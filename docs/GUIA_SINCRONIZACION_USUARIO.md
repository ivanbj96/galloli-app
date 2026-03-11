# 📱 Guía Rápida: Sincronización GallOli en Múltiples Dispositivos

## ¿Cómo funciona?

Una vez que inicias sesión con tu cuenta, **TODOS tus dispositivos se sincronizan automáticamente**.

No tienes que hacer nada especial. Simplemente:

✅ Usa la app en tu laptop
✅ Abre la app en tu móvil  
✅ Nada más - los datos se sincronizan en tiempo real

---

## 📋 Lo que está sincronizado

Estos datos se sincronizan AUTOMÁTICAMENTE en todos tus dispositivos:

- ✅ **Clientes** - Lista de clientes de tu negocio
- ✅ **Ventas** - Todas las ventas registradas
- ✅ **Pedidos** - Pedidos pendientes y completados
- ✅ **Gastos** - Gastos y contabilidad
- ✅ **Precios** - Precios diarios de productos
- ✅ **Merma** - Registros de desperdicio
- ✅ **Diezmos** - Diezmos y ofrendas
- ✅ **Historial de Pagos** - Pagos de clientes
- ✅ **Configuración** - Configuración de tu negocio

---

## 🌐 Sincronización en Tiempo Real

### Cuando estás ONLINE (con internet)

```
Laptop        Servidor       Móvil
 │              │             │
 ├─ Nueva venta │             │
 └─────────────→│─────────────→ (1-2 segundos)
                │             │
                └─ Notificación vía WebSocket
                              │
                         Móvil actualizado
```

**Resultado:** Los cambios aparecen INSTANTÁNEAMENTE en todos los dispositivos.

### Cuando estás OFFLINE (sin internet)

```
Móvil (sin señal)
│
├─ Local: Creas una venta
├─ Se guarda en el dispositivo
├─ Se agrega a la cola de cambios
└─ Espera hasta tener conexión
```

**Cuando vuelves ONLINE:**

```
Móvil recupera conexión
│
├─ Detecta los cambios pendientes
├─ Automáticamente los envía al servidor
├─ Procesa la cola de cambios uno por uno
└─ Laptop/Tablet reciben actualizaciones
```

---

## ✨ Características Principales

### 1. **Sincronización Automática**
No tienes que hacer clic en "Sincronizar" - sucede automáticamente:
- ✅ Al abrir la app
- ✅ Cada vez que haces un cambio
- ✅ Cada 30 segundos (fallback)
- ✅ Al recuperar conexión

### 2. **Cambios Nunca se Pierden**
Aunque se apague tu dispositivo:
- ✅ Los cambios se guardan en la base de datos local
- ✅ Se sincronizarán cuando vuelvas a iniciar la app
- ✅ Si estabas offline, se enviarán cuando obtengas conexión

### 3. **Funciona SIN Internet**
- ✅ Puedes trabajar offline
- ✅ Todos los datos se guardan localmente
- ✅ Se sincroniza automáticamente cuando vuelves online
- ✅ Perfecto para rutas sin señal

### 4. **Resolución Automática de Conflictos**
Si dos dispositivos modifican lo mismo:
- ✅ WIN la modificación más reciente
- ✅ No se pierden datos
- ✅ Todo se sincroniza correctamente

---

## 🚀 Casos de Uso

### Caso 1: Trabajar en ruta sin internet

```
1. Abres la app en el móvil (sin señal)
2. Registras 10 ventas durante el día
3. Los cambios se guardan localmente
4. Recuperas conexión al volver a casa
5. ✅ Automáticamente se sincronizan con el servidor
6. ✅ Tu laptop (en casa) ve las 10 ventas
```

### Caso 2: Múltiples dispositivos simultáneamente

```
Laptop: Dashboard abierto
Móvil:  En la ruta
Tablet: Viendo estadísticas

Móvil:  Registras una venta
↓
Servidor recibe el cambio
↓
Broadcast a todos los dispositivos
↓
Laptop: Dashboard actualiza automáticamente
Tablet: Estadísticas se recalculan
```

### Caso 3: Dispositivo perdido/robado

```
Todos tus datos están en el SERVIDOR
SI pierdes el móvil:
1. Simplemente toma otro dispositivo
2. Inicia sesión con tu cuenta
3. ✅ Todos tus datos aparecen (descarga desde servidor)
```

---

## ⚙️ Configuración Recomendada

### En tu Laptop

```
1. Abre GallOli
2. Inicia sesión con tu cuenta
3. Dashboard abierto todo el día
4. ✅ Automáticamente recibe cambios de móvil
```

### En tu Móvil

```
1. Abre GallOli
2. Inicia sesión con la MISMA cuenta
3. Úsalo normalmente en la ruta
4. ✅ Los cambios se sincronizan automáticamente
```

### En tu Tablet

