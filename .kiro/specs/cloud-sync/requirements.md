# Sincronización en la Nube - Requisitos

## Descripción General
Implementar un sistema de sincronización en la nube que permita acceder a los datos de GallOli desde múltiples dispositivos y trabajar de forma colaborativa en tiempo real.

## Problema Actual
- Los datos se guardan solo en el dispositivo local (IndexedDB)
- No se puede acceder a los datos desde otro celular
- No hay colaboración en tiempo real entre múltiples usuarios
- Si el celular se daña o pierde, se pierden todos los datos

## Solución Propuesta
Sistema de sincronización en la nube con:
- Base de datos centralizada en la nube
- Sincronización automática bidireccional
- Acceso desde múltiples dispositivos
- Colaboración en tiempo real
- Backup automático en la nube

## Historias de Usuario

### 1. Acceso Multi-Dispositivo
**Como** usuario de GallOli  
**Quiero** poder acceder a mis datos desde cualquier dispositivo  
**Para** no depender de un solo celular y poder trabajar desde donde sea

**Criterios de Aceptación:**
- Puedo iniciar sesión desde cualquier dispositivo
- Veo los mismos datos en todos mis dispositivos
- Los cambios se sincronizan automáticamente
- Puedo trabajar offline y sincronizar después

### 2. Colaboración en Tiempo Real
**Como** dueño del negocio  
**Quiero** que mi esposa y yo podamos trabajar simultáneamente  
**Para** que ambos registremos ventas y pedidos sin conflictos

**Criterios de Aceptación:**
- Múltiples usuarios pueden trabajar al mismo tiempo
- Los cambios de un usuario se reflejan inmediatamente en otros dispositivos
- No hay pérdida de datos cuando ambos trabajan simultáneamente
- Se notifica cuando otro usuario hace cambios

### 3. Recuperación de Datos
**Como** usuario  
**Quiero** que mis datos estén seguros en la nube  
**Para** no perderlos si mi celular se daña o pierde

**Criterios de Aceptación:**
- Los datos se guardan automáticamente en la nube
- Puedo recuperar todos mis datos en un nuevo dispositivo
- Hay backup automático diario
- Puedo restaurar datos de fechas anteriores

### 4. Modo Offline
**Como** usuario  
**Quiero** poder trabajar sin internet  
**Para** no depender de la conexión y sincronizar después

**Criterios de Aceptación:**
- Puedo registrar ventas sin internet
- Los datos se guardan localmente
- Se sincronizan automáticamente cuando hay conexión
- Se indica claramente el estado de sincronización

## Requisitos Técnicos

### Arquitectura: Sistema P2P Descentralizado con Cloudflare
**Solución elegida:** Cloudflare D1 + Durable Objects + WebSockets + WebRTC

**Ventajas:**
- ✅ Todo en tu propia infraestructura Cloudflare (sin servicios externos)
- ✅ Sincronización P2P directa entre dispositivos (WebRTC)
- ✅ Fallback a servidor cuando P2P no es posible (WebSocket)
- ✅ Base de datos SQLite en la nube (Cloudflare D1)
- ✅ Estado compartido con Durable Objects
- ✅ Gratis con límites generosos de Cloudflare
- ✅ Máxima privacidad y control

**Componentes:**

1. **Cloudflare D1 (Base de Datos)**
   - SQLite en la nube
   - Almacenamiento persistente
   - Consultas SQL estándar
   - Backup automático

2. **Cloudflare Durable Objects (Estado en Tiempo Real)**
   - Mantiene estado de sesiones activas
   - Coordina sincronización entre dispositivos
   - Maneja WebSocket connections
   - Detecta conflictos

3. **WebRTC (Sincronización P2P Directa)**
   - Conexión directa entre dispositivos
   - Latencia mínima
   - No pasa por servidor (más privado)
   - Sincronización instantánea

4. **WebSocket (Fallback y Coordinación)**
   - Cuando WebRTC no es posible
   - Notificaciones de cambios
   - Presencia de usuarios online
   - Sincronización de estado

5. **IndexedDB Local (Modo Offline)**
   - Cache local completo
   - Funciona sin internet
   - Cola de sincronización
   - Resolución de conflictos

### Autenticación Multi-Método
**Opción 1: Telegram (Preferida)**
- Login con cuenta de Telegram
- Verificación con bot de Telegram
- Sin contraseñas que recordar
- Notificaciones de acceso

