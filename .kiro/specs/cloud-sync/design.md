# Sistema de Sincronización en la Nube - Diseño Técnico

## Arquitectura General

### Stack Tecnológico
- **Frontend:** PWA existente (HTML/CSS/JS)
- **Backend:** Cloudflare Workers + Durable Objects
- **Base de Datos:** Cloudflare D1 (SQLite)
- **Tiempo Real:** WebSocket + WebRTC
- **Autenticación:** Telegram Bot API + JWT
- **Storage Local:** IndexedDB (offline-first)

### Componentes Principales

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (PWA)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Auth Module │  │  Sync Engine │  │  P2P Manager │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │           IndexedDB (Offline Storage)            │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              CLOUDFLARE WORKERS (API)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Auth API    │  │  Sync API    │  │  WebSocket   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│            CLOUDFLARE DURABLE OBJECTS                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Session Manager (WebSocket + Estado)            │  │
│  │  • Conexiones activas                            │  │
│  │  • Presencia de usuarios                         │  │
│  │  • Coordinación P2P                              │  │
│  │  • Detección de conflictos                       │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              CLOUDFLARE D1 (SQLite)                      │
│  • businesses                                            │
│  • users                                                 │
│  • sync_data                                             │
│  • changes                                               │
└─────────────────────────────────────────────────────────┘
```

## 1. Base de Datos (Cloudflare D1)

### Schema SQL Completo

```sql
-- Tabla de negocios
CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  settings TEXT DEFAULT '{}',
  subscription_tier TEXT DEFAULT 'free',
  max_users INTEGER DEFAULT 10,
  is_active INTEGER DEFAULT 1
);

