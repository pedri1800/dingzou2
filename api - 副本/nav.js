export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { code } = req.query;
  if (!code) return res.status(400).json({ error: '缺少基金代码' });

  // 先试盘中估算净值接口（实时，交易时间每15分钟更新）
  const estimateResult = await tryEstimate(code);
  if (estimateResult) return res.json(estimateResult);

  // 再试官方净值接口（每日收盘后更新）
  const officialResult = await tryOfficial(code);
  if (officialResult) return res.json(officialResult);

  return res.status(404).json({ error: '未找到净值', code });
}

// 天天基金盘中估算净值（gsz字段）
async function tryEstimate(code) {
  try {
    const url = `https://fundgz.1234567.com.cn/z/sz/sz${code}.js?rt=${Date.now()}`;
    const r = await fetch(url, {
      headers: {
        'Referer': 'https://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const text = await r.text();
    const m = text.match(/jsonpgz\(({.*?})\)/s);
    if (!m) return null;
    const d = JSON.parse(m[1]);
    const nav = parseFloat(d.gsz || d.dwjz);
    if (!nav || nav <= 0) return null;
    return { code, nav, date: d.jzrq || '', name: d.name || '', type: 'estimate' };
  } catch { return null; }
}

// 天天基金官方净值接口
async function tryOfficial(code) {
  try {
    const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=1`;
    const r = await fetch(url, {
      headers: {
        'Referer': 'https://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const data = await r.json();
    const record = data?.Data?.LSJZList?.[0];
    if (!record) return null;
    const nav = parseFloat(record.DWJZ);
    if (!nav || nav <= 0) return null;
    return { code, nav, date: record.FSRQ || '', name: '', type: 'official' };
  } catch { return null; }
}
