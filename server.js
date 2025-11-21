const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let players = {};
let bullets = [];
const SPEED = 5;
const BULLET_SPEED = 10;

io.on('connection', (socket) => {
  console.log('Игрок подключился:', socket.id);

  // Создаем нового игрока
  players[socket.id] = {
    x: Math.random() * 800,
    y: Math.random() * 600,
    color: `hsl(${Math.random() * 360}, 100%, 50%)`,
    angle: 0,
    hp: 100
  };

  // Принимаем ввод от игрока
  socket.on('movement', (data) => {
    const player = players[socket.id];
    if (!player) return;

    player.angle = data.angle; // Поворот

    if (data.left) player.x -= SPEED;
    if (data.right) player.x += SPEED;
    if (data.up) player.y -= SPEED;
    if (data.down) player.y += SPEED;
    
    // Ограничение карты
    player.x = Math.max(0, Math.min(800, player.x));
    player.y = Math.max(0, Math.min(600, player.y));
  });

  // Стрельба
  socket.on('shoot', () => {
    const p = players[socket.id];
    if (!p) return;
    
    bullets.push({
      x: p.x,
      y: p.y,
      vx: Math.cos(p.angle) * BULLET_SPEED,
      vy: Math.sin(p.angle) * BULLET_SPEED,
      ownerId: socket.id
    });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    console.log('Игрок отключился');
  });
});

// Игровой цикл сервера (60 раз в секунду)
setInterval(() => {
  // Двигаем пули
  for (let i = bullets.length - 1; i >= 0; i--) {
    let b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;

    // Удаляем пули за пределами карты
    if (b.x < 0 || b.x > 800 || b.y < 0 || b.y > 600) {
      bullets.splice(i, 1);
      continue;
    }

    // Проверка попаданий
    for (let id in players) {
      if (id !== b.ownerId) {
        let p = players[id];
        let dx = p.x - b.x;
        let dy = p.y - b.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < 20) { // Радиус игрока
          p.hp -= 10;
          bullets.splice(i, 1);
          if (p.hp <= 0) {
             p.x = Math.random() * 800;
             p.y = Math.random() * 600;
             p.hp = 100;
          }
          break; 
        }
      }
    }
  }
  
  // Отправляем состояние всем
  io.emit('state', { players, bullets });
}, 1000 / 60);

server.listen(3000, () => {
  console.log('СЕРВЕР ЗАПУЩЕН: Открой в браузере http://localhost:3000');
});