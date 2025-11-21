const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Важно для Render: использовать порт из переменных окружения или 3000
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Настройки игры
const MAP_SIZE = 2000; // Размер карты
const PLAYERS = {};
const BULLETS = [];
const OBSTACLES = [];

// Генерируем 20 случайных стен
for (let i = 0; i < 20; i++) {
    OBSTACLES.push({
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        w: 80 + Math.random() * 150,
        h: 80 + Math.random() * 150
    });
}

io.on('connection', (socket) => {
  console.log('Новый игрок:', socket.id);

  // Создаем персонажа
  PLAYERS[socket.id] = {
    id: socket.id,
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    angle: 0,
    hp: 100,
    score: 0,
    color: `hsl(${Math.random() * 360}, 100%, 50%)`
  };

  // Отправляем игроку данные о карте
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

    // Проверка столкновений (стены + границы карты)
    if (isValidMove(nx, p.y)) p.x = nx;
    if (isValidMove(p.x, ny)) p.y = ny;
  });

  socket.on('shoot', () => {
    const p = PLAYERS[socket.