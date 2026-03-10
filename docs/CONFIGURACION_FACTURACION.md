# Guía de Configuración - Facturación Electrónica SRI

## 🚀 Pasos para Activar Facturación Electrónica

### 1. Obtener Certificado Digital
1. Contactar a una entidad certificadora autorizada:
   - Banco Central del Ecuador
   - Security Data
   - ANF AC Ecuador
2. Costo aproximado: $30-50 USD anuales
3. Descargar certificado en formato .p12 o .pfx

### 2. Registrarse en el SRI
1. Ingresar a https://www.sri.gob.ec
2. Solicitar autorización para emitir comprobantes electrónicos
3. Obtener credenciales de acceso

### 3. Configurar en GallOli

#### Datos del Negocio
```
RUC: 1234567890001
Razón Social: NOMBRE LEGAL DEL NEGOCIO
Nombre Comercial: NOMBRE COMERCIAL
Dirección Matriz: Calle Principal 123 y Secundaria
Establecimiento: 001
Punto de Emisión: 001
Obligado a llevar contabilidad: NO (o SÍ según corresponda)
```

#### Certificado Digital
1. Subir archivo .p12 o .pfx
2. Ingresar contraseña del certificado
3. Sistema lo almacenará encriptado

#### Secuencial Inicial
- Número de factura inicial (ej: 1)
- Se incrementa automáticamente

### 4. Ambiente de Pruebas
1. Iniciar en ambiente de pruebas (ambiente = 1)
2. Emitir facturas de prueba
3. Verificar autorización en portal SRI
4. Una vez validado, cambiar a producción (ambiente = 2)

### 5. Emisión de Facturas

#### Desde Ventas
1. Registrar venta normalmente
2. Click en "Emitir Factura Electrónica"
3. Sistema genera y envía al SRI automáticamente
4. Cliente recibe PDF y XML por email

#### Datos del Cliente Requeridos
- Nombre completo
- RUC o Cédula (obligatorio)
- Email (para envío)
- Teléfono

### 6. Consulta de Facturas
- Ver todas las facturas emitidas
- Estado de autorización
- Reenviar al cliente
- Descargar XML y PDF

## ⚠️ Importante

### Obligaciones
- Emitir factura por cada venta
- Conservar XML por 7 años
- Reportar mensualmente al SRI (ATS)

### Contingencia
- Si no hay internet, usar emisión offline
- Enviar al SRI dentro de 24 horas

### Soporte
- SRI: 1700 774 774
- Email: atencionalcontribuyente@sri.gob.ec

## 📱 Integración con GallOli

### Flujo Automático
1. Cliente registra venta
2. Sistema genera factura electrónica
3. Envía al SRI
4. Notifica al cliente
5. Almacena en base de datos

### Notificaciones
- Email con PDF y XML
- WhatsApp (opcional)
- SMS (opcional)

## 🔧 Solución de Problemas

### Factura Devuelta
- Verificar datos del cliente
- Revisar formato de RUC/Cédula
- Validar certificado digital

### No Autorizada
- Verificar conexión a internet
- Revisar secuencial
- Contactar al SRI

### Certificado Expirado
- Renovar con entidad certificadora
- Actualizar en configuración

## 📊 Reportes

### Diario
- Facturas emitidas
- Monto total facturado
- Estado de autorizaciones

### Mensual
- Generar ATS
- Enviar al SRI
- Declaración de IVA

## 💡 Consejos

1. **Backup:** Respaldar XML diariamente
2. **Validación:** Verificar datos antes de emitir
3. **Pruebas:** Usar ambiente de pruebas primero
4. **Capacitación:** Entrenar al personal
5. **Actualización:** Mantener sistema actualizado
