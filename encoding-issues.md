# Reporte de Caracteres Corruptos — GallOli

## Causa del problema

PowerShell en Windows, cuando se usa para reescribir archivos JS/HTML con `echo`, `Set-Content`, o redirección `>`, corrompe los caracteres UTF-8 especiales (tildes, ñ, ¿, ¡, emojis) porque los convierte a secuencias de escape visibles o los reemplaza con el carácter de reemplazo Unicode `\uFFFD` (se ve como `?` o `□` o `½`).

---

## Tipos de corrupción encontrados

| Tipo | Descripción | Ejemplo corrupto | Debería ser |
|------|-------------|-----------------|-------------|
| `\uFFFD` | Carácter de reemplazo Unicode (PowerShell) | `CR\uFFFDTICO` | `CRÍTICO` |
| `\uFFFD` | Carácter de reemplazo Unicode | `telo½fono` | `teléfono` |
| `\uFFFD` | Carácter de reemplazo Unicode | `mo½s` | `más` |
| `\uFFFD` | Emoji corrupto | `'□️ Ver detalles'` | `'🔍 Ver detalles'` |
| `\uFFFD` | Emoji corrupto | `'□ Ubicación'` | `'📍 Ubicación'` |
| `\uFFFD` | Emoji corrupto | `'□ Verificando'` | `'🔐 Verificando'` |

---

## Archivos afectados (código fuente de la app)

### 1. `js/app.js` — 7 líneas afectadas

| Línea | Texto corrupto | Corrección |
|-------|---------------|------------|
| L1047 | `// CR\uFFFDTICO: Notificar al sistema...` | `// CRÍTICO: Notificar al sistema...` |
| L1639 | `<button ... disabled>` — contiene carácter invisible | Revisar encoding del botón |
| L1657 | `async executeDeleteAccount()` — carácter invisible | Revisar encoding |
| L2839 | `Puedes dejar vacío cualquier campo excepto` — posible corrupción invisible | Revisar |
| L3446 | `<input ... placeholder="123456:ABC-DEF..."` — carácter invisible | Revisar |
| L5029 | `'Para confirmar, escribe exactamente: ELIMINAR'` — carácter invisible | Revisar |
| L5576 | `console.log('□️ Ver detalles de créditos')` | `console.log('🔍 Ver detalles de créditos')` |

### 2. `js/modules.js` — 2 líneas afectadas

| Línea | Texto corrupto | Corrección |
|-------|---------------|------------|
| L71 | `// Coincidencia exacta de nombre` — carácter invisible | Revisar |
| L74 | `// Coincidencia exacta de telo½fono (sin formato)` | `// Coincidencia exacta de teléfono (sin formato)` |

### 3. `js/auth.js` — 1 línea afectada

| Línea | Texto corrupto | Corrección |
|-------|---------------|------------|
| L170 | `console.log('□ Verificando código...')` | `console.log('🔐 Verificando código...')` |

### 4. `js/sync-engine.js` — 1 línea afectada

| Línea | Texto corrupto | Corrección |
|-------|---------------|------------|
| L375 | `// CR\uFFFDTICO: Actualizar la lista visual de ventas` | `// CRÍTICO: Actualizar la lista visual de ventas` |

### 5. `js/error-handler.js` — 1 línea afectada

| Línea | Texto corrupto | Corrección |
|-------|---------------|------------|
| L47 | `<p><strong>□ Ubicación:</strong>` | `<p><strong>📍 Ubicación:</strong>` |

### 6. `sw.js` — 2 líneas afectadas

| Línea | Texto corrupto | Corrección |
|-------|---------------|------------|
| L207 | `// Ignorar solicitudes a APIs externas (excepto CDNs conocidas)` — carácter invisible | Revisar |
| L609 | `'⚠️ Monto Excedido'` — posible corrupción en emoji | Verificar que ⚠️ se muestre bien |

### 7. `workers/session-manager.js` — 1 línea afectada

| Línea | Texto corrupto | Corrección |
|-------|---------------|------------|
| L141 | `// Send to all connected users except sender` — carácter invisible | Revisar |

---

## Archivos NO afectados (falsos positivos del análisis)

Los siguientes archivos aparecieron en el análisis inicial pero son **falsos positivos** — el patrón `IndexedDB` contiene `xedDB` que coincide con el regex hex, pero no está corrupto:

- `js/db.js` — solo menciona `IndexedDB` (correcto)
- `js/auto-backup.js` — solo menciona `IndexedDB` (correcto)
- `js/offline-maps.js` — solo menciona `IndexedDB` (correcto)
- `js/offline-queue.js` — solo menciona `IndexedDB` (correcto)
- `README.md`, `privacy.html` — solo menciona `IndexedDB` (correcto)

## Archivos ignorados (no son código de la app)

- `GallOli - Google Play package2/app/build/**` — archivos de build compilados, no editables
- `logs3/`, `run_logs/`, `run_logs2/` — logs de GitHub Actions, no son código
- `package-lock.json`, `workers/package-lock.json` — generados automáticamente
- `.kiro/specs/**`, `.kiro/steering/**` — documentación interna de Kiro

---

## Resumen

| Archivo | Líneas corruptas | Prioridad |
|---------|-----------------|-----------|
| `js/app.js` | 7 | Alta |
| `js/modules.js` | 2 | Alta |
| `js/auth.js` | 1 | Media |
| `js/sync-engine.js` | 1 | Media |
| `js/error-handler.js` | 1 | Media |
| `sw.js` | 2 | Baja |
| `workers/session-manager.js` | 1 | Baja |
| **Total** | **15** | |

---

## Regla para evitar corrupción futura

**NUNCA usar PowerShell para reescribir archivos JS/HTML con caracteres especiales.**
Siempre usar `strReplace` o `fsWrite` de Kiro para editar estos archivos.
