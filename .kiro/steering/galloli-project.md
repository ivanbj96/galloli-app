---
inclusion: always
---

# GallOli — Guía Completa del Proyecto

## Qué es GallOli

PWA + TWA (Google Play) de gestión integral para venta de pollos pelados. Uso en campo: ventas, pedidos, clientes con GPS, merma, contabilidad, créditos. Offline-first con sync en la nube. Dueño: Ivan Quiñonez (ivqb96@gmail.com).

---

## Stack

- **Frontend**: HTML/CSS/JS vanilla, IndexedDB, Service Worker, Leaflet.js, jsPDF
- **Hosting**: Cloudflare Pages → `https://galloli.pages.dev`
- **Worker API**: `https://galloli-sync.ivanbj-96.workers.dev` (nombre: `galloli-sync`, archivo: `workers/index.js`)
- **DB**: Cloudflare D1 SQLite → `galloli` (id: `c5dd06b9-2998-49d5-834e-fd0d5f7f8da1`)
- **Realtime**: Durable Objects `SessionManager` para WebSockets
- **Auth**: JWT HMAC-SHA256, login con Telegram / Email / PIN

---

## Estructura de Archivos

```
/
├── index.html          # SPA principal
├── sw.js               # Service Worker — APP_VERSION aquí
├── manifest.json       # PWA manifest
├── css/styles.css
├── js/
│   ├── app.js          # App object — controlador principal
│   ├── modules.js      # Todos los módulos de datos
│   ├── auth.js         # AuthManager
│   ├── sync-engine.js  # SyncEngine (WebSocket + REST)
│   ├── auto-backup.js  # AutoBackup (10 PM diario)
│   ├── db.js           # IndexedDB wrapper
│   ├── utils.js
│   ├── creditos.js     # CreditosModule
│   ├── notify-system.js # PushNotifications / NotificationsModule
│   ├── payment-processor.js
│   ├── pdf-generator.js
│   ├── offline-queue.js
│   ├── offline-maps.js
│   ├── facturacion-electronica.js
│   └── facturacion-ui.js
├── workers/
│   ├── index.js        # Worker API REST + WebSocket + Cron
│   ├── session-manager.js
│   ├── wrangler.toml
│   └── schema.sql
├── .well-known/assetlinks.json  # TWA fingerprint
├── privacy.html
├── terms.html
├── feedback.html       # Formulario → Telegram del dev
└── wrangler.toml       # Cloudflare Pages config
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

**Páginas públicas** (accesibles desde sidebar y URL directa):
- `/feedback.html` — comentarios → Telegram del dev
- `/privacy.html` — política de privacidad
- `/terms.html` — términos y condiciones

---

## Layout Visual

- **Desktop (>1024px)**: sidebar fijo a la izquierda, siempre visible. El botón hamburguesa lo colapsa con clase `collapsed`. El `main-content` tiene `margin-left: var(--sidebar-width)`.
- **Móvil (≤1024px)**: sidebar oculto por defecto, se abre con clase `active` + overlay. Bottom nav visible.
- **Header**: logo + botón hamburguesa (siempre visible) + botón sync (llama `SyncEngine.forceFullSync()` si hay sesión activa).
- Los links de Privacidad/Términos/Feedback están al final del sidebar, antes del toggle de modo desarrollo.

---

## Sistema de Backup — MÁXIMA PRIORIDAD

Cuando se agregue cualquier dato nuevo, actualizar TODOS estos puntos:

1. `BackupModule.createBackup()` en `js/modules.js` (~línea 2850)
2. `runScheduledBackup()` en `workers/index.js` (~línea 130)
3. `handleBackup()` en `workers/index.js` (~línea 950)
4. `getLocalData()` en `js/sync-engine.js` (~línea 530)
5. `BackupModule.importFromData()` en `js/modules.js` (~línea 2920)

**Estructura completa del backup:**
```javascript
{
  clients, sales, orders, expenses,
  mermaPrices, mermaRecords,
  diezmosRecords, diezmosConfig,
  paymentHistory,
  creditosData: { creditSales, paymentHistory },
  config: { appName, primaryColor, secondaryColor, ... },
  telegramConfig: { botToken, chatId },
  metadata: { exportDate, version, totalClients, ... }
}
```

**Credenciales Telegram del usuario**: guardadas encriptadas en IndexedDB `GallOliSecure`. Acceso via `AutoBackup.saveCredentials()` / `AutoBackup.getCredentials()`.

---

## Sistema de Sincronización

- `SyncEngine` en `js/sync-engine.js`
- WebSocket: `wss://galloli-sync.ivanbj-96.workers.dev/ws`
- REST: `https://galloli-sync.ivanbj-96.workers.dev/api/sync/`
- Merge por timestamp (`lastModified` > `timestamp` > `date`)
- Cola offline: `OfflineQueueManager`
- Tipos sincronizados: clients, sales, orders, expenses, prices, mermaRecords, diezmos, paymentHistory, config, telegramCredentials