-- Tabla de usuarios
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  telegram_id TEXT UNIQUE,
  email TEXT UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  permissions TEXT DEFAULT '{}',
  pin_hash TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER,
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- Tabla de sesiones
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  device_info TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_activity INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tabla de datos sincronizados (genérica)
CREATE TABLE sync_data (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  data_type TEXT NOT NULL,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0,
  deleted_at INTEGER,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Tabla de cambios (log de sincronización)
CREATE TABLE changes (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  data_type TEXT NOT NULL,
  data_id TEXT NOT NULL,
  action TEXT NOT NULL,
  changes TEXT,
  timestamp INTEGER NOT NULL,
  synced INTEGER DEFAULT 0,
  device_id TEXT,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Tabla de códigos de invitación
CREATE TABLE invitation_codes (
  code TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  role TEXT NOT NULL,
  max_uses INTEGER DEFAULT 1,
  uses INTEGER DEFAULT 0,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Índices para optimización
CREATE INDEX idx_users_business ON users(business_id, is_active);
CREATE INDEX idx_users_telegram ON users(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX idx_sessions_user ON sessions(user_id, expires_at);
CREATE INDEX idx_sync_data_business ON sync_data(business_id, data_type, deleted);
CREATE INDEX idx_sync_data_updated ON sync_data(business_id, updated_at);
CREATE INDEX idx_changes_business ON changes(business_id, timestamp DESC);
CREATE INDEX idx_changes_sync ON changes(business_id, synced, timestamp);
```

## 2. API REST (Cloudflare Workers)

### Endpoints de Autenticación

```javascript
// POST /api/auth/telegram/init
// Inicia login con Telegram
{
  request: { telegram_id: string },
  response: { 
    verification_code: string,
    expires_in: number 
  }
}

// POST /api/auth/telegram/verify
// Verifica código de Telegram
{
  request: { 
    telegram_id: string,
    verification_code: string 
  },
  response: { 
    token: string,
    user: UserObject,
    business: BusinessObject 
  }
}

// POST /api/auth/email/register
// Registro con email
{
  request: { 
    email: string,
    password: string,
    name: string,
    business_name: string 
  },
  response: { 
    token: string,
    user: UserObject,
    business: BusinessObject 
  }
}

// POST /api/auth/email/login
{
  request: { email: string, password: string },
  response: { token: string, user: UserObject, business: BusinessObject }
}

// POST /api/auth/pin/set
{
  request: { pin: string },
  response: { success: boolean }
}

// POST /api/auth/pin/login
{
  request: { user_id: string, pin: string },
  response: { token: string, user: UserObject }
}

// POST /api/auth/refresh
{
  request: { refresh_token: string },
  response: { token: string }
}

// POST /api/auth/logout
{
  request: { token: string },
  response: { success: boolean }
}
```

### Endpoints de Negocio

```javascript
// POST /api/business/create
{
  request: { name: string, settings?: object },
  response: { business: BusinessObject, invitation_code: string }
}

// POST /api/business/join
{
  request: { invitation_code: string },
  response: { business: BusinessObject, user: UserObject }
}

// GET /api/business/:id
{
  response: { business: BusinessObject, users: UserObject[] }
}

// PUT /api/business/:id
{
  request: { name?: string, settings?: object },
  response: { business: BusinessObject }
}

// POST /api/business/:id/invitation
{
  request: { role: string, max_uses?: number, expires_in?: number },
  response: { code: string, expires_at: number }
}
```

### Endpoints de Usuarios

```javascript
// GET /api/users
{
  response: { users: UserObject[] }
}

// GET /api/users/:id
{
  response: { user: UserObject }
}

// PUT /api/users/:id
{
  request: { name?: string, role?: string, permissions?: object },
  response: { user: UserObject }
}

// DELETE /api/users/:id
{
  response: { success: boolean }
}

// GET /api/users/online
{
  response: { users: UserObject[], count: number }
}
```

### Endpoints de Sincronización

```javascript
// POST /api/sync/push
// Subir cambios locales
{
  request: {
    changes: [
      {
        id: string,
        data_type: string,
        action: 'create' | 'update' | 'delete',
        data: object,
        timestamp: number
      }
    ],
    last_sync: number
  },
  response: {
    accepted: string[],
    rejected: string[],
    conflicts: ConflictObject[],
    server_timestamp: number
  }
}

// GET /api/sync/pull
// Descargar cambios del servidor
{
  query: { since: number, data_types?: string[] },
  response: {
    changes: ChangeObject[],
    server_timestamp: number,
    has_more: boolean
  }
}

// GET /api/sync/full
// Sincronización completa (primera vez)
{
  response: {
    data: {
      clients: object[],
      sales: object[],
      orders: object[],
      // ... todos los tipos de datos
    },
    server_timestamp: number
  }
}
```

## 3. Durable Objects (Estado en Tiempo Real)

### SessionManager Durable Object

```javascript
class SessionManager {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // userId -> WebSocket
    this.presence = new Map(); // userId -> { name, role, lastSeen }
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/ws') {
      return this.handleWebSocket(request);
    }
    
    if (url.pathname === '/presence') {
      return this.getPresence();
    }
    
    if (url.pathname === '/broadcast') {
      return this.broadcast(request);
    }
  }

  async handleWebSocket(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    
    await this.handleSession(server, request);
    
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async handleSession(ws, request) {
    const userId = this.getUserIdFromRequest(request);
    
    this.sessions.set(userId, ws);
    this.updatePresence(userId, 'online');
    
    ws.accept();
    
    ws.addEventListener('message', async (event) => {
      const message = JSON.parse(event.data);
      await this.handleMessage(userId, message);
    });
    
    ws.addEventListener('close', () => {
      this.sessions.delete(userId);
      this.updatePresence(userId, 'offline');
    });
  }

  async handleMessage(userId, message) {
    switch (message.type) {
      case 'change':
        await this.broadcastChange(userId, message.data);
        break;
      case 'presence':
        this.updatePresence(userId, message.status);
        break;
      case 'p2p-signal':
        await this.relayP2PSignal(userId, message);
        break;
    }
  }

  async broadcastChange(fromUserId, change) {
    const message = JSON.stringify({
      type: 'change',
      from: fromUserId,
      data: change,
      timestamp: Date.now()
    });
    
    for (const [userId, ws] of this.sessions) {
      if (userId !== fromUserId) {
        ws.send(message);
      }
    }
  }

  updatePresence(userId, status) {
    this.presence.set(userId, {
      status,
      lastSeen: Date.now()
    });
    
    this.broadcastPresence();
  }

  broadcastPresence() {
    const message = JSON.stringify({
      type: 'presence',
      users: Array.from(this.presence.entries())
    });
    
    for (const ws of this.sessions.values()) {
      ws.send(message);
    }
  }
}
```

## 4. Frontend - Módulos de Sincronización

### AuthModule (js/auth.js)

```javascript
const AuthModule = {
  currentUser: null,
  currentBusiness: null,
  token: null,

  async loginWithTelegram(telegramId) {
    // 1. Solicitar código de verificación
    const { verification_code } = await this.api('/auth/telegram/init', {
      telegram_id: telegramId
    });
    
    // 2. Enviar código al bot de Telegram
    await this.sendTelegramCode(telegramId, verification_code);
    
    // 3. Esperar verificación del usuario
    const verified = await this.waitForTelegramVerification(telegramId);
    
    if (verified) {
      const { token, user, business } = await this.api('/auth/telegram/verify', {
        telegram_id: telegramId,
        verification_code
      });
      
      await this.setSession(token, user, business);
      return true;
    }
    
    return false;
  },

  async loginWithEmail(email, password) {
    const { token, user, business } = await this.api('/auth/email/login', {
      email,
      password
    });
    
    await this.setSession(token, user, business);
    return true;
  },

  async setSession(token, user, business) {
    this.token = token;
    this.currentUser = user;
    this.currentBusiness = business;
    
    localStorage.setItem('auth_token', token);
    await DB.set('config', { key: 'user', value: user });
    await DB.set('config', { key: 'business', value: business });
  }
};
```

### SyncEngine (js/sync-engine.js)

```javascript
const SyncEngine = {
  isOnline: false,
  isSyncing: false,
  lastSync: 0,
  pendingChanges: [],
  ws: null,
  p2pConnections: new Map(),

  async init() {
    await this.loadPendingChanges();
    this.setupOnlineDetection();
    this.setupWebSocket();
    this.startSyncLoop();
  },

  async sync() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    
    try {
      // 1. Push cambios locales
      if (this.pendingChanges.length > 0) {
        await this.pushChanges();
      }
      
      // 2. Pull cambios del servidor
      await this.pullChanges();
      
      this.lastSync = Date.now();
      this.updateSyncStatus('synced');
    } catch (error) {
      console.error('Sync error:', error);
      this.updateSyncStatus('error');
    } finally {
      this.isSyncing = false;
    }
  },

  async pushChanges() {
    const response = await fetch('/api/sync/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AuthModule.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        changes: this.pendingChanges,
        last_sync: this.lastSync
      })
    });
    
    const { accepted, rejected, conflicts } = await response.json();
    
    // Remover cambios aceptados
    this.pendingChanges = this.pendingChanges.filter(
      c => !accepted.includes(c.id)
    );
    
    // Manejar conflictos
    if (conflicts.length > 0) {
      await this.resolveConflicts(conflicts);
    }
    
    await this.savePendingChanges();
  }
};
```

### P2PManager (js/p2p-manager.js)

```javascript
const P2PManager = {
  peers: new Map(),
  localConnection: null,

  async init() {
    this.setupSignaling();
  },

  async connectToPeer(peerId) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });
    
    // Canal de datos para sincronización
    const dataChannel = pc.createDataChannel('sync');
    
    dataChannel.onmessage = (event) => {
      this.handleP2PMessage(peerId, JSON.parse(event.data));
    };
    
    dataChannel.onopen = () => {
      console.log('P2P connection established with', peerId);
      this.peers.set(peerId, { pc, dataChannel });
    };
    
    // Crear oferta
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    // Enviar oferta via WebSocket
    SyncEngine.ws.send(JSON.stringify({
      type: 'p2p-offer',
      to: peerId,
      offer: offer
    }));
    
    return pc;
  },

  async handleP2PMessage(peerId, message) {
    switch (message.type) {
      case 'change':
        await SyncEngine.applyRemoteChange(message.data);
        break;
      case 'sync-request':
        await this.sendFullSync(peerId);
        break;
    }
  },

  sendChange(change) {
    // Enviar a todos los peers conectados
    for (const { dataChannel } of this.peers.values()) {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({
          type: 'change',
          data: change
        }));
      }
    }
  }
};
```

## 5. Sistema de Roles y Permisos

### Definición de Roles

```javascript
const ROLES = {
  super_admin: {
    name: 'Super Administrador',
    permissions: {
      ventas: { crear: true, editar: true, eliminar: true, ver: true },
      pedidos: { crear: true, editar: true, eliminar: true, ver: true, asignar: true },
      clientes: { crear: true, editar: true, eliminar: true, ver: true },
      gastos: { crear: true, editar: true, eliminar: true, ver: true },
      reportes: { ver: true, exportar: true },
      usuarios: { crear: true, editar: true, eliminar: true, ver: true },
      configuracion: { ver: true, editar: true },
      backup: { crear: true, restaurar: true }
    }
  },
  
  admin: {
    name: 'Administrador',
    permissions: {
      ventas: { crear: true, editar: true, eliminar: true, ver: true },
      pedidos: { crear: true, editar: true, eliminar: true, ver: true, asignar: true },
      clientes: { crear: true, editar: true, eliminar: false, ver: true },
      gastos: { crear: true, editar: true, eliminar: false, ver: true },
      reportes: { ver: true, exportar: true },
      usuarios: { crear: false, editar: false, eliminar: false, ver: true },
      configuracion: { ver: true, editar: false },
      backup: { crear: true, restaurar: false }
    }
  },
  
  vendedor: {
    name: 'Vendedor',
    permissions: {
      ventas: { crear: true, editar: true, eliminar: false, ver: true },
      pedidos: { crear: true, editar: true, eliminar: false, ver: true, asignar: false },
      clientes: { crear: true, editar: false, eliminar: false, ver: true },
      gastos: { crear: false, editar: false, eliminar: false, ver: false },
      reportes: { ver: false, exportar: false },
      usuarios: { crear: false, editar: false, eliminar: false, ver: false },
      configuracion: { ver: false, editar: false },
      backup: { crear: false, restaurar: false }
    }
  }
};
```

### PermissionsModule (js/permissions.js)

```javascript
const PermissionsModule = {
  can(action, resource) {
    const user = AuthModule.currentUser;
    if (!user) return false;
    
    const permissions = user.permissions || ROLES[user.role].permissions;
    return permissions[resource]?.[action] === true;
  },

  canAny(actions, resource) {
    return actions.some(action => this.can(action, resource));
  },

  canAll(actions, resource) {
    return actions.every(action => this.can(action, resource));
  },

  enforce(action, resource) {
    if (!this.can(action, resource)) {
      throw new Error(`No tienes permiso para ${action} en ${resource}`);
    }
  }
};

