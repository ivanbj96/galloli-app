// UI para Facturación Electrónica SRI
const FacturacionUI = {
    async renderConfigPage() {
        const config = FacturacionElectronicaModule.config;
        
        return `
            <div class="page-header">
                <h1><i class="fas fa-file-invoice"></i> Facturación Electrónica SRI</h1>
                <p>Configuración de facturación electrónica para Ecuador</p>
            </div>
            
            <div style="max-width: 800px; margin: 2rem auto;">
                <!-- Toggle Principal -->
                <div style="background: white; padding: 2rem; border-radius: 12px; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h3 style="margin: 0 0 0.5rem 0;"><i class="fas fa-power-off"></i> Estado de Facturación</h3>
                            <p style="margin: 0; color: #666;">Habilitar emisión de facturas electrónicas al SRI</p>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="facturacion-enabled" ${config.habilitado ? 'checked' : ''} onchange="FacturacionUI.toggleFacturacion(this.checked)">
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>
                
                <!-- Configuración -->
                <div id="facturacion-config" style="display: ${config.habilitado ? 'block' : 'none'};">
                    <!-- Ambiente -->
                    <div style="background: white; padding: 2rem; border-radius: 12px; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h3><i class="fas fa-server"></i> Ambiente</h3>
                        <select id="ambiente" class="form-input" onchange="FacturacionUI.saveConfig()">
                            <option value="1" ${config.ambiente === 1 ? 'selected' : ''}>Pruebas</option>
                            <option value="2" ${config.ambiente === 2 ? 'selected' : ''}>Producción</option>
                        </select>
                        <small style="color: #666; display: block; margin-top: 0.5rem;">
                            <i class="fas fa-info-circle"></i> Usar Pruebas hasta validar con el SRI
                        </small>
                    </div>
                    
                    <!-- Datos del Negocio -->
                    <div style="background: white; padding: 2rem; border-radius: 12px; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h3><i class="fas fa-building"></i> Datos del Negocio</h3>
                        
                        <div class="form-group">
                            <label>RUC</label>
                            <input type="text" id="ruc" class="form-input" value="${config.ruc}" placeholder="1234567890001" maxlength="13">
                        </div>
                        
                        <div class="form-group">
                            <label>Razón Social</label>
                            <input type="text" id="razon-social" class="form-input" value="${config.razonSocial}" placeholder="NOMBRE LEGAL DEL NEGOCIO">
                        </div>
                        
                        <div class="form-group">
                            <label>Nombre Comercial</label>
                            <input type="text" id="nombre-comercial" class="form-input" value="${config.nombreComercial}" placeholder="NOMBRE COMERCIAL">
                        </div>
                        
                        <div class="form-group">
                            <label>Dirección Matriz</label>
                            <input type="text" id="dir-matriz" class="form-input" value="${config.dirMatriz}" placeholder="Calle Principal 123 y Secundaria">
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label>Establecimiento</label>
                                <input type="text" id="establecimiento" class="form-input" value="${config.establecimiento}" placeholder="001" maxlength="3">
                            </div>
                            <div class="form-group">
                                <label>Punto Emisión</label>
                                <input type="text" id="punto-emision" class="form-input" value="${config.puntoEmision}" placeholder="001" maxlength="3">
                            </div>
                            <div class="form-group">
                                <label>Secuencial</label>
                                <input type="number" id="secuencial" class="form-input" value="${config.secuencialActual}" min="1">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Obligado a llevar contabilidad</label>
                            <select id="obligado-contabilidad" class="form-input">
                                <option value="NO" ${config.obligadoContabilidad === 'NO' ? 'selected' : ''}>NO</option>
                                <option value="SI" ${config.obligadoContabilidad === 'SI' ? 'selected' : ''}>SÍ</option>
                            </select>
                        </div>
                        
                        <button class="btn btn-primary" onclick="FacturacionUI.saveConfig()" style="width: 100%;">
                            <i class="fas fa-save"></i> Guardar Configuración
                        </button>
                    </div>
                    
                    <!-- Certificado Digital -->
                    <div style="background: white; padding: 2rem; border-radius: 12px; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h3><i class="fas fa-certificate"></i> Certificado Digital</h3>
                        
                        ${config.certificadoBase64 ? `
                            <div style="background: #e8f5e9; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                                <i class="fas fa-check-circle" style="color: #4CAF50;"></i> Certificado configurado
                            </div>
                        ` : `
                            <div style="background: #fff3cd; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                                <i class="fas fa-exclamation-triangle" style="color: #FF9800;"></i> Sin certificado
                            </div>
                        `}
                        
                        <div class="form-group">
                            <label>Archivo .p12 o .pfx</label>
                            <input type="file" id="certificado-file" class="form-input" accept=".p12,.pfx" onchange="FacturacionUI.loadCertificate(this)">
                        </div>
                        
                        <div class="form-group">
                            <label>Contraseña del Certificado</label>
                            <input type="password" id="certificado-password" class="form-input" placeholder="••••••••">
                        </div>
                        
                        <button class="btn btn-success" onclick="FacturacionUI.saveCertificate()" style="width: 100%;">
                            <i class="fas fa-upload"></i> Guardar Certificado
                        </button>
                    </div>
                    
                    <!-- Prueba de Conexión -->
                    <div style="background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <h3><i class="fas fa-vial"></i> Prueba de Conexión</h3>
                        <p style="color: #666; margin-bottom: 1rem;">Verificar que todo esté configurado correctamente</p>
                        <button class="btn btn-outline" onclick="FacturacionUI.testConnection()" style="width: 100%;">
                            <i class="fas fa-plug"></i> Probar Conexión con SRI
                        </button>
                    </div>
                </div>
            </div>
        `;
    },
    
    async toggleFacturacion(enabled) {
        FacturacionElectronicaModule.config.habilitado = enabled;
        await FacturacionElectronicaModule.saveConfig();
        
        const configDiv = document.getElementById('facturacion-config');
        if (configDiv) {
            configDiv.style.display = enabled ? 'block' : 'none';
        }
        
        Utils.showNotification(
            enabled ? '✅ Facturación electrónica habilitada' : '⏸️ Facturación electrónica deshabilitada',
            enabled ? 'success' : 'info',
            3000
        );
    },
    
    async saveConfig() {
        const config = FacturacionElectronicaModule.config;
        
        config.ambiente = parseInt(document.getElementById('ambiente').value);
        config.ruc = document.getElementById('ruc').value.trim();
        config.razonSocial = document.getElementById('razon-social').value.trim();
        config.nombreComercial = document.getElementById('nombre-comercial').value.trim();
        config.dirMatriz = document.getElementById('dir-matriz').value.trim();
        config.establecimiento = document.getElementById('establecimiento').value.trim();
        config.puntoEmision = document.getElementById('punto-emision').value.trim();
        config.secuencialActual = parseInt(document.getElementById('secuencial').value);
        config.obligadoContabilidad = document.getElementById('obligado-contabilidad').value;
        
        await FacturacionElectronicaModule.saveConfig();
        Utils.showNotification('✅ Configuración guardada', 'success', 3000);
    },
    
    async loadCertificate(input) {
        const file = input.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target.result;
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            // Guardar temporalmente
            this.tempCertificado = base64;
            Utils.showNotification('📄 Certificado cargado. Ingresa la contraseña y guarda.', 'info', 3000);
        };
        reader.readAsArrayBuffer(file);
    },
    
    async saveCertificate() {
        const password = document.getElementById('certificado-password').value;
        
        if (!this.tempCertificado) {
            Utils.showNotification('❌ Selecciona un archivo de certificado', 'error', 3000);
            return;
        }
        
        if (!password) {
            Utils.showNotification('❌ Ingresa la contraseña del certificado', 'error', 3000);
            return;
        }
        
        FacturacionElectronicaModule.config.certificadoBase64 = this.tempCertificado;
        FacturacionElectronicaModule.config.certificadoPassword = password;
        
        await FacturacionElectronicaModule.saveConfig();
        Utils.showNotification('✅ Certificado guardado de forma segura', 'success', 3000);
        
        // Recargar página
        App.loadPage('facturacion-config');
    },
    
    async testConnection() {
        Utils.showLoading(true);
        
        try {
            // Probar firma
            const testXML = '<?xml version="1.0"?><test>Prueba</test>';
            await FacturacionElectronicaModule.firmarXML(testXML);
            
            Utils.showLoading(false);
            Utils.showNotification('✅ Conexión exitosa con el Worker de facturación', 'success', 5000);
        } catch (error) {
            Utils.showLoading(false);
            Utils.showNotification('❌ Error: ' + error.message, 'error', 5000);
        }
    },
    
    // Botón para emitir factura desde venta
    async showEmitirFacturaButton(saleId) {
        const sale = SalesModule.getSaleById(saleId);
        if (!sale) return '';
        
        if (!FacturacionElectronicaModule.config.habilitado) return '';
        
        // Verificar si ya tiene factura
        const facturaExistente = FacturacionElectronicaModule.facturas.find(f => f.saleId === saleId);
        if (facturaExistente) {
            return `
                <button class="btn btn-success" onclick="FacturacionUI.verFactura(${facturaExistente.id})" style="padding: 5px 10px; font-size: 0.8rem;">
                    <i class="fas fa-file-invoice"></i> Ver Factura
                </button>
            `;
        }
        
        return `
            <button class="btn btn-primary" onclick="FacturacionUI.emitirFactura(${saleId})" style="padding: 5px 10px; font-size: 0.8rem;">
                <i class="fas fa-file-invoice"></i> Emitir Factura
            </button>
        `;
    },
    
    async emitirFactura(saleId) {
        const sale = SalesModule.getSaleById(saleId);
        if (!sale) return;
        
        const client = ClientsModule.getClientById(sale.clientId);
        if (!client) {
            Utils.showNotification('❌ Cliente no encontrado', 'error', 3000);
            return;
        }
        
        // Verificar RUC/Cédula del cliente
        if (!client.ruc && !client.cedula) {
            Utils.showNotification('❌ Cliente necesita RUC o Cédula para facturar', 'error', 3000);
            return;
        }
        
        try {
            Utils.showLoading(true);
            const factura = await FacturacionElectronicaModule.emitirFactura(sale, client);
            Utils.showLoading(false);
            
            if (factura) {
                Utils.showNotification('✅ Factura emitida y autorizada por el SRI', 'success', 5000);
                
                // Descargar PDF automáticamente
                await FacturacionElectronicaModule.generarRIDE(factura);
                
                SalesModule.updateSalesList(sale.date);
            }
        } catch (error) {
            Utils.showLoading(false);
            Utils.showNotification('❌ Error: ' + error.message, 'error', 5000);
        }
    },
    
    async verFactura(facturaId) {
        const factura = FacturacionElectronicaModule.facturas.find(f => f.id === facturaId);
        if (!factura) return;
        
        try {
            Utils.showLoading(true);
            await FacturacionElectronicaModule.generarRIDE(factura);
            Utils.showLoading(false);
        } catch (error) {
            Utils.showLoading(false);
            Utils.showNotification('❌ Error descargando factura: ' + error.message, 'error', 3000);
        }
    }
};

// Exportar
window.FacturacionUI = FacturacionUI;
