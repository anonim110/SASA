// server.js
});


// game loop
let last = Date.now();
setInterval(() => {
const now = Date.now();
const dt = (now - last)/1000; last = now;


// update players
for (const idStr in players) {
const p = players[idStr];
const input = p.input || {};
let vx=0, vy=0;
if (input.up) vy -= 1;
if (input.down) vy += 1;
if (input.left) vx -= 1;
if (input.right) vx += 1;
// normalize
const len = Math.hypot(vx,vy);
if (len>0) { vx/=len; vy/=len; }
p.x += vx * PLAYER_SPEED * dt;
p.y += vy * PLAYER_SPEED * dt;
if (input.aimX !== undefined && input.aimY !== undefined) {
p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
}
// shooting
if (input.shoot && (!p.lastShoot || now - p.lastShoot > 300)) {
p.lastShoot = now;
const bx = p.x + Math.cos(p.angle)*20;
const by = p.y + Math.sin(p.angle)*20;
const vxB = Math.cos(p.angle)*BULLET_SPEED;
const vyB = Math.sin(p.angle)*BULLET_SPEED;
bullets.push({ x:bx, y:by, vx:vxB, vy:vyB, owner:p.id, ttl:2.5 });
}
}


// update bullets
for (let i = bullets.length-1; i>=0; i--) {
const b = bullets[i];
b.x += b.vx * dt; b.y += b.vy * dt; b.ttl -= dt;
if (b.ttl <= 0) { bullets.splice(i,1); continue; }
// collision with players
for (const idStr in players) {
const p = players[idStr];
if (p.id === b.owner) continue;
const dx = p.x - b.x, dy = p.y - b.y;
if (dx*dx + dy*dy < 20*20) {
p.hp -= 20;
bullets.splice(i,1);
if (p.hp <= 0) {
// respawn
p.x = Math.random()*600+100; p.y = Math.random()*400+100; p.hp = 100;
}
break;
}
}
}


// broadcast state
const snapshot = { type:'state', players, bullets };
const raw = JSON.stringify(snapshot);
wss.clients.forEach(client => {
if (client.readyState === WebSocket.OPEN) client.send(raw);
});


}, 1000 / TICK_RATE);


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));
