---
inclusion: always
---

# GallOli — Guia Completa del Proyecto

## Que es GallOli

PWA + TWA (Google Play) + APK nativo Capacitor de gestion integral para venta de pollos pelados. Uso en campo: ventas, pedidos, clientes con GPS, merma, contabilidad, creditos. Offline-first con sync en la nube. Dueno: Ivan Quinonez (ivqb96@gmail.com).

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

### 2. APK Capacitor basico — branch `main`
- Generado por `.github/workflows/build-android.yml` en cada push a `main`
- App ID: `store.ivapps.galloli`
- Incluye: BLE foreground service, FCM basico, GPS background
- Enviado al canal Telegram "GallOli Builds"

### 3. APK Nativo completo — branch `apk-native` (APK de produccion del dueno)
- Generado por `.github/workflows/build-android-apk.yml` en cada push a `apk-native`
- **NUNCA** mergear `apk-native` → `main`
- Incluye todo lo del APK basico MAS:
  - `GeofenceBleService.kt` — foreground service Kotlin con wakelock, sobrevive a Doze
  - `BootReceiver.kt` — arranca el servicio automaticamente al reiniciar el telefono
  - `src/native/auto-sale-engine.js` — motor de venta automatica (geofence + balanza)
  - `src/native/platform-guard.js` — garantiza que solo corra en APK nativo
  - `src/native/geofence-manager.js` — geofence via `@capacitor/geolocation`
  - `src/native/fcm-handler.js` — FCM via `@capacitor-firebase/messaging`
  - `workers/fcm-send.js` — endpoint Worker para enviar comandos FCM al APK

---

## Flujo de venta automatica (APK nativo)

```
GeofenceBleService (Kotlin, siempre activo)
    GPS watcher → detecta cliente cercano en radio 150m
    BLE → recibe peso de balanza CAMRY
    auto-sale-engine.js (orquestador JS)
        peso > 3.50 lb estable 2s → commitSale()
        guarda en SalesModule (IndexedDB)
        notificacion: "Venta registrada — Juan Perez · 4.32 lb · $18.50"
```

**Garantias:**
- App minimizada: FG service independiente del Activity
- App cerrada: FG service sobrevive
- Pantalla bloqueada: wakelock parcial activo
- Doze mode: FG service exento
- Reinicio del telefono: BootReceiver reanuda el servicio
- TWA publica: platform-guard desactiva todo automaticamente

**Salvaguardas anti-error:**
- Minimo 3 lecturas estables (spread < 0.07 lb) en 2s
- 1 venta max por cliente cada 60s
- Solo dispara dentro de geofence activo

---

## CI/CD — GitHub Actions

### Workflow `build-android.yml` (branch `main`)
Genera APK basico con BLE + FCM basico + GPS. Envia a Telegram como `GallOli.apk`.

### Workflow `build-android-apk.yml` (branch `apk-native`)
Genera APK nativo completo con todos los plugins y archivos Kotlin. Envia a Telegram como `GallOli-Native.apk`.

**Pasos clave de ambos workflows:**
1. `npm install` + build BLE bundle con esbuild
2. Copia archivos web a `www/` (incluyendo `src/native/` en apk-native)
3. `npx cap add android` + `npx cap sync android`
4. Genera iconos y splash screens con ImageMagick
5. Elimina `ic_launcher_background.xml` antes de parchear `colors.xml` (evita duplicate resources)
6. Copia archivos Java/Kotlin desde `.github/android-src/`
7. Inyecta `google-services.json` desde secret `GOOGLE_SERVICES_JSON`
8. Parchea `AndroidManifest.xml` con Python (evita problemas de escaping de `sed`)
9. Parchea `build.gradle` con Firebase via `patch_firebase.py`
10. `./gradlew assembleDebug` → APK
11. Envia APK a canal Telegram via script dedicado

### Archivos nativos (`.github/android-src/`)
| Archivo | Branch | Funcion |
|---------|--------|---------|
| `MainActivity.java` | ambos | Registra plugins, pide permisos BLE/GPS/notificaciones |
| `BleForegroundService.java` | ambos | Foreground service BLE + GPS + pesaje automatico en Java |
| `BleForegroundPlugin.java` | ambos | Plugin Capacitor — expone metodos al JS |
| `GalloliFirebaseService.java` | ambos | Recibe FCM push, guarda token en SharedPreferences |
| `MainActivityFcm.java` | ambos | MainActivity con FCM (usado como MainActivity.java en CI) |
| `GeofenceBleService.kt` | apk-native | Foreground service Kotlin con wakelock, sobrevive a Doze |
| `BootReceiver.kt` | apk-native | Arranca el servicio al reiniciar el telefono |

