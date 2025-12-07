// --- ИМПОРТЫ ДЛЯ NODE.JS (предполагается 'npm install firebase') ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';

// --- КОНСТАНТЫ И КОНФИГУРАЦИЯ ---
// Переменные окружения, предоставляемые средой
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const PUBLIC_COLLECTION = 'tanks_games'; // Коллекция для публичных игр

// Игровые константы (Эти константы могут быть не нужны, если это действительно 'bot.js', 
// но я сохраняю их для полноты игровой логики, которую вы запросили ранее)
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

// ВНИМАНИЕ: Так как это код Node.js, элементы DOM (document.getElementById) 
// и canvas здесь не существуют и приведут к ошибке.
// Я оставляю ссылки на них для браузерной части, но в Node.js они будут null.
const canvas = typeof document !== 'undefined' ? document.getElementById('gameCanvas') : null;
const ctx = canvas ? canvas.getContext('2d') : null;
const lobbyContainer = typeof document !== 'undefined' ? document.getElementById('lobby-container') : null;
const gameContainer = typeof document !== 'undefined' ? document.getElementById('game-container') : null;
// ... (остальные DOM-элементы также должны быть проверены) ...
const uiMyHp = typeof document !== 'undefined' ? document.getElementById('ui-my-hp') : null;
const uiOppHp = typeof document !== 'undefined' ? document.getElementById('ui-opp-hp') : null;
const gameStatus = typeof document !== 'undefined' ? document.getElementById('game-status') : null;
const errorMsg = typeof document !== 'undefined' ? document.getElementById('error-msg') : null;


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
 * Отображает временное сообщение об ошибке (Адаптировано для Node.js/Console).
 */
function showStatus(message, isError = false) {
    if (isError) {
        if (errorMsg) {
            errorMsg.textContent = message;
            errorMsg.style.display = 'block';
            setTimeout(() => errorMsg.style.display = 'none', 5000);
        }
        console.error("STATUS ERROR:", message);
    } else {
        if (gameStatus) gameStatus.textContent = message;
        console.log("STATUS:", message);
    }
}

/**
 * Инициализирует начальные позиции танков.
 */
function initPositions() {
    // ... (логика позиционирования осталась прежней) ...
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
 * Поскольку это, вероятно, серверный бот, он должен просто аутентифицироваться.
 */
async function initAuth() {
    try {
        if (typeof __initial_auth_token !== 'undefined') {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            // Для сервера лучше использовать анонимный вход, если нет токена
            await signInAnonymously(auth);
        }

        return new Promise((resolve, reject) => {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                if (user) {
                    userId = user.uid;
                    showStatus(`✅ Подключено. ID: ${userId.substring(0, 8)}...`);
                    resolve(user);
                } else {
                    showStatus(`❌ Ошибка аутентификации.`, true);
                    reject(new Error("Authentication failed"));
                }
                unsubscribe();
            });
        });
    } catch (e) {
        showStatus(`❌ Ошибка подключения: ${e.message}`, true);
        throw e;
    }
}

/**
 * Создание новой игры.
 */
// В Node.js мы не можем полагаться на window.createGame, поэтому делаем его экспортируемым
export async function createGame() {
    if (!userId) {
        try { await initAuth(); } catch (e) { return showStatus("Ошибка: Пользователь не аутентифицирован.", true); }
    }
    
    roomId = generateCode();
    role = 'host';
    const roomRef = getRoomDocRef(roomId);
    
    try {
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

        // Обновление UI-элементов здесь не имеет смысла в Node.js
        showStatus(`Комната создана: ${roomId}. Ожидание игрока...`);
        setupRoomListener();

    } catch (e) {
        showStatus(`Не удалось создать игру: ${e.message}`, true);
    }
}

/**
 * Присоединение к существующей игре.
 */
