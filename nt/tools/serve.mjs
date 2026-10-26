/**
 * 本地调试服务器（零依赖）
 *
 *   node nt/tools/serve.mjs            # 默认 127.0.0.1:8080，根目录 = money-way
 *   node nt/tools/serve.mjs 8090       # 换端口
 *
 * 为什么需要它：file:// 下 fetch('./templates/templates.html') 会被 CORS 拦，
 * 页面白屏。必须走 http。
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/nt/index.html';
    const file = resolve(join(ROOT, p));
    if (!file.startsWith(resolve(ROOT))) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('not found');
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`端口 ${PORT} 已被占用（服务器可能已在运行）`);
    process.exit(0);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`NT 本地调试: http://127.0.0.1:${PORT}/nt/index.html?debug=1`);
  console.log(`               http://127.0.0.1:${PORT}/nt/index.html`);
  console.log(`根目录: ${ROOT}`);
});
