const { app, BrowserWindow, Menu, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = 8123;
const WEB_ROOT = path.join(__dirname, 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const target = path.normalize(path.join(WEB_ROOT, relative));
  if (!target.startsWith(path.normalize(WEB_ROOT + path.sep)) && target !== path.join(WEB_ROOT, 'index.html')) {
    return null;
  }
  return target;
}

function createServer() {
  return http.createServer((req, res) => {
    const file = safePath(req.url);
    if (!file) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(port));
  });
}

async function startServer() {
  for (let port = DEFAULT_PORT; port < DEFAULT_PORT + 20; port += 1) {
    const server = createServer();
    try {
      await listen(server, port);
      return { server, port };
    } catch (error) {
      server.close();
    }
  }
  throw new Error('no free local port');
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

async function selftest() {
  const { server, port } = await startServer();
  try {
    const index = await get(`http://127.0.0.1:${port}/index.html`);
    const data = await get(`http://127.0.0.1:${port}/js/data/game-data.js`);
    const checks = [
      ['index 200', index.status === 200],
      ['终端入口', index.body.includes('btn-terminal')],
      ['脚本入口', index.body.includes('btn-script')],
      ['生活线数据', data.body.includes('"kind":"life"')],
    ];
    for (const [name, ok] of checks) {
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
    }
    return checks.every(([, ok]) => ok) ? 0 : 1;
  } finally {
    server.close();
  }
}

function createWindow(port, show) {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show,
    backgroundColor: '#080d14',
    title: '零日值班：网络安全防御模拟器',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  window.loadURL(`http://127.0.0.1:${port}/`);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  return window;
}

async function main() {
  const args = process.argv.slice(1);
  if (args.includes('--selftest')) {
    const code = await selftest();
    app.exit(code);
    return;
  }

  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  await app.whenReady();
  Menu.setApplicationMenu(null);

  const { server, port } = await startServer();

  if (args.includes('--window-selftest')) {
    const window = createWindow(port, false);
    window.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        window.destroy();
        server.close();
        app.exit(0);
      }, 1500);
    });
    return;
  }

  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) {
    app.setPath('userData', path.join(portableDir, 'saves'));
  }

  createWindow(port, true);
  app.on('window-all-closed', () => {
    server.close();
    app.quit();
  });
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
