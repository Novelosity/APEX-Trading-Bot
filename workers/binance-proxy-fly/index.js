const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;

// Route proxy path to the correct Binance host
function getTarget(pathname) {
  if (pathname.startsWith('/fapi')) return { host: 'fapi.binance.com', path: pathname };
  if (pathname.startsWith('/dapi')) return { host: 'dapi.binance.com', path: pathname };
  if (pathname.startsWith('/papi')) return { host: 'papi.binance.com', path: pathname };
  return { host: 'api.binance.com', path: pathname };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const { host, path } = getTarget(url.pathname);
    const targetPath = path + url.search;

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : null;

    const headers = { ...req.headers, host };
    delete headers['x-forwarded-for'];
    delete headers['x-real-ip'];
    delete headers['cf-connecting-ip'];

    const proxyReq = https.request(
      { hostname: host, path: targetPath || '/', method: req.method, headers },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          'access-control-allow-origin': '*',
        });
        proxyRes.pipe(res);
      }
    );

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
  console.log(`Binance proxy listening on port ${PORT}`);
});
