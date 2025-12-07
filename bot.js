import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- КОНСТАНТЫ И КОНФИГУРАЦИЯ ---
// Переменные окружения, предоставляемые средой
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const PUBLIC_COLLECTION = 'tanks_games'; // Коллекция для публичных игр

// Игровые константы
const CANVAS_W = 800;
const CANVAS_H = 600;
const TANK_SIZE = 40;
const TANK_SPEED_FORWARD = 3.5;
const TANK_SPEED_BACKWARD = 2; 
const TANK_ROT_SPEED = 0.05;
const BULLET_SIZE = 5;
const BULLET_SPEED = 8;
const SHOOT_COOLDOWN = 500; // мс
const SYNC_RATE = 50; // мс (частота отправки состояния на сервер)
const DAMAGE = 10;
const INTERPOLATION_RATE = 0.15; // Скорость интерполяции для сглаживания движения оппонента

// --- ИНИЦИАЛИЗАЦИЯ FIREBASE ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ГЛОБАЛЬНОЕ СОСТОЯНИЕ ИГРЫ ---
let userId = null;
let roomId = null;
let role = null; // 'host' или 'guest'
let unsubscribeRoom = null;
let syncInterval = null;
let gameRunning = false;
let gameReady = false;

// Ссылки на элементы DOM (Предполагается, что они существуют в HTML)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const lobbyContainer = document.getElementById('lobby-container');
const gameContainer = document.getElementById('game-container');
const authStatus = document.getElementById('auth-status');
const createSection = document.getElementById('create-section');
const joinSection = document.getElementById('join-section');
const dividerSection = document.getElementById('divider-section');
const waitingScreen = document.getElementById('waiting-screen');
const displayRoomCode = document.getElementById('display-room-code');
const errorMsg = document.getElementById('error-msg');
const uiMyHp = document.getElementById('ui-my-hp');
const uiOppHp = document.getElementById('ui-opp-hp');
const gameStatus = document.getElementById('game-status');
const resultOverlay = document.getElementById('result-overlay');
const resultMessage = document.getElementById('result-message');
const roomCodeInput = document.getElementById('room-code-input');

// Локальное состояние игры
let myTank = { x: 0, y: 0, angle: 0, hp: 100, lastShot: 0 };
let opponentTank = { x: 0, y: 0, angle: 0, hp: 100 };
let bullets = [];
let keys = {};
let lastOpponentState = null; // Состояние оппонента для интерполяции

// --- УТИЛИТЫ И ХЭЛПЕРЫ ---

/**
 * Генерирует 6-значный код комнаты.
 */
function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Вычисляет квадрат расстояния между двумя точками.
 */
function distSq(x1, y1, x2, y2) {
    return (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
}

/**
 * Ограничивает значение в пределах min и max.
 */
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Отображает временное сообщение об ошибке.
 */
function showStatus(message, isError = false) {
    if (isError) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
        console.error(message);
        setTimeout(() => errorMsg.style.display = 'none', 5000);
    } else {
        gameStatus.textContent = message;
        console.log(message);
    }
}

/**
 * Инициализирует начальные позиции танков.
 */
function initPositions() {
    if (role === 'host') {
        myTank.x = CANVAS_W / 4;
        myTank.y = CANVAS_H / 2;
        myTank.angle = 0; // Направлен вправо
        opponentTank.x = CANVAS_W * 3 / 4;
        opponentTank.y = CANVAS_H / 2;
        opponentTank.angle = Math.PI; // Направлен влево
    } else { // guest
        myTank.x = CANVAS_W * 3 / 4;
        myTank.y = CANVAS_H / 2;
        myTank.angle = Math.PI; // Направлен влево
        opponentTank.x = CANVAS_W / 4;
        opponentTank.y = CANVAS_H / 2;
        opponentTank.angle = 0; // Направлен вправо
    }
    myTank.hp = 100;
    opponentTank.hp = 100;
    bullets = [];
    keys = {};
    lastOpponentState = null;
}

// --- ФУНКЦИИ FIREBASE ---

/**
 * Получает ссылку на документ комнаты.
 */
function getRoomDocRef(id) {
    return doc(db, 'artifacts', appId, 'public', 'data', PUBLIC_COLLECTION, id);
}

/**
 * Инициализация аутентификации.
 */
