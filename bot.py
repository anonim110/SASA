import asyncio
import logging
import sqlite3
import uuid
import os
import socket
from typing import Optional

from aiogram import Bot, Dispatcher, Router, F
from aiogram.filters import CommandStart, CommandObject, Command
from aiogram.types import (
    Message, InlineKeyboardMarkup, InlineKeyboardButton, 
    CallbackQuery, ReplyKeyboardMarkup, KeyboardButton
)
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.client.session.aiohttp import AiohttpSession

# ==========================================
# НАСТРОЙКИ
# ==========================================
BOT_TOKEN = os.getenv("BOT_TOKEN", "7799303200:AAH5S_webBddEjkpUVYH9X4K1MnykO72aYs")

def get_proxy_url() -> Optional[str]:
    is_pa = 'PYTHONANYWHERE_DOMAIN' in os.environ or '.pythonanywhere.com' in socket.getfqdn()
    return "http://proxy.server:3128" if is_pa else None

# ==========================================
# БАЗА ДАННЫХ (с поддержкой ЧС и Статистики)
# ==========================================
class Database:
    def __init__(self, db_path: str = 'anon_bot.db'):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        full_path = os.path.join(base_dir, db_path)
        self.conn = sqlite3.connect(full_path, check_same_thread=False)
        self.create_tables()

    def create_tables(self):
        cursor = self.conn.cursor()
        # Таблица пользователей
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                chat_id INTEGER PRIMARY KEY,
                user_code TEXT UNIQUE,
                msgs_received INTEGER DEFAULT 0
            )
        ''')
        # Обновление старой базы (если она есть)
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN msgs_received INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass

        # Таблица черного списка
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS blocks (
                owner_id INTEGER,
                blocked_id INTEGER,
                PRIMARY KEY (owner_id, blocked_id)
            )
        ''')
        self.conn.commit()

    def get_or_create_user(self, chat_id: int) -> str:
        cursor = self.conn.cursor()
        cursor.execute("SELECT user_code FROM users WHERE chat_id=?", (chat_id,))
        res = cursor.fetchone()
        if res:
            return res[0]
        
        new_code = str(uuid.uuid4())[:8]
        cursor.execute("INSERT INTO users (chat_id, user_code) VALUES (?, ?)", (chat_id, new_code))
        self.conn.commit()
        return new_code

    def get_chat_id_by_code(self, user_code: str) -> Optional[int]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT chat_id FROM users WHERE user_code=?", (user_code,))
        res = cursor.fetchone()
        return res[0] if res else None

    def inc_messages(self, chat_id: int):
        cursor = self.conn.cursor()
        cursor.execute("UPDATE users SET msgs_received = msgs_received + 1 WHERE chat_id=?", (chat_id,))
        self.conn.commit()

    def get_stats(self, chat_id: int) -> int:
        cursor = self.conn.cursor()
        cursor.execute("SELECT msgs_received FROM users WHERE chat_id=?", (chat_id,))
        res = cursor.fetchone()
        return res[0] if res else 0

    def block_user(self, owner_id: int, blocked_id: int):
        cursor = self.conn.cursor()
        cursor.execute("INSERT OR IGNORE INTO blocks (owner_id, blocked_id) VALUES (?, ?)", (owner_id, blocked_id))
        self.conn.commit()

    def is_blocked(self, owner_id: int, sender_id: int) -> bool:
        cursor = self.conn.cursor()
        cursor.execute("SELECT 1 FROM blocks WHERE owner_id=? AND blocked_id=?", (owner_id, sender_id))
        return bool(cursor.fetchone())

db = Database()

# ==========================================
# КЛАВИАТУРЫ И СОСТОЯНИЯ
# ==========================================
class AnonState(StatesGroup):
    waiting_for_message = State()
    waiting_for_reply = State()

def get_main_keyboard():
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🔗 Моя ссылка")],
            [KeyboardButton(text="📊 Статистика"), KeyboardButton(text="❓ Помощь")]
        ],
        resize_keyboard=True,
        input_field_placeholder="Выберите действие ниже 👇"
    )

# ==========================================
# ОБРАБОТЧИКИ (HANDLERS)
# ==========================================
router = Router()

@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject, state: FSMContext, bot: Bot):
    args = command.args
    user_code = db.get_or_create_user(message.chat.id)
    bot_user = await bot.get_me()

    if args:
        target_chat_id = db.get_chat_id_by_code(args)
        if not target_chat_id:
            return await message.answer("❌ <b>Ошибка:</b> Ссылка устарела или недействительна.", reply_markup=get_main_keyboard())
        
        if target_chat_id == message.chat.id:
            return await message.answer("😅 Вы не можете отправлять анонимные сообщения самому себе!", reply_markup=get_main_keyboard())

        if db.is_blocked(target_chat_id, message.chat.id):
            return await message.answer("🚷 <b>В доступе отказано:</b> Пользователь ограничил вам возможность отправлять сообщения.")

        await state.update_data(target_chat_id=target_chat_id)
        await state.set_state(AnonState.waiting_for_message)
        
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🚫 Отмена", callback_query_data="cancel_action")]])
        await message.answer(
            "🤫 <b>Режим анонимного сообщения</b>\n\n"
            "✍️ Напишите всё, что хотите сказать. Текст, фото, кружочки или голосовые — получатель <b>не узнает</b>, кто вы.\n\n"
            "<i>Ожидаю ваше сообщение...</i>",
            reply_markup=kb
        )
    else:
        link = f"https://t.me/{bot_user.username}?start={user_code}"
        await message.answer(
            f"👋 <b>Добро пожаловать в Анонимного Бота!</b>\n\n"
            f"🔗 <b>Ваша личная ссылка:</b>\n"
            f"<code>{link}</code>\n\n"
            f"📌 <i>Опубликуйте её в Telegram-канале, Instagram, TikTok или перешлите друзьям. Все сообщения будут приходить сюда анонимно!</i>",
            disable_web_page_preview=True,
            reply_markup=get_main_keyboard()
        )