### Secrets requeridos en GitHub
| Secret | Descripcion |
|--------|-------------|
| `TELEGRAM_API_ID` | API ID de my.telegram.org |
| `TELEGRAM_API_HASH` | API Hash de my.telegram.org |
| `TELEGRAM_SESSION` | String de sesion generado por `gen_session.py` |
| `GOOGLE_SERVICES_JSON` | Contenido completo del `google-services.json` de Firebase |

---

## Estructura de Archivos

```
/
├── index.html
├── sw.js                          # APP_VERSION — incrementar SIEMPRE antes de deploy
├── manifest.json
├── capacitor.config.ts            # appId: store.ivapps.galloli
├── _headers                       # Headers Cloudflare Pages
├── css/styles.css
├── js/
│   ├── app.js                     # App object — controlador principal
│   ├── modules.js                 # Todos los modulos de datos
│   ├── auth.js                    # AuthManager (window.AuthManager)
│   ├── sync-engine.js             # SyncEngine (WebSocket + REST)
│   ├── auto-backup.js             # AutoBackup (10 PM diario, solo si servidor no activo)
│   ├── db.js                      # IndexedDB wrapper
│   ├── utils.js                   # Utils + LocationModule
│   ├── creditos.js
│   ├── notify-system.js           # PushNotifications / NotificationsModule (VAPID + FCM)
│   ├── payment-processor.js
│   ├── pdf-generator.js
│   ├── offline-queue.js
│   ├── offline-maps.js
│   ├── facturacion-electronica.js
│   ├── facturacion-ui.js
│   ├── bluetooth-scale.js         # BluetoothScale — BLE balanza CAMRY
│   ├── geo-chain.js               # GeoChain — pesaje automatico por GPS (TWA/PWA)
│   ├── ble-entry.js               # Entry point para esbuild → ble-bundle.js
│   └── ble-bundle.js              # Generado por CI. Stub vacio en PWA/TWA
├── src/
│   └── native/                    # Solo activo en APK nativo (platform-guard lo verifica)
│       ├── auto-sale-engine.js    # Motor de venta automatica (orquestador)
│       ├── platform-guard.js      # Guard: solo corre en APK nativo
│       ├── geofence-manager.js    # Geofence via @capacitor/geolocation
│       └── fcm-handler.js         # FCM via @capacitor-firebase/messaging
├── .github/
│   ├── workflows/
│   │   ├── build-android.yml      # CI APK basico (branch main)
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
│       ├── send_apk.py            # Envia APK basico a Telegram
│       ├── send_native_apk.py     # Envia APK nativo a Telegram
│       ├── patch_firebase.py
│       ├── disable_splash.py
│       └── gen_session.py
├── workers/
│   ├── index.js                   # Worker API REST + WebSocket + Cron
│   ├── session-manager.js
│   ├── fcm-send.js                # Endpoint para enviar comandos FCM al APK
│   ├── wrangler.toml
│   └── schema.sql
├── branch-apk/                    # Documentacion y parche del APK nativo (en .gitignore)
├── ideas/                         # Backlog privado de ideas (en .gitignore)
├── .well-known/assetlinks.json    # Fingerprint Google Play Signing
├── GallOli - Google Play package2/ # Proyecto Android TWA (en .gitignore)
├── privacy.html
├── terms.html
├── feedback.html
└── wrangler.toml                  # Cloudflare Pages config
```

---

## Modulos (js/modules.js)

| Modulo | Store IndexedDB | Contenido |
|--------|----------------|-----------|
| `ClientsModule` | `clients` | Clientes, coordenadas GPS, activo/archivado |
| `SalesModule` | `sales` | Ventas, historial pagos, creditos |
| `OrdersModule` | `orders` | Pedidos |
| `AccountingModule` | `expenses` | Gastos |
| `MermaModule` | `prices` + `mermaRecords` | Precios diarios, calculo merma |
| `DiezmosModule` | `diezmos` | Diezmos y ofrendas |
| `CreditosModule` | (usa SalesModule) | Creditos pendientes |
| `PaymentHistoryModule` | `paymentHistory` | Historial pagos |
| `BackupModule` | — | Backup Telegram + importacion |
| `ConfigModule` | `config` | Colores, nombre, logo |
| `RutasModule` | — | Mapa de rutas con pedidos pendientes |

