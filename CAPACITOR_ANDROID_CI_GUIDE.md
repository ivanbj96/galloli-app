# Guía: Build Android APK con GitHub Actions + Envío a Telegram

Esta guía explica cómo configurar un proyecto Capacitor para que cada push a `main` genere un APK y lo envíe automáticamente a un canal privado de Telegram.

---

## Requisitos del proyecto

- App web (React, Vue, etc.) con Vite o similar
- Capacitor instalado (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`)
- Repositorio en GitHub

---

## Paso 1 — Estructura de archivos necesarios

```
.github/
  workflows/
    build-android.yml     ← workflow principal
  scripts/
    send_apk.py           ← script que envía el APK a Telegram
    gen_session.py        ← script para generar la sesión (solo se corre una vez local)
```

---

## Paso 2 — Workflow principal

Crea `.github/workflows/build-android.yml`:

```yaml
name: Build Android APK

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm install --legacy-peer-deps

      - name: Build web app
        run: npm run build

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '21'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Accept Android SDK licenses
        run: yes | sdkmanager --licenses || true

      - name: Install Android SDK components
        run: |
          sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"

      - name: Add Android platform
        run: npx cap add android

      - name: Sync Capacitor
        run: npx cap sync android

      - name: Make Gradle executable
        run: chmod +x android/gradlew

      - name: Build Debug APK
        working-directory: android
        run: ./gradlew assembleDebug

      - name: Rename APK
        run: mv android/app/build/outputs/apk/debug/app-debug.apk android/app/build/outputs/apk/debug/MiApp.apk

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: MiApp
          path: android/app/build/outputs/apk/debug/MiApp.apk
          retention-days: 30

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install Telethon
        run: pip install telethon

      - name: Send APK to Telegram
        env:
          TELEGRAM_API_ID: ${{ secrets.TELEGRAM_API_ID }}
          TELEGRAM_API_HASH: ${{ secrets.TELEGRAM_API_HASH }}
          TELEGRAM_SESSION: ${{ secrets.TELEGRAM_SESSION }}
          COMMIT_MESSAGE: ${{ github.event.head_commit.message }}
          GITHUB_SHA: ${{ github.sha }}
          GITHUB_RUN_NUMBER: ${{ github.run_number }}
        run: python .github/scripts/send_apk.py
```

> Ajusta `MiApp` con el nombre de tu app en los pasos de rename, artifact y en `send_apk.py`.

---

## Paso 3 — Script de envío a Telegram

Crea `.github/scripts/send_apk.py`:

```python
import asyncio
import os
import sys
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.functions.channels import CreateChannelRequest

CHANNEL_NAME = "MiApp Builds"   # ← cambia esto
APK_PATH = "android/app/build/outputs/apk/debug/MiApp.apk"  # ← cambia esto


async def get_or_create_channel(client):
    async for dialog in client.iter_dialogs():
        if dialog.is_channel and dialog.name == CHANNEL_NAME:
            return await client.get_input_entity(dialog.id)

    result = await client(CreateChannelRequest(
        title=CHANNEL_NAME,
        about="APKs generados automáticamente por GitHub Actions",
        megagroup=False,
        broadcast=True,
    ))
    channel = result.chats[0]
    return await client.get_input_entity(channel.id)


async def main():
    api_id = int(os.environ["TELEGRAM_API_ID"])
    api_hash = os.environ["TELEGRAM_API_HASH"]
    session_str = os.environ["TELEGRAM_SESSION"]

    commit_sha = os.environ.get("GITHUB_SHA", "unknown")[:7]
    commit_msg = os.environ.get("COMMIT_MESSAGE", "sin mensaje")
    run_number = os.environ.get("GITHUB_RUN_NUMBER", "?")

    if not os.path.exists(APK_PATH):
        print(f"ERROR: APK no encontrado en {APK_PATH}", file=sys.stderr)
        sys.exit(1)

    apk_size_mb = os.path.getsize(APK_PATH) / 1024 / 1024

    async with TelegramClient(StringSession(session_str), api_id, api_hash) as client:
        channel = await get_or_create_channel(client)

        caption = (
            f"🤖 **MiApp** — Build #{run_number}\n\n"
            f"📦 `MiApp.apk` ({apk_size_mb:.1f} MB)\n"
            f"🔖 Commit: `{commit_sha}`\n"
            f"💬 {commit_msg}"
        )

        await client.send_file(channel, APK_PATH, caption=caption, parse_mode="markdown")
        print("APK enviado exitosamente.")


if __name__ == "__main__":
    asyncio.run(main())
```

---

## Paso 4 — Generar la sesión de Telegram (solo una vez, en tu PC)

Crea `.github/scripts/gen_session.py`:

```python
import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(input("API_ID: "))
API_HASH = input("API_HASH: ")

async def main():
    async with TelegramClient(StringSession(), API_ID, API_HASH) as client:
        print("\n✅ Copia este string como secret TELEGRAM_SESSION en GitHub:\n")
        print(client.session.save())

asyncio.run(main())
```

Instala Telethon y corre el script:

```bash
pip install telethon
python .github/scripts/gen_session.py
```

Te pedirá tu número de teléfono y el código de verificación. Al final imprime un string largo — cópialo.

---

## Paso 5 — Obtener API_ID y API_HASH de Telegram

1. Ve a [https://my.telegram.org](https://my.telegram.org)
2. Inicia sesión con tu número de teléfono
3. Entra a **API development tools**
4. Crea una nueva aplicación (nombre y plataforma no importan)
5. Copia el `api_id` (número) y el `api_hash` (string)

---

## Paso 6 — Agregar los secrets en GitHub

Ve a tu repositorio → **Settings → Secrets and variables → Actions → Repository secrets** y crea los 3 secrets:

| Secret | Valor |
|---|---|
| `TELEGRAM_API_ID` | El número `api_id` de my.telegram.org |
| `TELEGRAM_API_HASH` | El string `api_hash` de my.telegram.org |
| `TELEGRAM_SESSION` | El string generado por `gen_session.py` |

---

## Paso 7 — Hacer el primer push

```bash
git add .
git commit -m "feat: configurar CI/CD con build Android y envío a Telegram"
git push origin main
```

GitHub Actions se dispara automáticamente. En unos minutos recibes el APK en el canal **"MiApp Builds"** de Telegram (se crea solo si no existe).

---

## Notas importantes

- El canal se crea automáticamente la primera vez con el nombre definido en `CHANNEL_NAME`
- El workflow también sube el APK como artifact en GitHub Actions (disponible 30 días)
- Para builds de release (firmados) necesitas agregar un keystore como secret adicional
- El script `gen_session.py` solo se corre una vez localmente — no lo corras en CI
- Si cambias de número de teléfono o revocan la sesión, vuelve a correr `gen_session.py` y actualiza el secret `TELEGRAM_SESSION`
