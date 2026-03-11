# 🔄 Sistema de Sincronización Multi-Dispositivo - GallOli Cloud Sync

## Resumen

GallOli nunca sincroniza un solo dispositivo. Todos tus datos están **automáticamente sincronizados en toda tu cuenta** - laptop, móvil, tablet, etc. Los datos están centralizados en el servidor y optimizados localmente en cada dispositivo.

### ¿Qué significa "sincronizado"?
✅ Haces un cambio en una venta en tu móvil  
✅ Instantáneamente está disponible en tu laptop  
✅ Todas tus computadoras tienen los **mismos datos exactos**  

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    SERVIDOR CENTRALIZADO                    │
│          Cloudflare D1 Database (galloli-sync)              │
│  - sync_data (todos los datos de la cuenta)                │
│  - changes (historial de cambios)                          │
│  - users (usuarios de la cuenta)                           │
│  - sessions (sesiones activas)                             │
└─────────────────────────────────────────────────────────────┘
                          ▲
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │  LAPTOP    │  │   MÓVIL    │  │  TABLET    │
    │  (Tú)      │  │  (Tú)      │  │   (Tú)     │
    │            │  │            │  │            │
    │ IndexedDB  │  │ IndexedDB  │  │ IndexedDB  │
    │ (Caché)    │  │ (Caché)    │  │ (Caché)    │
    └────────────┘  └────────────┘  └────────────┘

    WebSocket (tiempo real) + API REST (fallback)
```

---

## 🔌 Componentes Clave

### 1. **SyncEngine** (`js/sync-engine.js`)
El motor principal de sincronización:
- 🔗 Administra conexión WebSocket en tiempo real
- 📲 Detecta cambios locales (clientes, ventas, gastos, etc.)
- 🔄 Sincronizacióninteligente con merge de datos
- 📴 Soporta modo offline
- 🔐 Maneja autenticación y permisos

### 2. **OfflineQueueManager** (`js/offline-queue.js`) - NUEVO
Gestiona cambios cuando estás sin internet:
- 📋 Crea una cola de cambios pendientes
- 💾 Los guarda en IndexedDB (nunca se pierden)
- ⏳ Reintentos automáticos cuando vuelves online
- 📊 Usa backoff exponencial (1s, 2s, 5s, 10s, 30s)
- ✅ Máximo 5 intentos por cambio

### 3. **AuthManager** (`js/auth.js`)
Gestiona autenticación:
- 🔐 Sesiones seguras con tokens
- 👤 Soporte multi-usuario
- 💾 Guarda sesión en IndexedDB
- 📱 Cargas la sesión automáticamente al iniciar

### 4. **IndexedDB** (Local Storage en el navegador)
Base de datos local en cada dispositivo:
- 🗄️ Almacena: clientes, ventas, gastos, pedidos, merma, diezmos
- 🔍 Índices para búsquedas rápidas
- 📦 Caché local para funcionamiento offline
- 🔄 Se sincroniza automáticamente con servidor

---

## 🔄 Flujo de Sincronización

### A. Cuando haces un cambio (ej: Nueva venta)

```
1. Haces una venta en tu móvil
   ↓
2. SyncEngine detecta el cambio (vía interceptores)
   ↓
3. Se guarda en IndexedDB local
   ↓
4. ¿Estás online?
   ├─ SÍ → Envía a servidor via API REST
   └─ NO → Se agrega a la cola de cambios (OfflineQueueManager)
   ↓
5. Servidor recibe: crea un "change record"
   ↓
6. Broadcast a otros dispositivos via WebSocket:
   "Cambio detectado: sales/ID#123"
   ↓
7. Otros dispositivos reciben notificación
   ↓
8. Automáticamente sincronizan ese dato
   ↓
9. Todas tus computadoras tienen la venta actualizada ✅
```

### B. Sincronización Inicial (al iniciar app)

```
1. App carga
   ↓
2. AuthManager carga la sesión
   ↓
3. SyncEngine.init() ejecuta smartSync()
   ↓
4. Obtiene datos locales (de IndexedDB)
   ↓
5. Obtiene datos remotos (del servidor)
   ↓
6. Hace MERGE inteligente:
   - Si es más nuevo en local → usa local
   - Si es más nuevo en remoto → usa remoto
   - Elimina duplicados
   ↓
7. Guarda datos merged localmente
   ↓
8. Recarga toda la UI
   ↓
9. Inicia intercepción de cambios futuros
```

### C. Cambios Pendientes (Modo Offline)

```
1. Estás sin conexión
   ↓
2. Haces cambios (se guardan en IndexedDB)
   ↓
3. OfflineQueueManager los agrega a la cola
   ↓
