import asyncio
import logging
import sqlite3
import uuid
import os
import socket
from typing import Optional

from aiogram import Bot, Dispatcher, Router, F
from aiogram.filters import CommandStart, CommandObject, Command
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.client.session.aiohttp import AiohttpSession

# ==========================================
# ИНСТРУКЦИЯ ПО ЗАПУСКУ 24/7 (БЕСПЛАТНО):
# ==========================================
# 1. KOYEB.COM / RENDER.COM:
#    - Создайте аккаунт. 
#    - Привяжите свой GitHub с этим файлом (назовите его main.py).
#    - В настройках выберите тип "Worker" (не Web Service, чтобы не засыпал).
#    - Укажите команду запуска: python main.py
#
# 2. ORACLE CLOUD (Always Free):
#    - Самый мощный вариант. Дают полноценный сервер.
#    - Нужно создать экземпляр (Instance) на Ubuntu.
#    - Установить python и запустить через Screen или Systemd.
#
# 3. VPS (Платные, но стабильные ~150-200 руб/мес):
#    - Timeweb, Aeza, FirstVDS. Это гарантирует 100% работу без "засыпания".
# ==========================================

# 1. НАСТРОЙКИ
# ==========================================
# Рекомендуется задавать токен через переменные окружения на сайте хостинга
BOT_TOKEN = os.getenv("BOT_TOKEN", "7799303200:AAH5S_webBddEjkpUVYH9X4K1MnykO72aYs")

def get_proxy_url() -> Optional[str]:
    """Прокси нужен только для бесплатного тарифа PythonAnywhere."""
    is_pa = 'PYTHONANYWHERE_DOMAIN' in os.environ or '.pythonanywhere.com' in socket.getfqdn()
    return "http://proxy.server:3128" if is_pa else None

# ==========================================
# 2. БАЗА ДАННЫХ
# ==========================================
class Database:
    def __init__(self, db_path: str = 'anon_bot.db'):
        # Используем абсолютный путь, чтобы база не терялась при запусках в Docker/Cloud
        base_dir = os.path.dirname(os.path.abspath(__file__))
        full_path = os.path.join(base_dir, db_path)
        self.conn = sqlite3.connect(full_path, check_same_thread=False)
        self.create_tables()

    def create_tables(self):
        cursor = self.conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                chat_id INTEGER PRIMARY KEY,
                user_code TEXT UNIQUE
            )
        ''')
        self.conn.commit()

    def get_user_code(self, chat_id: int) -> str:
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

db = Database()

# ==========================================
# 3. СОСТОЯНИЯ (FSM)
# ==========================================
class AnonState(StatesGroup):
    waiting_for_message = State()
    waiting_for_reply = State()

# ==========================================
# 4. ОБРАБОТЧИКИ
# ==========================================
router = Router()

@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject, state: FSMContext, bot: Bot):
    args = command.args
    if args:
        target_chat_id = db.get_chat_id_by_code(args)
        if not target_chat_id:
            return await message.answer("❌ Ссылка недействительна.")
        
        if target_chat_id == message.chat.id:
            return await message.answer("😅 Вы не можете отправить сообщение самому себе!")

        await state.update_data(target_chat_id=target_chat_id)
        await state.set_state(AnonState.waiting_for_message)
        
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="❌ Отмена", callback_query_data="cancel_send")]
        ])
        await message.answer(
            "🤫 <b>Режим анонимного сообщения</b>\n\n"
            "Пришлите что угодно. Получатель не узнает, кто вы.",
            reply_markup=kb
        )
    else:
        user_code = db.get_user_code(message.chat.id)
        bot_user = await bot.get_me()
        link = f"https://t.me/{bot_user.username}?start={user_code}"
        
        await message.answer(
            f"👋 <b>Ваша ссылка:</b>\n\n"
            f"<code>{link}</code>\n\n"
            f"Опубликуйте её. Сообщения будут приходить сюда анонимно!",
            disable_web_page_preview=True
        )

@router.callback_query(F.data == "cancel_send")
async def cancel_handler(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.message.edit_text("Отправка отменена.")

@router.message(AnonState.waiting_for_message)
async def process_anon_message(message: Message, state: FSMContext, bot: Bot):
    data = await state.get_data()
    target_id = data.get("target_chat_id")
    
    reply_kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="💬 Ответить анонимно", callback_query_data=f"reply_{message.chat.id}")]
    ])

    try:
        await bot.send_message(target_id, "📩 <b>Новое анонимное сообщение:</b>")
        await message.copy_to(target_id, reply_markup=reply_kb)
        await message.answer("✅ Отправлено!")
    except Exception as e:
        logging.error(f"Error: {e}")
        await message.answer("❌ Ошибка доставки.")
    finally:
        await state.clear()

@router.callback_query(F.data.startswith("reply_"))
async def start_reply(callback: CallbackQuery, state: FSMContext):
    sender_id = int(callback.data.split("_")[1])
    await state.update_data(reply_to_id=sender_id)
    await state.set_state(AnonState.waiting_for_reply)
    await callback.message.answer("✍️ Введите ваш ответ:")
    await callback.answer()

@router.message(AnonState.waiting_for_reply)
async def send_reply(message: Message, state: FSMContext, bot: Bot):
    data = await state.get_data()
    reply_to_id = data.get("reply_to_id")
    
    try:
        await bot.send_message(reply_to_id, "💬 <b>Вам пришел анонимный ответ:</b>")
        await message.copy_to(reply_to_id)
        await message.answer("✅ Ответ отправлен!")
    except Exception:
        await message.answer("❌ Ошибка отправки.")
    finally:
        await state.clear()

# ==========================================
# 5. ЗАПУСК
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
