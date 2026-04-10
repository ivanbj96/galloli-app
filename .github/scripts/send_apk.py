import asyncio
import os
import sys
from telethon import TelegramClient
from telethon.sessions import StringSession

CHANNEL_INVITE = "https://t.me/+QPr885dQgl0wNDgx"
CHANNEL_NAME = "GallOli Builds"
APK_PATH = "android/app/build/outputs/apk/debug/GallOli.apk"


async def get_channel(client):
    # Buscar el canal por nombre en los dialogos existentes
    async for dialog in client.iter_dialogs():
        if dialog.is_channel and dialog.name == CHANNEL_NAME:
            return await client.get_input_entity(dialog.id)

    # Si no esta en dialogos, unirse via link de invitacion
    try:
        from telethon.tl.functions.messages import ImportChatInviteRequest
        hash_part = CHANNEL_INVITE.split("+")[1]
        result = await client(ImportChatInviteRequest(hash_part))
        channel = result.chats[0]
        return await client.get_input_entity(channel.id)
    except Exception as e:
        print(f"No se pudo unir al canal: {e}", file=sys.stderr)
        sys.exit(1)


async def main():
    api_id = int(os.environ["TELEGRAM_API_ID"])
    api_hash = os.environ["TELEGRAM_API_HASH"]
    session_str = os.environ["TELEGRAM_SESSION"]

    commit_sha = os.environ.get("GITHUB_SHA", "unknown")[:7]
    commit_msg = os.environ.get("COMMIT_MESSAGE", "sin mensaje")
    run_number = os.environ.get("GITHUB_RUN_NUMBER", "?")
    app_version = os.environ.get("APP_VERSION", "?")

    if not os.path.exists(APK_PATH):
        print(f"ERROR: APK no encontrado en {APK_PATH}", file=sys.stderr)
        sys.exit(1)

    apk_size_mb = os.path.getsize(APK_PATH) / 1024 / 1024

    async with TelegramClient(StringSession(session_str), api_id, api_hash) as client:
        channel = await get_channel(client)

        caption = (
            f"GallOli APK - Build #{run_number}\n\n"
            f"Version: {app_version}\n"
            f"Archivo: GallOli.apk ({apk_size_mb:.1f} MB)\n"
            f"Commit: {commit_sha}\n"
            f"Mensaje: {commit_msg}\n\n"
            f"Instalar: Habilitar fuentes desconocidas en Android y abrir el APK"
        )

        await client.send_file(channel, APK_PATH, caption=caption)
        print("APK enviado exitosamente a Telegram.")


if __name__ == "__main__":
    asyncio.run(main())