4. Se guardan en DB.syncQueue (nunca se pierden)
   ↓
5. Vuelves a estar online
   ↓
6. handleOnline() activa OfflineQueueManager.processBatch()
   ↓
7. Intenta enviar cambios al servidor (5 intentos máximo)
   ↓
8. Con backoff exponencial:
   Intento 1: espera 1 segundo
   Intento 2: espera 2 segundos
   Intento 3: espera 5 segundos
   Intento 4: espera 10 segundos
   Intento 5: espera 30 segundos
   ↓
9. Una vez enviados, se eliminan de la cola
   ↓
10. Sincronización completada ✅
```

---

## ⚙️ Resolución de Conflictos

Cuando dos dispositivos modifican el MISMO dato:

### Regla: ÚLTIMO EN ESCRIBIR GANA (Last-Write-Wins)

```
Laptop:  Venta #101 - Modificado 14:30
Móvil:   Venta #101 - Modificado 14:32 ← GANA (más reciente)
Servidor: Venta #101 - Usa versión del móvil
```

✅ El sistema usa **timestamps** (`updated_at`) para determinar qué versión es más reciente.

### Merging de Datos

El merge inteligente combina datos de múltiples fuentes:

```
Remoto (Servidor):    sales: [1, 2, 3]
Local (Este PC):      sales: [1, 2, 4]
                      ↓ (merge)
Resultado:            sales: [1, 2, 3, 4]

Se eliminan duplicados y se ordena por timestamp.
```

---

## 📊 Estados de Sincronización

### Por Dispositivo

| Estado | Significado | Acción |
|--------|------------|--------|
| 🟢 **Online** | Conectado a internet | Sincronización en tiempo real |
| 🔴 **Offline** | Sin internet | Cambios se guardan en cola |
| 🟡 **Reconectando** | Intentando conectar | Reintentos con backoff |
| ✅ **Sincronizado** | Datos actualizados | Todo en orden |
| ⏳ **Sincronizando** | En proceso | Espera a que termine |

### Por Datos

```
getSyncStatus() retorna:
{
  total: 45,              // Cambios en cola
  pending: 12,            // Pendientes de envío
  sending: 3,             // En proceso
  failed: 0,              // Fallidos permanentes
  isProcessing: true      // Está sincronizando
}
```

---

## 🔐 Seguridad

### Autenticación

```
1. Login (Telegram, Email, PIN)
2. Servidor genera token JWT
3. Token se guarda en IndexedDB (encriptado)
4. Cada request incluye: Authorization: Bearer <token>
5. Servidor valida token antes de sync
```

### Persmisos

```
Solo puedes sincronizar datos de tu negocio (business_id)
Solo puedes ver datos que tienes permiso
No hay acceso a datos de otros negocios
```

---

## 📱 API REST de Sincronización

### Push (Subir cambios)

```bash
POST /api/sync/push
Content-Type: application/json
Authorization: Bearer <token>

{
  "changes": [
    {
      "data_type": "sales",
      "data_id": "sale_123",
      "action": "update",
      "data": { /* datos de la venta */ },
      "timestamp": 1234567890
    }
  ]
}
```

**Respuesta:**
```json
{
  "results": [
    { "success": true, "change_id": "chg_xyz", "data_id": "sale_123" }
  ]
}
```

### Pull (Descargar cambios)

```bash
GET /api/sync/pull?since=<timestamp>&data_type=sales
Authorization: Bearer <token>
```

**Respuesta:**
```json
{
  "data": [
    {
      "id": "sale_123",
      "data_type": "sales",
      "data": { /* datos */ },
      "version": 3,
      "updated_at": 1234567890
    }
  ]
}
```

### Full Sync (Sincronización completa)

```bash
GET /api/sync/full?data_type=<tipo>
Authorization: Bearer <token>
```

Descarga **todos** los datos de ese tipo (para sincronización inicial).

---

## 🎯 Casos de Uso

### Caso 1: Modificar venta abierta en 2 dispositivos
```
Laptop abierto: Panel de ventas
Móvil en ruta: Registra nueva venta

✅ Se sincroniza automáticamente en tiempo real via WebSocket
✅ Laptop ve la nueva venta instantáneamente
```

### Caso 2: Sin conexión en la ruta
```
Móvil "sin señal": Creas 5 ventas
Cambios se guardan en: IndexedDB + OfflineQueue

Cuando recuperas conexión:
✅ Automáticamente se envían al servidor
✅ Laptop/Tablet ven las ventas
```

### Caso 3: Conflicto de datos
```
Laptop 14:30: Modificas cliente "Juan" 
Móvil  14:32: Modificas cliente "Juan" (versión anterior)

