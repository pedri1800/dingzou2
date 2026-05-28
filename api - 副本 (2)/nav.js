// Vercel Serverless Function
// 代理天天基金净值接口，解决浏览器跨域问题
export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: '缺少基金代码' });
  }

  try {
    // 天天基金净值接口（公开接口，无需鉴权）
    const url = `https://fundgz.1234567.com.cn/z/sz/sz${code}.js?rt=${Date.now()}`;
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`上游返回 ${response.status}`);
    }

    const text = await response.text();

    // 解析 JSONP 格式：jsonpgz({"fundcode":"159307","name":"...","jzrq":"2026-05-26","dwjz":"1.0680",...});
    const match = text.match(/jsonpgz\((\{.*?\})\)/);
    if (!match) {
      // 尝试另一个接口：获取官方净值（非估值）
      return await fallbackNav(code, res);
    }

    const data = JSON.parse(match[1]);
    // dwjz = 当日估算净值（盘中实时）, gsz = 估算净值, jzrq = 净值日期
    const nav = parseFloat(data.gsz || data.dwjz);
    const date = data.jzrq || '';
    const name = data.name || '';

    if (isNaN(nav) || nav <= 0) {
      return await fallbackNav(code, res);
    }

    return res.json({
      code,
      nav,
      date,
      name,
      type: 'estimate', // 盘中估算
    });

  } catch (e) {
    return await fallbackNav(code, res);
  }
}

// 备用接口：获取上一交易日官方净值
async function fallbackNav(code, res) {
  try {
    const url = `https://fundgz.1234567.com.cn/z/sz/sz${code}.js?rt=${Date.now()}`;
    // 尝试上海代码前缀
    const url2 = `https://fundgz.1234567.com.cn/z/sh/sh${code}.js?rt=${Date.now()}`;

    for (const u of [url, url2]) {
      const r = await fetch(u, {
        headers: { 'Referer': 'https://fund.eastmoney.com/' }
      });
      const t = await r.text();
      const m = t.match(/jsonpgz\((\{.*?\})\)/);
      if (m) {
        const d = JSON.parse(m[1]);
        const nav = parseFloat(d.dwjz || d.gsz);
        if (!isNaN(nav) && nav > 0) {
          return res.json({ code, nav, date: d.jzrq || '', name: d.name || '', type: 'official' });
        }
      }
    }
    return res.status(404).json({ error: '未找到净值', code });
  } catch (e) {
    return res.status(500).json({ error: e.message, code });
  }
}