// Uso en el código
if (PermissionsModule.can('eliminar', 'ventas')) {
  // Mostrar botón de eliminar
}

// O forzar permiso
try {
  PermissionsModule.enforce('crear', 'gastos');
  // Crear gasto
} catch (error) {
  Utils.showNotification(error.message, 'error');
}
```

## 6. Flujos de Sincronización

### Flujo 1: Registro de Nueva Venta

```
Usuario registra venta
  ↓
1. Guardar en IndexedDB local
  ↓
2. Agregar a cola de cambios pendientes
  ↓
3. Actualizar UI inmediatamente
  ↓
4. ¿Hay conexión P2P?
  ├─ SÍ → Enviar via WebRTC a peers
  └─ NO → Continuar
  ↓
5. ¿Hay conexión WebSocket?
  ├─ SÍ → Enviar via WebSocket
  └─ NO → Quedará en cola
  ↓
6. Servidor recibe cambio
  ↓
7. Guardar en D1
  ↓
8. Broadcast a otros usuarios
  ↓
9. Otros usuarios reciben y actualizan UI
```

### Flujo 2: Sincronización al Reconectar

```
Usuario vuelve online
  ↓
1. Detectar conexión
  ↓
2. Establecer WebSocket
  ↓
3. Enviar cambios pendientes (cola)
  ↓
