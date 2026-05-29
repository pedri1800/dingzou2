export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { code } = req.query;
  if (!code) return res.status(400).json({ error: '缺少基金代码' });

  // 判断交易所前缀（沪市60/51开头=sh，深市15/16/00开头=sz）
  const prefix = code.startsWith('5') || code.startsWith('6') ? 'sh' : 'sz';
  const symbol = prefix + code;

  // 新浪财经实时行情接口（与同花顺同源，交易时间秒级更新）
  try {
    const url = `https://hq.sinajs.cn/list=${symbol}`;
    const r = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const text = await r.text();

    // 格式: var hq_str_sh159307="名称,今开,昨收,当前价,最高,最低,买一,卖一,成交量,成交额,..."
    const m = text.match(/="([^"]+)"/);
    if (!m || !m[1]) throw new Error('解析失败');

    const parts = m[1].split(',');
    if (parts.length < 10) throw new Error('数据不完整');

    const name = parts[0];
    const price = parseFloat(parts[3]);   // 当前价（实时）
    const prevClose = parseFloat(parts[2]); // 昨收价
    const open = parseFloat(parts[1]);    // 今开
    const high = parseFloat(parts[4]);    // 最高
    const low = parseFloat(parts[5]);     // 最低
    const date = parts[30] || '';         // 日期
    const time = parts[31] || '';         // 时间

    if (!price || price <= 0) throw new Error('价格无效');

    const change = price - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose * 100) : 0;

    return res.json({
      code,
      nav: price,           // 实时场内价格
      prevClose,
      change: +change.toFixed(4),
      changePct: +changePct.toFixed(2),
      open, high, low,
      date, time,
      name,
      type: 'realtime',     // 标记为实时数据
    });

  } catch(e) {
    // 新浪接口失败，回退到天天基金官方净值
    try {
      const url2 = `https://fundgz.1234567.com.cn/z/sz/sz${code}.js?rt=${Date.now()}`;
      const r2 = await fetch(url2, {
        headers: { 'Referer': 'https://fund.eastmoney.com/' }
      });
      const text2 = await r2.text();
      const m2 = text2.match(/jsonpgz\(({.*?})\)/s);
      if (!m2) throw new Error('备用接口也失败');
      const d = JSON.parse(m2[1]);
      const nav = parseFloat(d.gsz || d.dwjz);
      if (!nav || nav <= 0) throw new Error('净值无效');
      return res.json({ code, nav, date: d.jzrq || '', name: d.name || '', type: 'estimate' });
    } catch(e2) {
      return res.status(404).json({ error: '获取失败', code });
    }
  }
}
