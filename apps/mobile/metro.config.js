const http = require('node:http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ส่ง /api/* ต่อให้ API ในเครื่อง มือถือที่สแกน QR ผ่าน tunnel จะได้เรียก API ทาง URL เดียวกับ Metro
const API_PORT = Number(process.env.API_PORT ?? 3001);

function proxyApi(req, res) {
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: API_PORT,
      method: req.method,
      path: req.url.slice('/api'.length) || '/',
      headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` },
    },
    (apiRes) => {
      res.writeHead(apiRes.statusCode ?? 502, apiRes.headers);
      apiRes.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'API_DOWN', message: 'API ในเครื่องยังไม่ได้เปิด' } }));
  });
  req.pipe(upstream);
}

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) =>
    req.url.startsWith('/api/') ? proxyApi(req, res) : middleware(req, res, next),
};

module.exports = config;
