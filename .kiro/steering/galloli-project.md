---
inclusion: always
---

# GallOli — Guía Completa del Proyecto

## Qué es GallOli

PWA + TWA (Google Play) + APK nativo Capacitor de gestión integral para venta de pollos pelados. Uso en campo: ventas, pedidos, clientes con GPS, merma, contabilidad, créditos. Offline-first con sync en la nube. Dueño: Ivan Quiñonez (ivqb96@gmail.com).

---

## Stack

- **Frontend**: HTML/CSS/JS vanilla, IndexedDB, Service Worker, Leaflet.js, jsPDF
- **Hosting**: Cloudflare Pages → `https://galloli.pages.dev` y `https://galloli.ivapps.store`
- **Worker API**: `https://galloli-sync.ivanbj-96.workers.dev` (nombre: `galloli-sync`, archivo: `workers/index.js`)
- **DB**: Cloudflare D1 SQLite → `galloli` (id: `c5dd06b9-2998-49d5-834e-fd0d5f7f8da1`)
- **Realtime**: Durable Objects `SessionManager` para WebSockets
- **Auth**: JWT HMAC-SHA256, login con Telegram / Email / PIN
- **TWA**: Bubblewrap CLI → `GallOli - Google Play package2/`
- **APK nativo**: Capacitor → branch `apk-native`, CI en cada push, enviado a Telegram

---

## Tres versiones de la app

### 1. PWA / TWA (Google Play Store) — branch `main`
- Desplegada en Cloudflare Pages
- TWA en Play Store: App ID `dev.pages.galloli.twa`, carga `galloli.ivapps.store`
- Sin acceso a APIs nativas de Capacitor
- Notificaciones push via VAPID (Service Worker)
- Pesaje en cadena con GPS funciona solo con app en primer plano

### 2. APK Capacitor básico — branch `main`
- Generado por `.github/workflows/build-android.yml` en cada push a `main`
- App ID: `store.ivapps.galloli`
- Incluye: BLE foreground service, FCM básico, GPS background
- Enviado al canal Telegram "GallOli Builds"

### 3. APK Nativo completo — branch `apk-native` ← APK de producción del dueño
- Generado por `.github/workflows/build-android-apk.yml` en cada push a `apk-native`
- **NUNCA** mergear `apk-native` → `main`
- Incluye todo lo del APK básico MÁS:
  - `GeofenceBleService.kt` — foreground service Kotlin con wakelock, sobrevive a Doze
  - `BootReceiver.kt` — arranca el servicio automáticamente al reiniciar el teléfono
  - `src/native/auto-sale-engine.js` — motor de venta automática (geofence + balanza)
  - `src/native/platform-guard.js` — garantiza que solo corra en APK nativo
  - `src/native/geofence-manager.js` — geofence via `@capacitor/geolocation`
  - `src/native/fcm-handler.js` — FCM via `@capacitor-firebase/messaging`
  - `workers/fcm-send.js` — endpoint Worker para enviar comandos FCM al APK
- Plugins adicionales: `@capacitor/geolocation`, `@capacitor/local-notifications`, `@capacitor/push-notifications`, `@capacitor/app`, `@capacitor/preferences`, `@capacitor-firebase/messaging`

---

## Flujo de venta automática (APK nativo)

```
GeofenceBleService (Kotlin, siempre activo)
    ├── GPS watcher → detecta cliente cercano en radio 150m
    ├── BLE → recibe peso de balanza CAMRY
    └── auto-sale-engine.js (orquestador JS)
            ├── peso > 3.50 lb estable 2s → commitSale()
            ├── guarda en SalesModule (IndexedDB)
            └── notificación: "Venta registrada — Juan Pérez · 4.32 lb · $18.50"
```

