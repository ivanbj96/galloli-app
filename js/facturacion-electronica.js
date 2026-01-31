// Módulo de Facturación Electrónica SRI Ecuador
const FacturacionElectronicaModule = {
    config: {
        habilitado: false, // NUEVO: Facturación opcional
        ambiente: 1,
        ruc: '',
        razonSocial: '',
        nombreComercial: '',
        dirMatriz: '',
        establecimiento: '001',
        puntoEmision: '001',
        secuencialActual: 1,
        obligadoContabilidad: 'NO',
        certificadoBase64: null,
        certificadoPassword: null,
        agenteRetencion: 'NO',
        contribuyenteRimpe: 'NO'
    },
    
    facturas: [],
    
    async init() {
        await this.loadConfig();
        await this.loadFacturas();
    },
    
    // Generar clave de acceso de 49 dígitos
    generarClaveAcceso(fecha, tipoComprobante, secuencial) {
        const dia = fecha.getDate().toString().padStart(2, '0');
        const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
        const anio = fecha.getFullYear().toString();
        
        const fechaStr = dia + mes + anio;
        const tipo = tipoComprobante.padStart(2, '0');
        const ruc = this.config.ruc.padStart(13, '0');
        const ambiente = this.config.ambiente.toString();
        const serie = this.config.establecimiento + this.config.puntoEmision;
        const secuencialStr = secuencial.toString().padStart(9, '0');
        const codigoNumerico = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
        
        const clave48 = fechaStr + tipo + ruc + ambiente + serie + secuencialStr + codigoNumerico;
        const digitoVerificador = this.calcularModulo11(clave48);
        
        return clave48 + digitoVerificador;
    },
    
    // Algoritmo Módulo 11 para dígito verificador
    calcularModulo11(clave48) {
        const multiplicadores = [2,3,4,5,6,7,2,3,4,5,6,7,2,3,4,5,6,7,2,3,4,5,6,7,2,3,4,5,6,7,2,3,4,5,6,7,2,3,4,5,6,7,2,3,4,5,6,7];
        let suma = 0;
        
        for (let i = 0; i < 48; i++) {
            suma += parseInt(clave48[i]) * multiplicadores[i];
        }
        
        const residuo = suma % 11;
        const digito = residuo === 0 ? 0 : 11 - residuo;
        
        return digito.toString();
    },
    
    // Generar XML de factura
    generarXMLFactura(venta, cliente) {
        const fecha = new Date(venta.date);
        const claveAcceso = this.generarClaveAcceso(fecha, '01', this.config.secuencialActual);
        const secuencial = this.config.secuencialActual.toString().padStart(9, '0');
        
        // Calcular impuestos
        const subtotal = venta.total / 1.12; // Asumiendo IVA 12%
        const iva = venta.total - subtotal;
        
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${this.config.ambiente}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${this.escapeXML(this.config.razonSocial)}</razonSocial>
    <nombreComercial>${this.escapeXML(this.config.nombreComercial)}</nombreComercial>
    <ruc>${this.config.ruc}</ruc>
    <claveAcceso>${claveAcceso}</claveAcceso>
    <codDoc>01</codDoc>
    <estab>${this.config.establecimiento}</estab>
    <ptoEmi>${this.config.puntoEmision}</ptoEmi>
    <secuencial>${secuencial}</secuencial>
    <dirMatriz>${this.escapeXML(this.config.dirMatriz)}</dirMatriz>
  </infoTributaria>
  
  <infoFactura>
    <fechaEmision>${this.formatearFecha(fecha)}</fechaEmision>
    <dirEstablecimiento>${this.escapeXML(this.config.dirMatriz)}</dirEstablecimiento>
    <obligadoContabilidad>${this.config.obligadoContabilidad}</obligadoContabilidad>
    <tipoIdentificacionComprador>${this.getTipoIdentificacion(cliente)}</tipoIdentificacionComprador>
    <razonSocialComprador>${this.escapeXML(cliente.name)}</razonSocialComprador>
    <identificacionComprador>${cliente.ruc || cliente.cedula || '9999999999999'}</identificacionComprador>
    <totalSinImpuestos>${subtotal.toFixed(2)}</totalSinImpuestos>
    <totalDescuento>0.00</totalDescuento>
    <totalConImpuestos>
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>2</codigoPorcentaje>
        <baseImponible>${subtotal.toFixed(2)}</baseImponible>
        <valor>${iva.toFixed(2)}</valor>
      </totalImpuesto>
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>${venta.total.toFixed(2)}</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      <pago>
        <formaPago>${venta.isPaid ? '01' : '20'}</formaPago>
        <total>${venta.total.toFixed(2)}</total>
        <plazo>0</plazo>
        <unidadTiempo>dias</unidadTiempo>
      </pago>
    </pagos>
  </infoFactura>
  
  <detalles>
    <detalle>
      <codigoPrincipal>POLLO001</codigoPrincipal>
      <descripcion>POLLO PELADO</descripcion>
      <cantidad>${venta.weight.toFixed(2)}</cantidad>
      <precioUnitario>${(subtotal / venta.weight).toFixed(2)}</precioUnitario>
      <descuento>0.00</descuento>
      <precioTotalSinImpuesto>${subtotal.toFixed(2)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>2</codigoPorcentaje>
          <tarifa>12</tarifa>
          <baseImponible>${subtotal.toFixed(2)}</baseImponible>
          <valor>${iva.toFixed(2)}</valor>
        </impuesto>
      </impuestos>
    </detalle>
  </detalles>
  
  <infoAdicional>
    <campoAdicional nombre="Email">${cliente.email || 'sin-email@example.com'}</campoAdicional>
    <campoAdicional nombre="Teléfono">${cliente.phone}</campoAdicional>
    <campoAdicional nombre="Peso">${venta.weight.toFixed(2)} lb</campoAdicional>
    <campoAdicional nombre="Cantidad">${venta.quantity} pollos</campoAdicional>
  </infoAdicional>
</factura>`;
        
        return { xml, claveAcceso, secuencial };
    },
    
    // Emitir factura al SRI (SOLO si está habilitado)
    async emitirFactura(venta, cliente) {
        // Verificar si facturación está habilitada
        if (!this.config.habilitado) {
            console.log('Facturación electrónica deshabilitada');
            return null;
        }
        
        try {
            // Validar configuración
            if (!this.validarConfiguracion()) {
                throw new Error('Configuración incompleta. Configure RUC y certificado digital.');
            }
            
            // Generar XML
            const { xml, claveAcceso, secuencial } = this.generarXMLFactura(venta, cliente);
            
            // Firmar XML (requiere certificado digital)
            const xmlFirmado = await this.firmarXML(xml);
            
            // Enviar a recepción SRI
            const respuestaRecepcion = await this.enviarRecepcion(xmlFirmado);
            
            if (respuestaRecepcion.estado !== 'RECIBIDA') {
                throw new Error('Factura devuelta por el SRI: ' + respuestaRecepcion.mensaje);
            }
            
            // Consultar autorización
            const respuestaAutorizacion = await this.consultarAutorizacion(claveAcceso);
            
            if (respuestaAutorizacion.estado !== 'AUTORIZADO') {
                throw new Error('Factura no autorizada: ' + respuestaAutorizacion.mensaje);
            }
            
            // Guardar factura
            const factura = {
                id: Date.now(),
                saleId: venta.id,
                claveAcceso,
                numeroAutorizacion: respuestaAutorizacion.numeroAutorizacion,
                fechaAutorizacion: respuestaAutorizacion.fechaAutorizacion,
                estado: 'AUTORIZADO',
                ambiente: this.config.ambiente === 1 ? 'PRUEBAS' : 'PRODUCCION',
                tipoComprobante: 'FACTURA',
                establecimiento: this.config.establecimiento,
                puntoEmision: this.config.puntoEmision,
                secuencial,
                xmlFirmado,
                xmlAutorizado: respuestaAutorizacion.xmlAutorizado,
                clienteRuc: cliente.ruc || cliente.cedula,
                clienteNombre: cliente.name,
                total: venta.total,
                fecha: venta.date,
                timestamp: Date.now()
            };
            
            this.facturas.push(factura);
            await this.saveFacturas();
            
            // Incrementar secuencial
            this.config.secuencialActual++;
            await this.saveConfig();
            
            // Generar RIDE (PDF)
            await this.generarRIDE(factura);
            
            return factura;
            
        } catch (error) {
            console.error('Error emitiendo factura:', error);
            throw error;
        }
    },
    
    // Firmar XML con certificado digital (usando Worker)
    async firmarXML(xml) {
        if (!this.config.certificadoBase64 || !this.config.certificadoPassword) {
            throw new Error('Certificado digital no configurado');
        }
        
        try {
            const response = await fetch('https://facturacion-sri.ivanbj-96.workers.dev/api/facturacion/firmar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    xml,
                    certificadoBase64: this.config.certificadoBase64,
                    password: this.config.certificadoPassword
                })
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Error firmando XML');
            }
            
            return result.xmlFirmado;
            
        } catch (error) {
            console.error('Error en firma digital:', error);
            throw new Error('No se pudo firmar el XML: ' + error.message);
        }
    },
    
    // Enviar a recepción SRI (usando Worker)
    async enviarRecepcion(xmlFirmado) {
        try {
            const response = await fetch('https://facturacion-sri.ivanbj-96.workers.dev/api/facturacion/enviar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    xmlFirmado,
                    ambiente: this.config.ambiente
                })
            });
            
            return await response.json();
            
        } catch (error) {
            console.error('Error enviando al SRI:', error);
            throw new Error('No se pudo enviar al SRI: ' + error.message);
        }
    },
    
    // Consultar autorización (usando Worker)
    async consultarAutorizacion(claveAcceso) {
        try {
            const response = await fetch('https://facturacion-sri.ivanbj-96.workers.dev/api/facturacion/autorizar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    claveAcceso,
                    ambiente: this.config.ambiente
                })
            });
            
            return await response.json();
            
        } catch (error) {
            console.error('Error consultando autorización:', error);
            throw new Error('No se pudo consultar autorización: ' + error.message);
        }
    },
    
    // Generar RIDE (PDF)
    async generarRIDE(factura) {
        // Implementar generación de PDF con formato RIDE oficial
        // Incluir código QR con clave de acceso
        console.log('Generando RIDE para factura:', factura.claveAcceso);
    },
    
    // Utilidades
    escapeXML(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    },
    
    formatearFecha(fecha) {
        const dia = fecha.getDate().toString().padStart(2, '0');
        const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
        const anio = fecha.getFullYear();
        return `${dia}/${mes}/${anio}`;
    },
    
    getTipoIdentificacion(cliente) {
        if (cliente.ruc) return '04'; // RUC
        if (cliente.cedula) return '05'; // Cédula
        if (cliente.pasaporte) return '06'; // Pasaporte
        return '07'; // Consumidor Final
    },
    
    validarConfiguracion() {
        return this.config.ruc && 
               this.config.razonSocial && 
               this.config.certificadoBase64 && 
               this.config.certificadoPassword;
    },
    
    parsearRespuestaSRI(xml) {
        // Parsear respuesta SOAP del SRI
        // Implementar parser XML real
        return {
            estado: 'RECIBIDA',
            mensaje: 'Comprobante recibido correctamente'
        };
    },
    
    parsearRespuestaAutorizacion(xml) {
        // Parsear respuesta de autorización
        return {
            estado: 'AUTORIZADO',
            numeroAutorizacion: '1234567890',
            fechaAutorizacion: new Date().toISOString(),
            xmlAutorizado: xml
        };
    },
    
    // Persistencia
    async saveConfig() {
        if (DB.db) {
            await DB.set('config', { key: 'facturacion-config', value: this.config });
        }
        localStorage.setItem('facturacionConfig', JSON.stringify(this.config));
    },
    
    async loadConfig() {
        if (DB.db) {
            const saved = await DB.get('config', 'facturacion-config');
            if (saved?.value) this.config = { ...this.config, ...saved.value };
        }
        const savedLocal = localStorage.getItem('facturacionConfig');
        if (savedLocal) this.config = { ...this.config, ...JSON.parse(savedLocal) };
    },
    
    async saveFacturas() {
        if (DB.db) {
            for (const factura of this.facturas) {
                await DB.set('facturas', factura);
            }
        }
        localStorage.setItem('facturas', JSON.stringify(this.facturas));
    },
    
    async loadFacturas() {
        if (DB.db) {
            this.facturas = await DB.getAll('facturas');
        } else {
            const saved = localStorage.getItem('facturas');
            if (saved) this.facturas = JSON.parse(saved);
        }
    }
};

// Exportar
window.FacturacionElectronicaModule = FacturacionElectronicaModule;
