// Sistema de Autenticación - GallOli Cloud Sync
// Maneja login con Telegram, Email y PIN

const AUTH_CONFIG = {
    API_URL: 'https://galloli-sync.ivanbj-96.workers.dev',
    TOKEN_KEY: 'galloli_auth_token',
    USER_KEY: 'galloli_user',
    BUSINESS_KEY: 'galloli_business'
};

class AuthManager {
    constructor() {
        this.token = null;
        this.user = null;
        this.business = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        console.log('🔐 Inicializando sistema de autenticación...');
        
        // Esperar a que IndexedDB esté listo (con timeout de 5 segundos)
        // Esto es necesario porque DB.init() es asíncrono y puede no estar listo aún
        await this.waitForIndexedDB();
        
        // Cargar sesión desde IndexedDB
        await this.loadSession();
        
        this.initialized = true;
        console.log('✅ Sistema de autenticación inicializado');
    }

    async waitForIndexedDB() {
        if (window.DB && window.DB.db) {
            console.log('✅ IndexedDB ya está listo');
            return;
        }
        
        console.log('⏳ Esperando IndexedDB...');
        
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 segundos máximo
            
            const checkDB = setInterval(() => {
                attempts++;
                
                if (window.DB && window.DB.db) {
                    clearInterval(checkDB);
                    console.log(`✅ IndexedDB listo después de ${attempts * 100}ms`);
                    resolve();
                } else if (attempts >= maxAttempts) {
                    clearInterval(checkDB);
                    console.warn('⚠️ Timeout esperando IndexedDB (5s) - continuando sin sesión guardada');
                    resolve();
                }
            }, 100);
        });
    }

    async loadSession() {
        try {
            const token = await this.getFromDB(AUTH_CONFIG.TOKEN_KEY);
            const user = await this.getFromDB(AUTH_CONFIG.USER_KEY);
            const business = await this.getFromDB(AUTH_CONFIG.BUSINESS_KEY);
            
            if (token && user && business) {
                this.token = token;
                this.user = user;
                this.business = business;
                console.log('✅ Sesión cargada:', user.name);
                return true;
            } else {
                console.log('ℹ️ No hay sesión guardada');
            }
        } catch (error) {
            console.error('❌ Error cargando sesión:', error);
        }
        return false;
    }

    async saveSession(token, user, business) {
        this.token = token;
        this.user = user;
        this.business = business;
        
        await this.saveToDB(AUTH_CONFIG.TOKEN_KEY, token);
        await this.saveToDB(AUTH_CONFIG.USER_KEY, user);
        await this.saveToDB(AUTH_CONFIG.BUSINESS_KEY, business);
    }

    async clearSession() {
        this.token = null;
        this.user = null;
        this.business = null;
        
        await this.deleteFromDB(AUTH_CONFIG.TOKEN_KEY);
        await this.deleteFromDB(AUTH_CONFIG.USER_KEY);
        await this.deleteFromDB(AUTH_CONFIG.BUSINESS_KEY);
    }

    // Login con Telegram
    async loginWithTelegram(telegramId, telegramUsername, telegramFirstName) {
        try {
            console.log('📱 Iniciando login con Telegram...');
            
            // Paso 1: Solicitar código
            const initResponse = await fetch(`${AUTH_CONFIG.API_URL}/api/auth/telegram/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegram_id: telegramId,
                    telegram_username: telegramUsername,
                    telegram_first_name: telegramFirstName
                })
            });
            
            if (!initResponse.ok) {
                throw new Error('Error al solicitar código');
            }
            
            const initData = await initResponse.json();
            console.log('✅ Código enviado a Telegram');
            
            return {
                success: true,
                message: initData.message,
                expires_in: initData.expires_in
            };
        } catch (error) {
            console.error('❌ Error en login Telegram:', error);
            throw error;
        }
    }

    async verifyTelegramCode(telegramId, code, telegramUsername, telegramFirstName) {
        try {
            console.log('� Verificando código...');
            
            const response = await fetch(`${AUTH_CONFIG.API_URL}/api/auth/telegram/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegram_id: telegramId,
                    verification_code: code,
                    telegram_username: telegramUsername,
                    telegram_first_name: telegramFirstName
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Código inválido');
            }
            
            const data = await response.json();
            
            // Guardar sesión
            await this.saveSession(data.token, data.user, data.business);
            
            console.log('✅ Login exitoso:', data.user.name);
            
            // Inicializar sincronización
            if (window.SyncEngine) {
                await window.SyncEngine.init();
            }
            
            return {
                success: true,
                user: data.user,
                business: data.business
            };
        } catch (error) {
            console.error('❌ Error verificando código:', error);
            throw error;
        }
    }

    // Login con Email
    async loginWithEmail(email, password) {
        try {
            console.log('📧 Iniciando login con email...');
            
            const response = await fetch(`${AUTH_CONFIG.API_URL}/api/auth/email/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Credenciales inválidas');
            }
            
            const data = await response.json();
            
            // Guardar sesión
            await this.saveSession(data.token, data.user, data.business);
            
            console.log('✅ Login exitoso:', data.user.name);
            
            // Inicializar sincronización
            if (window.SyncEngine) {
                await window.SyncEngine.init();
            }
            
            return {
                success: true,
                user: data.user,
                business: data.business
            };
        } catch (error) {
            console.error('❌ Error en login email:', error);
            throw error;
        }
    }

    // Registro con Email
    async registerWithEmail(email, password, name) {
        try {
            console.log('📝 Registrando nuevo usuario...');
            
            const response = await fetch(`${AUTH_CONFIG.API_URL}/api/auth/email/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, name })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Error en registro');
            }
            
            const data = await response.json();
            
            // Guardar sesión
            await this.saveSession(data.token, data.user, data.business);
            
            console.log('✅ Registro exitoso:', data.user.name);
            
            return {
                success: true,
                user: data.user,
                business: data.business
            };
        } catch (error) {
            console.error('❌ Error en registro:', error);
            throw error;
        }
    }

    // Login con PIN
    async loginWithPIN(userId, pin) {
        try {
            console.log('🔢 Iniciando login con PIN...');
            
            const response = await fetch(`${AUTH_CONFIG.API_URL}/api/auth/pin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, pin })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'PIN incorrecto');
            }
            
            const data = await response.json();
            
            // Guardar sesión
            await this.saveSession(data.token, data.user, this.business);
            
            console.log('✅ Login con PIN exitoso');
            
            return {
                success: true,
                user: data.user
            };
        } catch (error) {
            console.error('❌ Error en login PIN:', error);
            throw error;
        }
    }

    // Establecer PIN
    async setPIN(pin) {
        if (!this.user) {
            throw new Error('No hay sesión activa');
        }
        
        try {
            const response = await fetch(`${AUTH_CONFIG.API_URL}/api/auth/pin/set`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ user_id: this.user.id, pin })
            });
            
            if (!response.ok) {
                throw new Error('Error al establecer PIN');
            }
            
            console.log('✅ PIN establecido');
            return { success: true };
        } catch (error) {
            console.error('❌ Error estableciendo PIN:', error);
            throw error;
        }
    }

    // Logout
    async logout() {
        try {
            if (this.token) {
                await fetch(`${AUTH_CONFIG.API_URL}/api/auth/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
            }
        } catch (error) {
            console.error('Error en logout:', error);
        } finally {
            await this.clearSession();
            console.log('✅ Sesión cerrada');
        }
    }

    // Verificar si está autenticado
    isAuthenticated() {
        const authenticated = !!(this.token && this.user && this.business);
        console.log('🔐 Verificando autenticación:', {
            hasToken: !!this.token,
            hasUser: !!this.user,
            hasBusiness: !!this.business,
            authenticated
        });
        return authenticated;
    }

    // Obtener headers con autenticación
    getAuthHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }

    // Helpers de IndexedDB
    async getFromDB(key) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('GallOliDB', window.DB_VERSION || 2);
            
            request.onsuccess = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('auth')) {
                    resolve(null);
                    return;
                }
                
                const transaction = db.transaction(['auth'], 'readonly');
                const store = transaction.objectStore('auth');
                const getRequest = store.get(key);
                
                getRequest.onsuccess = () => resolve(getRequest.result?.value || null);
                getRequest.onerror = () => reject(getRequest.error);
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async saveToDB(key, value) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('GallOliDB', window.DB_VERSION || 2);
            
            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction(['auth'], 'readwrite');
                const store = transaction.objectStore('auth');
                const putRequest = store.put({ key, value });
                
                putRequest.onsuccess = () => resolve();
                putRequest.onerror = () => reject(putRequest.error);
            };
            
            request.onerror = () => reject(request.error);
        });
    }

    async deleteFromDB(key) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('GallOliDB', window.DB_VERSION || 2);
            
            request.onsuccess = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('auth')) {
                    resolve();
                    return;
                }
                
                const transaction = db.transaction(['auth'], 'readwrite');
                const store = transaction.objectStore('auth');
                const deleteRequest = store.delete(key);
                
                deleteRequest.onsuccess = () => resolve();
                deleteRequest.onerror = () => reject(deleteRequest.error);
            };
            
            request.onerror = () => reject(request.error);
        });
    }
}

// Instancia global
window.AuthManager = new AuthManager();