async function initAuth() {
    try {
        if (typeof __initial_auth_token !== 'undefined') {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                authStatus.innerHTML = `<span class="text-green-400">✅ Подключено. ID: ${userId.substring(0, 8)}...</span>`;
                createSection.classList.remove('hidden');
                joinSection.classList.remove('hidden');
                dividerSection.classList.remove('hidden');
            } else {
                authStatus.innerHTML = `<span class="text-red-400">❌ Ошибка аутентификации.</span>`;
            }
        });
    } catch (e) {
        authStatus.innerHTML = `<span class="text-red-400">❌ Ошибка подключения: ${e.message}</span>`;
        console.error("Firebase Auth Error:", e);
    }
}

/**
 * Создание новой игры.
 */
window.createGame = async function() {
    if (!userId) return showStatus("Ошибка: Пользователь не аутентифицирован.", true);
    
    roomId = generateCode();
    role = 'host';
    const roomRef = getRoomDocRef(roomId);
    
    try {
        // Создание начального состояния комнаты
        await setDoc(roomRef, {
            status: 'waiting', // waiting, playing, finished
            hostId: userId,
            guestId: null,
            state: {
                host: { x: CANVAS_W / 4, y: CANVAS_H / 2, angle: 0, hp: 100, bullets: [] },
                guest: { x: CANVAS_W * 3 / 4, y: CANVAS_H / 2, angle: Math.PI, hp: 100, bullets: [] },
                lastUpdated: Date.now()
            },
            gameReady: false
        });

        // Обновление UI
        lobbyContainer.style.display = 'flex';
        createSection.classList.add('hidden');
        joinSection.classList.add('hidden');
        dividerSection.classList.add('hidden');
        waitingScreen.classList.remove('hidden');
        displayRoomCode.textContent = roomId;
        
        showStatus(`Комната создана: ${roomId}. Ожидание игрока...`);
        setupRoomListener();

    } catch (e) {
        showStatus(`Не удалось создать игру: ${e.message}`, true);
    }
}

/**
 * Присоединение к существующей игре.
 */
window.joinGame = async function() {
    if (!userId) return showStatus("Ошибка: Пользователь не аутентифицирован.", true);
    
    const code = roomCodeInput.value.toUpperCase().trim();
    if (code.length !== 6) return showStatus("Код должен состоять из 6 символов.", true);

    const roomRef = getRoomDocRef(code);
    
    try {
        const docSnap = await getDoc(roomRef);

        if (!docSnap.exists()) {
            return showStatus(`Комната с кодом ${code} не найдена.`, true);
        }

        const roomData = docSnap.data();

        if (roomData.guestId) {
            return showStatus("Комната уже занята.", true);
        }

        if (roomData.hostId === userId) {
             return showStatus("Вы не можете присоединиться к своей же комнате, используйте другой браузер/учетную запись.", true);
        }

        roomId = code;
        role = 'guest';

        // Обновление комнаты с ID гостя и установка готовности игры
        await updateDoc(roomRef, {
            guestId: userId,
            status: 'playing',
            gameReady: true
        });

        setupRoomListener();
        initGame(); // Начать игру немедленно для гостя
        
    } catch (e) {
        showStatus(`Не удалось присоединиться: ${e.message}`, true);
    }
}

/**
 * Настройка слушателя Firestore для комнаты.
 */
function setupRoomListener() {
    if (unsubscribeRoom) unsubscribeRoom();

    const roomRef = getRoomDocRef(roomId);

    unsubscribeRoom = onSnapshot(roomRef, (docSnap) => {
        if (!docSnap.exists()) {
            if (gameRunning) {
                showStatus('Соединение потеряно. Комната удалена.', true);
                window.resetGame(true);
            }
            return;
        }

        const roomData = docSnap.data();
        const opponentKey = role === 'host' ? 'guest' : 'host';
        const opponentId = role === 'host' ? roomData.guestId : roomData.hostId;

        if (roomData.status === 'finished') {
            // Игра закончена
            handleEndGame(roomData.winnerId);
            return;
        }

        // 1. Проверка готовности (для хоста)
        if (role === 'host' && opponentId && !gameReady) {
            gameReady = true;
            initGame();
            showStatus('Противник найден! Игра начинается...');
        }
        
        // 2. Обработка состояния оппонента и пуль
        if (roomData.state) {
            const oppState = roomData.state[opponentKey];
            const myStateInDB = roomData.state[role];

            if (oppState) {
                handleOpponentState(oppState);
            }

            if (myStateInDB) {
                // Синхронизация HP (если оппонент стрелял)
                if (myTank.hp !== myStateInDB.hp) {
                    myTank.hp = myStateInDB.hp;
                    updateUI();
                    
                    if (myTank.hp <= 0 && roomData.status !== 'finished') {
                         // Я проиграл, отправляю статус завершения
                         updateDoc(roomRef, {
                            status: 'finished',
                            winnerId: opponentId // Оппонент победил
                         });
                    }
                }
            }

            // Обработка пуль, выпущенных оппонентом
            const oppBullets = oppState?.bullets || [];
            // Добавляем только новые пули, которые не были у нас
            oppBullets.forEach(newBullet => {
                if (!bullets.some(b => b.id === newBullet.id)) {
                    bullets.push(newBullet);
                }
            });
        }
    });
}

