const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const TICK_RATE = 20;
const PLAYER_SPEED = 120;
const BULLET_SPEED = 400;

let nextId = 1;
const players = {};
const bullets = [];

wss.on('connection', (ws) => {
  const id = nextId++;
  players[id] = { id, x: Math.random()*600+100, y: Math.random()*400+100, angle:0, hp:100 };

  ws.send(JSON.stringify({ type: 'init', id, players, bullets }));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'input') {
        const p = players[data.id];
        if (!p) return;
        p.input = data.input;
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    delete players[id];
  });
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;

  for (const id in players) {
    const p = players[id];
    const input = p.input || {};
    let vx = 0, vy = 0;
    if (input.up) vy -= 1;
    if (input.down) vy += 1;
    if (input.left) vx -= 1;
    if (input.right) vx += 1;

    const len = Math.hypot(vx, vy);
    if (len > 0) { vx /= len; vy /= len; }

    p.x += vx * PLAYER_SPEED * dt;
    p.y += vy * PLAYER_SPEED * dt;
    if (input.aimX !== undefined && input.aimY !== undefined) {
      p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    }

    if (input.shoot && (!p.lastShoot || now - p.lastShoot > 300)) {
      p.lastShoot = now;
      const bx = p.x + Math.cos(p.angle) * 20;
      const by = p.y + Math.sin(p.angle) * 20;
      bullets.push({
        x: bx,
        y: by,
        vx: Math.cos(p.angle) * BULLET_SPEED,
        vy: Math.sin(p.angle) * BULLET_SPEED,
        owner: p.id,
        ttl: 2.5
      });
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.ttl -= dt;

    if (b.ttl <= 0) {
      bullets.splice(i, 1);
      continue;
    }

    for (const id in players) {
      const p = players[id];
      if (p.id === b.owner) continue;
      const dx = p.x - b.x, dy = p.y - b.y;
      if (dx*dx + dy*dy < 20*20) {
        p.hp -= 20;
        bullets.splice(i, 1);
        if (p.hp <= 0) {
          p.x = Math.random()*600+100;
          p.y = Math.random()*400+100;
          p.hp = 100;
        }
        break;
      }
    }
  }

  const snapshot = { type: 'state', players, bullets };
  const raw = JSON.stringify(snapshot);

  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(raw);
  });

}, 1000 / TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on ' + PORT));
