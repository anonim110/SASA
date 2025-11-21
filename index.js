const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ОЧЕНЬ ВАЖНО ДЛЯ RENDER:
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Настройки игры
const MAP_SIZE = 2000;
const PLAYERS = {};
const BULLETS = [];
const OBSTACLES = [];

// Генерируем стены
for (let i = 0; i < 20; i++) {
    OBSTACLES.push({
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        w: 80 + Math.random() * 150,
        h: 80 + Math.random() * 150
    });
}

io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);

  // Создаем игрока (English keys only!)
  PLAYERS[socket.id] = {
    id: socket.id,
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    angle: 0,
    hp: 100,
    score: 0,
    color: `hsl(${Math.random() * 360}, 100%, 50%)`
  };

  // Отправляем данные карты
  socket.emit('mapData', { obstacles: OBSTACLES, mapSize: MAP_SIZE, myId: socket.id });

  socket.on('input', (data) => {
    const p = PLAYERS[socket.id];
    if (!p || p.hp <= 0) return;

    p.angle = data.angle;
    const speed = 6;
    let nx = p.x;
    let ny = p.y;

    if (data.w) ny -= speed;
    if (data.s) ny += speed;
    if (data.a) nx -= speed;
    if (data.d) nx += speed;

    // Проверка стен
    if (isValidMove(nx, p.y)) p.x = nx;
    if (isValidMove(p.x, ny)) p.y = ny;
  });

  socket.on('shoot', () => {
    const p = PLAYERS[socket.id];
    if (!p || p.hp <= 0) return;
    
    BULLETS.push({
      x: p.x,
      y: p.y,
      vx: Math.cos(p.angle) * 15,
      vy: Math.sin(p.angle) * 15,
      owner: socket.id,
      life: 100
    });
  });

  socket.on('disconnect', () => {
    delete PLAYERS[socket.id];
  });
});

function isValidMove(x, y) {
    if (x < 0 || x > MAP_SIZE || y < 0 || y > MAP_SIZE) return false;
    for (let o of OBSTACLES) {
        if (x > o.x - 20 && x < o.x + o.w + 20 && y > o.y - 20 && y < o.y + o.h + 20) return false;
    }
    return true;
}

// Игровой цикл
setInterval(() => {
  for (let i = BULLETS.length - 1; i >= 0; i--) {
    let b = BULLETS[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    let hit = false;
    if (b.x < 0 || b.x > MAP_SIZE || b.y < 0 || b.y > MAP_SIZE) hit = true;
    for (let o of OBSTACLES) {
        if (b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h) hit = true;
    }

    if (!hit) {
        for (let id in PLAYERS) {
            if (id !== b.owner) {
                let p = PLAYERS[id];
                let dist = Math.sqrt((p.x - b.x)**2 + (p.y - b.y)**2);
                if (dist < 25) { 
                    p.hp -= 10;
                    hit = true;
                    if (p.hp <= 0) {
                        p.hp = 100;
                        p.x = Math.random() * MAP_SIZE;
                        p.y = Math.random() * MAP_SIZE;
                        if (PLAYERS[b.owner]) PLAYERS[b.owner].score++;
                    }
                    break;
                }
            }
        }
    }

    if (hit || b.life <= 0) {
        BULLETS.splice(i, 1);
    }
  }

  io.emit('state', { players: PLAYERS, bullets: BULLETS });
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