/**
 * Отправка текущего состояния танка на сервер.
 */
function sendMyState() {
    if (!roomId || !gameRunning) return;

    // Сбор текущего состояния моего танка и пуль
    const myState = {
        x: myTank.x,
        y: myTank.y,
        angle: myTank.angle,
        hp: myTank.hp,
        bullets: bullets.filter(b => b.ownerId === userId)
    };

    const updatePath = `state.${role}`;
    
    // Отправка только тех пуль, которые принадлежат мне
    updateDoc(getRoomDocRef(roomId), {
        [updatePath]: myState,
        'state.lastUpdated': Date.now()
    }).catch(e => {
        console.error("Ошибка отправки состояния:", e);
    });
}

/**
 * Обработка состояния, полученного от оппонента.
 */
function handleOpponentState(newState) {
    // Используем интерполяцию для плавного движения
    lastOpponentState = newState;
}

/**
 * Обновление UI с текущим HP.
 */
function updateUI() {
    uiMyHp.textContent = `Я: ${myTank.hp} HP`;
    uiOppHp.textContent = `Враг: ${opponentTank.hp} HP`;
    // Обновление цвета HP
    uiMyHp.parentElement.querySelector('div').className = `w-3 h-3 rounded-full ${myTank.hp > 50 ? 'bg-green-500' : myTank.hp > 20 ? 'bg-yellow-500' : 'bg-red-500'}`;
    uiOppHp.parentElement.querySelector('div').className = `w-3 h-3 rounded-full ${opponentTank.hp > 50 ? 'bg-green-500' : opponentTank.hp > 20 ? 'bg-yellow-500' : 'bg-red-500'}`;
}

/**
 * Обработка завершения игры.
 */
function handleEndGame(winnerId) {
    gameRunning = false;
    clearInterval(syncInterval);
    
    resultOverlay.classList.remove('hidden');
    
    if (winnerId === userId) {
        resultMessage.textContent = "ПОБЕДА!";
        resultMessage.className = 'text-6xl font-extrabold text-green-400 drop-shadow-lg';
    } else if (winnerId) {
        resultMessage.textContent = "ПОРАЖЕНИЕ";
        resultMessage.className = 'text-6xl font-extrabold text-red-400 drop-shadow-lg';
    } else {
        resultMessage.textContent = "НИЧЬЯ/ОШИБКА";
        resultMessage.className = 'text-6xl font-extrabold text-yellow-400 drop-shadow-lg';
    }
}

/**
 * Сброс игры и возврат в лобби.
 */
window.resetGame = async function(isDisconnected = false) {
    gameRunning = false;
    gameReady = false;
    if (unsubscribeRoom) unsubscribeRoom();
    if (syncInterval) clearInterval(syncInterval);

    if (roomId && role === 'host' && !isDisconnected) {
        // Удалить комнату, если хост покидает ее
        try {
            await deleteDoc(getRoomDocRef(roomId));
        } catch (e) {
            console.error("Не удалось удалить комнату:", e);
        }
    }
    
    roomId = null;
    role = null;
    bullets = [];
    keys = {};
    lastOpponentState = null;

    lobbyContainer.style.display = 'flex';
    gameContainer.style.display = 'none';
    waitingScreen.classList.add('hidden');
    createSection.classList.remove('hidden');
    joinSection.classList.remove('hidden');
    dividerSection.classList.remove('hidden');
    resultOverlay.classList.add('hidden');
    errorMsg.style.display = 'none';
    gameStatus.textContent = '';
    roomCodeInput.value = '';
    updateUI(); // Сбросить UI HP до 100
}