**Opción 2: Email + Contraseña**
- Login tradicional
- Recuperación de contraseña
- Verificación por email

**Opción 3: PIN Simple**
- Código de 6 dígitos
- Para acceso rápido
- Requiere registro previo

**Opción 4: Código de Invitación**
- El administrador genera códigos
- Usuarios se unen con el código
- Control total de accesos

### Sistema de Roles Completo
**Roles disponibles:**

1. **Super Administrador** (Dueño)
   - Control total del sistema
   - Gestionar usuarios y roles
   - Eliminar datos
   - Configurar sistema
   - Ver todo el historial
   - Exportar/importar datos

2. **Administrador**
   - Gestionar ventas, pedidos, clientes
   - Ver reportes completos
   - Gestionar gastos
   - No puede eliminar usuarios
   - No puede cambiar configuración crítica

3. **Vendedor**
   - Registrar ventas
   - Ver clientes
   - Crear pedidos
   - Ver sus propias ventas
   - No puede ver gastos ni reportes financieros

4. **Repartidor**
   - Ver pedidos asignados
   - Marcar pedidos como entregados
   - Ver rutas
   - Registrar pagos de pedidos
   - No puede crear ventas

5. **Contador**
   - Ver todos los reportes
   - Gestionar gastos
   - Ver diezmos
   - Exportar datos
   - No puede modificar ventas

6. **Visor** (Solo lectura)
   - Ver datos
   - No puede modificar nada
   - Útil para socios o inversionistas

**Permisos granulares:**
```javascript
{
  ventas: { crear, editar, eliminar, ver },
  pedidos: { crear, editar, eliminar, ver, asignar },
  clientes: { crear, editar, eliminar, ver },
  gastos: { crear, editar, eliminar, ver },
  reportes: { ver, exportar },
  usuarios: { crear, editar, eliminar, ver },
  configuracion: { ver, editar },
  backup: { crear, restaurar }
}
```

### Sincronización Híbrida (P2P + Servidor)
**Estrategia de 3 capas:**

1. **Capa 1: WebRTC P2P (Preferida)**
   - Conexión directa entre dispositivos en la misma red
   - Latencia < 50ms
   - Sin límite de datos
   - Máxima privacidad

2. **Capa 2: WebSocket via Durable Objects (Fallback)**
   - Cuando P2P no es posible
   - Sincronización a través del servidor
   - Notificaciones en tiempo real
   - Latencia < 200ms

3. **Capa 3: Polling D1 (Último recurso)**
   - Cuando WebSocket falla
   - Consulta cada 30 segundos
   - Funciona siempre
   - Mayor latencia pero confiable

**Modo Offline Robusto:**
- Todos los datos se guardan localmente en IndexedDB
- Cola de cambios pendientes de sincronizar
- Sincronización automática al recuperar conexión
- Detección inteligente de conflictos
- Resolución de conflictos configurable:
  - Último cambio gana (default)
  - Prioridad por rol (admin > vendedor)
  - Manual (pide al usuario decidir)

**Indicadores visuales:**
- 🟢 Online + Sincronizado
- 🟡 Online + Sincronizando
- 🔴 Offline + Cambios pendientes
- ⚡ P2P activo (conexión directa)
- 📡 Via servidor

### Estructura de Datos en D1
```sql
-- Tabla de negocios
CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  owner_telegram_id TEXT,
  settings JSON
);

-- Tabla de usuarios
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  telegram_id TEXT,
  email TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  permissions JSON,
  created_at INTEGER NOT NULL,
  last_seen INTEGER,
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);

-- Tabla de datos sincronizados
CREATE TABLE sync_data (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  data_type TEXT NOT NULL, -- 'client', 'sale', 'order', etc.
  data JSON NOT NULL,
  version INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER DEFAULT 0,
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Tabla de cambios (para sincronización)
CREATE TABLE changes (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  data_type TEXT NOT NULL,
  data_id TEXT NOT NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete'
  changes JSON,
  timestamp INTEGER NOT NULL,
  synced INTEGER DEFAULT 0,
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);

-- Índices para consultas rápidas
CREATE INDEX idx_sync_data_business ON sync_data(business_id, data_type);
CREATE INDEX idx_changes_business ON changes(business_id, timestamp);
CREATE INDEX idx_users_business ON users(business_id);
```

## Fases de Implementación

