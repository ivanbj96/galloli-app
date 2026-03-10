# ⚠️ Obligatoriedad de Facturación Electrónica en Ecuador

## 📋 ¿Quiénes DEBEN emitir facturas electrónicas?

### Obligados desde 2015
- Contribuyentes especiales
- Exportadores
- Sociedades (compañías)
- Personas naturales obligadas a llevar contabilidad

### Obligados desde 2020
- **TODOS los contribuyentes con RUC** (excepto RISE)

### NO Obligados
- Régimen RISE (Régimen Simplificado)
- Contribuyentes sin RUC
- Ventas menores a consumidor final sin identificación

## 🔍 ¿Cómo saber si estoy obligado?

1. Ingresar a https://srienlinea.sri.gob.ec
2. Consultar RUC
3. Verificar "Obligaciones Tributarias"
4. Si aparece "EMISIÓN DE COMPROBANTES ELECTRÓNICOS" → Estás obligado

## 💡 Recomendación para GallOli

### Opción 1: Facturación Opcional (Actual)
- Usuario decide si habilita facturación electrónica
- Ideal para negocios pequeños o RISE
- Pueden usar recibos simples

### Opción 2: Verificación Automática
- Al configurar RUC, consultar al SRI si está obligado
- Habilitar/deshabilitar automáticamente
- Mostrar advertencia si está obligado pero no configurado

## 📊 Estadísticas Ecuador 2024
- 85% de contribuyentes con RUC están obligados
- Multas por no emitir: $30 - $1,500 USD
- Plazo para regularizar: 30 días desde notificación

## ✅ Implementación en GallOli

### Estado Actual
```javascript
config: {
  habilitado: false, // Usuario decide
  // ... resto de configuración
}
```

### Flujo Recomendado
1. Usuario ingresa RUC en configuración
2. Sistema consulta al SRI (opcional)
3. Si está obligado → Mostrar alerta
4. Usuario puede habilitar/deshabilitar manualmente
5. Si está habilitado → Emitir facturas automáticamente

### Configuración
- **Habilitado:** Todas las ventas generan factura electrónica
- **Deshabilitado:** Solo recibos PDF simples
- **Mixto:** Usuario elige por venta (botón "Emitir Factura")

## 🚨 Sanciones por No Emitir

### Primera vez
- Multa: $30 USD
- Plazo: 30 días para regularizar

### Reincidencia
- Multa: $60 - $1,500 USD
- Suspensión temporal del RUC
- Clausura del establecimiento (casos graves)

## 📞 Contacto SRI
- Teléfono: 1700 774 774
- Web: https://www.sri.gob.ec
- Email: atencionalcontribuyente@sri.gob.ec

## 🎯 Conclusión

**Para GallOli:**
- Mantener facturación OPCIONAL es correcto
- Agregar advertencia si detecta RUC obligado
- Permitir al usuario decidir
- Facilitar activación cuando esté listo
