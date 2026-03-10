// Cloudflare Worker para Facturación Electrónica SRI Ecuador
// workers/facturacion-sri.js

import { SignedXml } from 'xml-crypto';
import forge from 'node-forge';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }
    
    try {
      // Rutas
      if (url.pathname === '/api/facturacion/firmar') {
        return await this.firmarXML(request, env);
      }
      
      if (url.pathname === '/api/facturacion/enviar') {
        return await this.enviarSRI(request, env);
      }
      
      if (url.pathname === '/api/facturacion/autorizar') {
        return await this.consultarAutorizacion(request, env);
      }
      
      if (url.pathname === '/api/facturacion/generar-ride') {
        return await this.generarRIDE(request, env);
      }
      
      return new Response('Not Found', { status: 404 });
      
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
  
  // Firmar XML con certificado digital
  async firmarXML(request, env) {
    const { xml, certificadoBase64, password } = await request.json();
    
    try {
      // Decodificar certificado PKCS#12
      const p12Der = forge.util.decode64(certificadoBase64);
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
      
      // Extraer clave privada y certificado
      const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certBag = bags[forge.pki.oids.certBag][0];
      const certificate = certBag.cert;
      
      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
      const privateKey = keyBag.key;
      
      // Convertir a PEM
      const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
      const certificatePem = forge.pki.certificateToPem(certificate);
      
      // Firmar XML
      const sig = new SignedXml();
      sig.addReference("//*[local-name(.)='factura']", 
        ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"],
        "http://www.w3.org/2001/04/xmlenc#sha256");
      
      sig.signingKey = privateKeyPem;
      sig.keyInfoProvider = {
        getKeyInfo: () => {
          return `<X509Data><X509Certificate>${certificate.toString('base64')}</X509Certificate></X509Data>`;
        }
      };
      
      sig.computeSignature(xml);
      const xmlFirmado = sig.getSignedXml();
      
      return new Response(JSON.stringify({ 
        success: true, 
        xmlFirmado 
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  },
  
  // Enviar a recepción SRI
  async enviarSRI(request, env) {
    const { xmlFirmado, ambiente } = await request.json();
    
    const url = ambiente === 1
      ? 'https://celeroapi.pruebas.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl'
      : 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl';
    
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <xml><![CDATA[${xmlFirmado}]]></xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': ''
      },
      body: soapEnvelope
    });
    
    const responseText = await response.text();
    const resultado = this.parsearRespuestaSRI(responseText);
    
    return new Response(JSON.stringify(resultado), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  },
  
  // Consultar autorización
  async consultarAutorizacion(request, env) {
    const { claveAcceso, ambiente } = await request.json();
    
    const url = ambiente === 1
      ? 'https://celeroapi.pruebas.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl'
      : 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl';
    
    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': ''
      },
      body: soapEnvelope
    });
    
    const responseText = await response.text();
    const resultado = this.parsearRespuestaAutorizacion(responseText);
    
    return new Response(JSON.stringify(resultado), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  },
  
  // Parsear respuesta del SRI
  parsearRespuestaSRI(xml) {
    const estadoMatch = xml.match(/<estado>([^<]+)<\/estado>/);
    const mensajeMatch = xml.match(/<mensaje>([^<]+)<\/mensaje>/);
    const comprobantesMatch = xml.match(/<comprobante>([^<]+)<\/comprobante>/);
    
    return {
      estado: estadoMatch ? estadoMatch[1] : 'ERROR',
      mensaje: mensajeMatch ? mensajeMatch[1] : 'Error desconocido',
      comprobantes: comprobantesMatch ? comprobantesMatch[1] : null
    };
  },
  
  // Parsear respuesta de autorización
  parsearRespuestaAutorizacion(xml) {
    const estadoMatch = xml.match(/<estado>([^<]+)<\/estado>/);
    const numeroMatch = xml.match(/<numeroAutorizacion>([^<]+)<\/numeroAutorizacion>/);
    const fechaMatch = xml.match(/<fechaAutorizacion>([^<]+)<\/fechaAutorizacion>/);
    const comprobanteMatch = xml.match(/<comprobante><!\[CDATA\[([^\]]+)\]\]><\/comprobante>/);
    
    return {
      estado: estadoMatch ? estadoMatch[1] : 'NO AUTORIZADO',
      numeroAutorizacion: numeroMatch ? numeroMatch[1] : null,
      fechaAutorizacion: fechaMatch ? fechaMatch[1] : null,
      xmlAutorizado: comprobanteMatch ? comprobanteMatch[1] : null
    };
  },
  
  // Generar RIDE (PDF)
  async generarRIDE(request, env) {
    const { factura, config } = await request.json();
    
    try {
      // Generar código de barras
      const barcodeBuffer = await bwipjs.toBuffer({
        bcid: 'code128',
        text: factura.claveAcceso,
        scale: 3,
        height: 10,
        includetext: true
      });
      
      // Crear PDF
      const chunks = [];
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {});
      
      // Encabezado
      doc.fontSize(18).text(config.razonSocial, { align: 'center' });
      doc.fontSize(12).text(config.nombreComercial, { align: 'center' });
      doc.fontSize(10).text(`RUC: ${config.ruc}`, { align: 'center' });
      doc.text(config.dirMatriz, { align: 'center' });
      doc.moveDown();
      
      // Tipo de comprobante
      doc.fontSize(14).text('FACTURA', { align: 'center', underline: true });
      doc.fontSize(10).text(`No. ${config.establecimiento}-${config.puntoEmision}-${factura.secuencial}`, { align: 'center' });
      doc.moveDown();
      
      // Información tributaria
      doc.fontSize(10);
      doc.text(`Ambiente: ${factura.ambiente}`);
      doc.text(`Emisión: ${factura.tipoEmision || 'NORMAL'}`);
      doc.text(`Clave de Acceso:`);
      doc.fontSize(8).text(factura.claveAcceso);
      doc.moveDown();
      
      // Código de barras
      doc.image(barcodeBuffer, { fit: [400, 60], align: 'center' });
      doc.moveDown();
      
      // Datos del cliente
      doc.fontSize(10);
      doc.text('DATOS DEL CLIENTE', { underline: true });
      doc.text(`Razón Social: ${factura.clienteNombre}`);
      doc.text(`RUC/Cédula: ${factura.clienteRuc}`);
      doc.moveDown();
      
      // Detalle de productos
      doc.text('DETALLE', { underline: true });
      doc.text('Cant.    Descripción                    P.Unit    Total');
      doc.text('─'.repeat(60));
      
      const subtotal = factura.total / 1.12;
      const iva = factura.total - subtotal;
      
      doc.text(`${factura.peso || '1.00'}    POLLO PELADO                   $${(subtotal / (factura.peso || 1)).toFixed(2)}    $${subtotal.toFixed(2)}`);
      doc.moveDown();
      
      // Totales
      doc.text('─'.repeat(60));
      doc.text(`Subtotal:                                      $${subtotal.toFixed(2)}`, { align: 'right' });
      doc.text(`IVA 12%:                                       $${iva.toFixed(2)}`, { align: 'right' });
      doc.fontSize(12).text(`TOTAL:                                         $${factura.total.toFixed(2)}`, { align: 'right', bold: true });
      doc.moveDown();
      
      // Información adicional
      doc.fontSize(10);
      doc.text('INFORMACIÓN ADICIONAL', { underline: true });
      doc.text(`Forma de Pago: ${factura.formaPago || 'EFECTIVO'}`);
      doc.text(`Fecha de Emisión: ${new Date(factura.fecha).toLocaleDateString('es-EC')}`);
      if (factura.numeroAutorizacion) {
        doc.text(`No. Autorización: ${factura.numeroAutorizacion}`);
        doc.text(`Fecha Autorización: ${new Date(factura.fechaAutorizacion).toLocaleString('es-EC')}`);
      }
      
      doc.end();
      
      // Esperar a que termine
      await new Promise(resolve => doc.on('end', resolve));
      
      const pdfBuffer = Buffer.concat(chunks);
      
      return new Response(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="FACTURA-${factura.secuencial}.pdf"`,
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
