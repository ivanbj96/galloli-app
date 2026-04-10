---
inclusion: always
---

# GallOli — Guía Completa del Proyecto

## Qué es GallOli

PWA + TWA (Google Play) de gestión integral para venta de pollos pelados. Uso en campo: ventas, pedidos, clientes con GPS, merma, contabilidad, créditos. Offline-first con sync en la nube. Dueño: Ivan Quiñonez (ivqb96@gmail.com).

---

## Stack

- **Frontend**: HTML/CSS/JS vanilla, IndexedDB, Service Worker, Leaflet.js, jsPDF
- **Hosting**: Cloudflare Pages → `https://galloli.pages.dev` y `https://galloli.ivapps.store`
- **Worker API**: `https://galloli-sync.ivanbj-96.workers.dev` (nombre: `galloli-sync`, archivo: `workers/index.js`)
- **DB**: Cloudflare D1 SQLite → `galloli` (id: `c5dd06b9-2998-49d5-834e-fd0d5f7f8da1`)
- **Realtime**: Durable Objects `SessionManager` para WebSockets
- **Auth**: JWT HMAC-SHA256, login con Telegram / Email / PIN
- **TWA**: Bubblewrap CLI → `GallOli - Google Play package2/`

---

## Estructura de Archivos

```
/
├── index.html
├── sw.js                          # APP_VERSION aquí — incrementar SIEMPRE antes de deploy
├── manifest.json                  # start_url y scope apuntan a galloli.ivapps.store
├── _headers                       # Headers Cloudflare Pages
├── css/styles.css
├── js/
│   ├── app.js                     # App object — controlador principal
│   ├── modules.js                 # Todos los módulos de datos
│   ├── auth.js                    # AuthManager (window.AuthManager)
│   ├── sync-engine.js             # SyncEngine (WebSocket + REST)
│   ├── auto-backup.js             # AutoBackup (10 PM diario)
│   ├── db.js                      # IndexedDB wrapper
│   ├── utils.js
│   ├── creditos.js
│   ├── notify-system.js           # PushNotifications / NotificationsModule
│   ├── payment-processor.js
│   ├── pdf-generator.js
│   ├── offline-queue.js
│   ├── offline-maps.js
│   ├── facturacion-electronica.js
│   └── facturacion-ui.js
├── workers/
│   ├── index.js                   # Worker API REST + WebSocket + Cron
│   ├── session-manager.js
│   ├── wrangler.toml
│   └── schema.sql
├── .well-known/assetlinks.json    # Fingerprint Google Play Signing — NO el del keystore local
├── GallOli - Google Play package2/ # Proyecto Android TWA (en .gitignore)
│   ├── app/src/main/AndroidManifest.xml
│   ├── app/build.gradle
│   ├── gradle.properties          # Debe tener android.overridePathCheck=true
│   ├── twa-manifest.json
│   ├── signing.keystore           # NUNCA commitear
│   └── signing-key-info.txt       # NUNCA commitear
├── privacy.html
├── terms.html
├── feedback.html
└── wrangler.toml                  # Cloudflare Pages config
```

---

## Módulos (js/modules.js)

| Módulo | Store IndexedDB | Contenido |
|--------|----------------|-----------|
| `ClientsModule` | `clients` | Clientes, GPS, activo/archivado |
| `SalesModule` | `sales` | Ventas, historial pagos, créditos |
| `OrdersModule` | `orders` | Pedidos |
| `AccountingModule` | `expenses` | Gastos |
| `MermaModule` | `prices` + `mermaRecords` | Precios diarios, cálculo merma |
| `DiezmosModule` | `diezmos` | Diezmos y ofrendas |
| `CreditosModule` | (usa SalesModule) | Créditos pendientes |
| `PaymentHistoryModule` | `paymentHistory` | Historial pagos |
| `BackupModule` | — | Backup Telegram + importación |
| `ConfigModule` | `config` | Colores, nombre, logo |

---

## Páginas SPA (App.loadPage)

`dashboard`, `sales`, `orders`, `clients`, `merma`, `stats`, `accounting`, `diezmos`, `backup`, `cloud-sync`, `rutas`, `creditos`, `payment-history`, `config`

---

## Layout Visual

- **Desktop (>1024px)**: sidebar fijo izquierda, hamburguesa lo colapsa con clase `collapsed`
- **Móvil (≤1024px)**: sidebar oculto, se abre con clase `active` + overlay. Bottom nav visible
- **Header**: logo + hamburguesa + botón sync (`SyncEngine.forceFullSync()`)

---

## Sistema de Backup — MÁXIMA PRIORIDAD

Cuando se agregue cualquier dato nuevo, actualizar TODOS estos puntos:

1. `BackupModule.createBackup()` en `js/modules.js`
2. `runScheduledBackup()` en `workers/index.js`
3. `handleBackup()` en `workers/index.js`
4. `getLocalData()` en `js/sync-engine.js`
5. `BackupModule.importFromData()` en `js/modules.js`

---

## Sistema de Sincronización

- WebSocket: `wss://galloli-sync.ivanbj-96.workers.dev/ws`
- REST: `https://galloli-sync.ivanbj-96.workers.dev/api/sync/`
- Tipos: clients, sales, orders, expenses, prices, mermaRecords, diezmos, paymentHistory, config, telegramCredentials

---

## Notificaciones Push (VAPID)