### Fase 1: Infraestructura Backend (v7.0.0) - 2-3 días
**Backend en Cloudflare Workers:**
- Configurar Cloudflare D1 database
- Crear Durable Objects para estado en tiempo real
- API REST para operaciones CRUD
- WebSocket server para notificaciones
- Sistema de autenticación con Telegram

**Entregables:**
- `/api/auth/telegram` - Login con Telegram
- `/api/auth/email` - Login con email
- `/api/business/create` - Crear negocio
- `/api/business/join` - Unirse con código
- WebSocket endpoint para tiempo real

### Fase 2: Autenticación y Usuarios (v7.1.0) - 2 días
**Frontend:**
- Pantalla de login multi-método
- Registro de nuevo negocio
- Sistema de invitaciones
- Gestión de usuarios y roles
- Permisos granulares

**Entregables:**
- Página de login
- Panel de administración de usuarios
- Sistema de roles completo
- Códigos de invitación

### Fase 3: Sincronización Básica (v7.2.0) - 3 días
**Sincronización unidireccional:**
- Subir datos locales a D1
- Descargar datos de D1
- Migración automática de datos existentes
- Detección de cambios locales
- Cola de sincronización

**Entregables:**
- Sincronización manual (botón)
- Indicador de estado
- Migración de datos
- Backup en la nube

### Fase 4: Sincronización en Tiempo Real (v7.3.0) - 3 días
**WebSocket + Durable Objects:**
- Conexión WebSocket persistente
- Notificaciones de cambios en tiempo real
- Actualización automática de UI
- Presencia de usuarios online
- Sincronización bidireccional automática

**Entregables:**
- Sincronización automática
- Indicador de usuarios online
- Notificaciones de cambios
- Actualización en tiempo real

### Fase 5: WebRTC P2P (v7.4.0) - 4 días
**Conexión directa entre dispositivos:**
- Establecer conexión WebRTC
- Sincronización P2P directa
- Fallback a WebSocket
- Optimización de ancho de banda
- Detección de red local

**Entregables:**
- Conexión P2P automática
- Indicador de conexión directa
- Sincronización ultra-rápida
- Modo híbrido inteligente

### Fase 6: Modo Offline Avanzado (v7.5.0) - 3 días
**Trabajo sin conexión:**
- Cola de cambios offline
- Sincronización al reconectar
- Detección de conflictos
- Resolución de conflictos
- Merge inteligente de datos

**Entregables:**
- Modo offline completo
- Cola de sincronización
- Resolución de conflictos
- Indicadores claros de estado

### Fase 7: Optimizaciones y Pulido (v7.6.0) - 2 días
**Mejoras finales:**
- Compresión de datos
- Sincronización incremental
- Cache inteligente
- Optimización de batería
- Logs y debugging

**Entregables:**
- Sistema optimizado
- Documentación completa
- Guía de usuario
- Panel de monitoreo

**Tiempo total estimado: 19-22 días de desarrollo**

## Consideraciones

### Seguridad
- ✅ Datos encriptados en tránsito (TLS 1.3)
- ✅ Autenticación requerida para todo
- ✅ Tokens JWT con expiración
- ✅ Rate limiting en API
- ✅ Validación de permisos en cada operación
- ✅ Logs de auditoría de cambios
- ✅ Encriptación opcional de datos sensibles
- ✅ 2FA opcional con Telegram

### Privacidad
- ✅ Datos aislados por negocio
- ✅ Sin compartir datos entre negocios
- ✅ Opción de eliminar todos los datos
- ✅ Exportación completa de datos
- ✅ Control total sobre quién accede
- ✅ WebRTC P2P = datos no pasan por servidor

### Costos (Cloudflare Free Tier)
- **D1 Database:** 
  - 5GB almacenamiento (suficiente para ~100,000 ventas)
  - 5 millones de lecturas/día
  - 100,000 escrituras/día
  - ✅ Más que suficiente para tu negocio

- **Durable Objects:**
  - 1 millón de requests/mes gratis
  - Después $0.15 por millón
  - ✅ Muy económico

- **Workers:**
  - 100,000 requests/día gratis
  - ✅ Suficiente para uso normal

- **WebSocket:**
  - Incluido en Durable Objects
  - Sin costo adicional

**Costo estimado mensual: $0 (dentro del free tier)**

### Migración desde Sistema Actual
1. **Fase de transición:**
   - Sistema funciona en modo híbrido
   - Datos locales se mantienen
   - Sincronización opcional al inicio