Servidor:
  ├─ Laptop: timestamp 14:30
  └─ Móvil:  timestamp 14:32 ← GANA (más reciente)
  
✅ Todas las computadoras usan la versión del móvil
```

---

## 🔧 Debugging & Monitoreo

### Verificar estado en Console

```javascript
// Ver estado de sincronización
window.SyncEngine.getQueueStatus?.()

// Ver cambios pendientes
window.OfflineQueueManager?.queue

// Ver estado del WebSocket
window.SyncEngine.ws?.readyState
// 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED

// Forzar sincronización
await window.SyncEngine.smartSync()

// Procesar cola manualmente
await window.OfflineQueueManager?.processBatch()
```

### Logs en Console

La aplicación registra todo lo que hace:

```
🔄 Sincronización P2P activa
📋 Cola offline lista (0 cambios pendientes)
🔌 Conectando WebSocket...
✅ WebSocket conectado
📤 Cambio detectado: sales
✅ Notificación enviada via WebSocket
```

---

## 📋 Tablas de Datos Sincronizados

| Tipo | Almacenado en | Sincronizado | Offline |
|------|---------------|--------------|---------|
| **Clientes** | sync_data | ✅ | ✅ |
| **Ventas** | sync_data | ✅ | ✅ |
| **Pedidos** | sync_data | ✅ | ✅ |
| **Gastos** | sync_data | ✅ | ✅ |
| **Precios** | sync_data | ✅ | ✅ |
| **Merma** | sync_data | ✅ | ✅ |
| **Diezmos** | sync_data | ✅ | ✅ |
| **Historial Pagos** | sync_data | ✅ | ✅ |
| **Configuración** | sync_data | ✅ | ✅ |

---

## 🚀 Performance

### Tamaños de Datos

```
Base de datos típica:
- 100 clientes: ~50 KB
- 500 ventas: ~500 KB
- 200 gastos: ~100 KB

Total: ~650 KB en IndexedDB
+ caché del service worker para datos estáticos
```

### Velocidades Típicas

```
Operación | Tiempo
-----------|-------
Crear venta | <100ms (local) + 500ms (servidor)
Sincronizar cambios | 1-5 segundos
Carga inicial | 3-10 segundos
Búsqueda local | <50ms
```

---

## ⚡ Mejoras Implementadas (v4.0)

### ✨ Nuevas Características

1. **Cola Offline Robusta**
   - Guarda cambios en IndexedDB
   - Nunca pierde datos aunque se apague el dispositivo
   - Reintentos automáticos con backoff exponencial

2. **Mejor Reconexión WebSocket**
   - Backoff exponencial (max 30 segundos)
   - Máximo 10 intentos
   - Auto-procesa cola cuando vuelve online

3. **Sincronización por Batch**
   - Envía máximo 20 cambios por solicitud
   - Reduce carga en servidor
   - Más rápido y confiable

4. **Mejor Manejo de Errores**
   - Diferencia entre errores permanentes y temporales
   - Log detallado de fallos
   - Muestra estado en interfaz

### 🔄 Cambios en API

**Antes:**
```javascript
this.notifyChange('sales') // Envía todos los datos
```

**Ahora:**
```javascript
this.notifyChange('sales', 'sale_123', 'update') // Más eficiente
```

---

## 📞 Soporte Técnico

### Problemas Comunes

**P: Los datos no se sincronizan**
R: Verifica en Console:
```javascript
navigator.onLine  // Debe ser true
window.SyncEngine.ws?.readyState  // Debe ser 1
```

**P: "Cambio pendiente" no desaparece**
R: Se intentará enviar hasta 5 veces con backoff. Si sigue fallando, revisa token.

**P: ¿Puedo usar sin internet?**
R: ✅ SÍ. Los cambios se guardan locally y se sincronizan cuando vuelve conexión.

**P: ¿Qué pasa si dos personas modifican lo mismo?**
R: Gana la modificación más reciente (por timestamp).

---

## 📚 Archivos Relacionados

- `/js/sync-engine.js` - Motor principal (1050+ líneas)
- `/js/offline-queue.js` - Gestor de cola offline (NUEVO)
- `/js/auth.js` - Autenticación
- `/js/db.js` - IndexedDB (v4)
- `/workers/index.js` - API backend
- `/workers/schema.sql` - Database schema

---

## 🔮 Roadmap Futuro

- [ ] Sincronización P2P directa (offline)
- [ ] Historial completo de cambios
- [ ] Resolución manual de conflictos
- [ ] Dashboard de sincronización
- [ ] Exportar/Importar datos
- [ ] Backup automático incrementalversiones futuras.

---

**Última actualización:** Marzo 2026  
**Versión:** 4.0 - Multi-Dispositivo Sync  
**Estado:** ✅ Producción