---

## Paginas SPA (App.loadPage)

`dashboard`, `sales`, `orders`, `clients`, `merma`, `stats`, `accounting`, `diezmos`, `backup`, `cloud-sync`, `rutas`, `creditos`, `payment-history`, `config`

---

## Layout Visual

- **Desktop (>1024px)**: sidebar fijo izquierda, hamburguesa lo colapsa con clase `collapsed`
- **Movil (<=1024px)**: sidebar oculto, se abre con clase `active` + overlay. Bottom nav visible
- **Header**: logo + hamburguesa + boton sync (`SyncEngine.forceFullSync()`)

---

## Sistema de Backup — MAXIMA PRIORIDAD

Cuando se agregue cualquier dato nuevo, actualizar TODOS estos puntos:

1. `BackupModule.createBackup()` en `js/modules.js`
2. `runScheduledBackup()` en `workers/index.js`
3. `handleBackup()` en `workers/index.js`
4. `getLocalData()` en `js/sync-engine.js`
5. `BackupModule.importFromData()` en `js/modules.js`

---

## Sistema de Sincronizacion

- WebSocket: `wss://galloli-sync.ivanbj-96.workers.dev/ws`
- REST: `https://galloli-sync.ivanbj-96.workers.dev/api/sync/`
- Tipos: clients, sales, orders, expenses, prices, mermaRecords, diezmos, paymentHistory, config, telegramCredentials
- `updateOrderStatus()` en modules.js llama `SyncEngine.addToQueue()` para sincronizar cambios de estado de pedidos

---

## Notificaciones Push

### VAPID (PWA/TWA)
- Keys guardadas como secrets en el Worker
- Suscripciones en D1 tabla `push_subscriptions`
- Crons: 8AM, 12PM, 6PM, 10PM hora Ecuador (UTC-5 = UTC+0: 13, 17, 23, 03)
- Toggle en sidebar — `App.initNotifToggle()` se llama 3s despues del init

### FCM (APK nativo)
- `GalloliFirebaseService.java` recibe push y muestra notificacion aunque la app este cerrada
- Token FCM guardado en SharedPreferences al recibirlo
- Al iniciar la app, `App._registerNativeFcmToken()` lee el token via `BleForeground.getFcmToken()` y lo registra en el Worker via `PushNotifications.registerFcmToken()`
- `workers/fcm-send.js` envia comandos remotos al APK (pause/resume/reload/set-radius/force-sync)
- Secrets requeridos: `FCM_SERVICE_ACCOUNT_JSON` y `FCM_PROJECT_ID`

### Contenido de notificaciones por hora (Worker cron)
| Hora Ecuador | Contenido |
|-------------|-----------|
| 8 AM | Buenos dias + creditos pendientes con nombre del cliente mas antiguo |
| 12 PM | Estado del dia: ventas, monto, lb, merma calculada o pendiente |
| 6 PM | Alertas finales: merma sin calcular, ventas a credito del dia, deuda total |
| 10 PM | Resumen completo del dia + "Backup enviado" |

### Notificaciones del foreground service (APK nativo)
- Canal persistente (baja prioridad): estado en tiempo real
  - `GallOli — Juan Perez | Pon un pollo | Hoy: 5 ventas $47.30`
  - `GallOli — Balanza desconectada | Reconectando...`
- Canal de alertas (alta prioridad, vibra): heads-up al registrar venta
  - `Venta registrada — Juan Perez`
  - `4.320 lb — $18.50 | Hoy: 6 ventas $65.80`

---

## BleForegroundPlugin — Metodos expuestos al JS