window.copyCode = function() {
    if (roomId) {
        navigator.clipboard.writeText(roomId).then(() => {
            const originalText = displayRoomCode.textContent;
            displayRoomCode.textContent = 'СКОПИРОВАНО!';
            setTimeout(() => {
                displayRoomCode.textContent = originalText;
            }, 1000);
        }).catch(err => {
            console.error('Не удалось скопировать текст: ', err);
        });
    }
}


// --- ИГРОВАЯ ЛОГИКА И ОТРИСОВКА ---

/**
 * Отрисовка танка.
 */
function drawTank(tank, isMyTank) {
    if (!ctx) return;
    
    const color = isMyTank ? '#4ade80' : '#f87171'; // Зеленый или Красный

    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.angle);
    
    // Корпус танка
    ctx.fillStyle = color;
    ctx.fillRect(-TANK_SIZE / 2, -TANK_SIZE / 2, TANK_SIZE, TANK_SIZE);
    
    // Башня (квадрат)
    ctx.fillStyle = isMyTank ? '#15803d' : '#991b1b';
    ctx.fillRect(-8, -8, 16, 16);

    // Ствол
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(TANK_SIZE / 2 + 10, 0);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#6b7280';
    ctx.stroke();

    // HP Bar
    const hpPercent = tank.hp / 100;
    const barWidth = TANK_SIZE;
    const barHeight = 4;
    ctx.fillStyle = '#374151'; // Фон
    ctx.fillRect(-barWidth / 2, -TANK_SIZE / 2 - barHeight - 4, barWidth, barHeight);
    ctx.fillStyle = hpPercent > 0.5 ? '#10b981' : hpPercent > 0.2 ? '#facc15' : '#ef4444'; // Цвет HP
    ctx.fillRect(-barWidth / 2, -TANK_SIZE / 2 - barHeight - 4, barWidth * hpPercent, barHeight);

    ctx.restore();
}

/**
 * Отрисовка пули.
 */
function drawBullet(bullet) {
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, BULLET_SIZE, 0, Math.PI * 2);
    ctx.fillStyle = bullet.ownerId === userId ? '#fbbf24' : '#f87171'; // Желтая моя, красная врага
    ctx.fill();
}

/**
 * Обработка ввода и обновление состояния моего танка.
 */
function updateMyTank() {
    const cosA = Math.cos(myTank.angle);
    const sinA = Math.sin(myTank.angle);

    let speed = 0;
    let rotation = 0;

    if (keys['w'] || keys['ArrowUp']) {
        speed = TANK_SPEED_FORWARD;
    } else if (keys['s'] || keys['ArrowDown']) {
        speed = -TANK_SPEED_BACKWARD;
    }

    if (keys['a'] || keys['ArrowLeft']) {
        rotation = -TANK_ROT_SPEED;
    } else if (keys['d'] || keys['ArrowRight']) {
        rotation = TANK_ROT_SPEED;
    }

    // Движение
    myTank.x += cosA * speed;
    myTank.y += sinA * speed;
    myTank.angle += rotation;

    // Ограничение движения границами канваса
    myTank.x = clamp(myTank.x, TANK_SIZE / 2, CANVAS_W - TANK_SIZE / 2);
    myTank.y = clamp(myTank.y, TANK_SIZE / 2, CANVAS_H - TANK_SIZE / 2);

    // Стрельба
    if ((keys[' '] || keys['Space']) && Date.now() > myTank.lastShot + SHOOT_COOLDOWN) {
        myTank.lastShot = Date.now();
        bullets.push({
            id: Date.now().toString() + Math.random(), // Уникальный ID пули
            ownerId: userId,
            x: myTank.x + cosA * (TANK_SIZE / 2 + 5), // Начало ствола
            y: myTank.y + sinA * (TANK_SIZE / 2 + 5),
            angle: myTank.angle,
            velX: cosA * BULLET_SPEED,
            velY: sinA * BULLET_SPEED
        });
    }
}

/**
 * Обновление состояния оппонента (интерполяция).
 */
function updateOpponentTank() {
    if (!lastOpponentState) return;

    // Интерполяция позиции
    opponentTank.x += (lastOpponentState.x - opponentTank.x) * INTERPOLATION_RATE;
    opponentTank.y += (lastOpponentState.y - opponentTank.y) * INTERPOLATION_RATE;

    // Интерполяция угла (для плавного поворота)
    let diff = lastOpponentState.angle - opponentTank.angle;
    // Корректировка угла для кратчайшего пути (предотвращение 360-градусного вращения)
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    opponentTank.angle += diff * INTERPOLATION_RATE;
    
    // Синхронизация HP оппонента
    opponentTank.hp = lastOpponentState.hp;
}