**Garantías:**
- App minimizada ✅ — FG service independiente del Activity
- App cerrada ✅ — FG service sobrevive
- Pantalla bloqueada ✅ — wakelock parcial activo
- Doze mode ✅ — FG service exento
- Reinicio del teléfono ✅ — BootReceiver reanuda el servicio
- TWA pública ✅ — platform-guard desactiva todo automáticamente

**Salvaguardas anti-error:**
- Mínimo 3 lecturas estables (spread < 0.07 lb) en 2s
- 1 venta máx por cliente cada 60s
- Solo dispara dentro de geofence activo

---

## CI/CD — GitHub Actions

### Workflow `build-android.yml` (branch `main`)
Genera APK básico con BLE + FCM básico + GPS. Envía a Telegram como `GallOli.apk`.

### Workflow `build-android-apk.yml` (branch `apk-native`)
Genera APK nativo completo con todos los plugins y archivos Kotlin. Envía a Telegram como `GallOli-Native.apk`.

**Pasos clave de ambos workflows:**
1. `npm install` + build BLE bundle con esbuild
2. Copia archivos web a `www/` (incluyendo `src/native/` en apk-native)
3. `npx cap add android` + `npx cap sync android`
4. Genera iconos y splash screens con ImageMagick
5. Copia archivos Java/Kotlin desde `.github/android-src/`
6. Inyecta `google-services.json` desde secret `GOOGLE_SERVICES_JSON`
7. Parchea `AndroidManifest.xml` con Python (evita problemas de escaping de `sed`)
8. Parchea `build.gradle` con Firebase via `patch_firebase.py`
9. `./gradlew assembleDebug` → APK
10. Envía APK a canal Telegram via `send_apk.py`

### Archivos nativos (`.github/android-src/`)
| Archivo | Branch | Función |
|---------|--------|---------|
| `MainActivity.java` | ambos | Registra plugins, pide permisos BLE/GPS/notificaciones |
| `BleForegroundService.java` | ambos | Foreground service BLE + GPS + pesaje automático en Java |
| `BleForegroundPlugin.java` | ambos | Plugin Capacitor — expone métodos al JS |
| `GalloliFirebaseService.java` | ambos | Recibe FCM push, guarda token en SharedPreferences |
| `MainActivityFcm.java` | ambos | MainActivity con FCM (usado como MainActivity.java en CI) |
| `GeofenceBleService.kt` | apk-native | Foreground service Kotlin con wakelock, sobrevive a Doze |
| `BootReceiver.kt` | apk-native | Arranca el servicio al reiniciar el teléfono |

### Secrets requeridos en GitHub
| Secret | Descripción |
|--------|-------------|
| `TELEGRAM_API_ID` | API ID de my.telegram.org |
| `TELEGRAM_API_HASH` | API Hash de my.telegram.org |
| `TELEGRAM_SESSION` | String de sesión generado por `gen_session.py` |
| `GOOGLE_SERVICES_JSON` | Contenido completo del `google-services.json` de Firebase |

---

## Estructura de Archivos

