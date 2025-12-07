// --- КОНФИГУРАЦИЯ ---
        const SERVER_URL = 'ws://localhost:3000'; 
        const TANK_SIZE = 40;
        const CANVAS_W = 800;
        const CANVAS_H = 600;
        
        // --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
        let ws = null;
        let myId = null;
        let gameState = null; 
        let gameActive = false;
        let keys = {};
        
        // Локальные копии для отрисовки и отправки команд
        let myTank = { hp: 100, color: '#38a169', lastShot: 0 }; // Цвет всегда зеленый для "меня"
        let oppTank = { hp: 100, color: '#e53e3e' }; // Цвет всегда красный для "врага"

        // --- ЭЛЕМЕНТЫ DOM (предполагается, что они есть в HTML) ---
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const lobbyContainer = document.getElementById('lobby-container');
        const gameContainer = document.getElementById('game-container');
        const authStatusEl = document.getElementById('auth-status');
        const connectSectionEl = document.getElementById('connect-section');
        const waitingScreenEl = document.getElementById('waiting-screen');
        const waitingMessageEl = document.getElementById('waiting-message');
        const errorMsgEl = document.getElementById('error-msg');
        const uiMyHpEl = document.getElementById('ui-my-hp');
        const uiOppHpEl = document.getElementById('ui-opp-hp');
        const gameStatusEl = document.getElementById('game-status');

        // --- УТИЛИТЫ ---
        function showError(msg) {
            errorMsgEl.innerText = msg;
            errorMsgEl.classList.remove('hidden');
        }

        function initCanvas() {
            canvas.width = CANVAS_W;
            canvas.height = CANVAS_H;
        }
        
        // --- СОЕДИНЕНИЕ С СЕРВЕРОМ ---
        window.connectToServer = () => {
            if (ws && ws.readyState === WebSocket.OPEN) return;
            
            authStatusEl.innerText = 'Подключение...';
            connectSectionEl.classList.add('hidden');
            waitingScreenEl.classList.remove('hidden');

            try {
                ws = new WebSocket(SERVER_URL);

                ws.onopen = () => {
                    authStatusEl.innerText = 'Подключено.';
                };

                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    handleServerMessage(data);
                };

                ws.onclose = () => {
                    gameActive = false;
                    authStatusEl.innerText = 'Отключено.';
                    showError('Соединение разорвано. Повторите попытку.');
                    lobbyContainer.style.display = 'flex';
                    gameContainer.style.display = 'none';
                    waitingScreenEl.classList.add('hidden');
                    connectSectionEl.classList.remove('hidden');
                };

                ws.onerror = (e) => {
                    showError('Ошибка подключения к серверу.');
                };

            } catch (e) {
                showError('Не удалось подключиться: ' + e.message);
            }
        };


        // --- ОБРАБОТКА СООБЩЕНИЙ СЕРВЕРА ---
        function handleServerMessage(data) {
            switch (data.type) {
                case 'INIT':
                    myId = data.id;
                    break;
                case 'ERROR':
                    showError(data.message);
                    break;
                case 'WAITING':
                    waitingMessageEl.innerText = data.message;
                    break;
                case 'START':
                    // Начало игры
                    lobbyContainer.style.display = 'none';
                    gameContainer.style.display = 'flex';
                    gameStatusEl.innerText = "";
                    initCanvas();
                    gameActive = true;
                    gameState = data.state;
                    requestAnimationFrame(gameLoop); // Запуск цикла отрисовки и ввода
                    break;
                case 'UPDATE':
                    // Обновление состояния мира
                    gameState = data.state;
                    updateLocalState(gameState);
                    break;
                case 'WIN':
                    endGame(data.winnerId === myId ? "ВЫ ПОБЕДИЛИ!" : "ВЫ ПРОИГРАЛИ!");
                    break;
                case 'RESTART': 
                    // Сервер сбросил игру (оппонент отключился или игра закончилась)
                    gameActive = false;
                    lobbyContainer.style.display = 'flex';
                    gameContainer.style.display = 'none';
                    waitingScreenEl.classList.remove('hidden');
                    connectSectionEl.classList.add('hidden');
                    waitingMessageEl.innerText = "Ожидание второго игрока...";
                    gameStatusEl.innerText = "";
                    break;
            }
        }

        function updateLocalState(state) {
            if (!myId || !state.players) return;

            const oppId = myId === 'player1' ? 'player2' : 'player1';

            // Обновляем локальные объекты из данных сервера для отрисовки
            myTank = { ...state.players[myId], color: '#38a169', lastShot: myTank.lastShot };
            oppTank = { ...state.players[oppId], color: '#e53e3e' };
            bullets = state.bullets;

            // Обновление UI
            uiMyHpEl.innerText = `Я: ${myTank.hp} HP`;
            uiOppHpEl.innerText = `Враг: ${oppTank.hp} HP`;
        }

        // --- УПРАВЛЕНИЕ ВВОДОМ ---
        
        // Отправка команды движения на сервер
        function sendMoveCommand() {
            if (!ws || ws.readyState !== WebSocket.OPEN || !myId || !gameActive) return;

            const moveTypes = [];
            // WASD/Arrow Keys (RU/EN layouts)
            if (keys['w'] || keys['ц'] || keys['arrowup']) moveTypes.push('forward');
            if (keys['s'] || keys['ы'] || keys['arrowdown']) moveTypes.push('backward');
            if (keys['a'] || keys['ф'] || keys['arrowleft']) moveTypes.push('turnLeft');
            if (keys['d'] || keys['в'] || keys['arrowright']) moveTypes.push('turnRight');

            // Отправляем команду, только если что-то нажато
            if (moveTypes.length > 0) {
                 ws.send(JSON.stringify({
                    type: 'move',
                    id: myId,
                    moveType: moveTypes.join(',')
                }));
            }
        }

        // Отправка команды выстрела на сервер
        function sendShootCommand() {
            if (!ws || ws.readyState !== WebSocket.OPEN || !myId || !gameActive) return;

            // Локальный ограничитель, чтобы не спамить
            if (Date.now() - myTank.lastShot < 500) return; 
            myTank.lastShot = Date.now();
            
            ws.send(JSON.stringify({
                type: 'shoot',
                id: myId
            }));
        }
        
        let lastMoveSync = 0;
        const MOVE_SYNC_INTERVAL = 1000 / 30; // 30 раз в секунду

        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (!keys[key]) keys[key] = true;
            
            // Если пробел и в игре, сразу стреляем
            if (gameActive && (key === ' ' || key === 'spacebar')) {
                e.preventDefault(); // Предотвратить прокрутку
                sendShootCommand();
            }
        });
        window.addEventListener('keyup', (e) => {
            keys[e.key.toLowerCase()] = false;
        });

        // --- ИГРОВОЙ ЦИКЛ (Отрисовка и Отправка Ввода) ---
        function gameLoop() {
            if (!gameActive) return;

            // 1. Отправляем ввод на сервер с ограничением частоты
            const now = Date.now();
            if (now - lastMoveSync > MOVE_SYNC_INTERVAL) {
                sendMoveCommand();
                lastMoveSync = now;
            }

            // 2. Отрисовка
            draw();

            requestAnimationFrame(gameLoop);
        }

        // --- ФУНКЦИИ ОТРИСОВКИ ---

        function draw() {
            // Фон
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

            // Сетка
            ctx.strokeStyle = '#374151';
            ctx.lineWidth = 1;
            for(let i=0; i<CANVAS_W; i+=40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,CANVAS_H); ctx.stroke(); }
            for(let i=0; i<CANVAS_H; i+=40) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(CANVAS_W,i); ctx.stroke(); }

            // Танки
            if (myTank) drawTank(myTank, true);
            if (oppTank) drawTank(oppTank, false);

            // Пули
            ctx.fillStyle = '#facc15';
            if (bullets) {
                bullets.forEach(b => {
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, 4, 0, Math.PI*2);
                    ctx.fill();
                });
            }
        }

        function drawTank(t, isMe) {
            ctx.save();
            ctx.translate(t.x, t.y);
            ctx.rotate(t.angle);
            
            // Корпус
            ctx.fillStyle = t.color;
            ctx.fillRect(-20, -20, 40, 40);
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 2;
            ctx.strokeRect(-20, -20, 40, 40);

            // Башня
            ctx.fillStyle = isMe ? '#48bb78' : '#fc8181';
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI*2);
            ctx.fill();
            
            // Дуло
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(30, 0);
            ctx.stroke();

            ctx.restore();
            
            // Имя
            ctx.fillStyle = 'white';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(isMe ? "Я" : "ВРАГ", t.x, t.y - 30);
        }

        function endGame(msg) {
            gameActive = false;
            gameStatusEl.innerText = msg;
        }

        // Инициализация при загрузке (если необходимо)
        // document.addEventListener('DOMContentLoaded', () => {});
