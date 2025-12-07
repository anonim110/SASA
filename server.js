const WebSocket = require('ws');

// --- Настройки сервера и игры ---
const PORT = 3000;
const GAME_TICK = 1000 / 60; // 60 тиков в секунду
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const TANK_SIZE = 40;
const TANK_SPEED = 3;
const TANK_ROT_SPEED = 0.05;
const BULLET_SPEED = 8;
const MAX_HP = 100;

// --- Состояние сервера ---
const wss = new WebSocket.Server({ port: PORT }, () => {
    console.log(`Сервер WebSockets запущен на порту ${PORT}`);
    console.log('Ждем подключения двух игроков...');
});

const clients = new Map(); 
let playerCount = 0;
let gameRunning = false;
let gameState = {
    players: {
        player1: createTank('player1', CANVAS_WIDTH / 4, CANVAS_HEIGHT / 2, 0), // Изменил начальный угол
        player2: createTank('player2', CANVAS_WIDTH * 3 / 4, CANVAS_HEIGHT / 2, Math.PI) // Изменил начальный угол
    },
    bullets: []
};

// --- Вспомогательные функции ---

function createTank(id, x, y, angle) {
    return {
        id,
        x,
        y,
        angle,
        hp: MAX_HP,
        moveType: 'none',
        ws: null
    };
}

// Отправка сообщения всем подключенным клиентам
function broadcast(data) {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}

// Отправка сообщения конкретному клиенту
function sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// Сброс состояния игры
function resetGame() {
    gameRunning = false;
    gameState = {
        players: {
            player1: createTank('player1', CANVAS_WIDTH / 4, CANVAS_HEIGHT / 2, 0),
            player2: createTank('player2', CANVAS_WIDTH * 3 / 4, CANVAS_HEIGHT / 2, Math.PI)
        },
        bullets: []
    };
    // Перепривязываем WS к новым объектам танков, если клиенты не отключились
    clients.forEach(client => {
        if (client.id) {
             gameState.players[client.id].ws = client.ws;
        }
    });
}

// --- Обработка подключения ---

wss.on('connection', (ws) => {
    if (playerCount >= 2) {
        sendToClient(ws, { type: 'ERROR', message: 'Сервер заполнен (макс. 2 игрока)' });
        ws.close();
        return;
    }

    playerCount++;
    const id = playerCount === 1 ? 'player1' : 'player2';
    
    // Привязываем WS к ID игрока в gameState
    gameState.players[id].ws = ws; 
    clients.set(ws, { id: id, ws: ws });

    console.log(`Игрок ${id} подключен. Всего: ${playerCount}`);

    // Инициализация игрока
    sendToClient(ws, { type: 'INIT', id: id });

    // Обработка сообщений от клиента
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        handleClientAction(data);
    });

    // Обработка отключения
    ws.on('close', () => {
        playerCount--;
        console.log(`Игрок ${id} отключен. Всего: ${playerCount}`);
        
        resetGame();
        clients.delete(ws);
        
        // Уведомляем оставшегося игрока
        broadcast({ type: 'RESTART' });
    });

    // Запуск игры, если 2 игрока
    if (playerCount === 2 && !gameRunning) {
        gameRunning = true;
        broadcast({ type: 'START', state: gameState });
        console.log('Игра началась!');
    } else if (playerCount < 2) {
        sendToClient(ws, { type: 'WAITING', message: 'Ожидание второго игрока...' });
    }
});


// --- Обработка действий клиента ---

function handleClientAction(data) {
    if (!gameRunning) return;

    const tank = gameState.players[data.id];
    if (!tank) return;

    switch (data.type) {
        case 'move':
            tank.moveType = data.moveType;
            break;
        case 'shoot':
            if (Date.now() - tank.lastShotTime > 500 || !tank.lastShotTime) { 
                tank.lastShotTime = Date.now();
                
                // Создание пули перед танком
                const bullet = {
                    x: tank.x + Math.cos(tank.angle) * (TANK_SIZE / 2 + 5),
                    y: tank.y + Math.sin(tank.angle) * (TANK_SIZE / 2 + 5),
                    angle: tank.angle,
                    ownerId: tank.id
                };
                gameState.bullets.push(bullet);
            }
            break;
    }
}


// --- Логика игрового мира (Game Loop) ---

function updateGame() {
    if (!gameRunning) return;

    // 1. Обновление танков
    for (const id in gameState.players) {
        const tank = gameState.players[id];
        
        // Поворот и Движение
        if (tank.moveType.includes('turnLeft')) {
            tank.angle -= TANK_ROT_SPEED;
        } 
        if (tank.moveType.includes('turnRight')) {
            tank.angle += TANK_ROT_SPEED;
        }

        if (tank.moveType.includes('forward')) {
            moveTank(tank, TANK_SPEED);
        } else if (tank.moveType.includes('backward')) {
            moveTank(tank, -TANK_SPEED / 2); // Задний ход медленнее
        }
        
        // Границы мира
        tank.x = Math.max(TANK_SIZE / 2, Math.min(CANVAS_WIDTH - TANK_SIZE / 2, tank.x));
        tank.y = Math.max(TANK_SIZE / 2, Math.min(CANVAS_HEIGHT - TANK_SIZE / 2, tank.y));
    }

    // 2. Обновление пуль и коллизии
    gameState.bullets = gameState.bullets.filter(bullet => {
        // Движение
        bullet.x += Math.cos(bullet.angle) * BULLET_SPEED;
        bullet.y += Math.sin(bullet.angle) * BULLET_SPEED;

        // Проверка столкновений с границами
        if (bullet.x < 0 || bullet.x > CANVAS_WIDTH || bullet.y < 0 || bullet.y > CANVAS_HEIGHT) {
            return false; // Удаляем пулю
        }

        // Проверка попаданий в танки
        for (const id in gameState.players) {
            const target = gameState.players[id];
            
            // Пуля не может попасть в танк, который ее выпустил
            if (target.id === bullet.ownerId) continue; 
            if (target.hp <= 0) continue;

            const dist = Math.hypot(bullet.x - target.x, bullet.y - target.y);

            if (dist < TANK_SIZE / 2) { // Попадание!
                target.hp -= 10;
                console.log(`Игрок ${target.id} получил урон. HP: ${target.hp}`);
                
                // Проверка победы
                if (target.hp <= 0) {
                    gameRunning = false;
                    const winnerId = bullet.ownerId;
                    broadcast({ type: 'WIN', winnerId: winnerId });
                    console.log(`Игрок ${winnerId} победил!`);
                    
                    // Переход в режим ожидания/сброса
                    setTimeout(() => {
                        resetGame();
                        broadcast({ type: 'RESTART' });
                    }, 5000); // 5 секунд до сброса
                }

                return false; // Удаляем пулю
            }
        }

        return true; // Сохраняем пулю
    });

    // 3. Отправка обновленного состояния клиентам
    broadcast({ type: 'UPDATE', state: gameState });
}

function moveTank(tank, speed) {
    tank.x += Math.cos(tank.angle) * speed;
    tank.y += Math.sin(tank.angle) * speed;
}

// Запуск игрового цикла
setInterval(updateGame, GAME_TICK);
