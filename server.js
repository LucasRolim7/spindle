const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// Render (and most hosts) set PORT as an environment variable
// Fall back to 3000 for local development
const PORT = process.env.PORT || 3000;

// ── tiny HTTPS GET helper ─────────────────────────────────────────────────
function get(targetUrl, headers) {
  return new Promise((resolve, reject) => {
    const opts = Object.assign(url.parse(targetUrl), { headers });
    https.get(opts, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    }).on('error', reject);
  });
}

// ── request handler ───────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS headers — allow the browser page to call our API routes
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── Serve index.html ──────────────────────────────────────────────────
  if (pathname === '/' || pathname === '/index.html') {
    const file = path.join(__dirname, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404); res.end('index.html not found'); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
    return;
  }

  // ── /api/discogs?path=...&token=... ───────────────────────────────────
  if (pathname === '/api/discogs') {
    const { path: apiPath, token } = parsed.query;
    if (!apiPath || !token) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing path or token' }));
      return;
    }
    try {
      const fullUrl = 'https://api.discogs.com' + apiPath;
      console.log('[Discogs]', fullUrl.split('?')[0]);
      const result = await get(fullUrl, {
        'Authorization': 'Discogs token=' + token,
        'User-Agent':    'Spindle/1.0',
        'Accept':        'application/json'
      });
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(result.body);
    } catch (e) {
      console.error('[Discogs error]', e.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── /api/deezer?q=... ────────────────────────────────────────────────
  if (pathname === '/api/deezer') {
    const { q } = parsed.query;
    if (!q) { res.writeHead(400); res.end('{}'); return; }
    try {
      const fullUrl = 'https://api.deezer.com/search?q=' + encodeURIComponent(q) + '&limit=15';
      console.log('[Deezer]', q);
      const result = await get(fullUrl, {
        'User-Agent': 'Spindle/1.0',
        'Accept':     'application/json'
      });
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(result.body);
    } catch (e) {
      console.error('[Deezer error]', e.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── /api/image?url=... — proxy cover images for color extraction ──────
  if (pathname === '/api/image') {
    const { url: imgUrl } = parsed.query;
    if (!imgUrl) { res.writeHead(400); res.end(''); return; }
    try {
      const opts = Object.assign(url.parse(imgUrl), {
        headers: { 'User-Agent': 'Spindle/1.0' }
      });
      https.get(opts, imgRes => {
        const ct = imgRes.headers['content-type'] || 'image/jpeg';
        res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' });
        imgRes.pipe(res);
      }).on('error', () => { res.writeHead(502); res.end(); });
    } catch (e) {
      res.writeHead(502); res.end();
    }
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log('Spindle running on port ' + PORT);
});