/**
 * Обновление всех пуль и проверка коллизий.
 */
function updateBullets() {
    const roomRef = getRoomDocRef(roomId);
    let hitOpponent = false;

    bullets = bullets.filter(bullet => {
        // Движение
        bullet.x += bullet.velX;
        bullet.y += bullet.velY;

        // Вылет за границы
        if (bullet.x < 0 || bullet.x > CANVAS_W || bullet.y < 0 || bullet.y > CANVAS_H) {
            return false;
        }

        // Проверка коллизии с оппонентом (только для моих пуль)
        if (bullet.ownerId === userId) {
            if (distSq(bullet.x, bullet.y, opponentTank.x, opponentTank.y) < (TANK_SIZE / 2) ** 2) {
                hitOpponent = true;
                return false; // Пуля исчезает
            }
        }
        
        // Проверка коллизии с моим танком (только для пуль оппонента)
        if (bullet.ownerId !== userId) {
            if (distSq(bullet.x, bullet.y, myTank.x, myTank.y) < (TANK_SIZE / 2) ** 2) {
                // Пуля врага попала в меня
                myTank.hp = clamp(myTank.hp - DAMAGE, 0, 100);
                updateUI();
                // Немедленно отправляем мое HP на сервер, чтобы оппонент обновил свой UI
                sendMyState();
                return false; // Пуля исчезает
            }
        }

        return true; // Пуля продолжает лететь
    });

    // Обработка попадания: обновляем HP оппонента на сервере
    if (hitOpponent) {
        const opponentKey = role === 'host' ? 'guest' : 'host';
        const opponentId = role === 'host' ? lastOpponentState.hostId : lastOpponentState.guestId;

        // Атомарное обновление HP оппонента на сервере
        const transaction = db.runTransaction(async (transaction) => {
            const sfDoc = await transaction.get(roomRef);
            if (!sfDoc.exists) {
                throw "Document does not exist!";
            }
            
            const currentOpponentState = sfDoc.data().state[opponentKey];
            const newHp = clamp(currentOpponentState.hp - DAMAGE, 0, 100);
            
            const updates = {
                [`state.${opponentKey}.hp`]: newHp
            };

            // Проверка на победу
            if (newHp <= 0) {
                 updates.status = 'finished';
                 updates.winnerId = userId; // Я победил
            }

            transaction.update(roomRef, updates);
            return newHp;
        });

        transaction.then((newHp) => {
            opponentTank.hp = newHp;
            updateUI();
        }).catch((error) => {
            console.error("Ошибка транзакции попадания:", error);
        });
    }
}

/**
 * Главный цикл игры.
 */
function gameLoop() {
    if (!gameRunning || !ctx) return;

    // 1. Очистка
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // 2. Обновление состояния
    updateMyTank();
    updateOpponentTank();
    updateBullets();
    
    // 3. Отрисовка
    drawTank(myTank, true); // Мой танк
    drawTank(opponentTank, false); // Танк оппонента

    bullets.forEach(drawBullet); // Пули

    // 4. Запрос следующего кадра
    requestAnimationFrame(gameLoop);
}

/**
 * Инициализация игры (после нахождения оппонента).
 */
function initGame() {
    lobbyContainer.style.display = 'none';
    gameContainer.style.display = 'block';
    gameRunning = true;
    
    initPositions();
    updateUI();

    // Запуск цикла синхронизации состояния
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(sendMyState, SYNC_RATE);

    // Запуск игрового цикла
    requestAnimationFrame(gameLoop);
}

// --- ОБРАБОТЧИКИ ВВОДА ---

document.addEventListener('keydown', (e) => {
    // Используем 'Space' для клавиши пробел
    const key = e.key === ' ' ? 'Space' : e.key.toLowerCase(); 
    keys[key] = true;
    
    if (gameRunning && (key === ' ' || key === 'space')) {
        e.preventDefault(); // Предотвратить прокрутку страницы пробелом
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key === ' ' ? 'Space' : e.key.toLowerCase();
    keys[key] = false;
});


// Глобальные функции для доступа из HTML
window.createGame = window.createGame;
window.joinGame = window.joinGame;
window.resetGame = window.resetGame;
window.copyCode = window.copyCode;

// --- ЗАПУСК ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
} else {
    initAuth();
}
