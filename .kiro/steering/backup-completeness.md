# Regla: Completitud Absoluta de Backups

## Principio Fundamental

**TODOS los backups deben incluir ABSOLUTAMENTE TODOS los datos y configuraciones de la aplicación sin excepción.**

Esto aplica a:
- Backup automático a Telegram (desde servidor con Cron)
- Backup manual a Telegram (desde cliente)
- Exportación de datos JSON
- Backup local descargable

## Datos que SIEMPRE deben incluirse

### 1. Datos de Negocio
- ✅ **Clientes** (`ClientsModule.clients`)
  - Todos los campos incluyendo coordenadas, ubicación, estado activo/archivado
  - Estadísticas de ventas por cliente
  
- ✅ **Ventas** (`SalesModule.sales`)
  - Todas las ventas con historial de pagos completo
  - Estado de pago (isPaid, remainingDebt)
  - Información de cliente asociado
  
- ✅ **Pedidos** (`OrdersModule.orders`)
  - Todos los pedidos con su estado
  - Información de entrega
  
- ✅ **Gastos** (`AccountingModule.expenses`)
  - Todos los gastos registrados
  - Categorías y descripciones

### 2. Datos de Merma
- ✅ **Precios Diarios** (`MermaModule.dailyPrices`)
  - Historial completo de precios por fecha
  
- ✅ **Registros de Merma** (`MermaModule.mermaRecords`)
  - Cálculos de merma por fecha
  - Porcentajes y cantidades

### 3. Datos de Diezmos
- ✅ **Registros de Diezmos** (`DiezmosModule.records`)
  - Historial completo de diezmos y ofrendas
  
- ✅ **Configuración de Diezmos** (`DiezmosModule.config`)
  - Porcentajes configurados (diezmoPercent, ofrendaPercent)

### 4. Historial de Pagos
- ✅ **Historial de Pagos** (construido desde `sale.paymentHistory`)
  - Todos los pagos realizados
  - Abonos parciales y pagos completos
  - Timestamps y montos

### 5. Créditos
- ✅ **Datos de Créditos** 
  - Ventas con crédito activo (no pagadas)
  - Historial de pagos por venta
  - Deudas pendientes

### 6. Configuraciones de la App

#### 6.1 Configuración General
- ✅ **Config de la App** (`ConfigModule.currentConfig`)
  - Nombre de la aplicación
  - **Colores del tema** (primaryColor, secondaryColor, accentColor, etc.)
  - Preferencias de usuario
  - Configuraciones de visualización
  - Cualquier otra configuración personalizada

#### 6.2 Credenciales de Telegram
- ✅ **Telegram Config**
  - Bot Token (encriptado)
  - Chat ID (encriptado)

#### 6.3 Configuración de Backup
- ✅ **Backup Settings**
  - Última fecha de backup
  - Configuración de backup automático
  - Preferencias de backup

### 7. Metadatos del Backup
- ✅ **Metadata**
  - Fecha y hora de exportación
  - Versión del backup
  - Estadísticas (totales de cada tipo de dato)
  - Nombre de la aplicación
  - ID del negocio (si aplica)
  - Usuario que creó el backup
  - Método de creación (manual, automático, servidor)

## Ubicaciones de Código a Actualizar

Cuando se agreguen nuevas características, SIEMPRE actualizar:

### 1. BackupModule.createBackup() 
**Archivo:** `js/modules.js`
**Líneas aproximadas:** 2850-2910

```javascript
const data = {
    // AGREGAR AQUÍ cualquier nuevo tipo de dato
    clients: ClientsModule.clients || [],
    sales: SalesModule.sales || [],
    // ... etc
};
```

### 2. Worker Scheduled Handler
**Archivo:** `workers/index.js`
**Función:** `scheduled(event, env, ctx)`
**Líneas aproximadas:** 100-250

```javascript
const backupData = {
    // AGREGAR AQUÍ cualquier nuevo tipo de dato
    clients: groupedData.clients,
    sales: groupedData.sales,
    // ... etc
};
```

### 3. Worker Backup Endpoint
**Archivo:** `workers/index.js`
**Función:** `handleBackup()`
**Líneas aproximadas:** 950-1100

```javascript
const backupData = {
    // AGREGAR AQUÍ cualquier nuevo tipo de dato
    clients: groupedData.clients,
    sales: groupedData.sales,
    // ... etc
};
```