2. **Migración automática:**
   - Al hacer login por primera vez
   - Todos los datos locales se suben
   - Se crea backup antes de migrar
   - Proceso reversible

3. **Compatibilidad:**
   - Versión antigua sigue funcionando
   - Actualización gradual
   - Sin pérdida de datos

### Performance
- **Latencia objetivo:**
  - P2P: < 50ms
  - WebSocket: < 200ms
  - Polling: < 2s

- **Sincronización:**
  - Cambios pequeños: instantáneo
  - Sincronización completa: < 5s
  - Modo offline: sin impacto

- **Uso de datos:**
  - Sincronización incremental
  - Solo cambios, no todo
  - Compresión automática
  - ~1-5MB por día de uso normal

## Preguntas Resueltas ✅

1. **¿Cuántos usuarios necesitas?** 
   - ✅ Más de 2 usuarios (sistema escalable)

2. **¿Qué plataforma prefieres?**
   - ✅ Cloudflare D1 + Durable Objects + WebRTC/WebSocket

3. **¿Necesitas roles diferentes?**
   - ✅ Sistema completo de 6 roles con permisos granulares

4. **¿Trabajas frecuentemente sin internet?**
   - ✅ Sí, modo offline robusto con cola de sincronización

5. **¿Prefieres login con:**
   - ✅ Telegram (preferido) + Email + PIN + Código de invitación

## Arquitectura Final

```
┌─────────────────────────────────────────────────────────┐
│                    DISPOSITIVOS                          │
│  📱 Celular 1    📱 Celular 2    💻 Tablet              │
│  (Tú)            (Esposa)        (Empleado)             │
└────────┬──────────────┬────────────────┬────────────────┘
         │              │                │
         │    WebRTC P2P (directo)      │
         │◄────────────►│                │
         │              │                │
         ▼              ▼                ▼
    ┌────────────────────────────────────────┐
    │     IndexedDB Local (Offline)          │
    │  • Todos los datos                     │
    │  • Cola de sincronización              │
    │  • Cache inteligente                   │
    └────────────────────────────────────────┘
         │              │                │
         │   WebSocket (fallback)       │
         ▼              ▼                ▼
    ┌────────────────────────────────────────┐
    │   Cloudflare Durable Objects           │
    │  • Estado en tiempo real               │
    │  • WebSocket connections               │
    │  • Coordinación P2P                    │
    │  • Detección de conflictos             │
    └────────────────────────────────────────┘
                       │
                       ▼
    ┌────────────────────────────────────────┐
    │      Cloudflare D1 (SQLite)            │
    │  • Base de datos persistente           │
    │  • Historial completo                  │
    │  • Backup automático                   │
    │  • Consultas SQL                       │
    └────────────────────────────────────────┘
                       │
                       ▼
    ┌────────────────────────────────────────┐
    │      Telegram Bot (Auth)               │
    │  • Autenticación                       │
    │  • Notificaciones                      │
    │  • Códigos de acceso                   │
    └────────────────────────────────────────┘
```

## Flujo de Sincronización

### Escenario 1: Ambos Online en la Misma Red
```
Tú registras venta → IndexedDB local → WebRTC P2P → 
Esposa ve cambio instantáneo (< 50ms) → También se guarda en D1
```

### Escenario 2: Ambos Online, Redes Diferentes
```
Tú registras venta → IndexedDB local → WebSocket → Durable Object → 
WebSocket → Esposa ve cambio (< 200ms) → D1 actualizado
```

### Escenario 3: Tú Offline, Esposa Online
```
Tú registras venta → IndexedDB local → Cola de sincronización →
(Cuando vuelves online) → WebSocket → D1 → Esposa recibe actualización
```

### Escenario 4: Ambos Offline
```
Tú registras venta → IndexedDB local
Esposa crea pedido → IndexedDB local
(Cuando ambos vuelven online) → Sincronización automática → 
Detección de conflictos → Resolución → Ambos actualizados
```

## Próximos Pasos

1. Decidir la plataforma de backend (Firebase/Supabase)
2. Crear el diseño técnico detallado
3. Implementar autenticación
4. Implementar sincronización básica
5. Probar con múltiples dispositivos
6. Implementar sincronización en tiempo real
7. Agregar manejo de conflictos

---

**Nota:** Esta es una funcionalidad grande que transformará GallOli de una app local a una app colaborativa en la nube. Se recomienda implementar por fases para asegurar estabilidad.
