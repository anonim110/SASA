const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- НАСТРОЙКИ ---
const MAP_SIZE = 1000; // Размер поля (от -500 до 500)
const OBSTACLES = [];
const PLAYERS = {};
const BULLETS = [];

// Генерируем кубы-стены
for (let i = 0; i < 15; i++) {
    OBSTACLES.push({
        x: (Math.random() - 0.5) * MAP_SIZE * 0.8,
        y: (Math.random() - 0.5) * MAP_SIZE * 0.8, 
        w: 50 + Math.random() * 100,
        h: 50 + Math.random() * 100
    });
}

io.on('connection', (socket) => {
  console.log('3D Player connected:', socket.id);

  PLAYERS[socket.id] = {
    id: socket.id,
    x: (Math.random() - 0.5) * 800,
    y: (Math.random() - 0.5) * 800,
    angle: Math.PI / 2, // Начинаем лицом вперед
    hp: 100,
    color: Math.random() * 0xffffff,
    score: 0
  };

  socket.emit('init', { obstacles: OBSTACLES, mapSize: MAP_SIZE, myId: socket.id });

  socket.on('input', (data) => {
    const p = PLAYERS[socket.id];
    // ВАЖНО: Если игрок не существует или мертв, игнорируем ввод
    if (!p || p.hp <= 0) return;

    p.angle = data.angle;
    const speed = 5;

    let nx = p.x;
    let ny = p.y; 
    let forwardAngle = p.angle;

    // --- БЛОК ДВИЖЕНИЯ WASD (Корректен для FPS) ---
    // Движение рассчитывается относительно угла, куда смотрит игрок (forwardAngle)
    if (data.w) { // Вперед
        nx += Math.cos(forwardAngle) * speed;
        ny += Math.sin(forwardAngle) * speed;
    }
    if (data.s) { // Назад
        nx -= Math.cos(forwardAngle) * speed;
        ny -= Math.sin(forwardAngle) * speed;
    }
    if (data.a) { // Влево (перпендикулярно)
        nx += Math.cos(forwardAngle - Math.PI / 2) * speed;
        ny += Math.sin(forwardAngle - Math.PI / 2) * speed;
    }
    if (data.d) { // Вправо
        nx += Math.cos(forwardAngle + Math.PI / 2) * speed;
        ny += Math.sin(forwardAngle + Math.PI / 2) * speed;
    }
    // --- КОНЕЦ БЛОКА ДВИЖЕНИЯ WASD ---

    // Простая коллизия со стенами
    let collide = false;
    
    // Границы карты (от -500 до 500)
    if (Math.abs(nx) > MAP_SIZE/2 || Math.abs(ny) > MAP_SIZE/2) collide = true;
    
    // Коллизия с препятствиями
    for (let o of OBSTACLES) {
        if (nx > o.x - o.w/2 - 10 && nx < o.x + o.w/2 + 10 &&
            ny > o.y - o.h/2 - 10 && ny < o.y + o.h/2 + 10) collide = true;
    }

    if (!collide) {
        p.x = nx;
        p.y = ny;
    }
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
      life: 60
    });
  });

  socket.on('disconnect', () => {
    delete PLAYERS[socket.id];
  });
});

// Игровой цикл
setInterval(() => {
  for (let i = BULLETS.length - 1; i >= 0; i--) {
    let b = BULLETS[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    let hit = false;
    // Стены
    for (let o of OBSTACLES) {
        if (b.x > o.x - o.w/2 && b.x < o.x + o.w/2 &&
            b.y > o.y - o.h/2 && b.y < o.y + o.h/2) hit = true;
    }

    // Игроки
    if (!hit) {
        for (let id in PLAYERS) {
            if (id !== b.owner) {
                let p = PLAYERS[id];
                let dist = Math.sqrt((p.x - b.x)**2 + (p.y - b.y)**2);
                if (dist < 15) { 
                    p.hp -= 10;
                    hit = true;
                    if (p.hp <= 0) {
                        p.hp = 100;
                        p.x = (Math.random() - 0.5) * 800;
                        p.y = (Math.random() - 0.5) * 800;
                        if (PLAYERS[b.owner]) PLAYERS[b.owner].score++;
                    }
                    break;
                }
            }
        }
    }

    if (hit || b.life <= 0) BULLETS.splice(i, 1);
  }

  io.emit('state', { players: PLAYERS, bullets: BULLETS });
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`3D Server running on ${PORT}`);
});
