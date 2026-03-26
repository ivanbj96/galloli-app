// Sistema de Notificaciones Push - Web Push VAPID
const WORKER_URL = 'https://galloli-sync.ivanbj-96.workers.dev';

const PushNotifications = {
    swRegistration: null,
    permission: 'default',
    checkInterval: null,
    isInitialized: false,
    vapidPublicKey: null,
    pushSubscription: null,

    // Inicializar el sistema
    async init() {
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('🔔 Push notifications no soportadas en este navegador');
            return false;
        }

        try {
            this.swRegistration = await navigator.serviceWorker.ready;
        } catch (e) {
            console.error('🔔 Service Worker no disponible:', e.message);
            return false;
        }

        // Si ya tiene permisos, inicializar completamente
        if (Notification.permission === 'granted') {
            this.permission = 'granted';
            await this._setupSubscription();
            this._startPeriodicChecks();
            this.isInitialized = true;
            return true;
        }

        return false;
    },

    // Solicitar permisos y suscribirse a Web Push
    async requestPermission() {
        if (!('Notification' in window) || !('PushManager' in window)) {
            alert('Tu navegador no soporta notificaciones push.');
            return false;
        }

        if (Notification.permission === 'denied') {
            alert('Las notificaciones están bloqueadas. Habilítalas en la configuración del navegador/sistema.');
            return false;
        }

        if (Notification.permission === 'granted') {
            this.permission = 'granted';
            if (!this.isInitialized) {
                await this._setupSubscription();
                this._startPeriodicChecks();
                this.isInitialized = true;
            }
            return true;
        }

        // Solicitar permiso
        const permission = await Notification.requestPermission();
        this.permission = permission;

        if (permission !== 'granted') {
            return false;
        }

        if (!this.swRegistration) {
            try {
                this.swRegistration = (typeof App !== 'undefined' && App._swRegistration)
                    ? App._swRegistration
                    : await navigator.serviceWorker.ready;
            } catch(e) {
                alert('Service Worker no disponible. Recarga la pagina.');
                return false;
            }
        }

        await this._setupSubscription();
        this._startPeriodicChecks();
        this.isInitialized = true;
        setTimeout(() => this.checkAllPendingTasks(), 2000);
        return true;
    },

    // Obtener VAPID public key del servidor y suscribirse
    async _setupSubscription() {
        try {
            if (!('serviceWorker' in navigator)) throw new Error('Service Worker no soportado');
            // Usar registration guardada por App, o esperar con ready
            const reg = (typeof App !== 'undefined' && App._swRegistration) 
                ? App._swRegistration 
                : await navigator.serviceWorker.ready;
            this.swRegistration = reg;

            // Obtener VAPID public key
            const res = await fetch(`${WORKER_URL}/api/push/vapid-key`);
            if (!res.ok) throw new Error('No se pudo obtener VAPID key');
            const { publicKey } = await res.json();
            this.vapidPublicKey = publicKey;

            // Verificar si ya hay suscripción activa
            let sub = await this.swRegistration.pushManager.getSubscription();

            if (!sub) {
                // Crear nueva suscripción
                sub = await this.swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this._urlBase64ToUint8Array(publicKey)
                });
            }

            this.pushSubscription = sub;

            // Guardar suscripción en el servidor (solo si hay sesión activa)
            await this._saveSubscriptionToServer(sub);

            console.log('✅ Suscripción push activa');
        } catch (error) {
            console.error('Error configurando suscripción push:', error.message);
            // Fallback: notificaciones locales siguen funcionando si la app está abierta
        }
    },

    // Guardar suscripción en el Worker (con reintentos si no hay token aún)
    async _saveSubscriptionToServer(subscription, retries = 5) {
        for (let i = 0; i < retries; i++) {
            try {
                const token = (typeof window !== 'undefined' && window.AuthManager) ? window.AuthManager.token : null;
                if (!token) {
                    if (i < retries - 1) {
                        await new Promise(r => setTimeout(r, 2000)); // esperar 2s y reintentar
                        continue;
                    }
                    console.warn('🔔 Sin token JWT, suscripción guardada solo en navegador');
                    return false;
                }

                const res = await fetch(`${WORKER_URL}/api/push/subscribe`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ subscription: subscription.toJSON() })
                });

                if (res.ok) {
                    console.log('✅ Suscripción push guardada en servidor');
                    return true;
                } else {
                    const err = await res.text();
                    console.error('❌ Error guardando suscripción:', res.status, err);
                    return false;
                }
            } catch (e) {
                console.warn(`Intento ${i+1} fallido:`, e.message);
                if (i < retries - 1) await new Promise(r => setTimeout(r, 2000));
            }
        }
        return false;
    },

    // Iniciar verificaciones periódicas locales
    _startPeriodicChecks() {
        if (this.checkInterval) return;
        setTimeout(() => this.checkAllPendingTasks(), 3000);
        this.checkInterval = setInterval(() => this.checkAllPendingTasks(), 5 * 60 * 1000);
    },

    // Verificar todas las tareas pendientes
    async checkAllPendingTasks() {
        if (!this.isInitialized) return;
        await this.checkMermaPending();
        await this.checkCreditsByClient();
    },

    // Mostrar notificación local (cuando la app está abierta)
    async show(title, body, options = {}) {
        if (this.permission !== 'granted' || !this.swRegistration) return false;

        try {
            await this.swRegistration.showNotification(title, {
                body,
                icon: options.icon || './icons/favicon.pub/android-chrome-192x192.png',
                badge: options.badge || './icons/favicon.pub/favicon-48x48.png',
                tag: options.tag || 'galloli-notification',
                requireInteraction: options.requireInteraction || false,
                silent: options.silent || false,
                vibrate: options.vibrate || [200, 100, 200],
                data: options.data || {},
                actions: options.actions || []
            });
            return true;
        } catch (e) {
            console.error('Error mostrando notificación:', e.message);
            return false;
        }
    },

    // Verificar merma pendiente
    async checkMermaPending() {
        const today = new Date().toISOString().split('T')[0];
        if (typeof MermaModule === 'undefined' || typeof SalesModule === 'undefined') return false;

        const mermaRecord = MermaModule.getMermaRecordByDate(today);
        const sales = SalesModule.getSalesByDate(today);

        if (!mermaRecord && sales.length > 0) {
            await this.show(
                '⚠️ Merma Sin Calcular',
                `Tienes ${sales.length} ventas hoy. ¡Calcula la merma!`,
                { tag: 'merma-urgent', requireInteraction: true, vibrate: [500, 200, 500], data: { action: 'calculate-merma' } }
            );
            return true;
        }
        return false;
    },

    // Verificar créditos por cliente
    async checkCreditsByClient() {
        if (typeof SalesModule === 'undefined' || typeof ClientsModule === 'undefined') return false;

        const creditSales = SalesModule.getCreditSales();
        const clientsWithDebt = {};

        creditSales.forEach(sale => {
            if (!clientsWithDebt[sale.clientId]) {
                clientsWithDebt[sale.clientId] = {
                    client: ClientsModule.getClientById(sale.clientId),
                    totalDebt: 0,
                    sales: []
                };
            }
            clientsWithDebt[sale.clientId].totalDebt += sale.remainingDebt;
            clientsWithDebt[sale.clientId].sales.push(sale);
        });

        for (const clientId in clientsWithDebt) {
            const { client, totalDebt, sales } = clientsWithDebt[clientId];
            await this.show(
                `💳 ${client.name} - Crédito Activo`,
                `Deuda: ${typeof Utils !== 'undefined' ? Utils.formatCurrency(totalDebt) : totalDebt} (${sales.length} venta${sales.length > 1 ? 's' : ''})`,
                {
                    tag: `credit-${clientId}`,
                    requireInteraction: true,
                    vibrate: [300, 100, 300],
                    data: { type: 'credit', clientId, clientName: client.name, totalDebt, sales: sales.map(s => s.id) }
                }
            );
        }

        return Object.keys(clientsWithDebt).length > 0;
    },

    // Notificaciones de eventos
    async notifyBackupSuccess(fileName) {
        await this.show('✅ Backup Enviado', `Archivo: ${fileName}`, { tag: 'backup-success' });
    },
    async notifyBackupError(error) {
        await this.show('❌ Error en Backup', `No se pudo enviar: ${error}`, { tag: 'backup-error', requireInteraction: true });
    },
    async notifyClientCreated(clientName) {
        await this.show('👥 Cliente Agregado', `"${clientName}" registrado`, { tag: 'client-created' });
    },
    async notifySaleCompleted(amount, clientName) {
        await this.show('💰 Venta Registrada', `${typeof Utils !== 'undefined' ? Utils.formatCurrency(amount) : amount} - ${clientName}`, { tag: 'sale-completed' });
    },
    async notifyOrderDelivered(clientName) {
        await this.show('📦 Pedido Entregado', `Pedido de ${clientName} completado`, { tag: 'order-delivered' });
    },
    async notifyPaymentReceived(amount, clientName) {
        await this.show('💵 Pago Recibido', `${typeof Utils !== 'undefined' ? Utils.formatCurrency(amount) : amount} de ${clientName}`, { tag: 'payment-received' });
    },

    // Prueba del sistema
    async test() {
        const granted = await this.requestPermission();
        if (!granted) return false;

        // Prueba local (app abierta)
        await this.show('🧪 Prueba local', 'Notificación local funcionando ✅', { tag: 'test-local' });

        // Prueba push real desde servidor (app puede estar cerrada)
        setTimeout(() => this.testServerPush(), 3000);
        return true;
    },

    // Enviar push de prueba desde el servidor (verifica todo el pipeline VAPID)
    async testServerPush() {
        try {
            const token = window.AuthManager ? window.AuthManager.token : null;
            if (!token) {
                console.warn('Sin token para test push');
                return false;
            }
            const res = await fetch(`${WORKER_URL}/api/push/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    title: '🔔 Push Real Funcionando',
                    body: 'Esta notificación llegó desde el servidor ✅',
                    tag: 'test-server-push'
                })
            });
            const data = await res.json();
            console.log('Test push resultado:', data);
            return data.success;
        } catch (e) {
            console.error('testServerPush error:', e.message);
            return false;
        }
    },

    // Convertir VAPID public key de base64url a Uint8Array
    _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        return Uint8Array.from(rawData, c => c.charCodeAt(0));
    }
};

// Alias para compatibilidad
const NotificationsModule = PushNotifications;
