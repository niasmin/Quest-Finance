// Dr. Quest — multiplayer server.
// Serves the client from ./public and connects WebSocket players to the shared game engine.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createGame } = require('./public/engine.js');
const storage = require('./src/storage.js');

const PORT = process.env.PORT || 3000;

// ---------- static file server ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};
const PUBLIC_DIR = path.join(__dirname, 'public');

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- game ----------
const game = createGame({ storage });
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let player = null;
  const send = (msg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.t === 'join' && !player) {
      const result = game.join(send, msg);
      if (typeof result === 'string') {
        send({ t: 'error', text: result });
        ws.close();
      } else {
        player = result;
      }
      return;
    }
    if (player) game.handle(player, msg);
  });

  ws.on('close', () => {
    if (player) game.leave(player);
  });
});

game.start();

function shutdown() {
  game.saveAll();
  storage.flush();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`Dr. Quest running at http://localhost:${PORT}`);
});
