// offline-maps.js - Sistema de mapas offline
const OfflineMaps = {
    tileCache: new Map(),
    defaultCenter: [19.4326, -99.1332],
    defaultZoom: 12,

    // Crear mapa offline
    createMap(elementId, options = {}) {
        const element = document.getElementById(elementId);
        if (!element) return null;

        const map = L.map(elementId, {
            center: options.center || this.defaultCenter,
            zoom: options.zoom || this.defaultZoom,
            zoomControl: true
        });

        // Usar tiles offline-first
        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19,
            crossOrigin: true
        });

        // Interceptar carga de tiles para cachear
        tileLayer.on('tileload', (e) => {
            this.cacheTile(e.tile.src, e.tile);
        });

        tileLayer.addTo(map);

        // Si no hay conexión, usar tiles cacheados
        if (!navigator.onLine) {
            this.loadCachedTiles(map);
        }

        return map;
    },

    async cacheTile(url, tile) {
        try {
            if (!this.tileCache.has(url)) {
                const canvas = document.createElement('canvas');
                canvas.width = tile.width;
                canvas.height = tile.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(tile, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                
                this.tileCache.set(url, dataUrl);
                
                // Guardar en IndexedDB
                if (DB.db) {
                    await DB.set('mapTiles', {
                        url: url,
                        data: dataUrl,
                        timestamp: Date.now()
                    });
                }
            }
        } catch (e) {
            console.error('Error caching tile:', e);
        }
    },

    async loadCachedTiles(map) {
        try {
            const tiles = await DB.getAll('mapTiles');
            tiles.forEach(tile => {
                this.tileCache.set(tile.url, tile.data);
            });
        } catch (e) {
            console.error('Error loading cached tiles:', e);
        }
    },

    // Crear marcador personalizado
    createMarker(lat, lng, options = {}) {
        const icon = L.divIcon({
            className: 'custom-marker',
            html: `
                <div style="
                    background: ${options.color || 'var(--primary)'}; 
                    color: white; 
                    width: ${options.size || 30}px; 
                    height: ${options.size || 30}px; 
                    border-radius: 50%; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    font-weight: bold; 
                    border: 3px solid white;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                ">
                    ${options.label || ''}
                </div>
            `,
            iconSize: [options.size || 30, options.size || 30],
            iconAnchor: [(options.size || 30) / 2, (options.size || 30) / 2]
        });

        return L.marker([lat, lng], { icon });
    },

    // Obtener ubicación sin internet (usar última conocida)
    async getOfflineLocation() {
        const lastLocation = localStorage.getItem('lastKnownLocation');
        if (lastLocation) {
            return JSON.parse(lastLocation);
        }
        return {
            latitude: this.defaultCenter[0],
            longitude: this.defaultCenter[1],
            address: 'Ubicación predeterminada (sin conexión)'
        };
    },

    // Guardar ubicación para uso offline
    saveLocation(lat, lng, address) {
        const location = { latitude: lat, longitude: lng, address, timestamp: Date.now() };
        localStorage.setItem('lastKnownLocation', JSON.stringify(location));
        return location;
    },

    // Calcular distancia entre dos puntos (Haversine)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radio de la Tierra en km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
};
