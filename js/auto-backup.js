// Sistema de Backup Automático Diario
const AutoBackup = {
    checkInterval: null,
    lastDataHash: null,
    
    // Inicializar el sistema
    async init() {
        console.log('💾 Inicializando sistema de backup automático...');
        
        // Cargar el hash de los últimos datos
        this.lastDataHash = localStorage.getItem('lastBackupDataHash') || null;
        
        // Verificar cada hora si es hora de hacer backup
        this.checkInterval = setInterval(() => {
            this.checkBackupTime();
        }, 60 * 60 * 1000); // Cada hora
        
        // Verificar inmediatamente al iniciar
        setTimeout(() => this.checkBackupTime(), 5000);
        
        console.log('✅ Sistema de backup automático inicializado');
    },
    
    // Verificar si es hora de hacer backup (10 PM)
    async checkBackupTime() {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        
        // Verificar si son las 10 PM (22:00)
        if (hour === 22 && minute < 60) {
            console.log('🕙 Son las 10 PM - Verificando si hay cambios para backup...');
            
            // Verificar si ya se hizo backup hoy
            const lastBackup = localStorage.getItem('lastAutoBackupDate');
            const today = new Date().toISOString().split('T')[0];
            
            if (lastBackup === today) {
                console.log('✅ Ya se hizo backup hoy');
                return;
            }
            
            // Verificar si hay cambios en los datos
            const hasChanges = await this.detectDataChanges();
            
            if (hasChanges) {
                console.log('📊 Se detectaron cambios - Creando backup...');
                await this.createAutomaticBackup();
            } else {
                console.log('ℹ️ No hay cambios en los datos - No se creará backup');
            }
        }
    },
    
    // Detectar si hubo cambios en los datos
    async detectDataChanges() {
        try {
            // Obtener todos los datos actuales
            const currentData = {
                clients: ClientsModule.clients || [],
                sales: SalesModule.sales || [],
                orders: OrdersModule.orders || [],
                accounting: AccountingModule.expenses || [],
                merma: MermaModule.records || [],
                diezmos: DiezmosModule.records || []
            };
            
            // Calcular hash de los datos actuales
            const currentHash = this.calculateHash(JSON.stringify(currentData));
            
            // Comparar con el hash anterior
            if (this.lastDataHash === null) {
                // Primera vez - guardar hash
                this.lastDataHash = currentHash;
                localStorage.setItem('lastBackupDataHash', currentHash);
                return true; // Hay "cambios" porque es la primera vez
            }
            
            if (currentHash !== this.lastDataHash) {
                // Hay cambios
                this.lastDataHash = currentHash;
                localStorage.setItem('lastBackupDataHash', currentHash);
                return true;
            }
            
            // No hay cambios
            return false;
            
        } catch (error) {
            console.error('❌ Error detectando cambios:', error);
            return false;
        }
    },
    
    // Calcular hash simple de una cadena
    calculateHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString();
    },
    
    // Crear backup automático
    async createAutomaticBackup() {
        try {
            // Verificar que haya credenciales guardadas
            const botToken = localStorage.getItem('telegramBotToken');
            const chatId = localStorage.getItem('telegramChatId');
            
            if (!botToken || !chatId) {
                console.warn('⚠️ No hay credenciales de Telegram guardadas');
                
                // Mostrar notificación para configurar
                if (typeof PushNotifications !== 'undefined') {
                    await PushNotifications.show(
                        '⚠️ Configurar Telegram',
                        'Configura tus credenciales de Telegram para backups automáticos',
                        {
                            tag: 'telegram-config-needed',
                            requireInteraction: true,
                            actions: [
                                { action: 'open-config', title: 'Configurar' }
                            ]
                        }
                    );
                }
                return false;
            }
            
            // Crear el backup usando el módulo de Backup
            if (typeof BackupModule === 'undefined') {
                console.error('❌ BackupModule no disponible');
                return false;
            }
            
            console.log('📦 Creando backup automático...');
            
            // Generar el archivo de backup
            const backupData = BackupModule.generateBackupData();
            const fileName = `galloli_backup_auto_${new Date().toISOString().split('T')[0]}.json`;
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            
            // Enviar a Telegram
            const formData = new FormData();
            formData.append('chat_id', chatId);
            formData.append('document', blob, fileName);
            formData.append('caption', `🤖 Backup Automático\n📅 ${new Date().toLocaleString('es-ES')}`);
            
            const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                console.log('✅ Backup automático enviado a Telegram');
                
                // Guardar fecha del último backup
                const today = new Date().toISOString().split('T')[0];
                localStorage.setItem('lastAutoBackupDate', today);
                localStorage.setItem('lastTelegramBackup', new Date().toISOString());
                
                // Notificar éxito
                if (typeof PushNotifications !== 'undefined') {
                    await PushNotifications.notifyBackupSuccess(fileName);
                }
                
                return true;
            } else {
                const error = await response.json();
                console.error('❌ Error enviando backup:', error);
                
                // Notificar error
                if (typeof PushNotifications !== 'undefined') {
                    await PushNotifications.notifyBackupError(error.description || 'Error desconocido');
                }
                
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error creando backup automático:', error);
            
            // Notificar error
            if (typeof PushNotifications !== 'undefined') {
                await PushNotifications.notifyBackupError(error.message);
            }
            
            return false;
        }
    },
    
    // Guardar credenciales de Telegram permanentemente
    saveCredentials(botToken, chatId) {
        localStorage.setItem('telegramBotToken', botToken);
        localStorage.setItem('telegramChatId', chatId);
        console.log('✅ Credenciales de Telegram guardadas');
    },
    
    // Obtener credenciales guardadas
    getCredentials() {
        return {
            botToken: localStorage.getItem('telegramBotToken') || '',
            chatId: localStorage.getItem('telegramChatId') || ''
        };
    },
    
    // Verificar si hay credenciales guardadas
    hasCredentials() {
        const botToken = localStorage.getItem('telegramBotToken');
        const chatId = localStorage.getItem('telegramChatId');
        return !!(botToken && chatId);
    },
    
    // Forzar backup manual (para pruebas)
    async forceBackup() {
        console.log('🔧 Forzando backup manual...');
        await this.createAutomaticBackup();
    }
};