4. Servidor procesa cambios
  ↓
5. Detectar conflictos
  ├─ Sin conflictos → Aceptar todos
  └─ Con conflictos → Resolver
  ↓
6. Pull cambios del servidor
  ↓
7. Aplicar cambios remotos
  ↓
8. Actualizar UI
  ↓
9. Marcar como sincronizado
```

### Flujo 3: Resolución de Conflictos

```
Conflicto detectado
  ↓
1. Comparar versiones
  ├─ Local: v5, timestamp: 1000
  └─ Remoto: v6, timestamp: 1100
  ↓
2. Aplicar estrategia de resolución
  ├─ Último cambio gana (default)
  ├─ Prioridad por rol (admin > vendedor)
  └─ Manual (preguntar al usuario)
  ↓
3. Si es automático:
  ├─ Aplicar cambio ganador
  └─ Descartar cambio perdedor
  ↓
4. Si es manual:
  ├─ Mostrar modal con ambas versiones
  ├─ Usuario elige cuál mantener
  └─ Aplicar elección
  ↓
5. Actualizar versión
  ↓
6. Sincronizar con servidor
```

## 7. Estructura de Archivos

```
galloli/
├── js/
│   ├── auth.js              # Módulo de autenticación
│   ├── sync-engine.js       # Motor de sincronización
│   ├── p2p-manager.js       # Gestor de conexiones P2P
│   ├── permissions.js       # Sistema de permisos
│   ├── roles.js             # Definición de roles
│   └── sync-ui.js           # UI de sincronización
├── workers/
│   ├── index.js             # Worker principal (API REST)
│   ├── session-manager.js   # Durable Object para sesiones
│   └── auth-handler.js      # Lógica de autenticación
└── wrangler.toml            # Configuración de Cloudflare
```

## 8. Configuración de Cloudflare

### wrangler.toml

```toml
name = "galloli-sync"
main = "workers/index.js"
compatibility_date = "2024-01-01"

