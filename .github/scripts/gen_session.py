"""
Corre este script UNA SOLA VEZ en tu PC para generar el TELEGRAM_SESSION secret.
Requiere: pip install telethon

Uso:
  python .github/scripts/gen_session.py

Copia el string resultante como secret TELEGRAM_SESSION en GitHub:
  Settings -> Secrets and variables -> Actions -> New repository secret
"""
import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(input("API_ID (de my.telegram.org): "))
API_HASH = input("API_HASH (de my.telegram.org): ")

async def main():
    async with TelegramClient(StringSession(), API_ID, API_HASH) as client:
        print("\n✅ Copia este string como secret TELEGRAM_SESSION en GitHub:\n")
        print(client.session.save())
        print()

asyncio.run(main())
