addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  let target;
  if (url.pathname.startsWith('/futures/')) {
    target = 'https://api-futures.kucoin.com';
    url.pathname = url.pathname.slice('/futures'.length);
  } else {
    target = 'https://api.kucoin.com';
  }

  const targetUrl = target + url.pathname + url.search;

  const headers = new Headers(request.headers);
  headers.set('host', new URL(target).hostname);
  headers.delete('cf-connecting-ip');
  headers.delete('x-forwarded-for');
  headers.delete('x-real-ip');

  const proxied = new Request(targetUrl, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
  });

  const response = await fetch(proxied);
  const respHeaders = new Headers(response.headers);
  respHeaders.set('access-control-allow-origin', '*');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: respHeaders,
  });
}