| Metodo | Descripcion |
|--------|-------------|
| `start()` | Inicia el foreground service |
| `stop()` | Detiene el foreground service |
| `updateWeight({weight})` | JS pasa el peso actual al servicio |
| `getLocation()` | → `{lat, lng, hasLocation}` |
| `getWeight()` | → `{weight}` |
| `setChainModalActive({active})` | Activa/desactiva flag para evitar doble factura cuando el modal JS esta abierto |
| `getFcmToken()` | → `{token, hasToken}` — lee token FCM de SharedPreferences |
| `syncClients({clientsJson})` | Sincroniza lista de clientes al servicio |
| `syncSalePrice({price})` | Sincroniza precio del dia al servicio |
| `saveBleDeviceId({deviceId})` | Guarda device ID para reconexion automatica |
| `getPendingSales()` | → `{sales}` JSON de ventas registradas en background |
| `clearPendingSales()` | Limpia la cola de ventas pendientes |
| `resetDayCounters()` | Resetea contadores del dia en el servicio |

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

### Worker modificado — primero Worker, luego Pages:
```bash
# Desde workers/
wrangler deploy
# Luego desde raiz (branch main):
git add . ; git commit -m "vX.X.X - descripcion" ; git push origin main ; wrangler pages deploy . --project-name=galloli --branch=main
```

### APK nativo (branch `apk-native`):
```bash
git checkout apk-native
# hacer cambios...
git add . ; git commit -m "vX.X.X - descripcion" ; git push origin apk-native
# El workflow build-android-apk.yml se dispara automaticamente
```

### TWA para Play Store (build manual):
```powershell
# Desde GallOli - Google Play package2/
$keystore = "C:\Users\Ivan Quinonez\Desktop\github-repos\GalloApp\GallOli - Google Play package2\signing.keystore"
.\gradlew clean bundleRelease "-Pandroid.injected.signing.store.file=$keystore" "-Pandroid.injected.signing.store.password=PASS" "-Pandroid.injected.signing.key.alias=galloli-iQ-Apps" "-Pandroid.injected.signing.key.password=PASS"
C:\AndroidSDK\platform-tools\adb.exe install -r "app\build\outputs\apk\release\app-release.apk"
```

### Versionado:
- `sw.js` → `const APP_VERSION = 'X.X.X'` — incrementar SIEMPRE en ambos branches
- Commit: `"vX.X.X - descripcion breve"`
- TWA: `versionCode` entero creciente en `build.gradle` y `twa-manifest.json`

---

## Variables del Worker