- VAPID keys guardadas como secrets en el Worker (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_X`, `VAPID_PUBLIC_Y`)
- Suscripciones en D1 tabla `push_subscriptions`
- Crons: 8AM, 12PM, 6PM, 10PM hora Ecuador (UTC-5 = UTC+0: 13, 17, 23, 03)
- Toggle en sidebar — `App.initNotifToggle()` se llama 3s después del init
- El SW se registra al inicio de `App.init()` y se guarda en `App._swRegistration`
- `window.AuthManager.token` (NO `AuthManager.getToken()`) para obtener el JWT

---

## Google Play Store / TWA

- App ID: `dev.pages.galloli.twa`
- Dominio TWA: `galloli.ivapps.store`
- Keystore: `GallOli - Google Play package2\signing.keystore`
- Key alias: `galloli-iQ-Apps`
- Fingerprint assetlinks (Google Play Signing): `B5:09:51:3F:F2:D5:DF:34:A2:0D:9F:EE:CE:5C:1C:07:7A:40:09:60:9B:DF:F0:48:FE:C7:C2:4A:8E:56:C6:CF`
- Carpetas `GallOli - Google Play package*/` y `*.keystore` en `.gitignore` — NUNCA trackear

---

## Despliegue

### Solo cambios en PWA (JS/CSS/HTML) — comando único:
```bash
git add . ; git commit -m "vX.X.X - descripcion" ; wrangler pages deploy . --project-name=galloli --branch=main
```

### Worker modificado — primero Worker, luego Pages:
```bash
# Desde workers/
wrangler deploy
# Luego desde raiz:
git add . ; git commit -m "vX.X.X - descripcion" ; wrangler pages deploy . --project-name=galloli --branch=main
```

### Nuevo build TWA para Play Store:
```powershell
# Desde GallOli - Google Play package2/
# 1. Incrementar versionCode y versionName en app/build.gradle y twa-manifest.json
# 2. Build:
$keystore = "C:\Users\Ivan Quiñonez\Desktop\github-repos\GalloApp\GallOli - Google Play package2\signing.keystore"
.\gradlew clean bundleRelease "-Pandroid.injected.signing.store.file=$keystore" "-Pandroid.injected.signing.store.password=PASS" "-Pandroid.injected.signing.key.alias=galloli-iQ-Apps" "-Pandroid.injected.signing.key.password=PASS"
# 3. AAB en: app\build\outputs\bundle\release\app-release.aab
# 4. Probar APK antes de subir:
.\gradlew assembleRelease ...
C:\AndroidSDK\platform-tools\adb.exe install -r "app\build\outputs\apk\release\app-release.apk"
# 5. Si ADB dice Success, subir AAB a Play Store
```

### Versionado:
- `sw.js` → `const APP_VERSION = 'X.X.X'` — incrementar SIEMPRE
- Commit: `"vX.X.X - descripcion breve"`
- TWA: `versionCode` entero creciente en `build.gradle` y `twa-manifest.json`

---

## Variables del Worker

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `JWT_SECRET` | Secret | Firma JWT |
| `TELEGRAM_BOT_TOKEN` | Secret | Bot auth Telegram |
| `FEEDBACK_BOT_TOKEN` | Secret | Bot feedback usuarios |
| `VAPID_PUBLIC_KEY` | Secret | Clave pública VAPID push |
| `VAPID_PRIVATE_KEY` | Secret | Clave privada VAPID push |
| `VAPID_PUBLIC_X` | Secret | Coordenada X de la clave pública |
| `VAPID_PUBLIC_Y` | Secret | Coordenada Y de la clave pública |
| `DB` | D1 | Base de datos |
| `SESSION_MANAGER` | Durable Object | WebSockets |
| `ENVIRONMENT` | Var | `"production"` |

---

## Reglas de Desarrollo

1. **Incrementar `APP_VERSION` en `sw.js`** antes de cada deploy
2. **No crear archivos markdown de resumen** — informar solo en el chat
3. **No crear** `CHANGES.md`, `SUMMARY.md`, `UPDATE.md`, `CHANGELOG.md`
4. **Backup completeness**: dato nuevo = actualizar los 5 puntos de backup
5. **No exponer secrets en frontend** — usar Worker como proxy
6. **Google Play carpetas son sensibles** — en `.gitignore`
7. **Modificar Worker** → `wrangler deploy` desde `workers/` ANTES de Pages
8. **TWA build**: siempre probar con ADB antes de subir a Play Store
9. **assetlinks.json**: usar fingerprint de Google Play Signing, NO del keystore local
10. **AndroidManifest**: NUNCA usar `.json` como mimeType — causa `INSTALL_PARSE_FAILED_MANIFEST_MALFORMED`
11. **gradle.properties**: siempre tener `android.overridePathCheck=true`
12. **AuthManager**: acceder token con `window.AuthManager.token`, no con `.getToken()`
13. **ENCODING CRÍTICO**: NUNCA usar PowerShell para reescribir archivos JS/HTML con caracteres especiales (ó, á, ú, ñ, ¿, emojis). PowerShell corrompe el encoding UTF-8. Usar SIEMPRE `strReplace` o `fsWrite` de Kiro. Si se necesita reemplazar texto con regex en un archivo grande, usar `git checkout HEAD~1 -- archivo.js` para restaurar y luego aplicar cambios con `strReplace`.

---

## Contexto de Negocio

- Venta de pollos pelados en Guatemala/Ecuador
- Moneda configurable (GTQ / USD)
- Vendedor en campo con rutas diarias
- Merma = diferencia peso vivo vs pelado
- Diezmos = % configurable de ganancia neta
- Facturación electrónica SRI Ecuador (en desarrollo)
