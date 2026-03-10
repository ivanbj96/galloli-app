# Despliegue del Worker de Facturación SRI

## 📦 Instalación

```bash
cd workers
npm install
```

## 🚀 Despliegue a Cloudflare

```bash
wrangler login
wrangler deploy facturacion-sri.js --name facturacion-sri
```

## 🔧 Configuración

El Worker estará disponible en:
```
https://facturacion-sri.tu-cuenta.workers.dev
```

Actualizar en `js/facturacion-electronica.js`:
```javascript
const WORKER_URL = 'https://facturacion-sri.tu-cuenta.workers.dev';
```

## 🔐 Seguridad

El Worker maneja:
- ✅ Firma digital con certificado PKCS#12
- ✅ Comunicación segura con SRI
- ✅ Validación de XML
- ✅ Parseo de respuestas SOAP

## 📡 Endpoints

### POST /api/facturacion/firmar
Firma XML con certificado digital

**Request:**
```json
{
  "xml": "<?xml version...",
  "certificadoBase64": "MIIKe...",
  "password": "tu-password"
}
```

**Response:**
```json
{
  "success": true,
  "xmlFirmado": "<?xml version..."
}
```

### POST /api/facturacion/enviar
Envía XML firmado al SRI

**Request:**
```json
{
  "xmlFirmado": "<?xml version...",
  "ambiente": 1
}
```

**Response:**
```json
{
  "estado": "RECIBIDA",
  "mensaje": "Comprobante recibido correctamente"
}
```

### POST /api/facturacion/autorizar
Consulta autorización en el SRI

**Request:**
```json
{
  "claveAcceso": "4920250130...",
  "ambiente": 1
}
```

**Response:**
```json
{
  "estado": "AUTORIZADO",
  "numeroAutorizacion": "1234567890",
  "fechaAutorizacion": "2025-01-30T10:30:00",
  "xmlAutorizado": "<?xml version..."
}
```

## ⚠️ Notas

- El certificado se envía al Worker solo durante la firma
- No se almacena en el Worker
- Toda comunicación es HTTPS
- Compatible con ambiente de pruebas y producción del SRI