### 4. Sincronización Local
**Archivo:** `js/sync-engine.js`
**Función:** `getLocalData()`
**Líneas aproximadas:** 530-560

```javascript
return {
    // AGREGAR AQUÍ cualquier nuevo tipo de dato
    clients: await DB.getAll('clients') || [],
    sales: await DB.getAll('sales') || [],
    // ... etc
};
```

### 5. Importación de Backup
**Archivo:** `js/modules.js`
**Función:** `BackupModule.importFromFile()`
**Líneas aproximadas:** 2920-3020

```javascript
// AGREGAR AQUÍ la lógica para restaurar cualquier nuevo tipo de dato
if (data.clients) {
    ClientsModule.clients = data.clients;
    await ClientsModule.saveClients();
}
// ... etc
```

## Checklist de Verificación

Antes de considerar completa cualquier feature nueva:

- [ ] ¿Los datos se guardan en IndexedDB?
- [ ] ¿Los datos se incluyen en `BackupModule.createBackup()`?
- [ ] ¿Los datos se incluyen en el Worker scheduled handler?
- [ ] ¿Los datos se incluyen en el Worker backup endpoint?
- [ ] ¿Los datos se incluyen en `sync-engine.js getLocalData()`?
- [ ] ¿Los datos se pueden restaurar en `BackupModule.importFromFile()`?
- [ ] ¿Los datos se sincronizan entre dispositivos?
- [ ] ¿Las configuraciones (incluyendo colores) se guardan?

## Reglas Críticas

1. **NUNCA omitir datos**: Si existe en la app, debe estar en el backup
2. **NUNCA asumir**: Verificar explícitamente que cada tipo de dato esté incluido
3. **SIEMPRE actualizar**: Cuando se agregue una feature, actualizar TODOS los puntos de backup
4. **SIEMPRE probar**: Crear un backup y restaurarlo para verificar que TODO funciona
5. **Colores del tema**: Los colores personalizados del usuario DEBEN guardarse en `config`

## Ejemplo de Estructura Completa de Backup

```javascript
{
  // Datos de negocio
  clients: [...],
  sales: [...],
  orders: [...],
  expenses: [...],
  
  // Merma
  mermaPrices: [...],
  mermaRecords: [...],
  
  // Diezmos
  diezmosRecords: [...],
  diezmosConfig: { diezmoPercent: 10, ofrendaPercent: 5 },
  
  // Pagos
  paymentHistory: [...],
  
  // Créditos
  creditosData: {
    creditSales: [...],
    paymentHistory: [...]
  },
  
  // Configuración COMPLETA
  config: {
    appName: 'GallOli',
    // COLORES DEL TEMA
    primaryColor: '#4CAF50',
    secondaryColor: '#45a049',
    accentColor: '#FF9800',
    backgroundColor: '#f5f5f5',
    textColor: '#333333',
    // Otras configuraciones
    language: 'es',
    currency: 'GTQ',
    timezone: 'America/Guatemala',
    // ... cualquier otra configuración
  },
  
  // Telegram
  telegramConfig: {
    botToken: '...',
    chatId: '...'
  },
  
  // Metadatos
  metadata: {
    exportDate: '2026-01-27T10:00:00.000Z',
    version: '2.1',
    totalClients: 100,
    totalSales: 500,
    totalOrders: 50,
    totalExpenses: 30,
    totalPayments: 200,
    appName: 'GallOli',
    businessId: 'abc123',
    businessName: 'Mi Negocio',
    createdBy: 'user-id',
    method: 'manual'
  }
}
```

## Consecuencias de No Seguir Esta Regla

- ❌ Pérdida de datos del usuario
- ❌ Pérdida de configuraciones personalizadas (incluyendo colores)
- ❌ Imposibilidad de restaurar completamente la app
- ❌ Frustración del usuario
- ❌ Pérdida de confianza en el sistema de backup

## Responsabilidad del Desarrollador

Es responsabilidad del desarrollador (humano o IA) asegurarse de que:

1. Cada nueva feature que agregue datos ACTUALICE todos los puntos de backup
2. Cada nueva configuración se guarde en `config`
3. Los backups se prueben regularmente
4. La documentación se mantenga actualizada

## Prioridad

Esta regla tiene **MÁXIMA PRIORIDAD** y debe verificarse en cada commit que agregue o modifique datos/configuraciones.
