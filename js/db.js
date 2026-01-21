// db.js - Sistema de persistencia con IndexedDB
// IMPORTANTE: IndexedDB es INDEPENDIENTE del cache del Service Worker
// Los datos en IndexedDB NO se borran al limpiar el cache del navegador
// Solo se borran si explícitamente se elimina la base de datos o se limpia el almacenamiento del sitio
const DB = {
    name: 'GallOliDB',
    version: 1,
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                this.migrateFromLocalStorage();
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Stores para cada módulo
                if (!db.objectStoreNames.contains('clients')) {
                    db.createObjectStore('clients', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('sales')) {
                    const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
                    salesStore.createIndex('date', 'date', { unique: false });
                    salesStore.createIndex('clientId', 'clientId', { unique: false });
                }
                if (!db.objectStoreNames.contains('orders')) {
                    const ordersStore = db.createObjectStore('orders', { keyPath: 'id' });
                    ordersStore.createIndex('status', 'status', { unique: false });
                }
                if (!db.objectStoreNames.contains('expenses')) {
                    const expensesStore = db.createObjectStore('expenses', { keyPath: 'id' });
                    expensesStore.createIndex('date', 'date', { unique: false });
                }
                if (!db.objectStoreNames.contains('prices')) {
                    db.createObjectStore('prices', { keyPath: 'date' });
                }
                if (!db.objectStoreNames.contains('mermaRecords')) {
                    const mermaStore = db.createObjectStore('mermaRecords', { keyPath: 'date' });
                    mermaStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                if (!db.objectStoreNames.contains('diezmos')) {
                    const diezmosStore = db.createObjectStore('diezmos', { keyPath: 'id' });
                    diezmosStore.createIndex('date', 'date', { unique: false });
                }
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('mapTiles')) {
                    const tilesStore = db.createObjectStore('mapTiles', { keyPath: 'url' });
                    tilesStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
                if (!db.objectStoreNames.contains('paymentHistory')) {
                    const paymentHistoryStore = db.createObjectStore('paymentHistory', { keyPath: 'id' });
                    paymentHistoryStore.createIndex('clientId', 'clientId', { unique: false });
                    paymentHistoryStore.createIndex('date', 'date', { unique: false });
                    paymentHistoryStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    },

    async migrateFromLocalStorage() {
        // Migrar datos de localStorage a IndexedDB
        const migrations = [
            { key: 'polloClients', store: 'clients' },
            { key: 'polloSales', store: 'sales' },
            { key: 'polloOrders', store: 'orders' },
            { key: 'polloExpenses', store: 'expenses' },
            { key: 'polloDailyPrices', store: 'prices' },
            { key: 'polloConfig', store: 'config', single: true }
        ];

        for (const migration of migrations) {
            const data = localStorage.getItem(migration.key);
            if (data) {
                try {
                    const parsed = JSON.parse(data);
                    if (migration.single) {
                        await this.set(migration.store, { key: 'main', value: parsed });
                    } else if (Array.isArray(parsed)) {
                        for (const item of parsed) {
                            await this.set(migration.store, item);
                        }
                    }
                    localStorage.removeItem(migration.key);
                } catch (e) {
                    console.error('Error migrating:', migration.key, e);
                }
            }
        }
    },

    async set(storeName, data) {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async get(storeName, key) {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAll(storeName) {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(storeName, key) {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async clear(storeName) {
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async exportAll() {
        const data = {
            clients: await this.getAll('clients'),
            sales: await this.getAll('sales'),
            orders: await this.getAll('orders'),
            expenses: await this.getAll('expenses'),
            prices: await this.getAll('prices'),
            mermaRecords: await this.getAll('mermaRecords'),
            diezmos: await this.getAll('diezmos'),
            config: await this.get('config', 'main'),
            timestamp: new Date().toISOString()
        };
        return data;
    },

    async importAll(data) {
        const stores = ['clients', 'sales', 'orders', 'expenses', 'prices', 'mermaRecords', 'diezmos'];
        for (const store of stores) {
            if (data[store] && Array.isArray(data[store])) {
                await this.clear(store);
                for (const item of data[store]) {
                    await this.set(store, item);
                }
            }
        }
        if (data.config) {
            await this.set('config', { key: 'main', value: data.config });
        }
    }
};
