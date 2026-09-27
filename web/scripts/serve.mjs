// Small bounded preview for browser inspection at a gateway-like subpath.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const root = new URL('../../dist/', import.meta.url);
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/preview/')) { res.writeHead(404).end(); return; }
    const relative = decodeURIComponent(pathname.slice('/preview/'.length)) || 'index.html';
    if (relative.includes('..')) { res.writeHead(400).end(); return; }
    const data = await readFile(new URL(relative, root));
    const ext = relative.split('.').pop();
    res.writeHead(200, { 'Content-Type': ({ html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml' })[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end(); }
});
server.listen(4173, '0.0.0.0', () => console.log('Preview: http://127.0.0.1:4173/preview/'));
const deadline = setTimeout(() => server.close(), 60 * 60 * 1000);
process.on('SIGTERM', () => { clearTimeout(deadline); server.close(); });