```
/
├── index.html
├── sw.js                          # APP_VERSION — incrementar SIEMPRE antes de deploy
├── manifest.json                  # start_url y scope apuntan a galloli.ivapps.store
├── capacitor.config.ts            # appId: store.ivapps.galloli
├── _headers                       # Headers Cloudflare Pages
├── css/styles.css
├── js/
│   ├── app.js                     # App object — controlador principal (~6k LoC)
│   ├── modules.js                 # Todos los módulos de datos (~4.5k LoC)
│   ├── auth.js                    # AuthManager (window.AuthManager)
│   ├── sync-engine.js             # SyncEngine (WebSocket + REST)
│   ├── auto-backup.js             # AutoBackup (10 PM diario)
│   ├── db.js                      # IndexedDB wrapper
│   ├── utils.js                   # Utils + LocationModule
│   ├── creditos.js
│   ├── notify-system.js           # PushNotifications / NotificationsModule (VAPID)
│   ├── payment-processor.js
│   ├── pdf-generator.js
│   ├── offline-queue.js
│   ├── offline-maps.js            # OfflineMaps (Leaflet wrapper)
│   ├── facturacion-electronica.js
│   ├── facturacion-ui.js
│   ├── bluetooth-scale.js         # BluetoothScale — BLE balanza CAMRY
│   ├── geo-chain.js               # GeoChain — pesaje automático por GPS (TWA/PWA)
│   ├── ble-entry.js               # Entry point para esbuild → ble-bundle.js
│   └── ble-bundle.js              # Generado por CI. Stub vacío en PWA/TWA
├── src/
│   └── native/                    # Solo activo en APK nativo (platform-guard lo verifica)
│       ├── auto-sale-engine.js    # Motor de venta automática (orquestador)
│       ├── platform-guard.js      # Guard: solo corre en APK nativo
│       ├── geofence-manager.js    # Geofence via @capacitor/geolocation
│       └── fcm-handler.js         # FCM via @capacitor-firebase/messaging
├── .github/
│   ├── workflows/
│   │   ├── build-android.yml      # CI APK básico (branch main)
│   │   └── build-android-apk.yml  # CI APK nativo completo (branch apk-native)
│   ├── android-src/               # Archivos Java/Kotlin copiados al build
│   │   ├── MainActivity.java
│   │   ├── BleForegroundPlugin.java
│   │   ├── BleForegroundService.java
│   │   ├── GalloliFirebaseService.java
│   │   ├── MainActivityFcm.java
│   │   ├── GeofenceBleService.kt  # Solo usado en build-android-apk.yml
│   │   └── BootReceiver.kt        # Solo usado en build-android-apk.yml
│   └── scripts/
│       ├── send_apk.py
│       ├── patch_firebase.py
│       ├── disable_splash.py
│       └── gen_session.py
├── workers/
│   ├── index.js                   # Worker API REST + WebSocket + Cron
│   ├── session-manager.js
│   ├── fcm-send.js                # Endpoint para enviar comandos FCM al APK
│   ├── wrangler.toml
│   └── schema.sql
├── branch-apk/                    # Documentación y parche del APK nativo
│   ├── ARCHITECTURE.md
│   ├── INSTALL.md
│   ├── SECURITY_GUIDE.md
│   └── galloli-apk-patch/         # Archivos fuente del parche (ya aplicados)
├── .well-known/assetlinks.json    # Fingerprint Google Play Signing
├── GallOli - Google Play package2/ # Proyecto Android TWA (en .gitignore)
├── privacy.html
├── terms.html
├── feedback.html
└── wrangler.toml                  # Cloudflare Pages config
```

---

## Módulos (js/modules.js)

| Módulo | Store IndexedDB | Contenido |
|--------|----------------|-----------|
| `ClientsModule` | `clients` | Clientes, coordenadas GPS, activo/archivado |
| `SalesModule` | `sales` | Ventas, historial pagos, créditos |
| `OrdersModule` | `orders` | Pedidos |
| `AccountingModule` | `expenses` | Gastos |
| `MermaModule` | `prices` + `mermaRecords` | Precios diarios, cálculo merma |
| `DiezmosModule` | `diezmos` | Diezmos y ofrendas |
| `CreditosModule` | (usa SalesModule) | Créditos pendientes |
| `PaymentHistoryModule` | `paymentHistory` | Historial pagos |
| `BackupModule` | — | Backup Telegram + importación |
| `ConfigModule` | `config` | Colores, nombre, logo |
| `RutasModule` | — | Mapa de rutas con pedidos pendientes |

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

## Notificaciones Push