---

## Sistema de Feedback

- Página: `/feedback.html` (rating 1-5 + mensaje)
- POST a `/api/feedback` en el Worker
- Worker reenvía al Telegram del dev (chat_id: `5115479408`)
- Secret en Worker: `FEEDBACK_BOT_TOKEN` — NUNCA exponer en frontend

---

## Notificaciones Push

- Sistema: `PushNotifications` / `NotificationsModule` en `js/notify-system.js`
- Requiere permisos del usuario — se solicitan al hacer clic en "Probar Notificaciones Push"
- Al conceder permisos, `requestPermission()` activa `isInitialized = true` y arranca verificaciones periódicas
- Verifica merma pendiente y créditos cada 5 minutos

---

## Google Play Store

- App ID: `dev.pages.galloli.twa`
- TWA generada con PWABuilder
- Fingerprint: `1D:D5:BE:56...` — debe coincidir con `.well-known/assetlinks.json`
- Carpetas `GallOli - Google Play package*/` y `*.keystore` en `.gitignore` — NUNCA trackear

---

## Despliegue

### Cloudflare Pages (frontend) — SIEMPRE en una línea:
```bash
git add . ; git commit -m "vX.X.X - descripción" ; wrangler pages deploy . --project-name=galloli --branch=main
```

### Cloudflare Worker (cuando se modifica workers/index.js):
```bash
# Ejecutar desde workers/ ANTES de desplegar Pages
wrangler deploy
```

### Versionado:
- Versión en `sw.js` → `const APP_VERSION = 'X.X.X'`
- Incrementar SIEMPRE antes de desplegar
- Formato commit: `"vX.X.X - descripción breve"`

---

## Variables del Worker

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `JWT_SECRET` | Secret | Firma JWT |
| `TELEGRAM_BOT_TOKEN` | Secret | Bot auth Telegram |
| `FEEDBACK_BOT_TOKEN` | Secret | Bot feedback usuarios |
| `DB` | D1 | Base de datos |
| `SESSION_MANAGER` | Durable Object | WebSockets |
| `ENVIRONMENT` | Var | `"production"` |

---

## Reglas de Desarrollo

1. **Incrementar `APP_VERSION` en `sw.js`** antes de cada deploy
2. **No crear archivos markdown de resumen** — informar solo en el chat (2-3 oraciones)
3. **No crear** `CHANGES.md`, `SUMMARY.md`, `UPDATE.md`, `CHANGELOG.md` ni ningún `.md` de resumen
4. **Backup completeness**: dato nuevo = actualizar los 5 puntos de backup
5. **No exponer secrets en frontend** — usar Worker como proxy
6. **Google Play carpetas son sensibles** — están en `.gitignore`
7. **Modificar Worker** → `wrangler deploy` desde `workers/` ANTES de Pages
8. **Visualizar mentalmente el app** antes de hacer cambios de UI: el sidebar está a la izquierda en desktop, bottom nav en móvil, header con hamburguesa + sync arriba

---

## Contexto de Negocio

- Venta de pollos pelados en Guatemala/Ecuador
- Moneda configurable (GTQ / USD)
- Vendedor en campo con rutas diarias
- Merma = diferencia peso vivo vs pelado
- Diezmos = % configurable de ganancia neta (uso personal del dueño)
- Facturación electrónica SRI Ecuador (en desarrollo)
