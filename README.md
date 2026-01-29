# GallOli - Sistema de Gestión Integral para Negocios

> PWA moderna para gestión completa de ventas, inventario, contabilidad y créditos con sincronización en tiempo real multi-dispositivo.

![Version](https://img.shields.io/badge/version-6.6.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20iOS%20%7C%20Android-lightgrey)

## 🚀 Características Principales

### 📊 Gestión de Ventas
- **Registro rápido de ventas** con cálculo automático de totales
- **Ventas al contado y a crédito** con seguimiento de pagos
- **Historial completo** con filtros por fecha y cliente
- **Recibos digitales** en PDF con logo personalizado
- **Estadísticas en tiempo real** de ventas diarias, semanales y mensuales

### 👥 Gestión de Clientes
- **Base de datos completa** de clientes con contacto y ubicación
- **Geolocalización** con mapas interactivos (OpenStreetMap)
- **Historial de compras** por cliente
- **Control de créditos** y deudas pendientes
- **Rutas de entrega** optimizadas

### 💰 Control de Créditos
- **Seguimiento de ventas a crédito** con saldo pendiente
- **Registro de pagos parciales** con historial detallado
- **Pago inteligente** para liquidar múltiples créditos
- **Alertas de deudas** pendientes
- **Reportes de cobranza** por cliente

### 📦 Gestión de Pedidos
- **Registro de pedidos** con estado (pendiente/completado)
- **Notificaciones automáticas** de pedidos pendientes
- **Conversión a venta** con un clic
- **Historial de pedidos** por cliente

### 📈 Contabilidad
- **Registro de gastos** con categorías personalizables
- **Cálculo automático de ganancias** (ventas - gastos - merma)
- **Control de merma** con registro diario de pérdidas
- **Precios dinámicos** por libra con historial
- **Diezmos y ofrendas** con cálculo automático basado en ganancia neta

### 🔄 Sincronización Multi-Dispositivo
- **Sincronización en tiempo real** vía WebSocket
- **Soporte multi-dispositivo** (celular, tablet, computadora)
- **Merge inteligente** de datos con resolución de conflictos
- **Modo offline** con sincronización automática al reconectar
- **Backup automático** diario a Telegram

### 🔐 Seguridad y Respaldo
- **Autenticación segura** con email/password o Telegram
- **Backup automático** programado (10 PM diario)
- **Backup manual** a Telegram con un clic
- **Exportación de datos** en JSON
- **Recuperación completa** desde backup

### 🎨 Personalización
- **Tema personalizable** con colores del negocio
- **Logo personalizado** en recibos y app
- **Configuración flexible** de porcentajes de diezmo/ofrenda
- **Manifest dinámico** para PWA

### 📱 Progressive Web App (PWA)
- **Instalable** en cualquier dispositivo (iOS, Android, Desktop)
- **Funciona offline** con IndexedDB
- **Notificaciones push** para recordatorios y alertas
- **Actualizaciones automáticas** del service worker
- **Responsive design** adaptado a cualquier pantalla

## 🛠️ Tecnologías

### Frontend
- **Vanilla JavaScript** (sin frameworks, ultra rápido)
- **IndexedDB** para almacenamiento local persistente
- **Service Worker** para modo offline y notificaciones
- **Leaflet.js** para mapas interactivos
- **jsPDF** para generación de recibos PDF
- **CSS3** con variables personalizables

### Backend
- **Cloudflare Workers** (serverless, edge computing)
- **Cloudflare D1** (SQLite distribuido)
- **Durable Objects** para WebSocket en tiempo real
- **Cloudflare Pages** para hosting del frontend

### Integraciones
- **Telegram Bot API** para backups automáticos
- **OpenStreetMap** para geolocalización
- **Web Push API** para notificaciones

## 📦 Instalación

### Requisitos Previos
- Node.js 18+
- Cuenta de Cloudflare (gratuita)
- Wrangler CLI (`npm install -g wrangler`)

### Configuración

1. **Clonar el repositorio**
```bash
git clone https://github.com/tu-usuario/galloli.git
cd galloli
```

2. **Configurar Cloudflare D1**
```bash
wrangler d1 create galloli
wrangler d1 execute galloli --file=workers/schema.sql
```

3. **Configurar variables de entorno**
```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put JWT_SECRET
```

4. **Desplegar Worker**
```bash
wrangler deploy
```

5. **Desplegar Frontend**
```bash
wrangler pages deploy . --project-name=galloli --branch=main
```

## 🚀 Uso

### Acceso
1. Abre la app en tu navegador: `https://tu-dominio.pages.dev`
2. Regístrate con email o Telegram
3. Configura tu negocio (nombre, logo, colores)
4. ¡Empieza a vender!

### Instalación como PWA
- **Android/Chrome:** Menú → "Agregar a pantalla de inicio"
- **iOS/Safari:** Compartir → "Agregar a pantalla de inicio"
- **Desktop:** Ícono de instalación en la barra de direcciones

### Sincronización Multi-Dispositivo
1. Inicia sesión en todos tus dispositivos
2. Los cambios se sincronizan automáticamente en tiempo real
3. Funciona offline, sincroniza al reconectar

### Backup y Recuperación
1. Configura tu bot de Telegram en Configuración
2. El backup se envía automáticamente a las 10 PM
3. Para restaurar, importa el archivo JSON desde Backup

## 📊 Estructura del Proyecto

```
galloli/
├── index.html              # Página principal
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker
├── css/
│   └── styles.css         # Estilos globales
├── js/
│   ├── app.js             # Lógica principal
│   ├── modules.js         # Módulos de negocio
│   ├── auth.js            # Autenticación
│   ├── sync-engine.js     # Motor de sincronización
│   ├── db.js              # IndexedDB wrapper
│   ├── auto-backup.js     # Backup automático
│   ├── payment-processor.js # Procesamiento de pagos
│   ├── notify-system.js   # Sistema de notificaciones
│   └── utils.js           # Utilidades
├── workers/
│   ├── index.js           # Cloudflare Worker principal
│   ├── session-manager.js # Durable Object para WebSocket
│   └── schema.sql         # Esquema de base de datos
└── icons/
    └── favicon.pub/       # Iconos de la app
```

## 🔧 Configuración Avanzada

### Personalización de Tema
```javascript
// En Configuración → Personalización
{
  primaryColor: "#4CAF50",
  secondaryColor: "#FF9800",
  logo: "data:image/png;base64,..."
}
```

### Configuración de Backup
```javascript
// En Configuración → Backup
{
  telegramBotToken: "tu_token",
  telegramChatId: "tu_chat_id",
  autoBackupTime: "22:00" // 10 PM
}
```

### Diezmos y Ofrendas
```javascript
// En Diezmos y Ofrendas → Configuración
{
  diezmoPercent: 10,  // 10% de ganancia neta
  ofrendaPercent: 5   // 5% de ganancia neta
}
```

## 🐛 Solución de Problemas

### La sincronización no funciona
- Verifica que estés conectado a internet
- Revisa que hayas iniciado sesión en todos los dispositivos
- Recarga la página para forzar sincronización

### El backup no se envía
- Verifica el token del bot de Telegram
- Asegúrate de que el bot tenga permisos para enviar mensajes
- Revisa que el chat_id sea correcto

### Los datos no persisten
- Verifica que IndexedDB esté habilitado en tu navegador
- No uses modo incógnito (no persiste datos)
- Revisa el espacio disponible en tu dispositivo

## 📈 Roadmap

- [ ] Reportes avanzados con gráficos
- [ ] Integración con WhatsApp Business
- [ ] Multi-sucursal
- [ ] Facturación electrónica
- [ ] Integración con sistemas de pago
- [ ] App nativa (React Native)
- [ ] Dashboard web para administración

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver `LICENSE` para más detalles.

## 👨‍💻 Autor

**Ivan Quiñonez**
- GitHub: [@ivanbj-96](https://github.com/ivanbj-96)
- Email: contacto@galloli.app

## 🙏 Agradecimientos

- Cloudflare por su infraestructura serverless
- OpenStreetMap por los mapas gratuitos
- Telegram por su API de bots
- La comunidad open source

---

**¿Te gusta GallOli?** ⭐ Dale una estrella en GitHub y compártelo con otros emprendedores.