[[ d1_databases ]]
binding = "DB"
database_name = "galloli"
database_id = "your-database-id"

[[ durable_objects.bindings ]]
name = "SESSION_MANAGER"
class_name = "SessionManager"
script_name = "galloli-sync"

[[migrations]]
tag = "v1"
new_classes = ["SessionManager"]

[vars]
TELEGRAM_BOT_TOKEN = "your-bot-token"
JWT_SECRET = "your-jwt-secret"
```

## 9. Indicadores de UI

### Estados de Sincronización

```javascript
const SyncStatus = {
  SYNCED: {
    icon: '🟢',
    text: 'Sincronizado',
    color: '#4CAF50'
  },
  SYNCING: {
    icon: '🟡',
    text: 'Sincronizando...',
    color: '#FF9800'
  },
  OFFLINE: {
    icon: '🔴',
    text: 'Sin conexión',
    color: '#F44336'
  },
  P2P_ACTIVE: {
    icon: '⚡',
    text: 'Conexión directa',
    color: '#2196F3'
  },
  PENDING: {
    icon: '⏳',
    text: 'Cambios pendientes',
    color: '#FF9800'
  },
  ERROR: {
    icon: '❌',
    text: 'Error de sincronización',
    color: '#F44336'
  }
};
```

## 10. Seguridad

### JWT Token Structure

```javascript
{
  header: {
    alg: 'HS256',
    typ: 'JWT'
  },
  payload: {
    user_id: 'uuid',
    business_id: 'uuid',
    role: 'admin',
    iat: 1234567890,
    exp: 1234567890 + 86400 // 24 horas
  },
  signature: 'hash'
}
```

### Validación de Permisos en Backend

```javascript
async function validatePermission(request, action, resource) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const user = await verifyToken(token);
  
  const permissions = user.permissions || ROLES[user.role].permissions;
  
  if (!permissions[resource]?.[action]) {
    throw new Error('Forbidden');
  }
  
  return user;
}

// Uso en endpoints
app.delete('/api/sales/:id', async (request) => {
  await validatePermission(request, 'eliminar', 'ventas');
  // ... eliminar venta
});
```

## 11. Optimizaciones

### Compresión de Datos

```javascript
async function compressData(data) {
  const json = JSON.stringify(data);
  const compressed = await gzip(json);
  return compressed;
}

async function decompressData(compressed) {
  const json = await gunzip(compressed);
  return JSON.parse(json);
}
```

### Sincronización Incremental

```javascript
// Solo enviar campos modificados
const change = {
  id: 'sale-123',
  type: 'update',
  fields: {
    isPaid: true,
    paidAmount: 100
  },
  // No enviar todos los campos
};
```

## 12. Testing

### Tests Unitarios
- Autenticación con Telegram
- Sincronización de cambios
- Resolución de conflictos
- Permisos y roles

### Tests de Integración
- Flujo completo de registro
- Sincronización multi-dispositivo
- Modo offline y reconexión

### Tests E2E
- Usuario registra venta en dispositivo A
- Usuario B ve cambio en tiempo real
- Ambos trabajan offline
- Sincronización al reconectar

---

**Diseño completo v1.0**