export async function joinGame(code) {
    if (!userId) {
        try { await initAuth(); } catch (e) { return showStatus("Ошибка: Пользователь не аутентифицирован.", true); }
    }
    
    const roomCode = (code || '').toUpperCase().trim();
    if (roomCode.length !== 6) return showStatus("Код должен состоять из 6 символов.", true);

    const roomRef = getRoomDocRef(roomCode);
    
    try {
        const docSnap = await getDoc(roomRef);

        if (!docSnap.exists()) {
            return showStatus(`Комната с кодом ${roomCode} не найдена.`, true);
        }

        const roomData = docSnap.data();

        if (roomData.guestId) {
            return showStatus("Комната уже занята.", true);
        }

        if (roomData.hostId === userId) {
             return showStatus("Вы не можете присоединиться к своей же комнате.", true);
        }

        roomId = roomCode;
        role = 'guest';

        await updateDoc(roomRef, {
            guestId: userId,
            status: 'playing',
            gameReady: true
        });

        setupRoomListener();
        initGame(); 
        
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
                resetGame(true);
            }
            return;
        }

        const roomData = docSnap.data();
        const opponentKey = role === 'host' ? 'guest' : 'host';
        const opponentId = role === 'host' ? roomData.guestId : roomData.hostId;

        if (roomData.status === 'finished') {
            handleEndGame(roomData.winnerId);
            return;
        }

        if (role === 'host' && opponentId && !gameReady) {
            gameReady = true;
            initGame();
            showStatus('Противник найден! Игра начинается...');
        }
        
        // ... (логика синхронизации состояния и пуль осталась прежней) ...
        if (roomData.state) {
            const oppState = roomData.state[opponentKey];
            const myStateInDB = roomData.state[role];

            if (oppState) {
                handleOpponentState(oppState);
            }

            if (myStateInDB) {
                if (myTank.hp !== myStateInDB.hp) {
                    myTank.hp = myStateInDB.hp;
                    updateUI();
                    
                    if (myTank.hp <= 0 && roomData.status !== 'finished') {
                         updateDoc(roomRef, {
                            status: 'finished',
                            winnerId: opponentId // Оппонент победил
                         });
                    }
                }
            }

            const oppBullets = oppState?.bullets || [];
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

    const myState = {
        x: myTank.x,
        y: myTank.y,
        angle: myTank.angle,
        hp: myTank.hp,
        bullets: bullets.filter(b => b.ownerId === userId)
    };

    const updatePath = `state.${role}`;
    
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
    lastOpponentState = newState;
}

/**
 * Обновление UI с текущим HP (проверка на существование элементов DOM).
 */
function updateUI() {
    if (uiMyHp && uiOppHp) {
        uiMyHp.textContent = `Я: ${myTank.hp} HP`;
        uiOppHp.textContent = `Враг: ${opponentTank.hp} HP`;
        // UI-цветы не могут быть обновлены в Node.js без полной DOM-библиотеки
    }
}

/**
 * Обработка завершения игры.
 */
function handleEndGame(winnerId) {
    gameRunning = false;
    clearInterval(syncInterval);
    
    if (winnerId === userId) {
        showStatus("ПОБЕДА!");
    } else if (winnerId) {
        showStatus("ПОРАЖЕНИЕ", true);
    } else {
        showStatus("НИЧЬЯ/ОШИБКА", true);
    }
    
    // В Node.js мы просто завершаем процесс или сбрасываем состояние
    if (typeof document !== 'undefined') {
        // ... (логика обновления UI-оверлея) ...
    }
}

/**
 * Сброс игры и возврат в лобби.
 */