| Variable | Tipo | Descripcion |
|----------|------|-------------|
| `JWT_SECRET` | Secret | Firma JWT |
| `TELEGRAM_BOT_TOKEN` | Secret | Bot auth Telegram |
| `FEEDBACK_BOT_TOKEN` | Secret | Bot feedback usuarios |
| `VAPID_PUBLIC_KEY` | Secret | Clave publica VAPID push |
| `VAPID_PRIVATE_KEY` | Secret | Clave privada VAPID push |
| `VAPID_PUBLIC_X` | Secret | Coordenada X de la clave publica |
| `VAPID_PUBLIC_Y` | Secret | Coordenada Y de la clave publica |
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
13. **ENCODING CRITICO**: NUNCA usar PowerShell para reescribir archivos JS/HTML con caracteres especiales. PowerShell corrompe el encoding UTF-8. Usar SIEMPRE `strReplace` o `fsWrite` de Kiro.
14. **Branches**: `main` = PWA + TWA + APK basico. `apk-native` = APK de produccion del dueno. NUNCA mergear `apk-native` → `main`. Fixes comunes se aplican en ambos branches por separado.
15. **DEPLOY CRITICO**: El deploy a Cloudflare Pages SIEMPRE desde branch `main` con todos los cambios commiteados. NUNCA desde `apk-native` ni con archivos sin commitear — rompe la TWA con 404 en todos los archivos.
16. **APK Capacitor vs TWA**: El APK tiene APIs nativas reales. El TWA es solo Chrome. `window.Capacitor.Plugins.BleForeground` solo funciona en APK.
17. **ble-bundle.js**: Stub en PWA/TWA. En APK generado por esbuild en CI desde `js/ble-entry.js`.
18. **Archivos Java/Kotlin nativos**: Editar en `.github/android-src/`. NUNCA editar directamente en `android/` (no esta en git).
19. **AndroidManifest patch**: Usar Python (no `sed`) para evitar problemas de escaping con `|` en `foregroundServiceType`. Eliminar `ic_launcher_background.xml` antes de parchear `colors.xml`.
20. **Coordenadas de clientes**: Siempre usar `c.coordinates.lat` y `c.coordinates.lng` (objeto numerico). El campo `c.gps` NO existe.
21. **GeoChain (js/geo-chain.js)**: Pesaje automatico por GPS para PWA/TWA. Radio 500m. Detecta cliente mas cercano usando `c.coordinates`.
22. **auto-sale-engine.js**: Motor de venta automatica para APK nativo. Se autodescarta en TWA/PWA via `platform-guard.js`. Radio 150m, 3 lecturas estables, 1 venta/cliente/60s.
23. **BleForegroundService**: Dos canales — `galloli_ble_channel` (persistente) y `galloli_alerts_channel` (heads-up con vibracion al registrar venta).
24. **Pesaje en segundo plano**: `BleForegroundService.java` recibe BLE en Java, detecta peso > 3.50 lb estable, busca cliente en 500m via SharedPreferences, guarda en `KEY_PENDING_SALES`. Al abrir la app, `App._processPendingNativeSales()` procesa la cola.
25. **Sincronizacion al servicio nativo**: `App._syncDataToNativeService()` envia clientes + precio del dia al servicio al iniciar. `BluetoothScale._syncToNativeService(deviceId)` lo llama al conectar la balanza.
26. **Activacion automatica**: Al conectar la balanza, `BluetoothScale._activateAutoMode()` abre `App.startChainWeighing()` automaticamente si hay precio del dia. Sin presionar ningun boton.
27. **FCM en APK**: Token FCM generado en `GalloliFirebaseService.java`, leido via `BleForeground.getFcmToken()` al iniciar, registrado en Worker via `PushNotifications.registerFcmToken()`.
28. **Sync pedidos**: `updateOrderStatus()` en modules.js llama `SyncEngine.addToQueue()` para sincronizar cancelaciones y entregas al servidor.
29. **Backup del servidor**: `runScheduledBackup()` en workers/index.js incluye clients, sales, orders, expenses, prices, mermaRecords, diezmos, paymentHistory, config, telegramConfig. Caption sin emojis ni tildes para evitar encoding roto.
30. **Auto-backup cliente**: `auto-backup.js` solo hace backup local si el servidor NO esta activo (evita duplicados con el cron del Worker).

---

## Como comunicarse con Kiro en este proyecto

### Formato de indicacion efectiva

1. **Que** — que quieres que haga
2. **Donde** — branch, archivo, modulo
3. **Contexto** — que esta pasando o que no funciona

**Ejemplo malo:** `arregla el gps`
**Ejemplo bueno:** `en el modo pesaje en cadena (app.js, branch main) el indicador GPS siempre dice "sin cliente cercano" aunque estoy en el mismo lugar donde cree los clientes`

### Indicar el branch activo

- **`main`** → PWA, TWA, APK basico
- **`apk-native`** → APK de produccion del dueno

Si no lo dices, Kiro asume `main`.

### Palabras clave utiles

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
| `notificaciones` | VAPID (PWA) o FCM (APK) segun contexto |
| `coordenadas` | `c.coordinates.lat` / `c.coordinates.lng` — NUNCA `c.gps` |
| `steering` | `.kiro/steering/galloli-project.md` |

### Lo que Kiro hace automaticamente

- Incrementar `APP_VERSION` en `sw.js` antes de cada deploy
- Actualizar el steering cuando hay cambios arquitectonicos
- Leer el codigo antes de modificarlo
- Usar Python en vez de `sed` para parchear XML/manifests
- Usar `strReplace` o `fsWrite` para archivos con caracteres especiales
- Hacer deploy a Cloudflare Pages SIEMPRE desde branch `main`
- Asumir que Ivan siempre tiene el APK mas reciente instalado — nunca suponer version vieja

### Lo que Kiro NO hace sin que lo pidas

- Crear tests
- Mergear branches
- Subir a Play Store
- Modificar secrets de GitHub o Cloudflare
- Activar facturacion SRI (`sriEnabled` esta en `false` por diseno)

---

## Contexto de Negocio

- Venta de pollos pelados en Guatemala/Ecuador
- Moneda configurable (GTQ / USD)
- Vendedor en campo con rutas diarias
- Merma = diferencia peso vivo vs pelado
- Diezmos = % configurable de ganancia neta
- Facturacion electronica SRI Ecuador (en desarrollo, `sriEnabled: false`)