```
1. Abre GallOli (opcional)
2. Inicia sesión con la MISMA cuenta
3. Úsalo para ver estadísticas/reportes
4. ✅ Todos los datos están sincronizados
```

---

## 📊 Indicadores de Sincronización

### Estatus Online (Verde)
```
🟢 Online - Los cambios se sincronizan en tiempo real
```

### Estatus Offline (Rojo)
```
🔴 Sin conexión - Los cambios se guardan localmente
```

### Sincronizando (Amarillo)
```
🟡 Sincronizando... - Espera a que termine
```

### Sincronizado (Azul)
```
🔵 Sincronizado - Todo está actualizado
```

### Errores (Con símbolo ⚠️)
```
⚠️ Error de sincronización - Reintentando...
   Los cambios se guardarán y se enviarán cuando se pueda
```

---

## 🔧 Qué Hacer Si...

### "No veo los cambios en otro dispositivo"

**Solución:**
1. Verifica que AMBOS dispositivos estén online
2. Espera 5 segundos (sincronización en tiempo real)
3. Recarga la página (F5 o swipe para refrescar)
4. Si sigue sin funcionar, verifica el token de autenticación

### "Tengo cambios pendientes"

**Significado:** Cambios que no se pudieron enviar al servidor aún.

**Solución:**
1. Verifica que tu conexión a internet sea estable
2. La app reintentará automáticamente
3. Si persiste, intenta:
   - Cierra la app completamente
   - Reabre la app
   - Los cambios se procesarán nuevamente

### "¿Dónde puedo ver el estado de sincronización?"

**En la app:**
1. Abre la página "Sincronización" (menú lateral)
2. Verás:
   - Estado de la connexión
   - Cambios pendientes
   - Historial de sincronización
   - Dispositivos conectados

**En la consola del navegador (Ctrl+Shift+J):**
```javascript
// Ver estado de sincronización
window.SyncEngine?.ws?.readyState
// 0=Conectando, 1=Conectado, 2=Cerrando, 3=Cerrado

// Ver cambios en cola
window.OfflineQueueManager?.queue?.length

// Ver logs de sincronización
// Busca en la consola "🔄" o "📤"
```

### "Mi conexión es lenta"

**No hay problema:**
1. La sincronización funciona con conexiones lentas
2. Usamos batches para no sobrecargar
3. Los cambios se enviarán gradualmente
4. Un cambio tarda máximo 30 segundos en sincronizarse

---

## 🔐 Seguridad

### Tu Sesión

```
Login: Se crea un token seguro
Token: Se guarda en IndexedDB (área privada del navegador)
Caducidad: 30 días (se renueva automáticamente)
Logout: Todo se limpia
```

### Datos

```
✅ Solo TÚ ves tus datos
✅ Solo datos de tu negocio se sincronizan
✅ Las comunicaciones son encriptadas (HTTPS/WSS)
✅ El servidor valida que tienes permiso
```

---

## 📞 Preguntas Frecuentes

**P: ¿Qué pasa si pierdo internet temporalmente?**
R: Los cambios se guardan localmente y se sincronizarán cuando vuelvas online. No se pierden datos.

**P: ¿Puedo usar dos cuentas en el mismo dispositivo?**
R: ✅ Sí. Simplemente cierra sesión e inicia sesión con otra cuenta. Los datos se sincronizan por cuenta.

**P: ¿A dónde van mis datos?**
R: A los servidores de Cloudflare D1 (CloudflareDatabase). Están seguros y encriptados.

**P: ¿Puedo desactivar la sincronización?**
R: No, la sincronización es automática. Pero puedes trabajar offline si lo deseas.

**P: ¿Cuánto almacenamiento toma?**
R: ~1 MB en IndexedDB (según cantidad de datos). El navegador te da 50 MB gratis por sitio.

**P: ¿Qué tiempo tarda la sincronización?**
R: 
- Cambios simples: 1-2 segundos
- Sincronización inicial: 3-10 segundos (según conexión)
- Offline queue: Se procesa en batches cada 30 segundos

**P: ¿Qué pasa si 2 personas actualizan el mismo dato?**
R: GANA la última modificación (por timestamp). El sistema es determinístico, sin conflictos.

---

## 🎯 Próximos Pasos

1. **Abre GallOli en tu PC**
   - Inicia sesión
   - Verifica que WebSocket está conectado
   - Haz un cambio de prueba

2. **Abre GallOli en tu móvil**
   - Inicia sesión con LA MISMA CUENTA
   - Verifica que puedes ver el cambio de la PC

3. **Prueba offline**
   - Abre el móvil en modo avión
   - Crea unos cambios
   - Desactiva el modo avión
   - Verifica que se sincronizan

4. **Usa la app normalmente**
   - La sincronización funciona en segundo plano
   - No tienes que hacer nada especial

---

**Última actualización:** Marzo 2026  
**Versión:** 4.0  
**Estado:** ✅ Listo para usar en múltiples dispositivos