export async function resetGame(isDisconnected = false) {
    gameRunning = false;
    gameReady = false;
    if (unsubscribeRoom) unsubscribeRoom();
    if (syncInterval) clearInterval(syncInterval);

    if (roomId && role === 'host' && !isDisconnected) {
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

    // Сброс UI-элементов (только если они существуют)
    if (typeof document !== 'undefined') {
        // ... (логика сброса UI) ...
    }
    
    updateUI(); 
}

// --- ИГРОВАЯ ЛОГИКА И ОТРИСОВКА ---

// Функции drawTank, drawBullet не могут работать в Node.js без canvas.
function drawTank(tank, isMyTank) {
    // Эта функция предназначена только для браузера
    if (!ctx) return;
    // ... (логика отрисовки) ...
}

function drawBullet(bullet) {
    // Эта функция предназначена только для браузера
    if (!ctx) return;
    // ... (логика отрисовки) ...
}


/**
 * Обновление состояния моего танка.
 */
function updateMyTank() {
    // В Node.js бот должен сам определять свои 'keys' или AI-движения
    // ... (логика движения и стрельбы) ...
    const cosA = Math.cos(myTank.angle);
    const sinA = Math.sin(myTank.angle);

    let speed = 0;
    let rotation = 0;
    
    // В Node.js здесь должна быть логика AI или внешнего управления
    // Для сохранения функциональности, я оставлю заглушку
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

    myTank.x += cosA * speed;
    myTank.y += sinA * speed;
    myTank.angle += rotation;

    myTank.x = clamp(myTank.x, TANK_SIZE / 2, CANVAS_W - TANK_SIZE / 2);
    myTank.y = clamp(myTank.y, TANK_SIZE / 2, CANVAS_H - TANK_H / 2);

    if ((keys[' '] || keys['Space']) && Date.now() > myTank.lastShot + SHOOT_COOLDOWN) {
        myTank.lastShot = Date.now();
        bullets.push({
            id: Date.now().toString() + Math.random(), 
            ownerId: userId,
            x: myTank.x + cosA * (TANK_SIZE / 2 + 5), 
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

    opponentTank.x += (lastOpponentState.x - opponentTank.x) * INTERPOLATION_RATE;
    opponentTank.y += (lastOpponentState.y - opponentTank.y) * INTERPOLATION_RATE;

    let diff = lastOpponentState.angle - opponentTank.angle;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    opponentTank.angle += diff * INTERPOLATION_RATE;
    
    opponentTank.hp = lastOpponentState.hp;
}

/**
 * Обновление всех пуль и проверка коллизий.
 */
function updateBullets() {
    const roomRef = getRoomDocRef(roomId);
    let hitOpponent = false;

    bullets = bullets.filter(bullet => {
        bullet.x += bullet.velX;
        bullet.y += bullet.velY;

        if (bullet.x < 0 || bullet.x > CANVAS_W || bullet.y < 0 || bullet.y > CANVAS_H) {
            return false;
        }

        if (bullet.ownerId === userId) {
            if (distSq(bullet.x, bullet.y, opponentTank.x, opponentTank.y) < (TANK_SIZE / 2) ** 2) {
                hitOpponent = true;
                return false; 
            }
        }
        
        if (bullet.ownerId !== userId) {
            if (distSq(bullet.x, bullet.y, myTank.x, myTank.y) < (TANK_SIZE / 2) ** 2) {
                myTank.hp = clamp(myTank.hp - DAMAGE, 0, 100);
                updateUI();
                sendMyState();
                return false; 
            }
        }

        return true; 
    });

    if (hitOpponent) {
        const opponentKey = role === 'host' ? 'guest' : 'host';
        const opponentId = role === 'host' ? lastOpponentState.hostId : lastOpponentState.guestId;

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

            if (newHp <= 0) {
                 updates.status = 'finished';
                 updates.winnerId = userId;
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
 * Главный цикл игры. (В Node.js - только логика, без отрисовки).
 */
function gameLoop() {
    if (!gameRunning) return;

    // 1. Обновление состояния
    updateMyTank();
    updateOpponentTank();
    updateBullets();
    
    // 2. Отрисовка (пропускается в Node.js)
    if (ctx) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        drawTank(myTank, true);
        drawTank(opponentTank, false);
        bullets.forEach(drawBullet);
    }


    // 3. Запрос следующего кадра (используем setInterval, если это Node.js бот)
    if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(gameLoop);
    } else {
        setTimeout(gameLoop, 1000 / 60); // 60 FPS для логики
    }
}

/**
 * Инициализация игры (после нахождения оппонента).
 */
function initGame() {
    if (lobbyContainer) lobbyContainer.style.display = 'none';
    if (gameContainer) gameContainer.style.display = 'block';
    gameRunning = true;
    
    initPositions();
    updateUI();

    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(sendMyState, SYNC_RATE);

    if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(gameLoop);
    } else {
        setTimeout(gameLoop, 0); // Немедленный запуск цикла Node.js
    }
}

// --- ЗАПУСК ---
if (typeof document !== 'undefined') {
    // Браузерная инициализация
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuth);
    } else {
        initAuth();
    }
} else {
    // Серверная (Node.js) инициализация. 
    // Поскольку это, вероятно, бот, который должен что-то делать, мы запускаем его здесь.
    // Если это просто модуль, экспортируем функции, как сделано выше.
    console.log("Running in Node.js environment. DOM and rendering functions are disabled.");
    // Чтобы бот начал работать:
    // initAuth().then(() => {
    //    // Если бот должен создать комнату:
    //    // createGame();
    //    // Если бот должен присоединиться к комнате (нужен код):
    //    // joinGame('ROOMCODE');
    // }).catch(e => console.error("Initialization Failed:", e));
}
