// app.js - COMPLETO Y FUNCIONAL
const App = {
    currentPage: 'dashboard',
    currentDate: Utils.getTodayDate(),
    tempMermaResult: null,
    isReceiptOpen: false,
    selectedCoordinates: null,
    selectedAddress: '',
    mapaDashboardInicializado: false, // NUEVO: Para controlar si el mapa del dashboard ya fue inicializado
    devModeCheckInterval: null, // NUEVO: Para el intervalo de verificación del modo desarrollo
    handleDevModeChange: null, // NUEVO: Para almacenar la referencia del event listener

    // Inicialización
    async init() {
        // Inicializar IndexedDB primero
        try {
            await DB.init();
            console.log('IndexedDB inicializado');
        } catch (error) {
            console.error('Error inicializando IndexedDB:', error);
            Utils.showNotification('Usando almacenamiento local', 'warning', 3000);
        }
        
        // Inicializar sistema de modales
        Utils.initModals();
        
        // Ocultar fecha/hora completamente
        const dateTimeElement = document.getElementById('current-date-time');
        if (dateTimeElement) {
            dateTimeElement.style.display = 'none';
        }
        
        // INICIALIZAR TOGGLE DE MODO DESARROLLO INMEDIATAMENTE
        this.initDevModeToggle();
        
        // SINCRONIZAR CON SERVICE WORKER
        this.syncDevModeWithServiceWorker();
        
        // Inicializar configuración PRIMERO
        await ConfigModule.init();
        
        // Cargar datos
        await this.loadAllData();
        this.setupNavigation();
        this.setupEventListeners();
        this.loadPage('dashboard');
        this.setupPWA();
        
        // INICIALIZAR NOTIFICACIONES PUSH
        await this.initPushNotifications();
        
        // INICIALIZAR BACKUP AUTOMÁTICO
        await AutoBackup.init();
        
        // Configurar recordatorio diario
        this.setupDailyReminder();
        
        // Ocultar recibo al iniciar
        this.closeReceipt();
        
        // Ocultar notificación al iniciar
        Utils.hideNotification();
        
        // Aplicar configuración después de cargar
        setTimeout(() => {
            ConfigModule.applyLogo();
            ConfigModule.updateDynamicManifest();
        }, 500);
        
        // Procesar acción de notificación desde URL
        this.checkNotificationActionFromURL();
        
        // NUEVO: Detectar cuando la app se vuelve visible y recargar datos
        this.setupVisibilityChangeHandler();
    },
    
    // NUEVO: Detectar cuando la app se vuelve visible y recargar datos
    setupVisibilityChangeHandler() {
        let lastVisibilityChange = Date.now();
        
        document.addEventListener('visibilitychange', async () => {
            if (!document.hidden) {
                // La app se volvió visible
                const now = Date.now();
                const timeSinceLastChange = now - lastVisibilityChange;
                
                console.log('👁️ App visible - Tiempo desde último cambio:', timeSinceLastChange, 'ms');
                
                // Si pasaron más de 2 segundos desde el último cambio, recargar datos
                if (timeSinceLastChange > 2000) {
                    console.log('🔄 Recargando datos...');
                    
                    // Recargar todos los datos
                    await this.loadAllData();
                    
                    // Recargar la página actual para reflejar cambios
                    this.loadPage(this.currentPage);
                    
                    console.log('✅ Datos actualizados');
                }
                
                lastVisibilityChange = now;
            }
        });
        
        // También detectar cuando la ventana recibe foco
        window.addEventListener('focus', async () => {
            const now = Date.now();
            const timeSinceLastChange = now - lastVisibilityChange;
            
            if (timeSinceLastChange > 2000) {
                console.log('🔄 Ventana enfocada - Recargando datos...');
                await this.loadAllData();
                this.loadPage(this.currentPage);
                console.log('✅ Datos actualizados');
                lastVisibilityChange = now;
            }
        });
    },

    // Cargar datos
    async loadAllData() {
        await ClientsModule.init();
        await OrdersModule.init();
        await SalesModule.init();
        await AccountingModule.init();
        await MermaModule.init();
        await DiezmosModule.init();
        await CreditosModule.init();
    },

    // Configurar navegación
    setupNavigation() {
        // Sidebar
        const sidebarItems = document.querySelectorAll('.sidebar-item');
        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                sidebarItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
        
        // Bottom navigation
        const navItems = document.querySelectorAll('.bottom-nav-item');
        navItems.forEach(item => {
            if (item.getAttribute('data-page')) {
                item.addEventListener('click', () => {
                    const page = item.getAttribute('data-page');
                    this.loadPage(page);
                    
                    // Actualizar estado activo
                    navItems.forEach(i => {
                        if (i.getAttribute('data-page')) {
                            i.classList.remove('active');
                        }
                    });
                    item.classList.add('active');
                    
                    // Cerrar recibo al cambiar de página
                    this.closeReceipt();
                });
            }
        });
    },

    // Configurar event listeners
    setupEventListeners() {
        // Cerrar modales con tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
        
        // Cerrar modales al hacer clic fuera de ellos
        document.addEventListener('click', (e) => {
            // Cerrar modal de mapa si se hace clic fuera
            const mapModal = document.getElementById('map-modal');
            if (mapModal && mapModal.classList.contains('active')) {
                if (e.target === mapModal) {
                    this.closeMapModal();
                }
            }
        });
        
        // Escuchar mensajes del Service Worker (acciones de notificaciones)
        navigator.serviceWorker.addEventListener('message', (event) => {
            console.log('========================================');
            console.log('📨 MENSAJE RECIBIDO DEL SERVICE WORKER');
            console.log('Tipo:', event.data?.type);
            console.log('Acción:', event.data?.action);
            console.log('Datos:', event.data?.data);
            console.log('========================================');
            
            if (event.data && event.data.type === 'notification-action') {
                console.log('✅ Procesando acción de notificación...');
                this.handleNotificationAction(event.data.action, event.data.data);
            }
            
            // NUEVO: Procesar pagos desde notificaciones
            if (event.data && event.data.type === 'process-payment') {
                console.log('💰 Procesando pago desde notificación...');
                PaymentProcessor.processPaymentFromNotification(event.data);
            }
        });
    },
    
    // Verificar si hay una acción de notificación en la URL
    checkNotificationActionFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');
        const clientId = urlParams.get('clientId');
        const clientName = urlParams.get('clientName');
        const totalDebt = urlParams.get('totalDebt');
        
        if (action) {
            console.log('🔔 Acción de notificación desde URL:', action);
            console.log('📋 Parámetros:', { clientId, clientName, totalDebt });
            
            // Limpiar la URL
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Procesar la acción después de que la app esté lista
            setTimeout(() => {
                this.handleNotificationAction(action, {
                    clientId: clientId,
                    clientName: clientName,
                    totalDebt: totalDebt ? parseFloat(totalDebt) : 0
                });
            }, 1500);
        }
    },

    // Cargar página
    async loadPage(page) {
        this.currentPage = page;
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;
        
        // Actualizar sidebar
        document.querySelectorAll('.sidebar-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeSidebarItem = document.querySelector(`.sidebar-item[onclick*="${page}"]`);
        if (activeSidebarItem) {
            activeSidebarItem.classList.add('active');
        }
        
        switch(page) {
            case 'dashboard':
                this.loadDashboardPage();
                break;
            case 'sales':
                this.loadSalesPage();
                break;
            case 'orders':
                this.loadOrdersPage();
                break;
            case 'clients':
                this.loadClientsPage();
                break;
            case 'merma':
                this.loadMermaPage();
                break;
            case 'stats':
                this.loadStatsPage();
                break;
            case 'accounting':
                this.loadAccountingPage();
                break;
            case 'backup':
                await this.loadBackupPage(); // ESPERAR carga asíncrona
                break;
            case 'rutas':
                this.loadRutasPage();
                break;
            case 'config':
                this.loadConfigPage();
                break;
            case 'diezmos':
                this.loadDiezmosPage();
                break;
            case 'creditos':
                this.loadCreditosPage();
                break;
        }
        
        // REINICIALIZAR TOGGLE DE MODO DESARROLLO DESPUÁ‰S DE CARGAR PÁGINA
        setTimeout(() => {
            this.initDevModeToggle();
        }, 100);
        
        // Si hay recibo abierto, mantenerlo visible
        if (this.isReceiptOpen) {
            const receipt = document.getElementById('receipt-preview');
            if (receipt) {
                receipt.style.display = 'block';
            }
        }
    },
    
    // Página de Diezmos y Ofrendas
    loadDiezmosPage() {
        const preview = DiezmosModule.getPreview(this.currentDate);
        const sales = SalesModule.getSalesByDate(this.currentDate);
        const expenses = AccountingModule.getExpensesByDate(this.currentDate);
        
        const html = `
            <div class="page active" id="diezmos-page">
                <h2><i class="fas fa-hand-holding-heart"></i> Diezmos y Ofrendas</h2>
                <p style="margin: 10px 0 20px; color: var(--gray);">Cálculo automático basado en ganancia neta</p>
                
                <div class="date-filter">
                    <input type="date" class="date-input" id="diezmos-date-filter" value="${this.currentDate}">
                    <button class="btn btn-outline" onclick="App.filterDiezmosByDate()">
                        <i class="fas fa-filter"></i> Filtrar
                    </button>
                </div>
                
                ${sales.length === 0 ? `
                    <div class="card" style="background: #FFF3CD; border-left: 4px solid #FF9800;">
                        <p style="margin: 0; color: #856404;">
                            <i class="fas fa-info-circle"></i> No hay ventas registradas para ${this.currentDate}. 
                            Registra ventas primero para calcular diezmos y ofrendas.
                        </p>
                    </div>
                ` : ''}
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">Diezmo (${preview.diezmoPercent}%)</div>
                        <div class="stat-value" style="color: var(--primary)">${Utils.formatCurrency(preview.diezmo)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Ofrenda (${preview.ofrendaPercent}%)</div>
                        <div class="stat-value" style="color: var(--secondary)">${Utils.formatCurrency(preview.ofrenda)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Total a Apartar</div>
                        <div class="stat-value" style="color: var(--warning)">${Utils.formatCurrency(preview.total)}</div>
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-cog"></i> Configuración de Porcentajes</h3>
                    <form id="diezmos-config-form">
                        <div class="form-group">
                            <label class="form-label">Porcentaje de Diezmo (%)</label>
                            <input type="number" step="0.1" min="0" max="100" class="form-input" 
                                   id="diezmo-percent" value="${DiezmosModule.config.diezmoPercent}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Porcentaje de Ofrenda (%)</label>
                            <input type="number" step="0.1" min="0" max="100" class="form-input" 
                                   id="ofrenda-percent" value="${DiezmosModule.config.ofrendaPercent}" required>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">
                            <i class="fas fa-save"></i> Guardar Configuración
                        </button>
                    </form>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-save"></i> Guardar Registro del Día</h3>
                    <p style="color: var(--gray); margin-bottom: 15px;">Guarda el cálculo de diezmos y ofrendas para ${this.currentDate}</p>
                    <button class="btn btn-success" onclick="App.saveDiezmosRecord()" style="width: 100%;" ${sales.length === 0 ? 'disabled' : ''}>
                        <i class="fas fa-check"></i> Guardar Registro de Hoy
                    </button>
                    ${sales.length === 0 ? '<p style="color: var(--gray); font-size: 0.85rem; margin-top: 10px;"><i class="fas fa-info-circle"></i> Necesitas tener ventas para guardar un registro</p>' : ''}
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-history"></i> Historial de Registros</h3>
                    
                    <!-- Filtro por rango de fechas -->
                    <div style="margin-bottom: 20px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                            <div class="form-group" style="margin: 0;">
                                <label class="form-label" style="font-size: 0.85rem;">Fecha Inicio</label>
                                <input type="date" class="form-input" id="diezmos-start-date">
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label class="form-label" style="font-size: 0.85rem;">Fecha Fin</label>
                                <input type="date" class="form-input" id="diezmos-end-date">
                            </div>
                        </div>
                        <button class="btn btn-primary" onclick="App.filterDiezmosRecords()" style="width: 100%;">
                            <i class="fas fa-filter"></i> Filtrar por Rango
                        </button>
                    </div>
                    
                    <ul class="sales-list" id="diezmos-records-list">
                        <!-- Los registros se agregarán aquí -->
                    </ul>
                </div>
            </div>
        `;
        
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = html;
            this.updateDiezmosRecordsList();
            
            const configForm = document.getElementById('diezmos-config-form');
            if (configForm) {
                configForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveDiezmosConfig();
                });
            }
            
            const dateFilter = document.getElementById('diezmos-date-filter');
            if (dateFilter) {
                dateFilter.addEventListener('change', (e) => {
                    this.currentDate = e.target.value;
                });
            }
        }
    },

    filterDiezmosByDate() {
        const dateInput = document.getElementById('diezmos-date-filter');
        if (dateInput) {
            this.currentDate = dateInput.value;
            // Actualizar vista previa inmediatamente
            this.updateDiezmosPreview();
        }
    },

    saveDiezmosConfig() {
        const diezmoPercent = parseFloat(document.getElementById('diezmo-percent').value);
        const ofrendaPercent = parseFloat(document.getElementById('ofrenda-percent').value);
        
        DiezmosModule.updateConfig(diezmoPercent, ofrendaPercent);
        Utils.showNotification('Configuración guardada correctamente', 'success', 3000);
        this.loadDiezmosPage();
    },

    async saveDiezmosRecord() {
        const dateInput = document.getElementById('diezmos-date-filter');
        const date = dateInput ? dateInput.value : Utils.getTodayDate();
        
        await DiezmosModule.saveDailyRecord(date);
        Utils.showNotification('Registro guardado correctamente', 'success', 3000);
        this.updateDiezmosRecordsList();
    },

    async saveDailyDiezmos() {
        const today = Utils.getTodayDate();
        await DiezmosModule.saveDailyRecord(today);
        Utils.showNotification('Diezmos guardados correctamente', 'success', 3000);
        
        // Notificación push
        if (NotificationsModule) {
            const preview = DiezmosModule.getPreview(today);
            NotificationsModule.notify('diezmos', `Diezmos guardados: ${Utils.formatCurrency(preview.total)}`);
        }
        
        this.loadDiezmosPage();
    },

    // NUEVO: Recalcular todos los diezmos pendientes
    async recalcularTodosDiezmos() {
        const confirmed = await Utils.showConfirm(
            '¿Recalcular diezmos para TODOS los días con ganancias? Esto puede tomar unos segundos.',
            'Recalcular Diezmos',
            'Recalcular',
            'Cancelar'
        );
        
        if (!confirmed) {
            return;
        }
        
        Utils.showLoading(true);
        
        try {
            const resultado = await DiezmosModule.forzarRecalculoCompleto();
            
            if (resultado.creados > 0 || resultado.actualizados > 0) {
                // Recargar la página para mostrar los nuevos registros
                this.loadDiezmosPage();
            } else {
                Utils.showNotification('No se encontraron días con ganancias pendientes de calcular', 'info', 3000);
            }
        } catch (error) {
            Utils.showNotification('Error al recalcular diezmos: ' + error.message, 'error', 5000);
        } finally {
            Utils.showLoading(false);
        }
    },

    filterDiezmosRecords() {
        const startDate = document.getElementById('diezmos-start-date').value;
        const endDate = document.getElementById('diezmos-end-date').value;
        
        if (!startDate || !endDate) {
            Utils.showNotification('Selecciona ambas fechas', 'error', 3000);
            return;
        }
        
        if (startDate > endDate) {
            Utils.showNotification('La fecha inicio debe ser menor a la fecha fin', 'error', 3000);
            return;
        }
        
        this.updateDiezmosRecordsList(startDate, endDate);
        
        const records = DiezmosModule.records.filter(r => r.date >= startDate && r.date <= endDate);
        const total = records.reduce((sum, r) => sum + r.total, 0);
        
        Utils.showNotification(`${records.length} registros encontrados. Total: ${Utils.formatCurrency(total)}`, 'success', 5000);
    },

    updateDiezmosRecordsList(startDate = null, endDate = null) {
        const recordsList = document.getElementById('diezmos-records-list');
        if (!recordsList) return;
        
        recordsList.innerHTML = '';
        
        let records = [...DiezmosModule.records];
        
        // Filtrar por rango si se proporciona
        if (startDate && endDate) {
            records = records.filter(r => r.date >= startDate && r.date <= endDate);
        }
        
        records = records.sort((a, b) => b.timestamp - a.timestamp);
        
        if (records.length === 0) {
            recordsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-hand-holding-heart empty-state-icon"></i>
                    <p>No hay registros guardados</p>
                </div>
            `;
            return;
        }
        
        records.forEach(record => {
            const li = document.createElement('li');
            li.className = 'sale-item';
            li.innerHTML = `
                <div class="sale-info">
                    <h3><i class="fas fa-calendar"></i> ${record.date}</h3>
                    <p class="sale-details">
                        <i class="fas fa-hand-holding-heart"></i> Diezmo: ${Utils.formatCurrency(record.diezmo)} (${record.diezmoPercent}%)
                    </p>
                    <p class="sale-details">
                        <i class="fas fa-gift"></i> Ofrenda: ${Utils.formatCurrency(record.ofrenda)} (${record.ofrendaPercent}%)
                    </p>
                </div>
                <div class="sale-amount" style="color: var(--warning);">
                    ${Utils.formatCurrency(record.total)}
                </div>
            `;
            recordsList.appendChild(li);
        });
    },

    loadCreditosPage() {
        const creditSales = SalesModule.getCreditSales();
        const totalDebt = creditSales.reduce((sum, sale) => sum + sale.remainingDebt, 0);
        
        const clientsWithDebt = {};
        creditSales.forEach(sale => {
            if (!clientsWithDebt[sale.clientId]) {
                const client = ClientsModule.getClientById(sale.clientId);
                clientsWithDebt[sale.clientId] = {
                    client,
                    totalDebt: 0,
                    sales: []
                };
            }
            clientsWithDebt[sale.clientId].totalDebt += sale.remainingDebt;
            clientsWithDebt[sale.clientId].sales.push(sale);
        });

        const html = `
            <div class="page active" id="creditos-page">
                <h2><i class="fas fa-credit-card"></i> Control de Créditos</h2>
                <p style="margin: 10px 0 20px; color: var(--gray);">Gestiona ventas a crédito y pagos</p>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">Créditos Activos</div>
                        <div class="stat-value" style="color: var(--warning)">${creditSales.length}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Deuda Total</div>
                        <div class="stat-value" style="color: var(--danger)">${Utils.formatCurrency(totalDebt)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Clientes con Deuda</div>
                        <div class="stat-value">${Object.keys(clientsWithDebt).length}</div>
                    </div>
                </div>

                ${Object.keys(clientsWithDebt).length === 0 ? `
                    <div class="card" style="background: #E8F5E9; border-left: 4px solid var(--success);">
                        <p style="margin: 0; color: var(--success);">
                            <i class="fas fa-check-circle"></i> No hay créditos pendientes
                        </p>
                    </div>
                ` : ''}

                ${Object.values(clientsWithDebt).map(data => `
                    <div class="card">
                        <h3>
                            <i class="fas fa-user"></i> ${data.client.name}
                            <span style="float: right; color: var(--danger); font-size: 1.2rem;">
                                ${Utils.formatCurrency(data.totalDebt)}
                            </span>
                        </h3>
                        <p style="color: var(--gray); margin: 5px 0 15px;">
                            <i class="fas fa-phone"></i> ${data.client.phone}
                        </p>
                        
                        <ul class="sales-list">
                            ${data.sales.map(sale => `
                                <li class="sale-item">
                                    <div class="sale-info">
                                        <h4>${sale.date} ${sale.time}</h4>
                                        <p class="sale-details">
                                            <i class="fas fa-weight"></i> ${sale.weight.toFixed(2)} lb × 
                                            <i class="fas fa-egg"></i> ${sale.quantity} pollos
                                        </p>
                                        <p class="sale-details">
                                            <i class="fas fa-dollar-sign"></i> Total: ${Utils.formatCurrency(sale.total)} | 
                                            <i class="fas fa-check"></i> Pagado: ${Utils.formatCurrency(sale.paidAmount)}
                                        </p>
                                        ${sale.paymentHistory && sale.paymentHistory.length > 0 ? `
                                            <details style="margin-top: 10px;">
                                                <summary style="cursor: pointer; color: var(--primary);">Ver pagos (${sale.paymentHistory.length})</summary>
                                                <ul style="margin: 10px 0 0 20px; font-size: 0.9rem;">
                                                    ${sale.paymentHistory.map(p => `
                                                        <li>${p.date} ${p.time}: ${Utils.formatCurrency(p.amount)}</li>
                                                    `).join('')}
                                                </ul>
                                            </details>
                                        ` : ''}
                                    </div>
                                    <div style="text-align: right;">
                                        <div class="sale-amount" style="color: var(--danger);">
                                            ${Utils.formatCurrency(sale.remainingDebt)}
                                        </div>
                                        <button class="btn btn-success" onclick="App.showPaymentModal(${sale.id})" 
                                                style="margin-top: 5px; padding: 5px 10px; font-size: 0.8rem;">
                                            <i class="fas fa-dollar-sign"></i> Pagar
                                        </button>
                                    </div>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `).join('')}
            </div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = html;
        }
    },

    showPaymentModal(saleId) {
        const sale = SalesModule.getSaleById(saleId);
        if (!sale) return;

        const client = ClientsModule.getClientById(sale.clientId);
        if (!client) return;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-dollar-sign"></i> Registrar Pago</h3>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p><strong>Cliente:</strong> ${client.name}</p>
                    <p><strong>Venta:</strong> ${sale.date} ${sale.time}</p>
                    <p><strong>Total:</strong> ${Utils.formatCurrency(sale.total)}</p>
                    <p><strong>Pagado:</strong> ${Utils.formatCurrency(sale.paidAmount)}</p>
                    <p style="color: var(--danger); font-weight: bold;"><strong>Deuda:</strong> ${Utils.formatCurrency(sale.remainingDebt)}</p>
                    
                    <form id="payment-form">
                        <div class="form-group">
                            <label class="form-label">Monto a Pagar</label>
                            <input type="number" step="0.01" min="0.01" 
                                   class="form-input" id="payment-amount" required 
                                   placeholder="Máximo: ${sale.remainingDebt.toFixed(2)}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Fecha del Pago</label>
                            <input type="date" class="form-input" id="payment-date" 
                                   value="${Utils.getTodayDate()}" required>
                        </div>
                        <button type="submit" class="btn btn-success" style="width: 100%;">
                            <i class="fas fa-check"></i> Registrar Pago
                        </button>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const form = modal.querySelector('#payment-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const amount = parseFloat(document.getElementById('payment-amount').value);
            const date = document.getElementById('payment-date').value;
            
            if (SalesModule.registerPayment(saleId, amount, date)) {
                Utils.showNotification(`Pago registrado: ${Utils.formatCurrency(amount)}`, 'success', 3000);
                modal.remove();
                this.loadCreditosPage();
                CreditosModule.updateCreditBadges();
            } else {
                Utils.showNotification('Error al registrar pago', 'error', 3000);
            }
        });
    },

    markSaleAsCredit(saleId) {
        if (SalesModule.markAsCredit(saleId)) {
            Utils.showNotification('Venta marcada como crédito', 'success', 3000);
            CreditosModule.updateCreditBadges();
            return true;
        }
        return false;
    },

    // Página de Configuración (NUEVA)
loadConfigPage() {
    ConfigModule.init();
    
    const html = `
        <div class="page active" id="config-page">
            <h2><i class="fas fa-cog"></i> Configuración de la App</h2>
            <p style="margin: 10px 0 20px; color: var(--gray);">Personaliza colores, nombre y logo de la aplicación</p>
            
            <!-- Configuración de Colores -->
            <div class="config-group">
                <h4><i class="fas fa-palette"></i> Colores de la Interfaz</h4>
                
                <!-- Temas predefinidos -->
                <div style="margin-bottom: 20px;">
                    <p style="margin-bottom: 10px; font-weight: 600;">Temas predefinidos:</p>
                    <div class="themes-grid">
                        ${Object.entries(ConfigModule.themes).map(([key, theme]) => `
                            <div class="theme-option ${ConfigModule.currentConfig.theme === key ? 'active' : ''}" 
                                 onclick="ConfigModule.setTheme('${key}'); ConfigModule.saveConfig(); App.updateConfigUI()">
                                <div class="theme-preview" style="background: linear-gradient(90deg, ${theme.colors.primary}, ${theme.colors.secondary})"></div>
                                <div class="theme-info">
                                    <div class="theme-name">${theme.name}</div>
                                    <div class="theme-colors">
                                        <div class="theme-color-dot" style="background: ${theme.colors.primary}"></div>
                                        <div class="theme-color-dot" style="background: ${theme.colors.secondary}"></div>
                                        <div class="theme-color-dot" style="background: ${theme.colors.light}"></div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <!-- Selector de colores individuales -->
                <p style="margin: 20px 0 10px; font-weight: 600;">Colores personalizados:</p>
                <div class="color-picker-container">
                    ${Object.entries(ConfigModule.currentConfig.colors).map(([key, value]) => `
                        <div class="color-option" onclick="App.openColorPicker('${key}', '${value}')">
                            <div class="color-preview ${'color-' + key}" style="background: ${value}"></div>
                            <div class="color-name">${key}</div>
                            <div class="color-value">${value}</div>
                        </div>
                    `).join('')}
                </div>
                
                <!-- Inputs de color personalizados -->
                <div class="custom-color-inputs">
                    <div class="color-input-group">
                        <label>Color Primario:</label>
                        <div class="color-input-wrapper">
                            <input type="color" class="color-input" value="${ConfigModule.currentConfig.colors.primary}" 
                                   onchange="ConfigModule.currentConfig.colors.primary = this.value; ConfigModule.applyConfig(); ConfigModule.saveConfig();">
                            <input type="text" class="color-hex-input" value="${ConfigModule.currentConfig.colors.primary}" 
                                   onchange="ConfigModule.currentConfig.colors.primary = this.value; ConfigModule.applyConfig(); ConfigModule.saveConfig();">
                        </div>
                    </div>
                    
                    <div class="color-input-group">
                        <label>Color Secundario:</label>
                        <div class="color-input-wrapper">
                            <input type="color" class="color-input" value="${ConfigModule.currentConfig.colors.secondary}" 
                                   onchange="ConfigModule.currentConfig.colors.secondary = this.value; ConfigModule.applyConfig(); ConfigModule.saveConfig();">
                            <input type="text" class="color-hex-input" value="${ConfigModule.currentConfig.colors.secondary}" 
                                   onchange="ConfigModule.currentConfig.colors.secondary = this.value; ConfigModule.applyConfig(); ConfigModule.saveConfig();">
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Configuración de Nombre y Logo -->
            <div class="config-group">
                <h4><i class="fas fa-font"></i> Nombre y Logo</h4>
                
                <!-- Nombre de la App -->
                <div class="form-group">
                    <label class="form-label">Nombre de la Aplicación</label>
                    <input type="text" class="form-input" id="config-app-name" 
                           value="${ConfigModule.currentConfig.appName}"
                           onchange="ConfigModule.setAppName(this.value)">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Nombre Corto (para PWA)</label>
                    <input type="text" class="form-input" id="config-app-shortname" 
                           value="${ConfigModule.currentConfig.appShortName}"
                           onchange="ConfigModule.currentConfig.appShortName = this.value">
                </div>
                
                <!-- Selector de Logo -->
                <div style="margin: 20px 0;">
                    <p style="margin-bottom: 10px; font-weight: 600;">Logo de la App:</p>
                    
                    <!-- Emojis -->
                    <div>
                        <p style="margin-bottom: 10px; color: var(--gray); font-size: 0.9rem;">Selecciona un emoji:</p>
                        <div class="emoji-grid">
                            ${ConfigModule.emojis.map(emoji => `
                                <div class="emoji-option ${ConfigModule.currentConfig.logoEmoji === emoji ? 'active' : ''}" 
                                     onclick="ConfigModule.setLogoEmoji('${emoji}')">
                                    ${emoji}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- Logo personalizado -->
<div style="margin-top: 20px;">
    <p style="margin-bottom: 10px; color: var(--gray); font-size: 0.9rem;">O sube una imagen:</p>
    <div class="logo-upload-container" onclick="document.getElementById('logo-upload').click()">
        <i class="fas fa-cloud-upload-alt"></i>
        <p>Haz clic para subir un logo</p>
        <p style="font-size: 0.8rem; color: var(--gray);">PNG, JPG o SVG (recomendado 512Á—512, máximo 2MB)</p>
        <input type="file" id="logo-upload" accept="image/*" style="display: none;" 
               onchange="App.handleLogoUpload(this.files[0])">
        ${ConfigModule.currentConfig.logoImage ? `
            <div class="logo-preview">
                <img src="${ConfigModule.currentConfig.logoImage}" alt="Logo actual" 
                     onerror="this.style.display='none'">
            </div>
        ` : ''}
    </div>
    ${ConfigModule.currentConfig.logoImage ? `
        <button class="btn btn-outline" onclick="ConfigModule.currentConfig.logoType='emoji'; ConfigModule.currentConfig.logoImage=null; ConfigModule.applyLogo(); App.updateConfigUI();" 
                style="margin-top: 10px; width: 100%;">
            <i class="fas fa-times"></i> Quitar imagen y usar emoji
        </button>
    ` : ''}
</div>
                </div>
            </div>
            
            <!-- Acciones -->
            <div class="config-group">
                <h4><i class="fas fa-tools"></i> Acciones</h4>
                <div class="config-actions">
                    <button class="btn btn-primary" onclick="ConfigModule.saveConfig()">
                        <i class="fas fa-save"></i> Guardar Cambios
                    </button>
                    <button class="btn btn-outline" onclick="App.exportConfig()">
                        <i class="fas fa-download"></i> Exportar Config
                    </button>
                    <button class="btn btn-outline" onclick="document.getElementById('config-import').click()">
                        <i class="fas fa-upload"></i> Importar Config
                    </button>
                    <input type="file" id="config-import" accept=".json" style="display: none;" 
                           onchange="App.importConfig(this.files[0])">
                </div>
                <div style="margin-top: 15px;">
                    <button class="btn btn-danger" onclick="ConfigModule.resetToDefault()" style="width: 100%;">
                        <i class="fas fa-undo"></i> Restaurar Valores por Defecto
                    </button>
                </div>
            </div>
            
            <!-- Depuración -->
            <div class="config-group">
                <h4><i class="fas fa-bug"></i> Depuración</h4>
                <p style="margin-bottom: 15px; color: var(--gray); font-size: 0.9rem;">
                    <i class="fas fa-info-circle"></i> Herramientas para diagnosticar problemas en la app
                </p>
                <div class="config-actions">
                    <button class="btn btn-outline" onclick="showErrorLog()" style="width: 100%; margin-bottom: 10px;">
                        <i class="fas fa-list"></i> Ver Log de Errores
                    </button>
                    <button class="btn btn-outline" onclick="clearErrorLog()" style="width: 100%;">
                        <i class="fas fa-trash"></i> Limpiar Log
                    </button>
                </div>
            </div>
            
            <!-- Notificaciones Manuales -->
            <div class="config-group">
                <h4><i class="fas fa-bell"></i> Notificaciones Manuales</h4>
                <p style="margin-bottom: 15px; color: var(--gray); font-size: 0.9rem;">
                    <i class="fas fa-info-circle"></i> Verifica tareas pendientes y recibe notificaciones
                </p>
                <div class="config-actions">
                    <button class="btn btn-warning" onclick="App.checkMermaPending()" style="width: 100%; margin-bottom: 10px;">
                        <i class="fas fa-calculator"></i> Verificar Merma Pendiente
                    </button>
                    <button class="btn btn-primary" onclick="App.checkCreditsPending()" style="width: 100%; margin-bottom: 10px;">
                        <i class="fas fa-credit-card"></i> Verificar Créditos Activos
                    </button>
                    <button class="btn btn-success" onclick="App.testAutoBackup()" style="width: 100%; margin-bottom: 10px;">
                        <i class="fas fa-robot"></i> Probar Backup Automático
                    </button>
                    <button class="btn btn-outline" onclick="App.testAllNotifications()" style="width: 100%;">
                        <i class="fas fa-vial"></i> Probar Todas las Notificaciones
                    </button>
                </div>
            </div>
            
            <!-- Vista Previa (solo escritorio) -->
            <div class="config-preview" id="config-preview">
                <h5><i class="fas fa-eye"></i> Vista Previa</h5>
                <div class="preview-item">
                    <div class="preview-color" style="background: ${ConfigModule.currentConfig.colors.primary}"></div>
                    <span>Color Primario</span>
                </div>
                <div class="preview-item">
                    <div class="preview-color" style="background: ${ConfigModule.currentConfig.colors.secondary}"></div>
                    <span>Color Secundario</span>
                </div>
                <div class="preview-item">
                    <div class="preview-color" style="background: ${ConfigModule.currentConfig.colors.light}"></span>
                    <span>Fondo Claro</span>
                </div>
            </div>
        </div>
    `;
    
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.innerHTML = html;
        
        // Mostrar vista previa solo en escritorio
        if (window.innerWidth > 768) {
            setTimeout(() => {
                const preview = document.getElementById('config-preview');
                if (preview) preview.style.display = 'block';
            }, 500);
        }
    }
},

// Verificar merma pendiente manualmente
async checkMermaPending() {
    if (typeof NotificationsModule !== 'undefined') {
        const hasPending = await NotificationsModule.checkPendingMerma();
        if (!hasPending) {
            Utils.showNotification('✅ No hay merma pendiente', 'success', 3000);
        }
    } else {
        Utils.showNotification('Sistema de notificaciones no disponible', 'error', 3000);
    }
},

// Verificar créditos pendientes manualmente
async checkCreditsPending() {
    if (typeof NotificationsModule !== 'undefined') {
        const hasPending = await NotificationsModule.checkPendingCredits();
        if (!hasPending) {
            Utils.showNotification('✅ No hay créditos pendientes', 'success', 3000);
        }
    } else {
        Utils.showNotification('Sistema de notificaciones no disponible', 'error', 3000);
    }
},

// Probar todas las notificaciones
async testAllNotifications() {
    if (typeof NotificationsModule !== 'undefined') {
        Utils.showLoading(true);
        
        // Notificación de merma
        await NotificationsModule.checkPendingMerma();
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Notificación de créditos
        await NotificationsModule.checkPendingCredits();
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Notificación de backup
        await NotificationsModule.showNotification(
            '💾 Prueba de Backup',
            'Esta es una notificación de prueba de backup',
            { tag: 'test-backup', requireInteraction: false }
        );
        
        Utils.showLoading(false);
        Utils.showNotification('Notificaciones de prueba enviadas', 'success', 3000);
    } else {
        Utils.showNotification('Sistema de notificaciones no disponible', 'error', 3000);
    }
},

// Métodos auxiliares para configuración
openColorPicker(colorName, currentValue) {
    ConfigModule.openColorPicker(colorName, currentValue).then(newValue => {
        if (newValue && newValue !== currentValue) {
            ConfigModule.currentConfig.colors[colorName] = newValue;
            ConfigModule.applyConfig();
            ConfigModule.saveConfig();
            App.updateConfigUI();
        }
    });
},

updateConfigUI() {
    // Actualizar inputs de color
    Object.entries(ConfigModule.currentConfig.colors).forEach(([key, value]) => {
        const colorInputs = document.querySelectorAll(`input[value="${value}"]`);
        colorInputs.forEach(input => {
            if (input.type === 'color' || input.type === 'text') {
                input.value = value;
            }
        });
    });
    
    // Actualizar tema activo
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
    });
    const activeTheme = document.querySelector(`.theme-option[onclick*="${ConfigModule.currentConfig.theme}"]`);
    if (activeTheme) activeTheme.classList.add('active');
    
    // Actualizar emoji activo
    document.querySelectorAll('.emoji-option').forEach(option => {
        option.classList.remove('active');
        if (option.textContent.trim() === ConfigModule.currentConfig.logoEmoji) {
            option.classList.add('active');
        }
    });
    
    // Actualizar vista previa
    const preview = document.getElementById('config-preview');
    if (preview) {
        preview.querySelectorAll('.preview-color')[0].style.background = ConfigModule.currentConfig.colors.primary;
        preview.querySelectorAll('.preview-color')[1].style.background = ConfigModule.currentConfig.colors.secondary;
        preview.querySelectorAll('.preview-color')[2].style.background = ConfigModule.currentConfig.colors.light;
    }
},

handleLogoUpload(file) {
    if (!file) return;
    
    const validTypes = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        Utils.showNotification('Formato no válido. Usa JPG, PNG, SVG o GIF', 'error', 5000);
        return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
        Utils.showNotification('La imagen es muy grande. Máximo 2MB', 'error', 5000);
        return;
    }
    
    Utils.showLoading(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const imageData = e.target.result;
        
        const img = new Image();
        img.onload = () => {
            let finalImageData = imageData;
            
            if (img.width > 512 || img.height > 512) {
                finalImageData = this.resizeImage(img, 512, 512);
            }
            
            ConfigModule.currentConfig.logoType = 'image';
            ConfigModule.currentConfig.logoImage = finalImageData;
            ConfigModule.currentConfig.logoEmoji = null;
            
            ConfigModule.applyLogo();
            ConfigModule.saveConfig();
            
            this.updateLogoPreview(finalImageData);
            
            Utils.showLoading(false);
            Utils.showNotification('Logo actualizado y guardado correctamente', 'success', 3000);
        };
        
        img.onerror = () => {
            Utils.showLoading(false);
            Utils.showNotification('Error al cargar la imagen', 'error', 5000);
        };
        
        img.src = imageData;
    };
    
    reader.onerror = () => {
        Utils.showLoading(false);
        Utils.showNotification('Error al leer el archivo', 'error', 5000);
    };
    
    reader.readAsDataURL(file);
},

// Método para redimensionar imagen
resizeImage(img, maxWidth, maxHeight) {
    const canvas = document.createElement('canvas');
    let width = img.width;
    let height = img.height;
    
    // Calcular nuevas dimensiones manteniendo proporción
    if (width > height) {
        if (width > maxWidth) {
            height = Math.round(height * maxWidth / width);
            width = maxWidth;
        }
    } else {
        if (height > maxHeight) {
            width = Math.round(width * maxHeight / height);
            height = maxHeight;
        }
    }
    
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    
    return canvas.toDataURL('image/png', 0.9);
},

// Método para actualizar vista previa del logo
updateLogoPreview(imageData) {
    const uploadContainer = document.querySelector('.logo-upload-container');
    if (!uploadContainer) return;
    
    // Remover vista previa anterior
    const oldPreview = uploadContainer.querySelector('.logo-preview');
    if (oldPreview) oldPreview.remove();
    
    // Crear nueva vista previa
    const previewDiv = document.createElement('div');
    previewDiv.className = 'logo-preview';
    
    const img = document.createElement('img');
    img.src = imageData;
    img.alt = 'Logo preview';
    img.style.maxWidth = '200px';
    img.style.maxHeight = '80px';
    img.style.borderRadius = '8px';
    img.style.display = 'block';
    img.style.margin = '20px auto';
    
    previewDiv.appendChild(img);
    uploadContainer.appendChild(previewDiv);
},


exportConfig() {
    ConfigModule.exportConfig();
},

async importConfig(file) {
    if (!file) return;
    
    try {
        await ConfigModule.importConfig(file);
        Utils.showNotification('Configuración importada correctamente', 'success', 3000);
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    } catch (error) {
        Utils.showNotification('Error al importar configuración: ' + error.message, 'error', 5000);
    }
},

    // Página Dashboard (ACTUALIZADA con mapa)
    loadDashboardPage() {
        const todaySales = SalesModule.getTodaySales();
        const todayIncome = todaySales.reduce((sum, sale) => sum + sale.total, 0);
        const todayWeight = SalesModule.getTotalWeightByDate(this.currentDate);
        const pendingOrders = OrdersModule.getPendingOrders().length;
        
        const html = `
            <div class="page active" id="dashboard-page">
                <h2><i class="fas fa-home"></i> Dashboard</h2>
                <p style="margin: 10px 0 20px; color: var(--gray);">Resumen general del negocio</p>
                
                <div class="dashboard-stats">
                    <div class="dashboard-card">
                        <div class="dashboard-icon">
                            <i class="fas fa-cash-register"></i>
                        </div>
                        <div class="dashboard-info">
                            <h3>Ventas Hoy</h3>
                            <div class="dashboard-value">${todaySales.length}</div>
                            <div class="dashboard-subtitle">${Utils.formatCurrency(todayIncome)}</div>
                        </div>
                    </div>
                    
                    <div class="dashboard-card">
                        <div class="dashboard-icon">
                            <i class="fas fa-weight"></i>
                        </div>
                        <div class="dashboard-info">
                            <h3>Libras Vendidas</h3>
                            <div class="dashboard-value">${todayWeight.toFixed(2)} lb</div>
                            <div class="dashboard-subtitle">Promedio: ${SalesModule.getAverageWeightByDate(this.currentDate).toFixed(2)} lb/pollo</div>
                        </div>
                    </div>
                    
                    <div class="dashboard-card">
                        <div class="dashboard-icon">
                            <i class="fas fa-clipboard-list"></i>
                        </div>
                        <div class="dashboard-info">
                            <h3>Pedidos Pendientes</h3>
                            <div class="dashboard-value">${pendingOrders}</div>
                            <div class="dashboard-subtitle">Requieren atención</div>
                        </div>
                    </div>
                    
                    <div class="dashboard-card">
                        <div class="dashboard-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="dashboard-info">
                            <h3>Clientes Activos</h3>
                            <div class="dashboard-value">${[...new Set(todaySales.map(sale => sale.clientId))].length}</div>
                            <div class="dashboard-subtitle">Hoy</div>
                        </div>
                    </div>
                </div>
                
                <!-- NUEVO: Mapa reducido en Dashboard -->
                <div class="card" style="margin-bottom: 20px;">
                    <h3><i class="fas fa-map-marked-alt"></i> Mapa de Entregas</h3>
                    <p style="margin: 5px 0 15px; color: var(--gray); font-size: 0.9rem;">
                        ${pendingOrders > 0 ? 
                          `${pendingOrders} pedidos pendientes para entrega` : 
                          'No hay pedidos pendientes'}
                    </p>
                    <div id="mapa-dashboard" style="height: 250px; width: 100%; border-radius: 8px; overflow: hidden; margin-top: 10px;"></div>
                    <div style="margin-top: 15px; display: flex; gap: 10px;">
                        <button class="btn btn-outline" onclick="App.loadPage('rutas')" style="flex: 1;">
                            <i class="fas fa-route"></i> Ver Ruta Completa
                        </button>
                        <button class="btn btn-outline" onclick="App.loadPage('orders')" style="flex: 1;">
                            <i class="fas fa-plus"></i> Agregar Pedido
                        </button>
                    </div>
                </div>
                
                <div class="quick-actions">
                    <div class="quick-action-btn" onclick="App.loadPage('sales')">
                        <i class="fas fa-plus-circle"></i>
                        <span>Nueva Venta</span>
                    </div>
                    <div class="quick-action-btn" onclick="App.loadPage('orders')">
                        <i class="fas fa-clipboard-list"></i>
                        <span>Nuevo Pedido</span>
                    </div>
                    <div class="quick-action-btn" onclick="App.loadPage('clients')">
                        <i class="fas fa-user-plus"></i>
                        <span>Agregar Cliente</span>
                    </div>
                    <div class="quick-action-btn" onclick="App.loadPage('merma')">
                        <i class="fas fa-calculator"></i>
                        <span>Calcular Merma</span>
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-history"></i> Actividad Reciente</h3>
                    <div style="margin-top: 15px;">
                        ${this.getRecentActivity()}
                    </div>
                </div>
            </div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = html;
            
            // Inicializar mapa del dashboard después de un breve delay
            setTimeout(() => {
                this.inicializarMapaDashboard();
            }, 300);
        }
    },

    // NUEVO: Inicializar mapa del dashboard
    inicializarMapaDashboard() {
        const pedidosPendientes = OrdersModule.getPendingOrders();
        
        if (pedidosPendientes.length === 0) {
            const mapaElement = document.getElementById('mapa-dashboard');
            if (mapaElement) {
                mapaElement.innerHTML = `
                    <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--gray);">
                        <i class="fas fa-route" style="font-size: 3rem; margin-bottom: 10px; opacity: 0.5;"></i>
                        <p>No hay pedidos pendientes</p>
                        <button class="btn btn-outline" onclick="App.loadPage('orders')" style="margin-top: 15px;">
                            <i class="fas fa-plus"></i> Crear primer pedido
                        </button>
                    </div>
                `;
            }
            return;
        }
        
        // Si ya hay un mapa, actualizarlo
        if (this.mapaDashboardInicializado) {
            this.actualizarMapaDashboard();
        } else {
            // Crear nuevo mapa
            const mapaElement = document.getElementById('mapa-dashboard');
            if (!mapaElement) return;
            
            // Limpiar contenido previo
            mapaElement.innerHTML = '';
            
            // Crear contenedor para Leaflet
            const mapContainer = document.createElement('div');
            mapContainer.style.width = '100%';
            mapContainer.style.height = '100%';
            mapaElement.appendChild(mapContainer);
            
            // Inicializar mapa con ubicación actual o por defecto
            let mapa;
            
            // Obtener clientes con coordenadas primero
            const clientesConCoordenadas = pedidosPendientes
                .map(pedido => {
                    const cliente = ClientsModule.getClientById(pedido.clientId);
                    return cliente && cliente.coordinates ? {
                        ...cliente,
                        pedidoId: pedido.id,
                        pedidoStatus: pedido.status,
                        peso: pedido.weight,
                        cantidad: pedido.quantity
                    } : null;
                })
                .filter(cliente => cliente !== null);
            
            if (clientesConCoordenadas.length === 0) {
                mapaElement.innerHTML = `
                    <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--gray);">
                        <i class="fas fa-map-marker-alt" style="font-size: 3rem; margin-bottom: 10px; opacity: 0.5;"></i>
                        <p>Los clientes no tienen ubicación</p>
                    </div>
                `;
                return;
            }
            
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        mapa = L.map(mapContainer).setView([position.coords.latitude, position.coords.longitude], 12);
                        this.configurarMapaDashboard(mapa, clientesConCoordenadas);
                    },
                    (error) => {
                        mapa = L.map(mapContainer).setView([19.4326, -99.1332], 12);
                        this.configurarMapaDashboard(mapa, clientesConCoordenadas);
                    }
                );
            } else {
                mapa = L.map(mapContainer).setView([19.4326, -99.1332], 12);
                this.configurarMapaDashboard(mapa, clientesConCoordenadas);
            }
        }
    },

    // Método auxiliar para configurar el mapa del dashboard
    configurarMapaDashboard(mapa, clientesConCoordenadas) {
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(mapa);
            
        // Obtener clientes con coordenadas
        if (clientesConCoordenadas.length === 0) {
            return;
        }
            
        // Ordenar por proximidad
        const rutaOptimizada = RutasModule.optimizarRuta(clientesConCoordenadas);
            
        // Agregar marcadores
        const marcadores = [];
        const coordenadas = [];
            
        rutaOptimizada.forEach((cliente, index) => {
            if (cliente.coordinates && cliente.coordinates.lat) {
                // Determinar color según estado del pedido
                let colorIcono = 'var(--primary)';
                if (cliente.pedidoStatus === 'delivered') {
                    colorIcono = 'var(--success)';
                } else if (cliente.pedidoStatus === 'cancelled') {
                    colorIcono = 'var(--danger)';
                }
                    
                    // Crear marcador con número
                    const icon = L.divIcon({
                        className: 'numero-marcador',
                        html: `
                            <div style="
                                background: ${colorIcono}; 
                                color: white; 
                                width: 24px; 
                                height: 24px; 
                                border-radius: 50%; 
                                display: flex; 
                                align-items: center; 
                                justify-content: center; 
                                font-weight: bold; 
                                border: 2px solid white;
                                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                            ">
                                ${index + 1}
                            </div>
                        `,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });
                    
                    const marker = L.marker([cliente.coordinates.lat, cliente.coordinates.lng], { icon })
                        .addTo(mapa)
                        .bindPopup(`
                            <div style="min-width: 180px;">
                                <b>${index + 1}. ${cliente.name}</b><br>
                                <small>${cliente.address}</small><br>
                                <hr style="margin: 5px 0;">
                                <strong>Pedido:</strong> ${cliente.peso.toFixed(2)} lb • ${cliente.cantidad} pollos<br>
                                <strong>Estado:</strong> <span class="order-status ${cliente.pedidoStatus}">${OrdersModule.getStatusText(cliente.pedidoStatus)}</span>
                            </div>
                        `);
                    
                    marcadores.push(marker);
                    coordenadas.push([cliente.coordinates.lat, cliente.coordinates.lng]);
                }
            });
            
            // Dibujar línea que conecta los puntos
            if (coordenadas.length >= 2) {
                L.polyline(coordenadas, {
                    color: 'var(--primary)',
                    weight: 2,
                    opacity: 0.7,
                    dashArray: '5, 5'
                }).addTo(mapa);
            }
            
            // Ajustar vista para mostrar todos los marcadores
            if (marcadores.length > 0) {
                const group = new L.featureGroup(marcadores);
                mapa.fitBounds(group.getBounds().pad(0.1));
            }
            
            // Guardar referencia al mapa
            this.mapaDashboard = mapa;
            this.mapaDashboardInicializado = true;
            this.marcadoresDashboard = marcadores;
            this.polylineDashboard = coordenadas.length >= 2 ? true : false;
    },

    // NUEVO: Actualizar mapa del dashboard
    actualizarMapaDashboard() {
        if (!this.mapaDashboard || !this.mapaDashboardInicializado) {
            this.inicializarMapaDashboard();
            return;
        }
        
        const pedidosPendientes = OrdersModule.getPendingOrders();
        
        if (pedidosPendientes.length === 0) {
            const mapaElement = document.getElementById('mapa-dashboard');
            if (mapaElement && this.mapaDashboard) {
                this.mapaDashboard.remove();
                this.mapaDashboard = null;
                this.mapaDashboardInicializado = false;
                
                mapaElement.innerHTML = `
                    <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--gray);">
                        <i class="fas fa-route" style="font-size: 3rem; margin-bottom: 10px; opacity: 0.5;"></i>
                        <p>No hay pedidos pendientes</p>
                        <button class="btn btn-outline" onclick="App.loadPage('orders')" style="margin-top: 15px;">
                            <i class="fas fa-plus"></i> Crear primer pedido
                        </button>
                    </div>
                `;
            }
            return;
        }
        
        // Limpiar marcadores anteriores
        if (this.marcadoresDashboard) {
            this.marcadoresDashboard.forEach(marker => {
                if (this.mapaDashboard && marker) {
                    this.mapaDashboard.removeLayer(marker);
                }
            });
        }
        
        // Obtener clientes con coordenadas
        const clientesConCoordenadas = pedidosPendientes
            .map(pedido => {
                const cliente = ClientsModule.getClientById(pedido.clientId);
                return cliente && cliente.coordinates ? {
                    ...cliente,
                    pedidoId: pedido.id,
                    pedidoStatus: pedido.status,
                    peso: pedido.weight,
                    cantidad: pedido.quantity
                } : null;
            })
            .filter(cliente => cliente !== null);
        
        if (clientesConCoordenadas.length === 0) {
            const mapaElement = document.getElementById('mapa-dashboard');
            if (mapaElement && this.mapaDashboard) {
                this.mapaDashboard.remove();
                this.mapaDashboard = null;
                this.mapaDashboardInicializado = false;
                
                mapaElement.innerHTML = `
                    <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--gray);">
                        <i class="fas fa-map-marker-alt" style="font-size: 3rem; margin-bottom: 10px; opacity: 0.5;"></i>
                        <p>Los clientes no tienen ubicación</p>
                    </div>
                `;
            }
            return;
        }
        
        // Ordenar por proximidad
        const rutaOptimizada = RutasModule.optimizarRuta(clientesConCoordenadas);
        
        // Agregar nuevos marcadores
        this.marcadoresDashboard = [];
        const coordenadas = [];
        
        rutaOptimizada.forEach((cliente, index) => {
            if (cliente.coordinates && cliente.coordinates.lat) {
                // Determinar color según estado del pedido
                let colorIcono = 'var(--primary)';
                if (cliente.pedidoStatus === 'delivered') {
                    colorIcono = 'var(--success)';
                } else if (cliente.pedidoStatus === 'cancelled') {
                    colorIcono = 'var(--danger)';
                }
                
                // Crear marcador con número
                const icon = L.divIcon({
                    className: 'numero-marcador',
                    html: `
                        <div style="
                            background: ${colorIcono}; 
                            color: white; 
                            width: 24px; 
                            height: 24px; 
                            border-radius: 50%; 
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            font-weight: bold; 
                            border: 2px solid white;
                            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                        ">
                            ${index + 1}
                        </div>
                    `,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });
                
                const marker = L.marker([cliente.coordinates.lat, cliente.coordinates.lng], { icon })
                    .addTo(this.mapaDashboard)
                    .bindPopup(`
                        <div style="min-width: 180px;">
                            <b>${index + 1}. ${cliente.name}</b><br>
                            <small>${cliente.address}</small><br>
                            <hr style="margin: 5px 0;">
                            <strong>Pedido:</strong> ${cliente.peso.toFixed(2)} lb • ${cliente.cantidad} pollos<br>
                            <strong>Estado:</strong> <span class="order-status ${cliente.pedidoStatus}">${OrdersModule.getStatusText(cliente.pedidoStatus)}</span>
                        </div>
                    `);
                
                this.marcadoresDashboard.push(marker);
                coordenadas.push([cliente.coordinates.lat, cliente.coordinates.lng]);
            }
        });
        
        // Limpiar polyline anterior
        if (this.polylineDashboard) {
            this.mapaDashboard.eachLayer(layer => {
                if (layer instanceof L.Polyline) {
                    this.mapaDashboard.removeLayer(layer);
                }
            });
        }
        
        // Dibujar nueva línea que conecta los puntos
        if (coordenadas.length >= 2) {
            L.polyline(coordenadas, {
                color: 'var(--primary)',
                weight: 2,
                opacity: 0.7,
                dashArray: '5, 5'
            }).addTo(this.mapaDashboard);
            this.polylineDashboard = true;
        }
        
        // Ajustar vista para mostrar todos los marcadores
        if (this.marcadoresDashboard.length > 0) {
            const group = new L.featureGroup(this.marcadoresDashboard);
            this.mapaDashboard.fitBounds(group.getBounds().pad(0.1));
        }
    },

    getRecentActivity() {
        const sales = SalesModule.sales.slice(-5).reverse();
        const orders = OrdersModule.orders.slice(-5).reverse();
        
        const allActivity = [...sales, ...orders]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 5);
        
        if (allActivity.length === 0) {
            return '<p class="empty-state">No hay actividad reciente</p>';
        }
        
        let html = '';
        allActivity.forEach(activity => {
            // Verificar que ClientsModule esté disponible
            if (typeof ClientsModule === 'undefined' || !ClientsModule.getClientById) {
                return; // Saltar si el módulo no está listo
            }
            
            const client = ClientsModule.getClientById(activity.clientId);
            const clientName = client ? client.name : 'Cliente desconocido';
            
            if (activity.hasOwnProperty('status')) {
                // Es un pedido
                html += `
                    <div style="padding: 10px; border-bottom: 1px solid #eee;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong><i class="fas fa-clipboard-list"></i> ${clientName}</strong>
                                <div style="font-size: 0.9rem; color: var(--gray);">
                                    Pedido ${OrdersModule.getStatusText ? OrdersModule.getStatusText(activity.status) : activity.status} - ${activity.weight} lb
                                </div>
                            </div>
                            <div style="color: var(--gray); font-size: 0.8rem;">
                                ${activity.createdTime || activity.time}
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // Es una venta
                html += `
                    <div style="padding: 10px; border-bottom: 1px solid #eee;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong><i class="fas fa-cash-register"></i> ${clientName}</strong>
                                <div style="font-size: 0.9rem; color: var(--gray);">
                                    Venta - ${Utils.formatCurrency(activity.total)}
                                </div>
                            </div>
                            <div style="color: var(--gray); font-size: 0.8rem;">
                                ${activity.time}
                            </div>
                        </div>
                    </div>
                `;
            }
        });
        
        return html || '<p class="empty-state">No hay actividad reciente</p>';
    },

    // Página de Ventas
    loadSalesPage() {
        const html = `
            <div class="page active" id="sales-page">
                <h2><i class="fas fa-cash-register"></i> Registro de Ventas</h2>
                <p style="margin: 10px 0 20px; color: var(--gray);">Registra las ventas de pollos pelados</p>
                
                <div class="date-filter">
                    <input type="date" class="date-input" id="sales-date-filter" value="${this.currentDate}">
                    <button class="btn btn-outline" onclick="App.filterSalesByDate()">
                        <i class="fas fa-filter"></i> Filtrar
                    </button>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-plus-circle"></i> Nueva Venta</h3>
                    <form id="sale-form">
                        <div class="form-group">
                            <label class="form-label" for="sale-date">Fecha de la Venta</label>
                            <input type="date" class="form-input" id="sale-date" value="${this.currentDate}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="sale-client">Cliente</label>
                            <div style="display: flex; gap: 10px;">
                                <select class="form-input" id="sale-client" required style="flex: 1;">
                                    <option value="">Seleccionar cliente</option>
                                </select>
                                <button type="button" class="btn btn-outline" onclick="App.toggleQuickClientForm()" 
                                        style="padding: 10px 15px; white-space: nowrap;">
                                    <i class="fas fa-user-plus"></i>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Formulario rápido de cliente (oculto por defecto) -->
                        <div id="quick-client-form" style="display: none; background: var(--light); padding: 15px; border-radius: 8px; margin: 15px 0;">
                            <h4 style="margin: 0 0 10px 0; color: var(--primary); font-size: 0.95rem;">
                                <i class="fas fa-user-plus"></i> Agregar Cliente Rápido
                            </h4>
                            <div class="form-group" style="margin-bottom: 10px;">
                                <input type="text" class="form-input" id="quick-client-name" placeholder="Nombre">
                            </div>
                            <div class="form-group" style="margin-bottom: 10px;">
                                <input type="tel" class="form-input" id="quick-client-phone" placeholder="Teléfono">
                            </div>
                            <div class="form-group" style="margin-bottom: 10px;">
                                <input type="text" class="form-input" id="quick-client-address" placeholder="Dirección">
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <button type="button" class="btn btn-primary" onclick="App.saveQuickClient()" style="flex: 1;">
                                    <i class="fas fa-save"></i> Guardar
                                </button>
                                <button type="button" class="btn btn-outline" onclick="App.toggleQuickClientForm()" style="flex: 1;">
                                    <i class="fas fa-times"></i> Cancelar
                                </button>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="sale-weight">Peso Total (lb)</label>
                            <input type="number" step="0.01" min="0.01" class="form-input" id="sale-weight" required 
                                   placeholder="Ej: 45.5" oninput="App.updateSalePreview()">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="sale-quantity">Cantidad de Pollos</label>
                            <input type="number" min="1" class="form-input" id="sale-quantity" required 
                                   placeholder="Ej: 10" oninput="App.updateSalePreview()">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="sale-price">Precio por lb ($)</label>
                            <input type="number" step="0.01" min="0" class="form-input" id="sale-price" 
                                   placeholder="Dejar vacío para usar precio de merma" oninput="App.updateSalePreview()">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="sale-payment-method">Método de Pago</label>
                            <select class="form-input" id="sale-payment-method" required onchange="App.toggleInitialPayment()">
                                <option value="cash">Efectivo (Pagado)</option>
                                <option value="credit">Crédito (A deber)</option>
                            </select>
                        </div>
                        
                        <div class="form-group" id="initial-payment-group" style="display: none;">
                            <label class="form-label" for="sale-initial-payment">Abono Inicial (Entrada)</label>
                            <input type="number" step="0.01" min="0" class="form-input" id="sale-initial-payment" 
                                   placeholder="Monto del abono inicial" oninput="App.updateSalePreview()">
                            <small style="color: var(--gray); display: block; margin-top: 5px;">
                                <i class="fas fa-info-circle"></i> Opcional: Deja vacío si no hay abono inicial
                            </small>
                        </div>
                        
                        <!-- VISTA PREVIA EN TIEMPO REAL -->
                        <div id="sale-preview" style="background: var(--light); padding: 15px; border-radius: 8px; margin: 15px 0; display: none;">
                            <h4 style="margin: 0 0 10px 0; color: var(--primary);"><i class="fas fa-eye"></i> Vista Previa</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem;">
                                <div>
                                    <strong>Peso Promedio:</strong><br>
                                    <span id="preview-avg-weight" style="color: var(--primary); font-size: 1.1rem; font-weight: bold;">0.00 lb/pollo</span>
                                </div>
                                <div>
                                    <strong>Precio por lb:</strong><br>
                                    <span id="preview-price" style="color: var(--secondary); font-size: 1.1rem; font-weight: bold;">$0.00</span>
                                </div>
                            </div>
                            <hr style="margin: 10px 0; border: none; border-top: 1px solid #ddd;">
                            <div style="text-align: center;">
                                <strong style="font-size: 0.9rem; color: var(--gray);">TOTAL A COBRAR</strong><br>
                                <span id="preview-total" style="color: var(--success); font-size: 2rem; font-weight: bold;">$0.00</span>
                            </div>
                        </div>
                        
                        <button type="submit" class="btn btn-primary" style="width: 100%;">
                            <i class="fas fa-save"></i> Registrar Venta
                        </button>
                    </form>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-list"></i> Ventas del ${this.currentDate}</h3>
                    <ul class="sales-list" id="sales-list">
                        <!-- Las ventas se agregarán aquí dinámicamente -->
                    </ul>
                </div>
            </div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = html;
            ClientsModule.updateClientSelect();
            SalesModule.updateSalesList(this.currentDate);
            
            // Configurar formulario de venta
            const saleForm = document.getElementById('sale-form');
            if (saleForm) {
                saleForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.addSale();
                });
            }
            
            // Configurar filtro de fecha
            const dateFilter = document.getElementById('sales-date-filter');
            if (dateFilter) {
                dateFilter.addEventListener('change', (e) => {
                    this.currentDate = e.target.value;
                });
            }
            
            // Inicializar select personalizado
            setTimeout(() => {
                if (typeof CustomSelect !== 'undefined') {
                    CustomSelect.init('sale-client', {
                        placeholder: 'Seleccionar cliente',
                        searchPlaceholder: 'Buscar cliente...'
                    });
                    CustomSelect.init('sale-payment-method', {
                        placeholder: 'Método de pago'
                    });
                }
            }, 100);
        }
    },

    // Página de Pedidos
    loadOrdersPage() {
        const html = `
            <div class="page active" id="orders-page">
                <h2><i class="fas fa-clipboard-list"></i> Gestión de Pedidos</h2>
                <p style="margin: 10px 0 20px; color: var(--gray);">Registra y gestiona pedidos de clientes</p>
                
                <div class="order-status-filter">
                    <button class="status-btn active" onclick="App.filterOrders('all')">Todos</button>
                    <button class="status-btn" onclick="App.filterOrders('pending')">Pendientes</button>
                    <button class="status-btn" onclick="App.filterOrders('delivered')">Entregados</button>
                    <button class="status-btn" onclick="App.filterOrders('cancelled')">Cancelados</button>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-plus-circle"></i> Nuevo Pedido</h3>
                    <form id="order-form">
                        <div class="form-group">
                            <label class="form-label" for="order-client">Cliente</label>
                            <div style="display: flex; gap: 10px;">
                                <select class="form-input" id="order-client" required style="flex: 1;">
                                    <option value="">Seleccionar cliente</option>
                                </select>
                                <button type="button" class="btn btn-outline" onclick="App.toggleQuickClientFormOrder()" 
                                        style="padding: 10px 15px; white-space: nowrap;">
                                    <i class="fas fa-user-plus"></i>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Formulario rápido de cliente -->
                        <div id="quick-client-form-order" style="display: none; background: var(--light); padding: 15px; border-radius: 8px; margin: 15px 0;">
                            <h4 style="margin: 0 0 10px 0; color: var(--primary); font-size: 0.95rem;">
                                <i class="fas fa-user-plus"></i> Agregar Cliente Rápido
                            </h4>
                            <div class="form-group" style="margin-bottom: 10px;">
                                <input type="text" class="form-input" id="quick-client-name-order" placeholder="Nombre">
                            </div>
                            <div class="form-group" style="margin-bottom: 10px;">
                                <input type="tel" class="form-input" id="quick-client-phone-order" placeholder="Teléfono">
                            </div>
                            <div class="form-group" style="margin-bottom: 10px;">
                                <input type="text" class="form-input" id="quick-client-address-order" placeholder="Dirección">
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <button type="button" class="btn btn-primary" onclick="App.saveQuickClientOrder()" style="flex: 1;">
                                    <i class="fas fa-save"></i> Guardar
                                </button>
                                <button type="button" class="btn btn-outline" onclick="App.toggleQuickClientFormOrder()" style="flex: 1;">
                                    <i class="fas fa-times"></i> Cancelar
                                </button>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="order-weight">Peso Total (lb)</label>
                            <input type="number" step="0.01" min="0.01" class="form-input" id="order-weight" required 
                                   placeholder="Ej: 45.5">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="order-quantity">Cantidad de Pollos</label>
                            <input type="number" min="1" class="form-input" id="order-quantity" required 
                                   placeholder="Ej: 10">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="order-price">Precio por lb ($)</label>
                            <input type="number" step="0.01" min="0" class="form-input" id="order-price" 
                                   placeholder="Dejar vacío para usar precio de merma">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="order-delivery-date">Fecha de Entrega (opcional)</label>
                            <input type="datetime-local" class="form-input" id="order-delivery-date">
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="order-notes">Notas (opcional)</label>
                            <textarea class="form-input" id="order-notes" rows="2" placeholder="Instrucciones especiales..."></textarea>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">
                            <i class="fas fa-save"></i> Registrar Pedido
                        </button>
                    </form>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-list"></i> Lista de Pedidos</h3>
                    <ul class="orders-list" id="orders-list">
                        <!-- Los pedidos se agregarán aquí dinámicamente -->
                    </ul>
                </div>
            </div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = html;
            ClientsModule.updateClientSelect();
            OrdersModule.updateOrdersList();
            
            // Configurar formulario de pedido
            const orderForm = document.getElementById('order-form');
            if (orderForm) {
                orderForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.addOrder();
                });
            }
            
            // Inicializar select personalizado
            setTimeout(() => {
                if (typeof CustomSelect !== 'undefined') {
                    CustomSelect.init('order-client', {
                        placeholder: 'Seleccionar cliente',
                        searchPlaceholder: 'Buscar cliente...'
                    });
                }
            }, 100);
        }
    },

    // Página de Clientes
    loadClientsPage() {
        const html = `
            <div class="page active" id="clients-page">
                <h2><i class="fas fa-users"></i> Gestión de Clientes</h2>
                <p style="margin: 10px 0 20px; color: var(--gray);">Agrega nuevos clientes con ubicación</p>
                
                <div class="card">
                    <h3><i class="fas fa-user-plus"></i> Agregar Cliente</h3>
                    
                    <form id="client-form">
                        <div class="form-group">
                            <label class="form-label" for="client-name">Nombre</label>
                            <input type="text" class="form-input" id="client-name" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="client-phone">Teléfono</label>
                            <input type="tel" class="form-input" id="client-phone" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="client-address">Dirección</label>
                            <input type="text" class="form-input" id="client-address" required>
                        </div>
                        <div class="location-info">
                            <i class="fas fa-map-marker-alt location-icon"></i>
                            <span id="current-location">Obteniendo ubicación actual...</span>
                            <button type="button" class="btn btn-outline" onclick="App.openMapModal()" 
                                    style="margin-left: auto; padding: 5px 10px; font-size: 0.8rem;">
                                <i class="fas fa-map"></i> Seleccionar en Mapa
                            </button>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 15px;">
                            <i class="fas fa-save"></i> Guardar Cliente
                        </button>
                    </form>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-list"></i> Lista de Clientes</h3>
                    
                    <!-- Buscador de clientes -->
                    <div class="form-group" style="margin-bottom: 15px;">
                        <div style="position: relative;">
                            <input type="text" class="form-input" id="client-search" 
                                   placeholder="Buscar por nombre, teléfono o dirección..." 
                                   style="padding-left: 40px;">
                            <i class="fas fa-search" style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: var(--gray);"></i>
                        </div>
                        <small style="color: var(--gray); display: block; margin-top: 5px;">
                            <span id="client-count">0 clientes</span> • 
                            <span id="client-filtered" style="display: none;">0 encontrados</span>
                        </small>
                    </div>
                    
                    <ul class="client-list" id="client-list">
                        <!-- Los clientes se agregarán aquí dinámicamente -->
                    </ul>
                </div>
            </div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = html;
            ClientsModule.updateClientList();
            
            // Obtener ubicación actual
            this.getCurrentLocation();
            
            // Configurar formulario de cliente
            const clientForm = document.getElementById('client-form');
            if (clientForm) {
                clientForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.addClient();
                });
            }
            
            // Configurar buscador de clientes
            const searchInput = document.getElementById('client-search');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.filterClients(e.target.value);
                });
            }
        }
    },

    // Página de Merma
    loadMermaPage() {
        const todayMermaPrice = MermaModule.getTodayMermaPrice();
        const selectedMermaRecord = MermaModule.getMermaRecordByDate(this.currentDate);
        
        const html = `
            <div class="page active" id="merma-page">
                <h2><i class="fas fa-calculator"></i> Cálculo de Merma</h2>
                <p style="margin: 10px 0 20px; color: var(--gray);">Calcula el costo real por lb de pollo pelado</p>
                
                <div class="card">
                    <h3><i class="fas fa-chart-line"></i> Datos de Producción</h3>
                    <form id="merma-form">
                        <div class="form-group">
                            <label class="form-label" for="merma-date">Fecha del Cálculo</label>
                            <input type="date" class="form-input" id="merma-date" value="${this.currentDate}" required>
                            <small style="color: var(--gray); display: block; margin-top: 5px;">
                                <i class="fas fa-info-circle"></i> Puedes calcular merma de días anteriores
                            </small>
                        </div>
                        <div class="merma-form">
                            <div class="form-group">
                                <label class="form-label" for="live-weight">Peso total pollos vivos (lb)</label>
                                <input type="number" step="0.01" min="0" class="form-input" id="live-weight"
                                       placeholder="Dejar vacío para calcular" oninput="App.updateMermaPreview()" 
                                       value="${selectedMermaRecord ? selectedMermaRecord.liveWeight : ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="live-cost">Costo por lb pollo vivo ($)</label>
                                <input type="number" step="0.01" min="0" class="form-input" id="live-cost"
                                       placeholder="Dejar vacío para calcular" oninput="App.updateMermaPreview()"
                                       value="${selectedMermaRecord ? selectedMermaRecord.liveCost : ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="processed-weight">Peso total pollos pelados (lb)</label>
                                <input type="number" step="0.01" min="0" class="form-input" id="processed-weight"
                                       placeholder="Dejar vacío para calcular" oninput="App.updateMermaPreview()"
                                       value="${selectedMermaRecord ? selectedMermaRecord.processedWeight : ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="chicken-count">Cantidad de pollos procesados</label>
                                <input type="number" min="1" class="form-input" id="chicken-count" required
                                       placeholder="Número de pollos" oninput="App.updateMermaPreview()"
                                       value="${selectedMermaRecord ? selectedMermaRecord.chickenCount : ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="processing-cost-per-chicken">Costo por pelar cada pollo ($)</label>
                                <input type="number" step="0.01" min="0" class="form-input" id="processing-cost-per-chicken"
                                       placeholder="Dejar vacío para calcular" oninput="App.updateMermaPreview()"
                                       value="${selectedMermaRecord ? selectedMermaRecord.processingCostPerChicken : ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="real-cost-per-lb">Costo real por lb ($) - Opcional</label>
                                <input type="number" step="0.01" min="0" class="form-input" id="real-cost-per-lb"
                                       placeholder="Dejar vacío para calcular" oninput="App.updateMermaPreview()"
                                       value="${selectedMermaRecord ? selectedMermaRecord.realCostPerLb : ''}">
                                <small style="color: var(--gray); display: block; margin-top: 5px;">
                                    <i class="fas fa-info-circle"></i> Puedes dejar vacío cualquier campo excepto "Cantidad de pollos"
                                </small>
                            </div>
                        </div>
                        
                        <!-- VISTA PREVIA EN TIEMPO REAL -->
                        <div id="merma-preview" style="background: linear-gradient(135deg, var(--light) 0%, #e8f5e9 100%); padding: 20px; border-radius: 12px; margin: 20px 0; display: none; border: 2px solid var(--primary);">
                            <h4 style="margin: 0 0 15px 0; color: var(--primary); text-align: center;">
                                <i class="fas fa-eye"></i> Vista Previa del Cálculo
                            </h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                                <div style="background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                    <div style="color: var(--gray); font-size: 0.85rem; margin-bottom: 5px;">
                                        <i class="fas fa-percentage"></i> Merma
                                    </div>
                                    <div id="preview-merma-percent" style="color: var(--danger); font-size: 1.8rem; font-weight: bold;">0%</div>
                                </div>
                                <div style="background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                    <div style="color: var(--gray); font-size: 0.85rem; margin-bottom: 5px;">
                                        <i class="fas fa-dollar-sign"></i> Costo Real/lb
                                    </div>
                                    <div id="preview-real-cost" style="color: var(--primary); font-size: 1.8rem; font-weight: bold;">$0.00</div>
                                </div>
                                <div style="background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                    <div style="color: var(--gray); font-size: 0.85rem; margin-bottom: 5px;">
                                        <i class="fas fa-chart-line"></i> Pérdida
                                    </div>
                                    <div id="preview-loss-amount" style="color: var(--warning); font-size: 1.8rem; font-weight: bold;">$0.00</div>
                                </div>
                                <div style="background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                    <div style="color: var(--gray); font-size: 0.85rem; margin-bottom: 5px;">
                                        <i class="fas fa-calculator"></i> Costo Total
                                    </div>
                                    <div id="preview-total-cost" style="color: var(--secondary); font-size: 1.8rem; font-weight: bold;">$0.00</div>
                                </div>
                            </div>
                            <div style="margin-top: 15px; padding: 12px; background: rgba(76, 175, 80, 0.1); border-radius: 8px; text-align: center;">
                                <div style="color: var(--gray); font-size: 0.85rem; margin-bottom: 5px;">Libras Perdidas</div>
                                <div id="preview-weight-loss" style="color: var(--primary); font-size: 1.3rem; font-weight: bold;">0.00 lb</div>
                            </div>
                        </div>
                        
                        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 15px;">
                            <i class="fas fa-calculator"></i> ${selectedMermaRecord ? 'Actualizar' : 'Calcular y Guardar'} Merma
                        </button>
                        ${selectedMermaRecord ? `
                            <p style="text-align: center; margin-top: 10px; color: var(--success);">
                                <i class="fas fa-check-circle"></i> Ya existe cálculo para ${this.currentDate}
                            </p>
                        ` : ''}
                    </form>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-history"></i> Historial de Merma</h3>
                    <div id="merma-history-list">
                        ${this.getMermaHistoryHTML()}
                    </div>
                </div>
            </div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = html;
            
            // Configurar formulario de merma
            const mermaForm = document.getElementById('merma-form');
            if (mermaForm) {
                mermaForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.calculateAndSaveMerma();
                });
            }
            
            // NUEVO: Listener para cambio de fecha - solo actualiza currentDate
            const dateInput = document.getElementById('merma-date');
            if (dateInput) {
                dateInput.addEventListener('change', (e) => {
                    this.currentDate = e.target.value;
                    // Recargar página para mostrar datos de la nueva fecha
                    this.loadMermaPage();
                });
            }
            
            // Actualizar vista previa si hay datos
            if (selectedMermaRecord) {
                setTimeout(() => this.updateMermaPreview(), 100);
            }
        }
    },

    // NUEVO: Actualizar vista previa de merma en tiempo real
    updateMermaPreview() {
        if (this._updatingMerma) return;
        this._updatingMerma = true;
        
        const preview = document.getElementById('merma-preview');
        if (!preview) {
            this._updatingMerma = false;
            return;
        }
        
        try {
            const liveWeightEl = document.getElementById('live-weight');
            const liveCostEl = document.getElementById('live-cost');
            const processedWeightEl = document.getElementById('processed-weight');
            const chickenCountEl = document.getElementById('chicken-count');
            const processingCostEl = document.getElementById('processing-cost-per-chicken');
            const realCostEl = document.getElementById('real-cost-per-lb');
            
            if (!liveWeightEl || !liveCostEl || !processedWeightEl || !chickenCountEl || !processingCostEl) {
                this._updatingMerma = false;
                return;
            }
            
            const liveWeight = liveWeightEl.value.trim() ? parseFloat(liveWeightEl.value) : 0;
            const liveCost = liveCostEl.value.trim() ? parseFloat(liveCostEl.value) : 0;
            const processedWeight = processedWeightEl.value.trim() ? parseFloat(processedWeightEl.value) : 0;
            const chickenCount = chickenCountEl.value.trim() ? parseInt(chickenCountEl.value) : 0;
            const processingCostPerChicken = processingCostEl.value.trim() ? parseFloat(processingCostEl.value) : 0;
            const realCostPerLb = realCostEl && realCostEl.value.trim() ? parseFloat(realCostEl.value) : 0;
        
            // Mostrar vista previa solo si hay datos suficientes
            const filledValues = [liveWeight, liveCost, processedWeight, processingCostPerChicken, realCostPerLb].filter(v => v > 0).length;
            
            if (filledValues < 4 || chickenCount === 0) {
                preview.style.display = 'none';
                this._updatingMerma = false;
                return;
            }
            
            preview.style.display = 'block';
            
            const totalProcessingCost = chickenCount * processingCostPerChicken;
            const result = MermaModule.calculateMerma(liveWeight, liveCost, processedWeight, totalProcessingCost, realCostPerLb);
                
            // Mostrar indicador si se dedujo un valor
            let deducedMessage = '';
            if (result.deducedValue) {
                const labels = {
                    liveWeight: 'Peso vivo',
                    liveCost: 'Costo por lb vivo',
                    processedWeight: 'Peso pelado',
                    processingCost: 'Costo de procesamiento',
                    realCostPerLb: 'Costo real por lb'
                };
                deducedMessage = `<div style="background: #E3F2FD; padding: 10px; border-radius: 8px; margin-bottom: 15px; text-align: center;">
                    <i class="fas fa-calculator" style="color: var(--primary);"></i> 
                    <strong style="color: var(--primary);">${labels[result.deducedValue]}</strong> calculado automáticamente
                </div>`;
            }
            
            preview.innerHTML = `
                <h4 style="margin: 0 0 15px 0; color: var(--primary); text-align: center;">
                    <i class="fas fa-eye"></i> Vista Previa del Cálculo
                </h4>
                ${deducedMessage}
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                    <div style="background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <div style="color: var(--gray); font-size: 0.85rem; margin-bottom: 5px;">
                            <i class="fas fa-percentage"></i> Merma
                        </div>
                        <div style="color: ${result.merma > 20 ? 'var(--danger)' : result.merma > 10 ? 'var(--warning)' : 'var(--success)'}; font-size: 1.8rem; font-weight: bold;">${result.merma}%</div>
                    </div>
                    <div style="background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <div style="color: var(--gray); font-size: 0.85rem; margin-bottom: 5px;">
                            <i class="fas fa-dollar-sign"></i> Costo Real/lb
                        </div>
                        <div style="color: var(--primary); font-size: 1.8rem; font-weight: bold;">$${result.realCostPerLb.toFixed(2)}</div>
                    </div>
                    <div style="background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <div style="color: var(--gray); font-size: 0.85rem; margin-bottom: 5px;">
                            <i class="fas fa-chart-line"></i> Pérdida
                        </div>
                        <div style="color: var(--warning); font-size: 1.8rem; font-weight: bold;">$${result.lossAmount.toFixed(2)}</div>
                    </div>
                    <div style="background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <div style="color: var(--gray); font-size: 0.85rem; margin-bottom: 5px;">
                            <i class="fas fa-calculator"></i> Costo Total
                        </div>
                        <div style="color: var(--secondary); font-size: 1.8rem; font-weight: bold;">$${result.totalCost.toFixed(2)}</div>
                    </div>
                </div>
                <div style="margin-top: 15px; padding: 12px; background: rgba(76, 175, 80, 0.1); border-radius: 8px; text-align: center;">
                    <div style="color: var(--gray); font-size: 0.85rem; margin-bottom: 5px;">Libras Perdidas</div>
                    <div style="color: var(--primary); font-size: 1.3rem; font-weight: bold;">${(result.liveWeight - result.processedWeight).toFixed(2)} lb</div>
                </div>
            `;
        } catch (error) {
            console.error('Error en updateMermaPreview:', error);
            preview.innerHTML = `
                <div style="background: #FFEBEE; padding: 15px; border-radius: 8px; text-align: center; color: var(--danger);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p style="margin: 0; font-weight: bold;">${error.message}</p>
                </div>
            `;
        } finally {
            this._updatingMerma = false;
        }
    },

    // Página de Estadísticas
    loadStatsPage() {
        const html = `
            <div class="page active" id="stats-page">
                <h2><i class="fas fa-chart-line"></i> Estadísticas de Ventas</h2>
                <p style="margin: 10px 0 20px; color: var(--gray);">Resumen de ventas y rendimiento</p>
                
                <div class="date-filter">
                    <input type="date" class="date-input" id="stats-date-filter" value="${this.currentDate}">
                    <button class="btn btn-outline" onclick="App.filterStatsByDate()">
                        <i class="fas fa-filter"></i> Filtrar
                    </button>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">Ventas</div>
                        <div class="stat-value" id="sales-today">0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Ganancia Neta</div>
                        <div class="stat-value" id="income-today">$0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Libras</div>
                        <div class="stat-value" id="weight-today">0 lb</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Peso Promedio</div>
                        <div class="stat-value" id="average-weight-today">0 lb</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Pollos</div>
                        <div class="stat-value" id="total-quantity-today">0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Clientes</div>
                        <div class="stat-value" id="active-clients">0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Pedidos Pend.</div>
                        <div class="stat-value" id="pending-orders-today">0</div>
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-money-bill-wave"></i> Precio de Merma</h3>
                    <div class="stat-value" id="merma-price-today" style="text-align: center; margin: 10px 0;">
                        No definido
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-user-chart"></i> Ventas por Cliente</h3>
                    <ul class="client-list" id="client-stats">
                        <!-- Las estadísticas por cliente se agregarán aquí dinámicamente -->
                    </ul>
                </div>
            </div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = html;
            StatsModule.updateStats(this.currentDate);
            
            // Configurar filtro de fecha
            const dateFilter = document.getElementById('stats-date-filter');
            if (dateFilter) {
                dateFilter.addEventListener('change', (e) => {
                    this.currentDate = e.target.value;
                });
            }
        }
    },

     // Página de Contabilidad
     loadAccountingPage() {
        const html = `
            <div class="page active" id="accounting-page">
                <h2><i class="fas fa-book"></i> Contabilidad</h2>
                <p style="margin: 10px 0 20px; color: var(--gray);">Resumen financiero y balance</p>
                
                <div class="date-filter">
                    <input type="date" class="date-input" id="accounting-date-filter" value="${this.currentDate}">
                    <button class="btn btn-outline" onclick="App.filterAccountingByDate()">
                        <i class="fas fa-filter"></i> Filtrar
                    </button>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">Ingresos Totales</div>
                        <div class="stat-value" id="total-income">$0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Costos Totales</div>
                        <div class="stat-value" id="total-costs">$0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Ganancia Neta</div>
                        <div class="stat-value" id="net-profit">$0</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Margen</div>
                        <div class="stat-value" id="profit-margin">0%</div>
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-info-circle"></i> Detalles de Costos</h3>
                    <div id="cost-details">
                        <!-- Los detalles de costos se agregarán aquí -->
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-plus-circle"></i> Registrar Gasto</h3>
                    <form id="expense-form">
                        <div class="form-group">
                            <label class="form-label" for="expense-date">Fecha del Gasto</label>
                            <input type="date" class="form-input" id="expense-date" value="${this.currentDate}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="expense-description">Descripción</label>
                            <input type="text" class="form-input" id="expense-description" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="expense-amount">Monto</label>
                            <input type="number" step="0.01" min="0.01" class="form-input" id="expense-amount" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="expense-category">Categoría</label>
                            <select class="form-input" id="expense-category" required>
                                <option value="insumos">Insumos</option>
                                <option value="mano_obra">Mano de Obra</option>
                                <option value="transporte">Transporte</option>
                                <option value="materia_prima">Materia Prima</option>
                                <option value="otros">Otros</option>
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">
                            <i class="fas fa-save"></i> Registrar Gasto
                        </button>
                    </form>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-list"></i> Gastos del ${this.currentDate}</h3>
                    <button class="btn btn-outline" onclick="console.log('Todos los gastos:', AccountingModule.expenses); Utils.showAlert('Total gastos: ' + AccountingModule.expenses.length + '. Ver consola (F12) para detalles', 'Debug: Gastos', 'info')" style="margin-bottom: 10px; width: 100%;">
                        <i class="fas fa-bug"></i> Debug: Ver Todos los Gastos
                    </button>
                    <ul class="sales-list" id="expenses-list">
                        <!-- Los gastos se agregarán aquí dinámicamente -->
                    </ul>
                </div>
            </div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = html;
            AccountingModule.updateAccounting(this.currentDate);
            AccountingModule.updateExpensesList(this.currentDate);
            
            // Configurar formulario de gasto
            const expenseForm = document.getElementById('expense-form');
            if (expenseForm) {
                expenseForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.addExpense();
                });
            }
            
            // Configurar filtro de fecha
            const dateFilter = document.getElementById('accounting-date-filter');
            if (dateFilter) {
                dateFilter.addEventListener('change', (e) => {
                    this.currentDate = e.target.value;
                });
            }
            
            // Inicializar select personalizado
            setTimeout(() => {
                if (typeof CustomSelect !== 'undefined') {
                    CustomSelect.init('expense-category', {
                        placeholder: 'Seleccionar categoría'
                    });
                }
            }, 100);
        }
    },

    // Página de Backup (NUEVA)
    async loadBackupPage() {
        // IMPORTANTE: Cargar credenciales de forma asíncrona ANTES de verificar
        await BackupModule.loadTelegramConfig();
        
        const stats = BackupModule.getBackupStats();
        const telegramConfigured = BackupModule.telegramBotToken && BackupModule.telegramChatId;
        
        const html = `
            <div class="page active" id="backup-page">
                <h2><i class="fas fa-database"></i> Backup y Restauración</h2>
                <p style="margin: 10px 0 20px; color: var(--gray);">Gestiona copias de seguridad de tus datos</p>
                
                <div class="card">
                    <h3><i class="fas fa-chart-pie"></i> Estadísticas de Datos</h3>
                    <div class="backup-stats">
                        <div class="backup-stat">
                            <div class="stat-label">Clientes</div>
                            <div class="stat-value">${stats.totalClients}</div>
                        </div>
                        <div class="backup-stat">
                            <div class="stat-label">Ventas</div>
                            <div class="stat-value">${stats.totalSales}</div>
                        </div>
                        <div class="backup-stat">
                            <div class="stat-label">Pedidos</div>
                            <div class="stat-value">${stats.totalOrders}</div>
                        </div>
                        <div class="backup-stat">
                            <div class="stat-label">Gastos</div>
                            <div class="stat-value">${stats.totalExpenses}</div>
                        </div>
                        <div class="backup-stat">
                            <div class="stat-label">Precios Merma</div>
                            <div class="stat-value">${stats.totalPrices}</div>
                        </div>
                        <div class="backup-stat">
                            <div class="stat-label">Tamaño Total</div>
                            <div class="stat-value">${stats.totalSize}</div>
                        </div>
                    </div>
                    <p style="text-align: center; margin-top: 10px; color: var(--gray); font-size: 0.9rem;">
                        <i class="fas fa-clock"></i> Último backup: ${stats.lastBackup}
                    </p>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-download"></i> Crear Backup</h3>
                    <p>Crea una copia de seguridad de todos tus datos.</p>
                    <div class="backup-actions">
                        <button class="btn btn-primary" onclick="App.createBackup()">
                            <i class="fas fa-save"></i> Crear Backup
                        </button>
                        <button class="btn btn-outline" onclick="App.exportAsJSON()">
                            <i class="fas fa-file-export"></i> Exportar JSON
                        </button>
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-upload"></i> Restaurar Backup</h3>
                    <p>Restaura datos desde un archivo de backup.</p>
                    <div class="backup-actions">
                        <input type="file" id="backup-file" accept=".json" style="display: none;" 
                               onchange="App.restoreFromFile(this.files[0])">
                        <button class="btn btn-warning" onclick="document.getElementById('backup-file').click()">
                            <i class="fas fa-file-import"></i> Seleccionar Archivo
                        </button>
                        <button class="btn btn-danger" onclick="App.clearAllData()">
                            <i class="fas fa-trash"></i> Limpiar Datos
                        </button>
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-file-pdf"></i> Generar Reportes</h3>
                    <p>Genera reportes PDF de ventas por período.</p>
                    <div class="backup-actions">
                        <button class="btn btn-success" onclick="App.generateReport()">
                            <i class="fas fa-chart-line"></i> Generar Reporte PDF
                        </button>
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fab fa-telegram"></i> Backup a Telegram</h3>
                    ${telegramConfigured ? `
                        <p style="margin-bottom: 15px; color: var(--success);">
                            <i class="fas fa-check-circle"></i> Telegram configurado correctamente
                        </p>
                        <div class="backup-actions">
                            <button class="btn btn-primary" onclick="App.sendBackupToTelegram()">
                                <i class="fab fa-telegram"></i> Enviar Backup
                            </button>
                            <button class="btn btn-outline" onclick="App.testTelegramConnection()">
                                <i class="fas fa-plug"></i> Probar Conexión
                            </button>
                        </div>
                        <div style="margin-top: 10px;">
                            <button class="btn btn-danger" onclick="App.clearTelegramConfig()" style="width: 100%; font-size: 0.9rem;">
                                <i class="fas fa-trash"></i> Eliminar Configuración
                            </button>
                        </div>
                    ` : `
                        <p style="margin-bottom: 15px; color: var(--gray);">
                            <i class="fas fa-info-circle"></i> Configura tu bot de Telegram para enviar backups automáticos
                        </p>
                        
                        <div style="background: var(--card-bg); padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid var(--primary);">
                            <h4 style="margin: 0 0 10px 0; font-size: 0.95rem;">📋 Instrucciones:</h4>
                            <ol style="margin: 0; padding-left: 20px; font-size: 0.9rem; line-height: 1.6;">
                                <li>Abre <a href="https://t.me/BotFather" target="_blank" style="color: var(--primary);">@BotFather</a> en Telegram</li>
                                <li>Envía el comando <code>/newbot</code></li>
                                <li>Sigue las instrucciones y copia el <strong>token</strong></li>
                                <li>Abre <a href="https://t.me/userinfobot" target="_blank" style="color: var(--primary);">@userinfobot</a></li>
                                <li>Copia tu <strong>Chat ID</strong></li>
                                <li>Ingresa ambos datos abajo</li>
                            </ol>
                        </div>
                        
                        <div style="margin-bottom: 10px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 500;">
                                <i class="fas fa-key"></i> Bot Token:
                            </label>
                            <input type="text" id="telegram-token" placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" 
                                   style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text);">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 500;">
                                <i class="fas fa-user"></i> Chat ID:
                            </label>
                            <input type="text" id="telegram-chatid" placeholder="123456789" 
                                   style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text);">
                        </div>
                        
                        <button class="btn btn-primary" onclick="App.saveTelegramConfig()" style="width: 100%;">
                            <i class="fas fa-save"></i> Guardar Configuración
                        </button>
                    `}
                </div>
                
                ${telegramConfigured ? `
                <div class="card">
                    <h3><i class="fas fa-robot"></i> Backup Automático</h3>
                    <p style="margin-bottom: 15px; color: var(--gray);">
                        <i class="fas fa-clock"></i> El backup automático se ejecuta todos los días a las <strong>10:00 PM</strong>
                    </p>
                    <div style="background: var(--card-bg); padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid var(--success);">
                        <p style="margin: 0; font-size: 0.9rem; line-height: 1.6;">
                            ✅ El sistema verifica automáticamente si hay cambios en los datos<br>
                            ✅ Solo crea backup si detecta cambios (evita duplicados)<br>
                            ✅ Usa el mismo método que el backup manual<br>
                            ✅ Envía el backup a tu Telegram configurado
                        </p>
                    </div>
                    <button class="btn btn-success" onclick="App.testAutoBackup()" style="width: 100%;">
                        <i class="fas fa-robot"></i> 🤖 Probar Backup Automático
                    </button>
                    <p style="margin-top: 10px; text-align: center; color: var(--gray); font-size: 0.85rem;">
                        Este botón ejecuta el mismo backup que se enviará a las 10 PM
                    </p>
                </div>
                ` : ''}
            </div>
        `;
        
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = html;
        }
    },

    // Página de Rutas (MEJORADA)
    loadRutasPage() {
        const html = `
            <div class="page active" id="rutas-page">
                <h2><i class="fas fa-route"></i> Optimización de Rutas</h2>
                <p style="margin: 10px 0 20px; color: var(--gray);">Optimiza las rutas de entrega para clientes</p>
                
                <!-- NUEVO: Mapa permanente siempre visible -->
                <div class="card" style="margin-bottom: 20px;">
                    <h3><i class="fas fa-map-marked-alt"></i> Mapa de Ruta</h3>
                    <div id="mapa-ruta-permanente" style="height: 400px; width: 100%; border-radius: 8px; overflow: hidden; margin-top: 15px;"></div>
                    <div class="controles-mapa">
                        <button class="btn btn-primary" onclick="RutasModule.actualizarMapa()">
                            <i class="fas fa-sync-alt"></i> Actualizar Ruta
                        </button>
                        <button class="btn btn-outline" onclick="RutasModule.generarRutaOptima()">
                            <i class="fas fa-route"></i> Re-optimizar Ruta
                        </button>
                        <button class="btn btn-outline" onclick="RutasModule.limpiarMapa()">
                            <i class="fas fa-trash"></i> Limpiar Mapa
                        </button>
                        <button class="btn btn-outline" onclick="App.loadPage('orders')">
                            <i class="fas fa-plus"></i> Agregar Pedidos
                        </button>
                    </div>
                    <div class="leyenda-colores">
                        <div class="leyenda-item">
                            <div class="leyenda-color pendiente"></div>
                            <span>Pendiente</span>
                        </div>
                        <div class="leyenda-item">
                            <div class="leyenda-color entregado"></div>
                            <span>Entregado</span>
                        </div>
                        <div class="leyenda-item">
                            <div class="leyenda-color cancelado"></div>
                            <span>Cancelado</span>
                        </div>
                    </div>
                </div>
                
                <div class="card" style="margin-bottom: 20px;">
                    <h3><i class="fas fa-directions"></i> Información de la Ruta</h3>
                    <div id="ruta-detalles">
                        <!-- Los detalles de la ruta se mostrarán aquí dinámicamente -->
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-users"></i> Clientes para Entrega</h3>
                    <div id="clientes-ruta">
                        <!-- Lista de clientes para entrega -->
                    </div>
                </div>
            </div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = html;
            
            // Inicializar mapa automáticamente al cargar la página
            setTimeout(() => {
                RutasModule.inicializarMapa();
                RutasModule.actualizarMapa();
            }, 100);
        }
    },

    // Métodos de negocio
    async getCurrentLocation() {
        try {
            Utils.showLoading(true);
            const location = await LocationModule.getLocation();
            LocationModule.setCurrentLocation(location.address, location.latitude, location.longitude);
            Utils.showNotification('Ubicación obtenida correctamente', 'success', 5000);
        } catch (error) {
            LocationModule.setCurrentLocation(error);
            Utils.showNotification(error, 'error', 5000);
        } finally {
            Utils.showLoading(false);
        }
    },

    async addClient() {
        const name = document.getElementById('client-name');
        const phone = document.getElementById('client-phone');
        const address = document.getElementById('client-address');
        
        if (!name || !phone || !address) {
            Utils.showNotification('Complete todos los campos', 'error', 5000);
            return;
        }

        const nameValue = name.value.trim();
        const phoneValue = phone.value.trim();
        const addressValue = address.value.trim();
        
        if (!nameValue || !phoneValue || !addressValue) {
            Utils.showNotification('Complete todos los campos', 'error', 5000);
            return;
        }
        
        // Verificar duplicados
        const duplicate = ClientsModule.findDuplicate(nameValue, phoneValue, addressValue);
        if (duplicate) {
            const confirmed = await Utils.showDangerConfirm(
                `Ya existe un cliente con datos similares:<br><br>
                <strong>Nombre:</strong> ${duplicate.name}<br>
                <strong>Teléfono:</strong> ${duplicate.phone}<br>
                <strong>Dirección:</strong> ${duplicate.address}<br><br>
                ¿Deseas guardar este cliente de todas formas?`,
                '⚠️ Cliente Duplicado Detectado',
                'Guardar de Todas Formas'
            );
            
            if (!confirmed) {
                return;
            }
        }
        
        // Usar ubicación seleccionada si existe, si no usar la actual
        let locationData = this.selectedAddress || LocationModule.getCurrentLocation().address;
        let coordinates = this.selectedCoordinates || LocationModule.getCurrentLocation();

        const client = ClientsModule.addClient(nameValue, phoneValue, addressValue, locationData, coordinates);
        ClientsModule.updateClientList();
        ClientsModule.updateClientSelect();
        
        // Limpiar formulario después de guardar exitosamente
        document.getElementById('client-form').reset();
        Utils.showNotification(`Cliente ${nameValue} agregado correctamente`, 'success', 5000);
        
        // Limpiar ubicación seleccionada
        this.selectedCoordinates = null;
        this.selectedAddress = '';
        
        // Actualizar contador
        this.updateClientCount();
    },
    
    filterClients(searchText) {
        const search = searchText.toLowerCase().trim();
        const clientItems = document.querySelectorAll('.client-list .client-item');
        let visibleCount = 0;
        
        clientItems.forEach(item => {
            const name = item.querySelector('.client-name')?.textContent.toLowerCase() || '';
            const phone = item.querySelector('.client-phone')?.textContent.toLowerCase() || '';
            const address = item.querySelector('.client-address')?.textContent.toLowerCase() || '';
            
            const matches = name.includes(search) || phone.includes(search) || address.includes(search);
            
            if (matches) {
                item.style.display = '';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });
        
        // Actualizar contador
        const filteredSpan = document.getElementById('client-filtered');
        if (search) {
            filteredSpan.textContent = `${visibleCount} encontrados`;
            filteredSpan.style.display = 'inline';
        } else {
            filteredSpan.style.display = 'none';
        }
    },
    
    updateClientCount() {
        const countSpan = document.getElementById('client-count');
        if (countSpan) {
            const total = ClientsModule.clients.filter(c => c.isActive !== false).length;
            countSpan.textContent = `${total} cliente${total !== 1 ? 's' : ''}`;
        }
    },

    deleteClient(id) {
        ClientsModule.archiveClient(id);
        ClientsModule.updateClientList();
        ClientsModule.updateClientSelect();
    },

    addSale() {
        const saleDate = document.getElementById('sale-date').value;
        const clientId = parseInt(document.getElementById('sale-client').value);
        const weight = parseFloat(document.getElementById('sale-weight').value);
        const quantity = parseInt(document.getElementById('sale-quantity').value);
        const price = document.getElementById('sale-price').value ? 
                     parseFloat(document.getElementById('sale-price').value) : null;
        const paymentMethod = document.getElementById('sale-payment-method').value;
        const initialPayment = document.getElementById('sale-initial-payment').value ? 
                              parseFloat(document.getElementById('sale-initial-payment').value) : 0;

        if (!saleDate) {
            Utils.showNotification('Selecciona una fecha', 'error', 5000);
            return;
        }

        if (!clientId) {
            Utils.showNotification('Selecciona un cliente', 'error', 5000);
            return;
        }

        if (!weight || weight <= 0) {
            Utils.showNotification('Ingrese un peso válido en libras', 'error', 5000);
            return;
        }

        if (!quantity || quantity <= 0) {
            Utils.showNotification('Ingrese una cantidad válida de pollos', 'error', 5000);
            return;
        }

        // Validar abono inicial si es crédito
        if (paymentMethod === 'credit' && initialPayment > 0) {
            const mermaPrice = MermaModule.getTodayMermaPrice();
            const salePrice = price || mermaPrice || 0;
            const total = weight * salePrice;
            
            if (initialPayment > total) {
                Utils.showNotification('El abono inicial no puede ser mayor al total', 'error', 5000);
                return;
            }
        }

        const isPaid = paymentMethod === 'cash';
        const sale = SalesModule.addSale(clientId, weight, quantity, price, saleDate, isPaid, initialPayment);
        
        // NUEVO: Notificación automática ok
        const client = ClientsModule.getClientById(clientId);
        if (client) {
            this.notifyNewSale(sale, client);
        }
        
        document.getElementById('sale-form').reset();
        // Restaurar la fecha al valor actual
        document.getElementById('sale-date').value = this.currentDate;
        // Ocultar vista previa
        const preview = document.getElementById('sale-preview');
        if (preview) preview.style.display = 'none';
        
        SalesModule.updateSalesList(this.currentDate);
        
        // Mostrar recibo
        this.showReceipt(sale.id);
        
        // Actualizar estadísticas y contabilidad
        StatsModule.updateStats(this.currentDate);
        AccountingModule.updateAccounting(this.currentDate);
        
        // NUEVO: Actualizar diezmos automáticamente si estamos en esa página
        if (this.currentPage === 'diezmos') {
            this.updateDiezmosPreview();
        }
        
        let paymentStatus = isPaid ? 'Pagado' : 'A Crédito';
        if (!isPaid && initialPayment > 0) {
            paymentStatus = `Crédito con abono de ${Utils.formatCurrency(initialPayment)}`;
        }
        Utils.showNotification(`Venta registrada: ${Utils.formatCurrency(sale.total)} (${paymentStatus})`, 'success', 5000);
        
        // Actualizar badges de créditos
        CreditosModule.updateCreditBadges();
    },

    // NUEVO: Mostrar/ocultar campo de abono inicial
    toggleInitialPayment() {
        const paymentMethod = document.getElementById('sale-payment-method').value;
        const initialPaymentGroup = document.getElementById('initial-payment-group');
        
        if (initialPaymentGroup) {
            if (paymentMethod === 'credit') {
                initialPaymentGroup.style.display = 'block';
            } else {
                initialPaymentGroup.style.display = 'none';
                document.getElementById('sale-initial-payment').value = '';
            }
        }
    },

    // NUEVO: Actualizar vista previa de venta en tiempo real
    updateSalePreview() {
        const weight = parseFloat(document.getElementById('sale-weight').value) || 0;
        const quantity = parseInt(document.getElementById('sale-quantity').value) || 0;
        const priceInput = document.getElementById('sale-price').value;
        
        const preview = document.getElementById('sale-preview');
        if (!preview) return;
        
        // Mostrar vista previa solo si hay datos
        if (weight > 0 || quantity > 0) {
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
            return;
        }
        
        // Calcular peso promedio
        const avgWeight = quantity > 0 ? (weight / quantity) : 0;
        document.getElementById('preview-avg-weight').textContent = avgWeight.toFixed(2) + ' lb/pollo';
        
        // Determinar precio (usar precio ingresado o precio de merma)
        const mermaPrice = MermaModule.getTodayMermaPrice();
        const price = priceInput ? parseFloat(priceInput) : (mermaPrice || 0);
        
        // Mostrar precio con indicador de origen
        const priceText = priceInput ? 
            `$${price.toFixed(2)}` : 
            (mermaPrice ? `$${price.toFixed(2)} (merma)` : '$0.00 (sin precio)');
        document.getElementById('preview-price').textContent = priceText;
        
        // Calcular total
        const total = weight * price;
        document.getElementById('preview-total').textContent = Utils.formatCurrency(total);
        
        // Cambiar color del total según si es válido
        const totalElement = document.getElementById('preview-total');
        if (total > 0 && weight > 0 && quantity > 0 && price > 0) {
            totalElement.style.color = 'var(--success)';
        } else {
            totalElement.style.color = 'var(--gray)';
        }
    },

    // NUEVO: Mostrar/ocultar formulario rápido de cliente
    toggleQuickClientForm() {
        const form = document.getElementById('quick-client-form');
        if (!form) return;
        
        if (form.style.display === 'none') {
            form.style.display = 'block';
            form.style.animation = 'fadeIn 0.3s';
            document.getElementById('quick-client-name').focus();
        } else {
            form.style.display = 'none';
            // Limpiar campos
            document.getElementById('quick-client-name').value = '';
            document.getElementById('quick-client-phone').value = '';
            document.getElementById('quick-client-address').value = '';
        }
    },

    // NUEVO: Guardar cliente rápido con ubicación automática
    async saveQuickClient() {
        const name = document.getElementById('quick-client-name').value.trim();
        const phone = document.getElementById('quick-client-phone').value.trim();
        const address = document.getElementById('quick-client-address').value.trim() || 'Sin dirección';
        
        if (!name || !phone) {
            Utils.showNotification('Ingresa nombre y teléfono', 'error', 3000);
            return;
        }
        
        Utils.showLoading(true);
        
        try {
            // Intentar crear cliente con ubicación automática
            const client = await ClientsModule.createQuickClient(name, phone);
            
            // Actualizar select de clientes
            ClientsModule.updateClientSelect();
            
            // Seleccionar el nuevo cliente automáticamente
            const clientSelect = document.getElementById('sale-client');
            if (clientSelect) {
                clientSelect.value = client.id;
            }
            
            // Ocultar formularios
            this.toggleQuickClientForm();
            
        } catch (error) {
            Utils.showNotification('Error al crear cliente: ' + error.message, 'error', 3000);
        } finally {
            Utils.showLoading(false);
        }
    },

    // NUEVO: Métodos para formulario rápido en pedidos
    toggleQuickClientFormOrder() {
        const form = document.getElementById('quick-client-form-order');
        if (!form) return;
        
        if (form.style.display === 'none') {
            form.style.display = 'block';
            form.style.animation = 'fadeIn 0.3s';
            document.getElementById('quick-client-name-order').focus();
        } else {
            form.style.display = 'none';
            document.getElementById('quick-client-name-order').value = '';
            document.getElementById('quick-client-phone-order').value = '';
            document.getElementById('quick-client-address-order').value = '';
        }
    },

    async saveQuickClientOrder() {
        const name = document.getElementById('quick-client-name-order').value.trim();
        const phone = document.getElementById('quick-client-phone-order').value.trim();
        const address = document.getElementById('quick-client-address-order').value.trim() || 'Sin dirección';
        
        if (!name || !phone) {
            Utils.showNotification('Ingresa nombre y teléfono', 'error', 3000);
            return;
        }
        
        Utils.showLoading(true);
        
        try {
            // Intentar crear cliente con ubicación automática
            const client = await ClientsModule.createQuickClient(name, phone);
            
            ClientsModule.updateClientSelect();
            
            const clientSelect = document.getElementById('order-client');
            if (clientSelect) {
                clientSelect.value = client.id;
            }
            
            this.toggleQuickClientFormOrder();
            
        } catch (error) {
            Utils.showNotification('Error al crear cliente: ' + error.message, 'error', 3000);
        } finally {
            Utils.showLoading(false);
        }
    },

    addOrder() {
        const clientId = parseInt(document.getElementById('order-client').value);
        const weight = parseFloat(document.getElementById('order-weight').value);
        const quantity = parseInt(document.getElementById('order-quantity').value);
        const price = document.getElementById('order-price').value ? 
                     parseFloat(document.getElementById('order-price').value) : null;
        const deliveryDate = document.getElementById('order-delivery-date').value;
        const notes = document.getElementById('order-notes').value;

        if (!clientId) {
            Utils.showNotification('Selecciona un cliente', 'error', 5000);
            return;
        }

        if (!weight || weight <= 0) {
            Utils.showNotification('Ingrese un peso válido en libras', 'error', 5000);
            return;
        }

        if (!quantity || quantity <= 0) {
            Utils.showNotification('Ingrese una cantidad válida de pollos', 'error', 5000);
            return;
        }

        const order = OrdersModule.addOrder(clientId, weight, quantity, price, deliveryDate, notes);
        
        // NUEVO: Notificación automática
        const client = ClientsModule.getClientById(clientId);
        if (client) {
            this.notifyNewOrder(order, client);
        }
        
        // NUEVO: Limpiar formulario después de guardar exitosamente
        document.getElementById('order-form').reset();
        OrdersModule.updateOrdersList();
        
        // ACTUALIZACIÁ“N: Actualizar mapas automáticamente
        this.actualizarMapasAutomaticamente();
        
        Utils.showNotification(`Pedido registrado: ${Utils.formatCurrency(order.total)}`, 'success', 5000);
    },

    filterOrders(status) {
        const buttons = document.querySelectorAll('.status-btn');
        buttons.forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.status-btn[onclick*="${status}"]`).classList.add('active');
        OrdersModule.updateOrdersList(status === 'all' ? null : status);
    },

    showReceipt(saleId) {
        const sale = SalesModule.getSaleById(saleId);
        if (!sale) return;

        const client = ClientsModule.getClientById(sale.clientId);
        if (!client) return;

        // Guardar ID para descargar PDF
        this.currentReceiptSaleId = saleId;

        // Actualizar datos del recibo
        document.getElementById('receipt-date').textContent = `${sale.date} ${sale.time}`;
        document.getElementById('receipt-client').textContent = client.name;
        document.getElementById('receipt-phone').textContent = client.phone;
        document.getElementById('receipt-weight').textContent = sale.weight.toFixed(2);
        document.getElementById('receipt-quantity').textContent = sale.quantity;
        document.getElementById('receipt-average-weight').textContent = sale.averageWeight;
        document.getElementById('receipt-price').textContent = sale.price.toFixed(2);
        document.getElementById('receipt-total').textContent = sale.total.toFixed(2);

        // Mostrar recibo
        const receipt = document.getElementById('receipt-preview');
        if (receipt) {
            receipt.style.display = 'block';
            this.isReceiptOpen = true;
            window.scrollTo(0, 0);
        }
    },

    // NOTIFICACIONES PUSH - CORREGIDO
    async initPushNotifications() {
        console.log('🔔 Inicializando notificaciones push...');
        
        if (typeof PushNotifications === 'undefined') {
            console.error('❌ PushNotifications no está definido');
            return false;
        }

        try {
            const initialized = await PushNotifications.init();
            
            if (initialized) {
                console.log('✅ Sistema de notificaciones inicializado');
                return true;
            } else {
                console.warn('⚠️ No se pudieron inicializar las notificaciones');
                return false;
            }
        } catch (error) {
            console.error('❌ Error inicializando notificaciones:', error);
            return false;
        }
    },

    async requestNotificationPermission() {
        console.log('🔔 Solicitando permisos de notificación...');
        
        if (Notification.permission === 'granted') {
            console.log('✅ Permisos ya concedidos');
            return true;
        }

        if (Notification.permission === 'denied') {
            console.log('❌ Permisos denegados');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            console.log('🔔 Resultado de permisos:', permission);
            
            if (permission === 'granted') {
                Utils.showNotification('✅ Notificaciones activadas', 'success', 3000);
                // Mostrar notificación de prueba
                setTimeout(() => {
                    this.showLocalNotification(
                        '🐔 GallOli - Notificaciones Activas',
                        'Las notificaciones están funcionando correctamente'
                    );
                }, 1000);
                return true;
            } else {
                console.log('❌ Permisos no concedidos:', permission);
                return false;
            }
        } catch (error) {
            console.error('❌ Error solicitando permisos:', error);
            return false;
        }
    },

    // Enviar notificación local - CORREGIDO
    showLocalNotification(title, body, icon = '🐔') {
        console.log('🔔 Intentando mostrar notificación:', title, body);
        
        if (Notification.permission !== 'granted') {
            console.log('❌ Sin permisos para notificaciones');
            return false;
        }

        try {
            const notification = new Notification(title, {
                body: body,
                icon: './icons/icon-192x192.png',
                badge: './icons/icon-72x72.png',
                tag: 'galloapp-' + Date.now(),
                renotify: true,
                requireInteraction: false,
                silent: false,
                vibrate: [200, 100, 200]
            });

            // Auto-cerrar después de 5 segundos
            setTimeout(() => {
                notification.close();
            }, 5000);

            console.log('✅ Notificación mostrada correctamente');
            return true;
        } catch (error) {
            console.error('❌ Error mostrando notificación:', error);
            return false;
        }
    },

    // Notificaciones automáticas para eventos importantes - CORREGIDO
    notifyNewSale(sale, client) {
        console.log('💰 Notificando nueva venta:', sale.id);
        this.showLocalNotification(
            '💰 Nueva Venta Registrada',
            `${client.name}: ${Utils.formatCurrency(sale.total)} - ${sale.weight}lb`
        );
    },

    notifyNewOrder(order, client) {
        console.log('📋 Notificando nuevo pedido:', order.id);
        this.showLocalNotification(
            '📋 Nuevo Pedido',
            `${client.name}: ${order.weight}lb - ${order.quantity} pollos`
        );
    },

    notifyDailyReminder() {
        const todaySales = SalesModule.getTodaySales();
        const totalIncome = todaySales.reduce((sum, sale) => sum + sale.total, 0);
        
        this.showLocalNotification(
            '📊 Resumen del Día',
            `${todaySales.length} ventas - ${Utils.formatCurrency(totalIncome)}`
        );
    },

    // Configurar recordatorio diario
    setupDailyReminder() {
        // Recordatorio a las 8 PM todos los días
        const now = new Date();
        const reminder = new Date();
        reminder.setHours(20, 0, 0, 0);
        
        if (reminder <= now) {
            reminder.setDate(reminder.getDate() + 1);
        }
        
        const timeUntilReminder = reminder.getTime() - now.getTime();
        
        setTimeout(() => {
            this.notifyDailyReminder();
            setInterval(() => {
                this.notifyDailyReminder();
            }, 24 * 60 * 60 * 1000);
        }, timeUntilReminder);
    },

    // Métodos para activar/desactivar notificaciones desde la UI - CORREGIDO
    async enableNotifications() {
        const enabled = await this.requestNotificationPermission();
        if (enabled) {
            Utils.showNotification('✅ Notificaciones activadas correctamente', 'success', 3000);
        } else {
            Utils.showNotification('❌ No se pudieron activar las notificaciones', 'error', 3000);
        }
        
        // Actualizar estado en la UI
        setTimeout(() => {
            this.updateNotificationStatus();
        }, 500);
        
        return enabled;
    },

    disableNotifications() {
        Utils.showNotification('🔕 Notificaciones desactivadas', 'warning', 3000);
    },

    testNotification() {
        console.log('🧪 Probando notificación...');
        const success = this.showLocalNotification(
            '🐔 Notificación de Prueba',
            'Las notificaciones están funcionando correctamente en GallOli'
        );
        
        if (!success) {
            Utils.showNotification('❌ Error: Activa los permisos de notificación primero', 'error', 5000);
        }
    },

    // NUEVO: Actualizar estado de notificaciones en la UI
    updateNotificationStatus() {
        const statusDiv = document.getElementById('notification-status');
        const enableBtn = document.getElementById('enable-notifications-btn');
        const testBtn = document.getElementById('test-notification-btn');
        
        if (!statusDiv) return;
        
        if (!('Notification' in window)) {
            statusDiv.style.background = '#FFEBEE';
            statusDiv.style.color = '#C62828';
            statusDiv.innerHTML = '<i class="fas fa-times-circle"></i> Notificaciones no soportadas';
            if (enableBtn) enableBtn.disabled = true;
            if (testBtn) testBtn.disabled = true;
            return;
        }
        
        const permission = Notification.permission;
        
        switch (permission) {
            case 'granted':
                statusDiv.style.background = '#E8F5E9';
                statusDiv.style.color = '#2E7D32';
                statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> Notificaciones activas';
                if (enableBtn) {
                    enableBtn.disabled = true;
                    enableBtn.innerHTML = '<i class="fas fa-check"></i> Activadas';
                }
                if (testBtn) testBtn.disabled = false;
                break;
                
            case 'denied':
                statusDiv.style.background = '#FFEBEE';
                statusDiv.style.color = '#C62828';
                statusDiv.innerHTML = '<i class="fas fa-times-circle"></i> Permisos denegados';
                if (enableBtn) enableBtn.disabled = true;
                if (testBtn) testBtn.disabled = true;
                break;
                
            default:
                statusDiv.style.background = '#FFF3E0';
                statusDiv.style.color = '#E65100';
                statusDiv.innerHTML = '<i class="fas fa-question-circle"></i> Permisos pendientes';
                if (enableBtn) enableBtn.disabled = false;
                if (testBtn) testBtn.disabled = true;
                break;
        }
    },

    closeReceipt() {
        const receipt = document.getElementById('receipt-preview');
        if (receipt) {
            receipt.style.display = 'none';
            // Limpiar datos del recibo
            document.getElementById('receipt-date').textContent = '';
            document.getElementById('receipt-client').textContent = '';
            document.getElementById('receipt-phone').textContent = '';
            document.getElementById('receipt-weight').textContent = '';
            document.getElementById('receipt-quantity').textContent = '';
            document.getElementById('receipt-average-weight').textContent = '';
            document.getElementById('receipt-price').textContent = '';
            document.getElementById('receipt-total').textContent = '';
        }
        this.isReceiptOpen = false;
    },

    async downloadReceipt() {
        if (!this.currentReceiptSaleId) {
            Utils.showNotification('Error: No hay recibo para descargar', 'error', 3000);
            return;
        }

        const sale = SalesModule.getSaleById(this.currentReceiptSaleId);
        if (!sale) {
            Utils.showNotification('Error: Venta no encontrada', 'error', 3000);
            return;
        }

        const client = ClientsModule.getClientById(sale.clientId);
        if (!client) {
            Utils.showNotification('Error: Cliente no encontrado', 'error', 3000);
            return;
        }

        Utils.showLoading(true);

        try {
            await PDFGenerator.generateReceipt(sale, client);
            Utils.showNotification('Recibo descargado correctamente', 'success', 3000);
        } catch (error) {
            console.error('Error generando PDF:', error);
            Utils.showNotification('Error al generar el PDF', 'error', 3000);
        } finally {
            Utils.showLoading(false);
        }
    },


    // Métodos del mapa
    openMapModal() {
        const modal = document.getElementById('map-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
            
            // Obtener ubicación actual y luego inicializar mapa
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        setTimeout(() => {
                            MapModule.initMap(lat, lng);
                        }, 100);
                    },
                    (error) => {
                        // Si falla, usar ubicación por defecto (Ciudad de México)
                        console.warn('No se pudo obtener ubicación:', error);
                        setTimeout(() => {
                            MapModule.initMap(19.4326, -99.1332);
                        }, 100);
                    }
                );
            } else {
                // Si no hay geolocalización, usar ubicación por defecto
                setTimeout(() => {
                    MapModule.initMap(19.4326, -99.1332);
                }, 100);
            }
        }
    },

    // NUEVO: Abrir modal de mapa - SIMPLIFICADO
    showMapModal(lat = 14.6349, lng = -90.5069, mode = 'add') {
        // Este método ya no se usa para edición, solo para agregar nuevos clientes
        const modal = document.getElementById('map-modal');
        if (modal) {
            modal.classList.add('active');
            modal.style.display = 'flex';
            modal.style.zIndex = '9999';
            
            setTimeout(() => {
                MapModule.initMap(lat, lng);
                this.mapMode = mode;
            }, 100);
        }
    },

    closeMapModal() {
        const modal = document.getElementById('map-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
            
            // Limpiar datos del mapa
            const latInput = document.getElementById('map-latitude');
            const lngInput = document.getElementById('map-longitude');
            const addressInput = document.getElementById('map-address');
            
            if (latInput) latInput.value = '';
            if (lngInput) lngInput.value = '';
            if (addressInput) addressInput.value = '';
            
            // Destruir mapa
            MapModule.destroyMap();
        }
    },

    // Método general para cerrar todos los modales
    closeAllModals() {
        // Cerrar modal de mapa
        this.closeMapModal();
        
        // Cerrar recibo
        this.closeReceipt();
        
        // Cerrar cualquier otro modal que pueda estar abierto
        const allModals = document.querySelectorAll('.modal');
        allModals.forEach(modal => {
            modal.classList.remove('active');
            modal.style.display = 'none';
        });
        
        // Ocultar notificaciones
        Utils.hideNotification();
    },

    useCurrentLocation() {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                MapModule.setCurrentLocation(lat, lng);
                Utils.showNotification('Ubicación actual establecida', 'success', 3000);
            },
            (error) => {
                Utils.showNotification('No se pudo obtener la ubicación actual', 'error', 5000);
            }
        );
    },

    saveSelectedLocation() {
        const location = MapModule.getSelectedLocation();
        const address = document.getElementById('map-address').value;
        
        if (location) {
            // Solo para modo agregar nuevos clientes
            this.selectedCoordinates = location;
            this.selectedAddress = address;
            
            const locationElement = document.getElementById('current-location');
            if (locationElement) {
                locationElement.innerHTML = `<i class="fas fa-map-marker-alt location-icon"></i> ${address}`;
                locationElement.style.color = 'var(--success)';
            }
            
            Utils.showNotification('Ubicación guardada correctamente', 'success', 3000);
            this.closeMapModal();
        } else {
            Utils.showNotification('Selecciona una ubicación en el mapa', 'error', 5000);
        }
    },

    // Otros métodos
    filterSalesByDate() {
        const dateInput = document.getElementById('sales-date-filter');
        if (dateInput) {
            this.currentDate = dateInput.value;
        }
        SalesModule.updateSalesList(this.currentDate);
        Utils.showNotification(`Mostrando ventas del ${this.currentDate}`, 'info', 2000);
    },

    filterStatsByDate() {
        const dateInput = document.getElementById('stats-date-filter');
        if (dateInput) {
            this.currentDate = dateInput.value;
        }
        StatsModule.updateStats(this.currentDate);
        Utils.showNotification(`Mostrando estadísticas del ${this.currentDate}`, 'info', 2000);
    },

    filterAccountingByDate() {
        const dateInput = document.getElementById('accounting-date-filter');
        if (dateInput) {
            this.currentDate = dateInput.value;
        }
        AccountingModule.updateAccounting(this.currentDate);
        AccountingModule.updateExpensesList(this.currentDate);
        Utils.showNotification(`Mostrando contabilidad del ${this.currentDate}`, 'info', 2000);
    },

    // NUEVO: Método para calcular y guardar merma con recalculación
    async calculateAndSaveMerma() {
        const mermaDate = document.getElementById('merma-date').value;
        const liveWeightInput = document.getElementById('live-weight').value.trim();
        const liveCostInput = document.getElementById('live-cost').value.trim();
        const processedWeightInput = document.getElementById('processed-weight').value.trim();
        const chickenCountInput = document.getElementById('chicken-count').value.trim();
        const processingCostInput = document.getElementById('processing-cost-per-chicken').value.trim();
        const realCostInput = document.getElementById('real-cost-per-lb')?.value.trim();
        
        const liveWeight = liveWeightInput ? parseFloat(liveWeightInput) : 0;
        const liveCost = liveCostInput ? parseFloat(liveCostInput) : 0;
        const processedWeight = processedWeightInput ? parseFloat(processedWeightInput) : 0;
        const chickenCount = chickenCountInput ? parseInt(chickenCountInput) : 0;
        const processingCostPerChicken = processingCostInput ? parseFloat(processingCostInput) : 0;
        const realCostPerLb = realCostInput ? parseFloat(realCostInput) : 0;

        if (!mermaDate || !chickenCount || chickenCount <= 0) {
            Utils.showNotification('Fecha y cantidad de pollos son obligatorios', 'error', 5000);
            return;
        }

        Utils.showLoading(true);

        try {
            const totalProcessingCost = chickenCount * processingCostPerChicken;
            const result = MermaModule.calculateMerma(liveWeight, liveCost, processedWeight, totalProcessingCost, realCostPerLb);
            
            result.chickenCount = chickenCount;
            result.processingCostPerChicken = processingCostPerChicken;
            
            const record = await MermaModule.saveMermaRecord(result, mermaDate);
            const ventasRecalculadas = await MermaModule.recalcularVentasPorFecha(mermaDate);
            
            Utils.showLoading(false);
            
            let mensaje = `Merma guardada: ${result.merma}% - ${Utils.formatCurrency(result.realCostPerLb)}/lb`;
            if (result.deducedValue) {
                const labels = {
                    liveWeight: 'Peso vivo',
                    liveCost: 'Costo/lb vivo',
                    processedWeight: 'Peso pelado',
                    processingCost: 'Costo procesamiento',
                    realCostPerLb: 'Costo real/lb'
                };
                mensaje += ` | ${labels[result.deducedValue]} calculado`;
            }
            if (ventasRecalculadas > 0) {
                mensaje += ` | ${ventasRecalculadas} ventas recalculadas`;
            }
            
            Utils.showNotification(mensaje, 'success', 5000);
            
            // Notificación push
            if (NotificationsModule) {
                NotificationsModule.notify('merma', `Merma del día: ${result.merma}%`);
            }
            
            document.getElementById('merma-form').reset();
            this.loadMermaPage();
            
            StatsModule.updateStats(mermaDate);
            AccountingModule.updateAccounting(mermaDate);
            
            if (this.currentPage === 'diezmos') {
                this.updateDiezmosPreview();
            }
            
        } catch (error) {
            Utils.showLoading(false);
            Utils.showNotification('Error: ' + error.message, 'error', 5000);
        }
    },

    // NUEVO: Obtener HTML del historial de merma
    getMermaHistoryHTML() {
        const records = MermaModule.mermaRecords
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10); // Ášltimos 10 registros

        if (records.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-calculator empty-state-icon"></i>
                    <p>No hay registros de merma</p>
                </div>
            `;
        }

        let html = '<ul class="sales-list">';
        records.forEach(record => {
            const chickenInfo = record.chickenCount ? 
                `<p class="sale-details">
                    <i class="fas fa-drumstick-bite"></i> ${record.chickenCount} pollos procesados | 
                    <i class="fas fa-dollar-sign"></i> $${record.processingCostPerChicken ? record.processingCostPerChicken.toFixed(2) : '0.00'}/pollo
                </p>` : '';
            
            html += `
                <li class="sale-item">
                    <div class="sale-info">
                        <h3><i class="fas fa-calendar-day"></i> ${record.date}</h3>
                        <p class="sale-details">
                            <i class="fas fa-percentage"></i> Merma: ${record.merma}% | 
                            <i class="fas fa-dollar-sign"></i> Costo: ${Utils.formatCurrency(record.realCostPerLb)}/lb
                        </p>
                        <p class="sale-details">
                            <i class="fas fa-weight"></i> ${record.liveWeight} lb vivo â†’ ${record.processedWeight} lb pelado
                        </p>
                        ${chickenInfo}
                        <p class="sale-details">
                            <i class="fas fa-chart-line"></i> Pérdida: ${Utils.formatCurrency(record.lossAmount)}
                        </p>
                    </div>
                    <div style="text-align: right;">
                        <div class="sale-amount" style="color: var(--primary);">
                            ${Utils.formatCurrency(record.realCostPerLb)}/lb
                        </div>
                        <button class="btn btn-outline" onclick="App.editMermaRecord('${record.date}')" 
                                style="margin-top: 5px; padding: 5px 10px; font-size: 0.8rem;">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                    </div>
                </li>
            `;
        });
        html += '</ul>';
        return html;
    },

    // NUEVO: Editar registro de merma
    editMermaRecord(date) {
        this.currentDate = date;
        this.loadMermaPage();
        Utils.showNotification(`Editando merma del ${date}`, 'info', 3000);
    },

    addExpense() {
        const description = document.getElementById('expense-description').value;
        const amount = parseFloat(document.getElementById('expense-amount').value);
        const category = document.getElementById('expense-category').value;
        const expenseDate = document.getElementById('expense-date')?.value || this.currentDate;

        if (!description || !amount || amount <= 0) {
            Utils.showNotification('Ingrese datos válidos', 'error', 5000);
            return;
        }

        const expense = AccountingModule.addExpense(description, amount, category, expenseDate);
        AccountingModule.updateExpensesList(this.currentDate);
        AccountingModule.updateAccounting(this.currentDate);
        
        // NUEVO: Limpiar formulario después de guardar exitosamente
        document.getElementById('expense-form').reset();
        // Restaurar la fecha
        if (document.getElementById('expense-date')) {
            document.getElementById('expense-date').value = this.currentDate;
        }
        
        Utils.showNotification('Gasto registrado correctamente', 'success', 5000);
        
        // NUEVO: Actualizar diezmos automáticamente si estamos en esa página
        if (this.currentPage === 'diezmos') {
            this.updateDiezmosPreview();
        }
    },

    editExpense(expenseId) {
        const expense = AccountingModule.getExpenseById(expenseId);
        if (!expense) return;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-edit"></i> Editar Gasto</h3>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="edit-expense-form">
                        <div class="form-group">
                            <label class="form-label">Descripción</label>
                            <input type="text" class="form-input" id="edit-expense-description" 
                                   value="${expense.description}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Monto</label>
                            <input type="number" step="0.01" min="0.01" class="form-input" 
                                   id="edit-expense-amount" value="${expense.amount}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Categoría</label>
                            <select class="form-input" id="edit-expense-category" required>
                                <option value="insumos" ${expense.category === 'insumos' ? 'selected' : ''}>Insumos</option>
                                <option value="mano_obra" ${expense.category === 'mano_obra' ? 'selected' : ''}>Mano de Obra</option>
                                <option value="transporte" ${expense.category === 'transporte' ? 'selected' : ''}>Transporte</option>
                                <option value="materia_prima" ${expense.category === 'materia_prima' ? 'selected' : ''}>Materia Prima</option>
                                <option value="otros" ${expense.category === 'otros' ? 'selected' : ''}>Otros</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Fecha</label>
                            <input type="date" class="form-input" id="edit-expense-date" 
                                   value="${expense.date}" required>
                        </div>
                        <button type="submit" class="btn btn-success" style="width: 100%;">
                            <i class="fas fa-save"></i> Guardar Cambios
                        </button>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const form = modal.querySelector('#edit-expense-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const success = AccountingModule.editExpense(expenseId, {
                description: document.getElementById('edit-expense-description').value,
                amount: document.getElementById('edit-expense-amount').value,
                category: document.getElementById('edit-expense-category').value,
                date: document.getElementById('edit-expense-date').value
            });
            
            if (success) {
                AccountingModule.updateExpensesList(this.currentDate);
                AccountingModule.updateAccounting(this.currentDate);
                Utils.showNotification('Gasto actualizado correctamente', 'success', 3000);
                
                if (this.currentPage === 'diezmos') {
                    this.updateDiezmosPreview();
                }
            }
            
            modal.remove();
        });
    },

    async deleteExpense(expenseId) {
        const expense = AccountingModule.getExpenseById(expenseId);
        if (!expense) return;

        const confirmed = await Utils.showDangerConfirm(
            `¿Eliminar el gasto "${expense.description}" por ${Utils.formatCurrency(expense.amount)}?`,
            'Eliminar Gasto',
            'Eliminar'
        );
        
        if (confirmed) {
            AccountingModule.deleteExpense(expenseId);
            AccountingModule.updateExpensesList(this.currentDate);
            AccountingModule.updateAccounting(this.currentDate);
            Utils.showNotification('Gasto eliminado correctamente', 'success', 3000);
            
            if (this.currentPage === 'diezmos') {
                this.updateDiezmosPreview();
            }
        }
    },

    // Sidebar
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) {
            sidebar.classList.toggle('active');
        }
        if (overlay) {
            overlay.classList.toggle('active');
        }
    },

    // Sincronización y exportación
    syncData() {
        Utils.showNotification('Sincronizando datos...', 'info', 3000);
        // Aquí iría la lógica de sincronización con servidor
        setTimeout(() => {
            Utils.showNotification('Datos sincronizados correctamente', 'success', 3000);
        }, 2000);
    },

    exportData() {
        const data = {
            clients: ClientsModule.clients,
            sales: SalesModule.sales,
            orders: OrdersModule.orders,
            expenses: AccountingModule.expenses,
            mermaPrices: MermaModule.dailyPrices,
            diezmosRecords: DiezmosModule.records,
            diezmosConfig: DiezmosModule.config,
            exportDate: Utils.formatDateTime()
        };
        
        const dataStr = JSON.stringify(data, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `pollos_frescos_backup_${Utils.formatDate()}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        Utils.showNotification('Datos exportados correctamente', 'success', 5000);
    },

    // PWA
    setupPWA() {
        // Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').then(
                    (registration) => {
                        console.log('ServiceWorker registrado: ', registration.scope);
                    },
                    (err) => {
                        console.log('Error al registrar ServiceWorker: ', err);
                    }
                ).catch(err => {
                    console.log('Error en ServiceWorker:', err);
                });
            });
        }

        // Install Prompt - Corregido
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            setTimeout(async () => {
                if (deferredPrompt) {
                    const install = await Utils.showConfirm(
                        '¿Deseas instalar GallOli en tu dispositivo para uso sin conexión?',
                        '📱 Instalar Aplicación',
                        'Instalar',
                        'Ahora No'
                    );
                    
                    if (install) {
                        try {
                            deferredPrompt.prompt();
                            deferredPrompt.userChoice.then(() => {
                                deferredPrompt = null;
                            }).catch(() => {
                                deferredPrompt = null;
                            });
                        } catch (err) {
                            deferredPrompt = null;
                        }
                    } else {
                        deferredPrompt = null;
                    }
                }
            }, 10000);
        });
        
        // Suprimir errores de extensiones
        window.addEventListener('error', (e) => {
            if (e.message && (e.message.includes('extension') || e.message.includes('Could not establish connection'))) {
                e.preventDefault();
                return true;
            }
        });
    },

    // NUEVO: Actualizar vista previa de diezmos en tiempo real
    updateDiezmosPreview() {
        const diezmoPercent = parseFloat(document.getElementById('diezmo-percent')?.value) || DiezmosModule.config.diezmoPercent;
        const ofrendaPercent = parseFloat(document.getElementById('ofrenda-percent')?.value) || DiezmosModule.config.ofrendaPercent;
        
        // Obtener ganancia neta actual
        const netProfit = AccountingModule.getNetProfitByDate(this.currentDate);
        
        // Calcular diezmos con los valores actuales
        const diezmo = netProfit > 0 ? (netProfit * diezmoPercent) / 100 : 0;
        const ofrenda = netProfit > 0 ? (netProfit * ofrendaPercent) / 100 : 0;
        const total = diezmo + ofrenda;
        
        // Actualizar elementos de vista previa
        const previewIncome = document.getElementById('preview-income');
        const previewDiezmo = document.getElementById('preview-diezmo');
        const previewOfrenda = document.getElementById('preview-ofrenda');
        const previewTotal = document.getElementById('preview-total');
        const previewDiezmoLabel = document.getElementById('preview-diezmo-label');
        const previewOfrendaLabel = document.getElementById('preview-ofrenda-label');
        
        if (previewIncome) previewIncome.textContent = Utils.formatCurrency(netProfit);
        if (previewDiezmo) previewDiezmo.textContent = Utils.formatCurrency(diezmo);
        if (previewOfrenda) previewOfrenda.textContent = Utils.formatCurrency(ofrenda);
        if (previewTotal) previewTotal.textContent = Utils.formatCurrency(total);
        if (previewDiezmoLabel) previewDiezmoLabel.textContent = `Diezmo (${diezmoPercent}%)`;
        if (previewOfrendaLabel) previewOfrendaLabel.textContent = `Ofrenda (${ofrendaPercent}%)`;
    },
    
    saveDiezmosConfig() {
        const diezmoPercent = parseFloat(document.getElementById('diezmo-percent')?.value) || 10;
        const ofrendaPercent = parseFloat(document.getElementById('ofrenda-percent')?.value) || 5;
        
        DiezmosModule.updateConfig(diezmoPercent, ofrendaPercent);
        Utils.showNotification('Configuración guardada correctamente', 'success', 3000);
        // Actualizar vista previa inmediatamente
        this.updateDiezmosPreview();
    },

    // NUEVO: Auto-guardar configuración sin notificación
    autoSaveDiezmosConfig() {
        const diezmoPercent = parseFloat(document.getElementById('diezmo-percent')?.value) || 10;
        const ofrendaPercent = parseFloat(document.getElementById('ofrenda-percent')?.value) || 5;
        
        // Guardar silenciosamente
        DiezmosModule.config.diezmoPercent = diezmoPercent;
        DiezmosModule.config.ofrendaPercent = ofrendaPercent;
        DiezmosModule.saveConfig();
    },

    getDiezmosHistoryHTML() {
        const records = DiezmosModule.records
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 30);

        if (records.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-hand-holding-heart empty-state-icon"></i>
                    <p>No hay registros automáticos aún</p>
                    <p style="font-size: 0.9rem; color: var(--gray);">Los diezmos se guardan automáticamente cada día</p>
                </div>
            `;
        }

        let html = '';
        records.forEach(record => {
            const netProfit = record.netProfit || record.totalIncome || 0;
            html += `
                <li class="sale-item">
                    <div class="sale-info">
                        <h3><i class="fas fa-calendar-day"></i> ${record.date}</h3>
                        <p class="sale-details">
                            <i class="fas fa-chart-line"></i> Ganancia Neta: ${Utils.formatCurrency(netProfit)}
                        </p>
                        <p class="sale-details">
                            <i class="fas fa-hand-holding-usd"></i> Diezmo (${record.diezmoPercent}%): ${Utils.formatCurrency(record.diezmo)} | 
                            <i class="fas fa-gift"></i> Ofrenda (${record.ofrendaPercent}%): ${Utils.formatCurrency(record.ofrenda)}
                        </p>
                    </div>
                    <div class="sale-amount" style="color: var(--primary);">${Utils.formatCurrency(record.total)}</div>
                </li>
            `;
        });
        return html;
    },

    // === NUEVOS MÁ‰TODOS DE BACKUP Y REPORTES ===
    async createBackup() {
        try {
            Utils.showLoading(true);
            const backup = await BackupModule.createBackup();
            
            // Descargar
            const blob = new Blob([backup.data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = backup.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Guardar fecha del último backup
            localStorage.setItem('lastBackup', new Date().toISOString());
            
            Utils.showNotification(`Backup creado: ${backup.filename}`, 'success', 5000);
            
            // Notificación push
            if (NotificationsModule) {
                NotificationsModule.notify('backup', 'Backup creado exitosamente');
            }
            
        } catch (error) {
            Utils.showNotification('Error al crear backup: ' + error.message, 'error', 5000);
        } finally {
            Utils.showLoading(false);
        }
    },

    async restoreFromFile(file) {
        if (!file) return;
        
        try {
            const success = await BackupModule.importFromFile(file);
            if (success) {
                // IMPORTANTE: Recargar TODOS los módulos después de importar
                await this.loadAllData();
                
                // Actualizar todas las vistas
                ClientsModule.updateClientList();
                ClientsModule.updateClientSelect();
                OrdersModule.updateOrdersList();
                OrdersModule.updateOrderBadges();
                CreditosModule.updateCreditBadges();
                
                // Recargar página actual
                this.loadPage(this.currentPage || 'dashboard');
            }
        } catch (error) {
            Utils.showNotification('Error al restaurar: ' + error.message, 'error', 5000);
        }
    },

    async clearAllData() {
        const confirmed = await Utils.showDangerConfirm(
            ' Esto eliminará TODOS los datos de la aplicación. Esta acción NO se puede deshacer.',
            ' Eliminar Todos los Datos',
            'Continuar'
        );
        
        if (!confirmed) return;
        
        const confirmation = await Utils.showPrompt(
            'Para confirmar, escribe exactamente: ELIMINAR',
            ' Confirmación Final',
            '',
            'ELIMINAR'
        );
        
        if (confirmation === 'ELIMINAR') {
            localStorage.clear();
            window.location.reload();
        } else if (confirmation) {
            Utils.showAlert('Texto incorrecto. No se eliminaron los datos.', 'Cancelado', 'info');
        }
    },

    exportAsJSON() {
        const data = {
            clients: ClientsModule.clients,
            sales: SalesModule.sales,
            orders: OrdersModule.orders,
            expenses: AccountingModule.expenses,
            mermaPrices: MermaModule.dailyPrices,
            exportDate: Utils.formatDateTime()
        };
        
        const dataStr = JSON.stringify(data, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `pollos_frescos_${Utils.formatDate()}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        Utils.showNotification('Datos exportados como JSON', 'success', 5000);
    },

    // Método para generar reportes
    async generateReport() {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 7); // Últimos 7 días por defecto
        
        const startDate = await Utils.showPrompt(
            'Ingresa la fecha de inicio:',
            '📅 Fecha Inicio',
            Utils.formatDate(yesterday),
            'YYYY-MM-DD'
        );
        
        if (!startDate) return;
        
        const endDate = await Utils.showPrompt(
            'Ingresa la fecha de fin:',
            '📅 Fecha Fin',
            Utils.formatDate(today),
            'YYYY-MM-DD'
        );
        
        if (!endDate) return;
        
        try {
            Utils.showLoading(true);
            const report = ReportsModule.generateSalesReport(startDate, endDate);
            
            if (report) {
                const filename = ReportsModule.generatePDFReport(report, 'Reporte de Ventas');
                Utils.showNotification(`Reporte generado: ${filename}`, 'success', 5000);
            } else {
                Utils.showNotification('No hay datos para el período seleccionado', 'warning', 5000);
            }
        } catch (error) {
            Utils.showNotification('Error al generar reporte: ' + error.message, 'error', 5000);
        } finally {
            Utils.showLoading(false);
        }
    },

    // Método para enviar backup a Telegram
    async sendBackupToTelegram() {
        try {
            Utils.showLoading(true);
            const backup = await BackupModule.createBackup();
            const result = await BackupModule.sendToTelegram(backup);
            
            if (result.ok) {
                Utils.showNotification('Backup enviado a Telegram correctamente', 'success', 5000);
            }
        } catch (error) {
            Utils.showNotification('Error al enviar a Telegram: ' + error.message, 'error', 5000);
        } finally {
            Utils.showLoading(false);
        }
    },

    // NUEVO: Probar backup automático (ejecuta el mismo método que se ejecutará a las 10 PM)
    async testAutoBackup() {
        try {
            Utils.showLoading(true);
            Utils.showNotification('🤖 Ejecutando backup automático de prueba...', 'info', 3000);
            
            // Ejecutar el mismo método que se ejecuta a las 10 PM
            const result = await AutoBackup.forceBackup();
            
            if (result !== false) {
                Utils.showNotification('✅ Backup automático enviado correctamente. Revisa tu Telegram.', 'success', 5000);
            } else {
                Utils.showNotification('⚠️ No se pudo enviar el backup. Verifica las credenciales.', 'warning', 5000);
            }
        } catch (error) {
            Utils.showNotification('❌ Error en backup automático: ' + error.message, 'error', 5000);
        } finally {
            Utils.showLoading(false);
        }
    },

    // NUEVO: Guardar configuración de Telegram
    saveTelegramConfig() {
        const token = document.getElementById('telegram-token').value.trim();
        const chatId = document.getElementById('telegram-chatid').value.trim();
        
        if (!token || !chatId) {
            Utils.showNotification('Ingresa token y chat ID', 'error', 3000);
            return;
        }
        
        BackupModule.saveTelegramConfig(token, chatId);
        
        // Recargar la página de backups para mostrar la nueva configuración
        setTimeout(() => {
            this.loadBackupPage();
        }, 1000);
    },

    // NUEVO: Probar conexión con Telegram
    async testTelegramConnection() {
        try {
            Utils.showLoading(true);
            const result = await BackupModule.testTelegramConnection();
            
            if (result.ok) {
                Utils.showNotification('✅ ¡Conexión exitosa! Revisa tu Telegram', 'success', 5000);
            }
        } catch (error) {
            Utils.showNotification('❌ ' + error.message, 'error', 5000);
        } finally {
            Utils.showLoading(false);
        }
    },
    
    // NUEVO: Limpiar configuración de Telegram
    async clearTelegramConfig() {
        const confirmed = await Utils.showDangerConfirm(
            'Se eliminará la configuración de Telegram. Podrás volver a configurarla cuando quieras.',
            'Eliminar Configuración de Telegram',
            'Eliminar'
        );
        
        if (confirmed) {
            BackupModule.clearTelegramConfig();
            
            // Recargar la página de backups
            setTimeout(() => {
                this.loadBackupPage();
            }, 500);
        }
    },

    // ===== MÁ‰TODOS DE DIEZMOS Y OFRENDAS =====
    loadDiezmosPage() {
        const preview = DiezmosModule.getPreview();
        
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        
        const weekRecords = DiezmosModule.getRecordsByDateRange(Utils.formatDate(weekAgo), Utils.formatDate(now));
        const monthRecords = DiezmosModule.getRecordsByDateRange(Utils.formatDate(monthAgo), Utils.formatDate(now));
        const yearRecords = DiezmosModule.getRecordsByDateRange(Utils.formatDate(yearAgo), Utils.formatDate(now));
        
        const resumenSemanal = { total: weekRecords.reduce((sum, r) => sum + r.total, 0) };
        const resumenMensual = { total: monthRecords.reduce((sum, r) => sum + r.total, 0) };
        const resumenAnual = { total: yearRecords.reduce((sum, r) => sum + r.total, 0) };

        const html = `
            <div class="page active" id="diezmos-page">
                <h2><i class="fas fa-hand-holding-heart"></i> Diezmos y Ofrendas</h2>
                <p style="margin: 10px 0 20px; color: var(--gray);">Sistema automático de diezmos basado en ventas diarias</p>
                
                <div class="card" style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white;">
                    <h3 style="color: white;"><i class="fas fa-calendar-day"></i> Vista Previa de Hoy</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 15px 0;">
                        <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.9rem; margin-bottom: 5px;">Ganancia Neta</div>
                            <div style="font-size: 1.8rem; font-weight: bold;" id="preview-income">${Utils.formatCurrency(preview.netProfit || 0)}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.9rem; margin-bottom: 5px;" id="preview-diezmo-label">Diezmo (${DiezmosModule.config.diezmoPercent}%)</div>
                            <div style="font-size: 1.8rem; font-weight: bold;" id="preview-diezmo">${Utils.formatCurrency(preview.diezmo)}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.9rem; margin-bottom: 5px;" id="preview-ofrenda-label">Ofrenda (${DiezmosModule.config.ofrendaPercent}%)</div>
                            <div style="font-size: 1.8rem; font-weight: bold;" id="preview-ofrenda">${Utils.formatCurrency(preview.ofrenda)}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.9rem; margin-bottom: 5px;">Total</div>
                            <div style="font-size: 1.8rem; font-weight: bold;" id="preview-total">${Utils.formatCurrency(preview.total)}</div>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-cog"></i> Configuración de Porcentajes</h3>
                    <p style="margin-bottom: 15px; color: var(--gray); font-size: 0.9rem;">
                        <i class="fas fa-info-circle"></i> Los cambios se reflejan en tiempo real
                    </p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label class="form-label">Diezmo (%)</label>
                            <input type="number" step="0.1" min="0" max="100" class="form-input" 
                                   id="diezmo-percent" value="${DiezmosModule.config.diezmoPercent}" 
                                   oninput="App.updateDiezmosPreview(); App.autoSaveDiezmosConfig()">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Ofrenda (%)</label>
                            <input type="number" step="0.1" min="0" max="100" class="form-input" 
                                   id="ofrenda-percent" value="${DiezmosModule.config.ofrendaPercent}" 
                                   oninput="App.updateDiezmosPreview(); App.autoSaveDiezmosConfig()">
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="App.saveDiezmosConfig()" style="width: 100%; margin-top: 10px;">
                        <i class="fas fa-save"></i> Guardar Configuración
                    </button>
                </div>

                <div class="card">
                    <h3><i class="fas fa-save"></i> Guardar Diezmos del Día</h3>
                    <p style="color: var(--gray); margin-bottom: 15px;">Guarda o actualiza el registro de diezmos para hoy</p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <button class="btn btn-success" onclick="App.saveDailyDiezmos()">
                            <i class="fas fa-check"></i> Guardar Hoy
                        </button>
                        <button class="btn btn-primary" onclick="App.recalcularTodosDiezmos()">
                            <i class="fas fa-sync-alt"></i> Recalcular Todo
                        </button>
                    </div>
                    <p style="color: var(--gray); font-size: 0.85rem; margin-top: 10px; text-align: center;">
                        <i class="fas fa-info-circle"></i> "Recalcular Todo" procesa automáticamente todos los días con ganancias
                    </p>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">Semanal</div>
                        <div class="stat-value">${Utils.formatCurrency(resumenSemanal.total)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Mensual</div>
                        <div class="stat-value">${Utils.formatCurrency(resumenMensual.total)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Anual</div>
                        <div class="stat-value">${Utils.formatCurrency(resumenAnual.total)}</div>
                    </div>
                </div>
                
                <div class="card">
                    <h3><i class="fas fa-history"></i> Historial Automático (Últimos 30 días)</h3>
                    <ul class="sales-list">
                        ${this.getDiezmosHistoryHTML()}
                    </ul>
                </div>
            </div>
        `;

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = html;
        }
    },


    
    // NUEVO: Método para actualizar todos los mapas automáticamente
    actualizarMapasAutomaticamente() {
        // Actualizar mapa del dashboard si estamos en esa página
        if (this.currentPage === 'dashboard' && this.mapaDashboardInicializado) {
            this.actualizarMapaDashboard();
        }
        
        // Actualizar mapa de rutas si estamos en esa página
        if (this.currentPage === 'rutas' && RutasModule.mapaRuta) {
            RutasModule.actualizarMapa();
        }
        
        // También actualizar el contador de pedidos pendientes
        const pedidosPendientes = OrdersModule.getPendingOrders().length;
        if (pedidosPendientes > 0) {
            // Notificar al módulo de rutas que hay nuevos pedidos
            RutasModule.actualizarRutaAutomatica();
        }
    },

    // NUEVO: Sincronizar modo desarrollo con Service Worker
    syncDevModeWithServiceWorker() {
        const savedMode = localStorage.getItem('devMode') === 'true';
        
        // Notificar al Service Worker del estado actual
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SET_DEV_MODE',
                devMode: savedMode
            });
        }
        
        // Escuchar cuando el Service Worker esté listo
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                if (registration.active) {
                    registration.active.postMessage({
                        type: 'SET_DEV_MODE',
                        devMode: savedMode
                    });
                }
            });
        }
    },

    // NUEVO: Toggle Modo Desarrollo
    toggleDevMode(enabled) {
        const devMode = enabled;
        
        // Guardar preferencia INMEDIATAMENTE
        localStorage.setItem('devMode', devMode ? 'true' : 'false');
        
        // Actualizar UI
        this.updateDevModeUI(devMode);
        
        // Notificar al Service Worker
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'SET_DEV_MODE',
                devMode: devMode
            });
        }
        
        // Mostrar notificación
        const mensaje = devMode ? 
            'Modo Desarrollo activado. Recarga para ver cambios instantáneos.' : 
            'Modo Producción activado. App funcionará 100% offline.';
        
        Utils.showNotification(mensaje, devMode ? 'warning' : 'success', 5000);
        
        // Sugerir recarga
        setTimeout(async () => {
            const shouldReload = await Utils.showConfirm(
                'Se recomienda recargar la aplicación para aplicar los cambios.',
                'Recargar Aplicación',
                'Recargar',
                'Más Tarde'
            );
            
            if (shouldReload) {
                window.location.reload();
            }
        }, 1000);
    },

    // NUEVO: Actualizar UI del modo desarrollo
    updateDevModeUI(devMode) {
        const statusText = document.getElementById('dev-mode-status');
        const statusTextMobile = document.getElementById('dev-mode-status-mobile');
        const devModeSwitch = document.getElementById('dev-mode-switch');
        
        // Sincronizar el switch
        if (devModeSwitch) {
            devModeSwitch.checked = devMode;
        }
        
        // Actualizar ambos elementos de estado
        [statusText, statusTextMobile].forEach(element => {
            if (element) {
                if (devMode) {
                    element.textContent = 'âš ï¸ Modo Desarrollo: Cache desactivado';
                    element.style.color = 'rgba(255, 193, 7, 0.8)';
                } else {
                    element.textContent = 'âœ… Modo Producción: Offline completo';
                    element.style.color = 'rgba(76, 175, 80, 0.8)';
                }
            }
        });
    },

    // NUEVO: Inicializar estado del toggle
    initDevModeToggle() {
        // Cargar estado guardado INMEDIATAMENTE
        const savedMode = localStorage.getItem('devMode') === 'true';
        
        // Actualizar UI con el estado guardado
        this.updateDevModeUI(savedMode);
        
        // Configurar listener para cambios futuros
        const devModeSwitch = document.getElementById('dev-mode-switch');
        if (devModeSwitch) {
            // Remover listeners anteriores para evitar duplicados
            if (this.handleDevModeChange) {
                devModeSwitch.removeEventListener('change', this.handleDevModeChange);
            }
            
            // Agregar nuevo listener
            this.handleDevModeChange = (e) => {
                this.toggleDevMode(e.target.checked);
            };
            devModeSwitch.addEventListener('change', this.handleDevModeChange);
            
            // Asegurar que el checkbox refleje el estado guardado
            devModeSwitch.checked = savedMode;
        }
        
        // Verificar periódicamente que el estado se mantenga sincronizado
        if (this.devModeCheckInterval) {
            clearInterval(this.devModeCheckInterval);
        }
        
        this.devModeCheckInterval = setInterval(() => {
            const currentSavedMode = localStorage.getItem('devMode') === 'true';
            const switchElement = document.getElementById('dev-mode-switch');
            
            if (switchElement && switchElement.checked !== currentSavedMode) {
                switchElement.checked = currentSavedMode;
                this.updateDevModeUI(currentSavedMode);
            }
        }, 1000); // Verificar cada segundo
    },

    // NUEVO: Forzar actualización del cache
    forceUpdateCache() {
        // Recarga forzada sin cache
        window.location.reload(true);
    },

    // NUEVO: Limpiar recursos del modo desarrollo
    cleanupDevMode() {
        if (this.devModeCheckInterval) {
            clearInterval(this.devModeCheckInterval);
            this.devModeCheckInterval = null;
        }
        
        const devModeSwitch = document.getElementById('dev-mode-switch');
        if (devModeSwitch && this.handleDevModeChange) {
            devModeSwitch.removeEventListener('change', this.handleDevModeChange);
            this.handleDevModeChange = null;
        }
    },

    // Verificar merma pendiente manualmente
    async checkMermaPending() {
        if (typeof PushNotifications !== 'undefined') {
            const hasPending = await PushNotifications.checkMermaPending();
            if (!hasPending) {
                Utils.showNotification('✅ No hay merma pendiente', 'success', 3000);
            }
        } else {
            Utils.showNotification('Sistema de notificaciones no disponible', 'error', 3000);
        }
    },

    // Verificar créditos pendientes manualmente
    async checkCreditsPending() {
        if (typeof PushNotifications !== 'undefined') {
            const hasPending = await PushNotifications.checkCreditsPending();
            if (!hasPending) {
                Utils.showNotification('✅ No hay créditos pendientes', 'success', 3000);
            }
        } else {
            Utils.showNotification('Sistema de notificaciones no disponible', 'error', 3000);
        }
    },

    // Probar todas las notificaciones
    async testAllNotifications() {
        if (typeof PushNotifications !== 'undefined') {
            await PushNotifications.test();
            Utils.showNotification('Notificaciones de prueba enviadas', 'success', 3000);
        } else {
            Utils.showNotification('Sistema de notificaciones no disponible', 'error', 3000);
        }
    },
    
    // Probar backup automático
    async testAutoBackup() {
        if (typeof AutoBackup === 'undefined') {
            Utils.showNotification('Sistema de backup automático no disponible', 'error', 3000);
            return;
        }
        
        const hasCredentials = await AutoBackup.hasCredentials();
        
        if (!hasCredentials) {
            Utils.showNotification('⚠️ Configura tus credenciales de Telegram primero en la página de Backups', 'warning', 5000);
            return;
        }
        
        const confirmed = await Utils.showConfirm(
            '¿Forzar backup automático ahora? Esto creará y enviará un backup a Telegram.',
            'Probar Backup Automático',
            'Sí, crear backup',
            'Cancelar'
        );
        
        if (!confirmed) return;
        
        Utils.showLoading(true);
        
        try {
            await AutoBackup.forceBackup();
            Utils.showLoading(false);
            Utils.showNotification('✅ Backup automático enviado correctamente', 'success', 5000);
        } catch (error) {
            Utils.showLoading(false);
            Utils.showNotification(`❌ Error: ${error.message}`, 'error', 5000);
        }
    },

    // Manejar acciones de notificaciones
    async handleNotificationAction(action, data) {
        console.log('========================================');
        console.log('🔔 PROCESANDO ACCIÓN DE NOTIFICACIÓN');
        console.log('Acción:', action);
        console.log('Datos:', data);
        console.log('========================================');
        
        // Si no hay acción o es 'open', solo abrir la app
        if (!action || action === 'open' || action === 'dismiss') {
            console.log('ℹ️ Acción básica, no requiere procesamiento');
            return;
        }
        
        switch(action) {
            case 'calculate':
                // Ir a página de merma
                console.log('📊 Navegando a página de merma');
                this.loadPage('merma');
                Utils.showNotification('📊 Calcula la merma del día', 'info', 3000);
                break;
                
            case 'pay-full':
                // Pagar deuda completa del cliente
                console.log('💵 Pago completo para cliente:', data.clientId);
                if (data.clientId) {
                    this.loadPage('creditos');
                    setTimeout(async () => {
                        const confirmed = await Utils.showConfirm(
                            `¿Pagar toda la deuda de ${data.clientName}?\nTotal: ${Utils.formatCurrency(data.totalDebt)}`,
                            'Confirmar Pago Completo',
                            'Pagar',
                            'Cancelar'
                        );
                        if (confirmed) {
                            Utils.showNotification(`💵 Procesando pago de ${data.clientName}`, 'info', 3000);
                            // Aquí iría la lógica de pago completo
                        }
                    }, 1000);
                }
                break;
                
            case 'pay-partial':
                // Hacer abono parcial
                console.log('💰 Abono parcial para cliente:', data.clientId);
                if (data.clientId) {
                    this.loadPage('creditos');
                    setTimeout(() => {
                        Utils.showNotification(`💰 Selecciona la venta de ${data.clientName} para hacer el abono`, 'info', 5000);
                    }, 1000);
                }
                break;
                
            case 'view':
                // Ver detalles de créditos
                console.log('�️ Ver detalles de créditos');
                this.loadPage('creditos');
                break;
                
            case 'backup-now':
                // Crear backup
                console.log('💾 Crear backup');
                this.loadPage('backup');
                setTimeout(() => {
                    Utils.showNotification('💾 Crea tu backup desde esta página', 'info', 3000);
                }, 1000);
                break;
                
            default:
                console.log('⚠️ Acción no manejada:', action);
        }
    }
};

// Suprimir errores de extensiones globalmente
window.addEventListener('unhandledrejection', (e) => {
    if (e.reason && e.reason.message && e.reason.message.includes('Could not establish connection')) {
        e.preventDefault();
    }
});

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', () => {
    // Prevenir zoom en inputs
    document.addEventListener('touchstart', (event) => {
        if (event.touches.length > 1) {
            event.preventDefault();
        }
    }, { passive: false });

    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);

    // Iniciar app
    App.init();
});

// Limpiar recursos al cerrar/recargar la página
window.addEventListener('beforeunload', () => {
    App.cleanupDevMode();
});

// También limpiar cuando la página se oculta (móviles)
window.addEventListener('pagehide', () => {
    App.cleanupDevMode();
});






// Métodos para notificaciones push
App.enableNotifications = async function() {
    const enabled = await NotificationsModule.enable();
    if (enabled) {
        Utils.showNotification('✅ Notificaciones activadas correctamente', 'success', 3000);
    } else {
        Utils.showNotification('❌ No se pudieron activar las notificaciones', 'error', 3000);
    }
};

App.disableNotifications = function() {
    NotificationsModule.disable();
    Utils.showNotification('🔕 Notificaciones desactivadas', 'warning', 3000);
};

App.testNotification = function() {
    NotificationsModule.showNotification(
        '🐔 Notificación de Prueba',
        'Las notificaciones están funcionando correctamente',
        '✅',
        'test-notification'
    );
};
