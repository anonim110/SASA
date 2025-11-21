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

// --- CONFIG ---
const MAP_SIZE = 2500;
const PLAYERS = {};
const BULLETS = [];
const ORBS = []; // Аптечки
const OBSTACLES = [];

// Генерируем стены
for (let i = 0; i < 25; i++) {
    OBSTACLES.push({
        x: Math.random() * MAP_SIZE,
        y: Math.random() * MAP_SIZE,
        w: 100 + Math.random() * 200,
        h: 100 + Math.random() * 200
    });
}

// Генерируем аптечки
function spawnOrb() {
    if (ORBS.length < 10) {
        ORBS.push({
            id: Math.random(),
            x: Math.random() * MAP_SIZE,
            y: Math.random() * MAP_SIZE
        });
    }
}
setInterval(spawnOrb, 3000);

// Характеристики оружия
const WEAPONS = {
    1: { name: 'Rifle', damage: 8, speed: 18, reload: 100, spread: 0.05, count: 1, range: 80 }, // life time
    2: { name: 'Shotgun', damage: 6, speed: 16, reload: 800, spread: 0.3, count: 5, range: 40 },
    3: { name: 'Sniper', damage: 90, speed: 35, reload: 1500, spread: 0.0, count: 1, range: 120 }
};

io.on('connection', (socket) => {
  console.log('Player joined:', socket.id);

  PLAYERS[socket.id] = {
    id: socket.id,
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    angle: 0,
    hp: 100,
    score: 0,
    weapon: 1,
    lastShoot: 0,
    stamina: 100, // Для рывка
    color: `hsl(${Math.random() * 360}, 100%, 60%)`,
    username: "Player" + Math.floor(Math.random()*100)
  };

  socket.emit('init', { obstacles: OBSTACLES, mapSize: MAP_SIZE, myId: socket.id });

  socket.on('input', (data) => {
    const p = PLAYERS[socket.id];
    if (!p || p.hp <= 0) return;

    p.angle = data.angle;
    
    // Восстановление стамины
    if (p.stamina < 100) p.stamina += 0.5;

    // Движение
    let speed = 6;
    
    // Логика рывка (Dash)
    if (data.dash && p.stamina > 30) {
        speed = 25; // Рывок
        p.stamina -= 30;
    }

    let nx = p.x;
    let ny = p.y;
    if (data.w) ny -= speed;
    if (data.s) ny += speed;
    if (data.a) nx -= speed;
    if (data.d) nx += speed;

    // Проверка коллизий
    if (isValidMove(nx, p.y)) p.x = nx;
    if (isValidMove(p.x, ny)) p.y = ny;
    
    // Сбор аптечек
    for (let i = ORBS.length - 1; i >= 0; i--) {
        let o = ORBS[i];
        let dist = Math.sqrt((p.x - o.x)**2 + (p.y - o.y)**2);
        if (dist < 40) {
            p.hp = Math.min(100, p.hp + 25);
            ORBS.splice(i, 1);
        }
    }
  });

  socket.on('changeWeapon', (num) => {
      if (PLAYERS[socket.id] && WEAPONS[num]) {
          PLAYERS[socket.id].weapon = num;
      }
  });

  socket.on('shoot', () => {
    const p = PLAYERS[socket.id];
    if (!p || p.hp <= 0) return;

    const now = Date.now();
    const wpn = WEAPONS[p.weapon];

    if (now - p.lastShoot > wpn.reload) {
        p.lastShoot = now;
        
        // Создаем пули (у дробовика их много)
        for(let i=0; i<wpn.count; i++) {
            const spread = (Math.random() - 0.5) * wpn.spread;
            BULLETS.push({
                x: p.x,
                y: p.y,
                vx: Math.cos(p.angle + spread) * wpn.speed,
                vy: Math.sin(p.angle + spread) * wpn.speed,
                owner: socket.id,
                dmg: wpn.damage,
                life: wpn.range
            });
        }
        // Говорим всем клиентам воспроизвести звук/эффект выстрела
        io.emit('sound', { type: 'shoot', x: p.x, y: p.y, wpn: p.weapon });
    }
  });

  socket.on('disconnect', () => {
    delete PLAYERS[socket.id];
  });
});

function isValidMove(x, y) {
    if (x < 0 || x > MAP_SIZE || y < 0 || y > MAP_SIZE) return false;
    for (let o of OBSTACLES) {
        if (x > o.x - 25 && x < o.x + o.w + 25 && y > o.y - 25 && y < o.y + o.h + 25) return false;
    }
    return true;
}

// --- LOOP ---
setInterval(() => {
  for (let i = BULLETS.length - 1; i >= 0; i--) {
    let b = BULLETS[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    let hit = false;
    // Стены
    if (b.x < 0 || b.x > MAP_SIZE || b.y < 0 || b.y > MAP_SIZE) hit = true;
    for (let o of OBSTACLES) {
        if (b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h) hit = true;
    }

    if (!hit) {
        for (let id in PLAYERS) {
            if (id !== b.owner) {
                let p = PLAYERS[id];
                let dist = Math.sqrt((p.x - b.x)**2 + (p.y - b.y)**2);
                if (dist < 30) { // Hit player
                    p.hp -= b.dmg;
                    hit = true;
                    io.emit('hit', { x: b.x, y: b.y }); // Эффект крови

                    if (p.hp <= 0) {
                        // KILL
                        io.emit('killFeed', { killer: PLAYERS[b.owner]?.username, victim: p.username });
                        if (PLAYERS[b.owner]) PLAYERS[b.owner].score++;
                        
                        // Respawn
                        p.hp = 100;
                        p.x = Math.random() * MAP_SIZE;
                        p.y = Math.random() * MAP_SIZE;
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

  io.emit('state', { players: PLAYERS, bullets: BULLETS, orbs: ORBS });
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