@router.message(F.text == "🔗 Моя ссылка")
async def show_link(message: Message, bot: Bot):
    user_code = db.get_or_create_user(message.chat.id)
    bot_user = await bot.get_me()
    link = f"https://t.me/{bot_user.username}?start={user_code}"
    await message.answer(
        f"🔗 <b>Ваша ссылка для получения сообщений:</b>\n\n"
        f"<code>{link}</code>\n\n"
        f"Нажмите на неё, чтобы скопировать 👆",
        disable_web_page_preview=True
    )

@router.message(F.text == "📊 Статистика")
async def show_stats(message: Message):
    count = db.get_stats(message.chat.id)
    await message.answer(
        f"📊 <b>Ваша статистика:</b>\n\n"
        f"📨 Получено сообщений: <b>{count}</b>\n\n"
        f"<i>Публикуйте ссылку чаще, чтобы получать больше сообщений!</i>"
    )

@router.message(F.text == "❓ Помощь")
async def show_help(message: Message):
    await message.answer(
        "💡 <b>Как это работает?</b>\n\n"
        "1️⃣ Вы копируете свою ссылку (кнопка «Моя ссылка»).\n"
        "2️⃣ Размещаете её там, где вас читают друзья или подписчики.\n"
        "3️⃣ Люди переходят по ссылке и пишут вам сообщения.\n"
        "4️⃣ Бот пересылает их вам, скрывая имя отправителя.\n"
        "5️⃣ Вы можете безопасно ответить им через бота, либо заблокировать спамеров."
    )

@router.callback_query(F.data == "cancel_action")
async def cancel_handler(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.message.edit_text("🛑 Действие отменено.")

@router.message(AnonState.waiting_for_message)
async def process_anon_message(message: Message, state: FSMContext, bot: Bot):
    data = await state.get_data()
    target_id = data.get("target_chat_id")
    
    # Кнопки для получателя (Ответить и Заблокировать)
    receiver_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💬 Ответить", callback_query_data=f"reply_{message.chat.id}")],
        [InlineKeyboardButton(text="🚫 Заблокировать отправителя", callback_query_data=f"block_{message.chat.id}")]
    ])

    try:
        await bot.send_message(target_id, "🔔 <b>Новое анонимное сообщение!</b>")
        await message.copy_to(target_id, reply_markup=receiver_kb)
        db.inc_messages(target_id) # Увеличиваем счетчик сообщений
        await message.answer("✅ <b>Успешно!</b> Ваше сообщение доставлено.", reply_markup=get_main_keyboard())
    except Exception as e:
        logging.error(f"Error: {e}")
        await message.answer("❌ <b>Ошибка:</b> Не удалось доставить сообщение (пользователь мог заблокировать бота).")
    finally:
        await state.clear()

@router.callback_query(F.data.startswith("reply_"))
async def start_reply(callback: CallbackQuery, state: FSMContext):
    sender_id = int(callback.data.split("_")[1])
    await state.update_data(reply_to_id=sender_id)
    await state.set_state(AnonState.waiting_for_reply)
    
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🚫 Отмена", callback_query_data="cancel_action")]])
    await callback.message.answer("✍️ <b>Напишите ваш ответ:</b>\n\n<i>Он также будет доставлен анонимно.</i>", reply_markup=kb)
    await callback.answer()

@router.callback_query(F.data.startswith("block_"))
async def block_sender(callback: CallbackQuery):
    sender_id = int(callback.data.split("_")[1])
    owner_id = callback.message.chat.id
    db.block_user(owner_id, sender_id)
    
    # Убираем кнопки у сообщения, чтобы нельзя было нажать еще раз
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.message.answer("🚷 <b>Отправитель заблокирован!</b>\nВы больше не будете получать от него сообщения.")
    await callback.answer("Пользователь в черном списке.")

@router.message(AnonState.waiting_for_reply)
async def send_reply(message: Message, state: FSMContext, bot: Bot):
    data = await state.get_data()
    reply_to_id = data.get("reply_to_id")
    
    try:
        await bot.send_message(reply_to_id, "💌 <b>Автор ответил на ваше сообщение:</b>")
        await message.copy_to(reply_to_id)
        await message.answer("✅ <b>Ответ успешно отправлен!</b>", reply_markup=get_main_keyboard())
    except Exception:
        await message.answer("❌ <b>Ошибка:</b> Не удалось отправить ответ.")
    finally:
        await state.clear()

# ==========================================
# ЗАПУСК
# ==========================================
async def main():
    logging.basicConfig(level=logging.INFO)

    proxy_url = get_proxy_url()
    session = AiohttpSession(proxy=proxy_url) if proxy_url else None

    bot = Bot(
        token=BOT_TOKEN,
        session=session,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML)
    )
    
    dp = Dispatcher()
    dp.include_router(router)

    await bot.delete_webhook(drop_pending_updates=True)
    
    try:
        await dp.start_polling(bot)
    finally:
        await bot.session.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass
