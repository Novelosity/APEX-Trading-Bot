const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let targetHost, targetPath;

    if (url.pathname.startsWith('/futures')) {
      targetHost = 'api-futures.kucoin.com';
      targetPath = url.pathname.slice('/futures'.length) + url.search;
    } else {
      targetHost = 'api.kucoin.com';
      targetPath = url.pathname + url.search;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : null;

    const options = {
      hostname: targetHost,
      path: targetPath || '/',
      method: req.method,
      headers: {
        ...req.headers,
        host: targetHost,
      },
    };
    delete options.headers['x-forwarded-for'];
    delete options.headers['x-real-ip'];
    delete options.headers['cf-connecting-ip'];

    const proxyReq = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        'access-control-allow-origin': '*',
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: err.message }));
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`KuCoin proxy listening on port ${PORT}`);
});