### VAPID (PWA/TWA)
- Keys guardadas como secrets en el Worker (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_X`, `VAPID_PUBLIC_Y`)
- Suscripciones en D1 tabla `push_subscriptions`
- Crons: 8AM, 12PM, 6PM, 10PM hora Ecuador (UTC-5 = UTC+0: 13, 17, 23, 03)
- Toggle en sidebar — `App.initNotifToggle()` se llama 3s después del init

### FCM (APK nativo)
- `GalloliFirebaseService.java` recibe push y muestra notificación aunque la app esté cerrada
- Token FCM guardado en SharedPreferences al recibirlo
- `auto-sale-engine.js` registra el token en el Worker via `/api/fcm/register`
- `workers/fcm-send.js` envía comandos remotos al APK (pause/resume/reload/set-radius)
- Secret requerido: `FCM_SERVICE_ACCOUNT_JSON` (service account de Firebase) y `FCM_PROJECT_ID`

### Notificaciones del foreground service (APK nativo)
- Canal persistente (baja prioridad, sin sonido): muestra estado en tiempo real
  - `GallOli — Juan Pérez | Pon un pollo | Hoy: 5 ventas $47.30`
  - `GallOli — Balanza desconectada | Reconectando...`
  - `GallOli — Pesaje activo | Pesando: 4.320 lb — estabilizando...`
- Canal de alertas (alta prioridad, vibra): heads-up al registrar venta
  - `Venta registrada — Juan Pérez`
  - `4.320 lb — $18.50 | Hoy: 6 ventas $65.80`

---

## BleForegroundPlugin — Métodos expuestos al JS

| Método | Descripción |
|--------|-------------|
| `start()` | Inicia el foreground service |
| `stop()` | Detiene el foreground service |
| `updateWeight({weight})` | JS pasa el peso actual al servicio |
| `getLocation()` | → `{lat, lng, hasLocation}` |
| `getWeight()` | → `{weight}` |
| `syncClients({clientsJson})` | Sincroniza lista de clientes al servicio |
| `syncSalePrice({price})` | Sincroniza precio del día al servicio |
| `saveBleDeviceId({deviceId})` | Guarda device ID para reconexión automática |
| `getPendingSales()` | → `{sales}` JSON de ventas registradas en background |
| `clearPendingSales()` | Limpia la cola de ventas pendientes |
| `getFcmToken()` | → `{token, hasToken}` — lee token FCM de SharedPreferences |
| `resetDayCounters()` | Resetea contadores del día en el servicio |

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

### PWA/TWA — cambios en JS/CSS/HTML (branch `main`):
```bash
git add . ; git commit -m "vX.X.X - descripcion" ; git push origin main ; wrangler pages deploy . --project-name=galloli --branch=main
```
El push a `main` también dispara `build-android.yml` → APK básico a Telegram.

### Worker modificado — primero Worker, luego Pages:
```bash
# Desde workers/
wrangler deploy
# Luego desde raiz:
git add . ; git commit -m "vX.X.X - descripcion" ; git push origin main ; wrangler pages deploy . --project-name=galloli --branch=main
```

### APK nativo (branch `apk-native`):
```bash
git checkout apk-native
# hacer cambios...
git add . ; git commit -m "vX.X.X - descripcion" ; git push origin apk-native
# El workflow build-android-apk.yml se dispara automáticamente → GallOli-Native.apk a Telegram
```

### TWA para Play Store (build manual):
```powershell
# Desde GallOli - Google Play package2/
# 1. Incrementar versionCode y versionName en app/build.gradle y twa-manifest.json
$keystore = "C:\Users\Ivan Quiñonez\Desktop\github-repos\GalloApp\GallOli - Google Play package2\signing.keystore"
.\gradlew clean bundleRelease "-Pandroid.injected.signing.store.file=$keystore" "-Pandroid.injected.signing.store.password=PASS" "-Pandroid.injected.signing.key.alias=galloli-iQ-Apps" "-Pandroid.injected.signing.key.password=PASS"
# AAB en: app\build\outputs\bundle\release\app-release.aab
# Probar con ADB antes de subir a Play Store
C:\AndroidSDK\platform-tools\adb.exe install -r "app\build\outputs\apk\release\app-release.apk"
```

### Versionado:
- `sw.js` → `const APP_VERSION = 'X.X.X'` — incrementar SIEMPRE en ambos branches
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
| `FCM_SERVICE_ACCOUNT_JSON` | Secret | Service account Firebase para FCM HTTP v1 |
| `FCM_PROJECT_ID` | Var | ID del proyecto Firebase |
| `DB` | D1 | Base de datos |
| `SESSION_MANAGER` | Durable Object | WebSockets |
| `ENVIRONMENT` | Var | `"production"` |

---

## Reglas de Desarrollo

1. **Incrementar `APP_VERSION` en `sw.js`** antes de cada deploy (en ambos branches)
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
13. **ENCODING CRÍTICO**: NUNCA usar PowerShell para reescribir archivos JS/HTML con caracteres especiales (ó, á, ú, ñ, ¿, emojis). PowerShell corrompe el encoding UTF-8. Usar SIEMPRE `strReplace` o `fsWrite` de Kiro.
14. **Branches**: `main` = PWA + TWA + APK básico. `apk-native` = APK de producción del dueño. NUNCA mergear `apk-native` → `main`.
15. **APK Capacitor vs TWA**: El APK (`store.ivapps.galloli`) tiene APIs nativas reales. El TWA (`dev.pages.galloli.twa`) es solo Chrome. `window.Capacitor.Plugins.BleForeground` solo funciona en APK.
16. **ble-bundle.js**: Stub en PWA/TWA. En APK generado por esbuild en CI desde `js/ble-entry.js`.
17. **Archivos Java/Kotlin nativos**: Editar en `.github/android-src/`. El CI los copia al proyecto Android. NUNCA editar directamente en `android/` (no está en git).
18. **AndroidManifest patch**: Usar Python (no `sed`) para evitar problemas de escaping con caracteres como `|` en `foregroundServiceType`.
19. **Coordenadas de clientes**: Siempre usar `c.coordinates.lat` y `c.coordinates.lng` (objeto numérico). El campo `c.gps` NO existe — error histórico corregido.
20. **GeoChain (js/geo-chain.js)**: Pesaje automático por GPS para PWA/TWA. Radio 500m. Detecta cliente más cercano usando `c.coordinates`. Registra venta cuando peso > 3.50 lb estable 1.5s.
21. **auto-sale-engine.js (src/native/)**: Motor de venta automática para APK nativo. Se autodescarta en TWA/PWA via `platform-guard.js`. Usa `@capacitor/geolocation` + `@capacitor/local-notifications`. Radio 150m, 3 lecturas estables, 1 venta/cliente/60s.
22. **BleForegroundService**: Dos canales de notificación — `galloli_ble_channel` (persistente, baja prioridad) y `galloli_alerts_channel` (heads-up, alta prioridad con vibración al registrar venta).
23. **Pesaje en segundo plano**: `BleForegroundService.java` recibe BLE en Java, detecta peso estable > 3.50 lb, busca cliente en 500m via SharedPreferences, guarda en `KEY_PENDING_SALES`. Al abrir la app, `App._processPendingNativeSales()` procesa la cola.
24. **Sincronización al servicio nativo**: `App._syncDataToNativeService()` envía clientes + precio del día al servicio al iniciar. `BluetoothScale._syncToNativeService(deviceId)` lo llama también al conectar la balanza.
25. **Activación automática**: Al conectar la balanza, `BluetoothScale._activateAutoMode()` abre `App.startChainWeighing()` automáticamente si hay precio del día. Sin presionar ningún botón.
26. **FCM en APK**: El token FCM se genera en `GalloliFirebaseService.java` y se registra en el Worker via `auto-sale-engine.js` → `/api/fcm/register`. `workers/fcm-send.js` envía comandos remotos (pause/resume/reload/set-radius/force-sync).
27. **branch-apk/**: Carpeta de documentación del parche APK nativo. Contiene `ARCHITECTURE.md`, `INSTALL.md`, `SECURITY_GUIDE.md` y los archivos fuente originales del parche (ya aplicados al proyecto).

---

## Contexto de Negocio

- Venta de pollos pelados en Guatemala/Ecuador
- Moneda configurable (GTQ / USD)
- Vendedor en campo con rutas diarias
- Merma = diferencia peso vivo vs pelado
- Diezmos = % configurable de ganancia neta
- Facturación electrónica SRI Ecuador (en desarrollo, `sriEnabled: false`)

---

## Cómo comunicarse con Kiro en este proyecto

### Formato de indicación efectiva

Para que Kiro trabaje bien, una indicación debe tener:

1. **Qué** — qué quieres que haga (acción concreta)
2. **Dónde** — en qué parte del proyecto (branch, archivo, módulo)
3. **Contexto** — qué está pasando ahora o qué no funciona

**Ejemplo malo:** `arregla el gps`
**Ejemplo bueno:** `en el modo pesaje en cadena (app.js) el indicador GPS siempre dice "sin cliente cercano" aunque estoy en el mismo lugar donde creé los clientes`

---

### Indicar el branch activo

Siempre especifica si el cambio es para:
- **`main`** → PWA, TWA, APK básico
- **`apk-native`** → APK de producción del dueño

Si no lo dices, Kiro asume `main`.

---

### Pegar errores de consola

Cuando algo no funciona, pega el error exacto de la consola del navegador o de Android Studio. Kiro puede diagnosticar mucho más rápido con el stack trace que con una descripción.

**Formato útil:**
```
Error: RutasModule.inicializarMapa is not a function
  at app.js:3567
```

---

### Describir el comportamiento esperado vs actual

| Campo | Ejemplo |
|-------|---------|
| **Esperado** | Al poner un pollo en la balanza, la venta se registra sola |
| **Actual** | El indicador dice "estabilizando" pero nunca registra |
| **Condición** | App abierta, balanza conectada, cliente seleccionado |

---

### Indicar si ya desplegaste o no

- `ya desplegaste` → Kiro hace commit + push + wrangler deploy
- `solo haz los cambios` → Kiro modifica archivos sin desplegar
- Si no dices nada, Kiro despliega por defecto

---

### Palabras clave útiles para este proyecto

| Palabra | Kiro entiende |
|---------|---------------|
| `apk` | Branch `apk-native`, archivos Java/Kotlin, CI `build-android-apk.yml` |
| `twa` | Branch `main`, Play Store, Bubblewrap |
| `pwa` | Branch `main`, Cloudflare Pages, Service Worker |
| `worker` | `workers/index.js`, Cloudflare Workers, D1 |
| `balanza` | `js/bluetooth-scale.js`, BLE, CAMRY |
| `pesaje en cadena` | `App.startChainWeighing()` en `js/app.js` |
| `modo automatico` | `src/native/auto-sale-engine.js` + `BleForegroundService` |
| `servicio nativo` | `BleForegroundService.java` + `GeofenceBleService.kt` |
| `notificaciones` | VAPID (PWA) o FCM (APK) según contexto |
| `coordenadas` | `c.coordinates.lat` / `c.coordinates.lng` — NUNCA `c.gps` |
| `steering` | `.kiro/steering/galloli-project.md` |

---

### Lo que Kiro hace automáticamente sin que lo pidas

- Incrementar `APP_VERSION` en `sw.js` antes de cada deploy
- Actualizar el steering cuando hay cambios arquitectónicos importantes
- Leer el código antes de modificarlo (nunca escribe a ciegas)
- Usar Python en vez de `sed` para parchear XML/manifests
- Usar `strReplace` o `fsWrite` para archivos con caracteres especiales (nunca PowerShell)

---

### Lo que Kiro NO hace sin que lo pidas explícitamente

- Crear tests
- Mergear branches
- Subir a Play Store
- Modificar secrets de GitHub o Cloudflare
- Activar facturación SRI (`sriEnabled` está en `false` por diseño)
