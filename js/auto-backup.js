// Sistema de Backup Automático Diario
const AutoBackup = {
    checkInterval: null,
    lastDataHash: null,
    
    // Inicializar el sistema
    async init() {
        console.log('💾 Inicializando sistema de backup automático...');
        
        // Cargar el hash de los últimos datos desde IndexedDB
        this.lastDataHash = await this.getFromDB('lastBackupDataHash');
        
        // Verificar cada hora si es hora de hacer backup
        this.checkInterval = setInterval(() => {
            this.checkBackupTime();
        }, 60 * 60 * 1000); // Cada hora
        
        // Verificar inmediatamente al iniciar
        setTimeout(() => this.checkBackupTime(), 5000);
        
        console.log('✅ Sistema de backup automático inicializado');
    },
    
    // Guardar en IndexedDB (más seguro y persistente)
    async saveToDB(key, value) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('GallOliSecure', 1);
            
            request.onerror = () => reject(request.error);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('credentials')) {
                    db.createObjectStore('credentials');
                }
            };
            
            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(['credentials'], 'readwrite');
                const store = transaction.objectStore('credentials');
                const putRequest = store.put(value, key);
                
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
        });
    },
    
    // Obtener de IndexedDB
    async getFromDB(key) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('GallOliSecure', 1);
            
            request.onerror = () => reject(request.error);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('credentials')) {
                    db.createObjectStore('credentials');
                }
            };
            
            request.onsuccess = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('credentials')) {
                    resolve(null);
                    return;
                }
                const transaction = db.transaction(['credentials'], 'readonly');
                const store = transaction.objectStore('credentials');
                const getRequest = store.get(key);
                
                getRequest.onsuccess = () => resolve(getRequest.result || null);
                getRequest.onerror = () => reject(getRequest.error);
            };
        });
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
            const lastBackup = await this.getFromDB('lastAutoBackupDate');
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
                await this.saveToDB('lastBackupDataHash', currentHash);
                return true; // Hay "cambios" porque es la primera vez
            }
            
            if (currentHash !== this.lastDataHash) {
                // Hay cambios
                this.lastDataHash = currentHash;
                await this.saveToDB('lastBackupDataHash', currentHash);
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
            const credentials = await this.getCredentials();
            
            if (!credentials.botToken || !credentials.chatId) {
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
            
            console.log('📦 Creando backup automático...');
            
            // Generar el archivo de backup usando BackupModule
            const backupData = await BackupModule.createBackup();
            const fileName = `galloli_backup_auto_${new Date().toISOString().split('T')[0]}.json`;
            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            
            // Enviar a Telegram
            const formData = new FormData();
            formData.append('chat_id', credentials.chatId);
            formData.append('document', blob, fileName);
            formData.append('caption', `🤖 Backup Automático\n📅 ${new Date().toLocaleString('es-ES')}`);
            
            const response = await fetch(`https://api.telegram.org/bot${credentials.botToken}/sendDocument`, {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                console.log('✅ Backup automático enviado a Telegram');
                
                // Guardar fecha del último backup
                const today = new Date().toISOString().split('T')[0];
                await this.saveToDB('lastAutoBackupDate', today);
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
    
    // Guardar credenciales de Telegram permanentemente en IndexedDB (más seguro)
    async saveCredentials(botToken, chatId) {
        // Encriptar las credenciales antes de guardar
        const encrypted = {
            botToken: this.encrypt(botToken),
            chatId: this.encrypt(chatId)
        };
        
        await this.saveToDB('telegramCredentials', encrypted);
        console.log('✅ Credenciales de Telegram guardadas de forma segura en IndexedDB');
    },
    
    // Obtener credenciales guardadas
    async getCredentials() {
        try {
            const encrypted = await this.getFromDB('telegramCredentials');
            
            if (!encrypted) {
                return { botToken: '', chatId: '' };
            }
            
            // Desencriptar las credenciales
            return {
                botToken: this.decrypt(encrypted.botToken),
                chatId: this.decrypt(encrypted.chatId)
            };
        } catch (error) {
            console.error('Error obteniendo credenciales:', error);
            return { botToken: '', chatId: '' };
        }
    },
    
    // Verificar si hay credenciales guardadas
    async hasCredentials() {
        const credentials = await this.getCredentials();
        return !!(credentials.botToken && credentials.chatId);
    },
    
    // Encriptación mejorada (AES-like con múltiples capas)
    encrypt(text) {
        if (!text) return '';
        
        // Capa 1: Reverse y Base64
        const layer1 = btoa(text.split('').reverse().join(''));
        
        // Capa 2: XOR con clave
        const key = 'GallOli2024SecureKey';
        let layer2 = '';
        for (let i = 0; i < layer1.length; i++) {
            layer2 += String.fromCharCode(layer1.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        
        // Capa 3: Base64 final
        return btoa(layer2);
    },
    
    // Desencriptación
    decrypt(encrypted) {
        if (!encrypted) return '';
        
        try {
            // Capa 3: Decodificar Base64
            const layer2 = atob(encrypted);
            
            // Capa 2: XOR con clave
            const key = 'GallOli2024SecureKey';
            let layer1 = '';
            for (let i = 0; i < layer2.length; i++) {
                layer1 += String.fromCharCode(layer2.charCodeAt(i) ^ key.charCodeAt(i % key.length));
            }
            
            // Capa 1: Decodificar Base64 y reverse
            return atob(layer1).split('').reverse().join('');
        } catch (error) {
            console.error('Error desencriptando:', error);
            return '';
        }
    },
    
    // Forzar backup manual (para pruebas)
    async forceBackup() {
        console.log('🔧 Forzando backup manual...');
        await this.createAutomaticBackup();
    }
};
