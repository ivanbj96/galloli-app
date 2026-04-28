// src/native/auto-sale-engine.js
// Motor de venta automática para APK nativo GallOli.
// Solo se ejecuta en APK Capacitor — la TWA y el navegador lo ignoran.
// Vanilla JS (sin imports ES modules) para compatibilidad con el proyecto.

(function() {
'use strict';

// ─── Guard: solo APK nativo ──────────────────────────────────────────────────
function isApkNative() {
    try {
        var cap = window.Capacitor;
        if (!cap || typeof cap.isNativePlatform !== 'function') return false;
        if (!cap.isNativePlatform()) return false;
        if (cap.getPlatform && cap.getPlatform() !== 'android') return false;
        return true;
    } catch(e) { return false; }
}

// ─── Configuración ───────────────────────────────────────────────────────────
var cfg = {
    mode: 'auto',               // 'auto' | 'confirm'
    minWeightLb: 3.50,          // mínimo para registrar
    stableReadings: 3,          // lecturas estables requeridas
    stableWindowMs: 2000,       // ventana de estabilidad
    minIntervalSamePlaceMs: 60000, // 1 min entre ventas al mismo cliente
    geofenceRadiusM: 150,       // radio de detección
    sriEnabled: false
};

// ─── Estado ──────────────────────────────────────────────────────────────────
var weightBuffer = [];
var lastSaleByClient = {};      // clientId -> timestamp
var currentZone = null;         // cliente activo en geofence
var watchId = null;
var initialized = false;

// ─── Init ────────────────────────────────────────────────────────────────────
window.initNativeAutoSale = function(userCfg) {
    if (!isApkNative()) {
        console.info('[galloli/native] auto-sale-engine desactivado (no es APK nativo)');
        return;
    }
    if (initialized) return;
    initialized = true;

    if (userCfg) Object.assign(cfg, userCfg);

    console.info('[galloli/native] Iniciando motor de venta automática...');

    // Arrancar foreground service
    _startBgService('Esperando clientes');

    // Iniciar geofence GPS
    _startGeofence();

    // Escuchar peso de la balanza (BluetoothScale ya está inicializado)
    if (window.BluetoothScale) {
        BluetoothScale.onWeight(function(w) {
            _onWeightReading(BluetoothScale.currentRawWeight);
        });
    }

    // Iniciar FCM para comandos remotos
    _initFcm();

    // Escuchar ventas automáticas del servicio nativo (cuando app vuelve a primer plano)
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) _processPendingNativeSales();
    });

    console.info('[galloli/native] Motor iniciado. Modo:', cfg.mode);
};

// ─── Foreground Service ───────────────────────────────────────────────────────
function _startBgService(text) {
    var plugin = _getPlugin('BleForeground');
    if (plugin) {
        plugin.start().catch(function(){});
    }
}

function _updateBgText(text) {
    // La notificación se actualiza via BleForegroundService.updateNotification
    // que ya está implementado en el servicio Java/Kotlin
}

// ─── Geofence GPS ─────────────────────────────────────────────────────────────
function _startGeofence() {
    var Geolocation = _getCapPlugin('Geolocation');

    if (Geolocation) {
        // APK: usar @capacitor/geolocation
        Geolocation.requestPermissions().then(function() {
            Geolocation.watchPosition(
                { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
                function(pos, err) {
                    if (err || !pos) return;
                    _checkZone(pos.coords.latitude, pos.coords.longitude);
                }
            ).then(function(id) { watchId = id; });
        }).catch(function(e) {
            console.warn('[galloli/native] Geolocation no disponible:', e);
            _fallbackGps();
        });
    } else {
        _fallbackGps();
    }
}

function _fallbackGps() {
    // Fallback: leer GPS del BleForegroundService nativo cada 4s
    var plugin = _getPlugin('BleForeground');
    if (plugin) {
        setInterval(function() {
            plugin.getLocation().then(function(loc) {
                if (loc && loc.hasLocation) {
                    _checkZone(loc.lat, loc.lng);
                }
            }).catch(function(){});
        }, 4000);
    } else if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            function(pos) { _checkZone(pos.coords.latitude, pos.coords.longitude); },
            function() {},
            { enableHighAccuracy: true, maximumAge: 5000 }
        );
    }
}

function _checkZone(lat, lng) {
    var clients = _getClientsWithCoords();
    var nearest = null;
    var nearestDist = Infinity;

    clients.forEach(function(c) {
        var d = _haversineM(lat, lng, c.lat, c.lng);
        if (d < cfg.geofenceRadiusM && d < nearestDist) {
            nearest = c;
            nearestDist = d;
        }
    });

    if (nearest && (!currentZone || currentZone.id !== nearest.id)) {
        currentZone = nearest;
        console.info('[galloli/native] Zona activa:', nearest.name, Math.round(nearestDist) + 'm');
        weightBuffer = [];
    } else if (!nearest && currentZone) {
        currentZone = null;
        weightBuffer = [];
    }
}

// ─── Peso ─────────────────────────────────────────────────────────────────────
function _onWeightReading(lb) {
    if (!currentZone) return;
    if (lb < cfg.minWeightLb) return;

    var now = Date.now();
    weightBuffer = weightBuffer.filter(function(r) { return now - r.t < cfg.stableWindowMs; });
    weightBuffer.push({ lb: lb, t: now });

    if (weightBuffer.length < cfg.stableReadings) return;

    // Verificar estabilidad: spread < 0.07 lb (~30g)
    var lbs = weightBuffer.map(function(r) { return r.lb; });
    var spread = Math.max.apply(null, lbs) - Math.min.apply(null, lbs);
    if (spread > 0.07) return;

    var stableLb = parseFloat((lbs.reduce(function(a,b){return a+b;},0) / lbs.length).toFixed(3));

    // Dedupe: una venta por cliente cada minIntervalSamePlaceMs
    var last = lastSaleByClient[currentZone.id] || 0;
    if (now - last < cfg.minIntervalSamePlaceMs) return;

    weightBuffer = [];
    lastSaleByClient[currentZone.id] = now;

    var sale = _buildSaleDraft(currentZone, stableLb);

    if (cfg.mode === 'auto') {
        _commitSale(sale);
    } else {
        _promptConfirm(sale);
    }
}

function _buildSaleDraft(zone, lb) {
    var salePrice = (window.MermaModule && MermaModule.getTodaySalePrice()) || 0;
    var total = parseFloat((lb * salePrice).toFixed(2));
    return {
        clientId: zone.id,
        clientName: zone.name,
        weightLb: lb,
        salePrice: salePrice,
        total: total,
        ts: Date.now(),
        autoGenerated: true,
        isPaid: true,
        quantity: 1
    };
}

function _commitSale(sale) {
    if (!sale.salePrice || sale.salePrice <= 0) {
        console.warn('[galloli/native] Sin precio del día, venta no registrada');
        return;
    }

    // Registrar en SalesModule (IndexedDB)
    if (window.SalesModule && window.ClientsModule) {
        var s = SalesModule.addSale(
            sale.clientId, sale.weightLb, sale.quantity,
            sale.salePrice, null, sale.isPaid
        );
        ClientsModule.updateClientStats(sale.clientId, sale.weightLb, sale.quantity, s.total);
        console.info('[galloli/native] Venta registrada:', sale.clientName, sale.weightLb + 'lb', '$' + s.total);
    } else {
        // Fallback: guardar en cola para procesar cuando el WebView esté listo
        window.dispatchEvent(new CustomEvent('galloli:auto-sale', { detail: sale }));
    }

    // Notificación local
    _showSaleNotification(sale);
}

function _promptConfirm(sale) {
    // En modo confirm: mostrar notificación con botones
    _showConfirmNotification(sale);
}

// ─── Notificaciones ───────────────────────────────────────────────────────────
function _showSaleNotification(sale) {
    var LocalNotifications = _getCapPlugin('LocalNotifications');
    if (LocalNotifications) {
        LocalNotifications.schedule({
            notifications: [{
                id: Math.floor(Math.random() * 1e6),
                title: 'Venta registrada — ' + sale.clientName,
                body: sale.weightLb.toFixed(3) + ' lb — $' + sale.total.toFixed(2),
                smallIcon: 'ic_notification',
                sound: null
            }]
        }).catch(function(){});
    }

    // Vibración
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
}

function _showConfirmNotification(sale) {
    var LocalNotifications = _getCapPlugin('LocalNotifications');
    if (LocalNotifications) {
        LocalNotifications.schedule({
            notifications: [{
                id: Math.floor(Math.random() * 1e6),
                title: 'Confirmar venta — ' + sale.clientName,
                body: sale.weightLb.toFixed(3) + ' lb — $' + sale.total.toFixed(2) + ' — Abre la app para confirmar',
                smallIcon: 'ic_notification',
                ongoing: true
            }]
        }).catch(function(){});
    }
}

// ─── FCM ──────────────────────────────────────────────────────────────────────
function _initFcm() {
    var FirebaseMessaging = _getCapPlugin('FirebaseMessaging');
    if (!FirebaseMessaging) {
        // Fallback: usar GalloliFirebaseService (ya implementado en Java)
        // El token se guarda en SharedPreferences y el JS lo lee al iniciar
        _readFcmTokenFromPrefs();
        return;
    }

    FirebaseMessaging.requestPermissions().then(function(perm) {
        if (perm.receive !== 'granted') return;
        return FirebaseMessaging.getToken();
    }).then(function(result) {
        if (!result) return;
        var token = result.token;
        console.info('[galloli/fcm] Token FCM:', token.substring(0, 20) + '...');
        _registerFcmToken(token);

        FirebaseMessaging.addListener('notificationReceived', function(ev) {
            var data = ev.notification && ev.notification.data;
            if (data && data.type) _handleRemoteCommand(data);
        });
    }).catch(function(e) {
        console.warn('[galloli/fcm] Error FCM:', e);
        _readFcmTokenFromPrefs();
    });
}

function _readFcmTokenFromPrefs() {
    // GalloliFirebaseService.java guarda el token en SharedPreferences
    // El plugin BleForeground puede leerlo
    var plugin = _getPlugin('BleForeground');
    if (!plugin) return;
    // El token se registra cuando el JS llama a la API del Worker
    // al iniciar la app (ya implementado en notify-system.js)
}

function _registerFcmToken(token) {
    // Registrar token en el Worker para recibir push
    var authToken = window.AuthManager && window.AuthManager.token;
    if (!authToken) return;
    fetch('https://galloli-sync.ivanbj-96.workers.dev/api/fcm/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({ token: token, platform: 'android-apk' })
    }).catch(function(){});
}

function _handleRemoteCommand(cmd) {
    switch(cmd.type) {
        case 'pause':      cfg.mode = 'confirm'; break;
        case 'resume':     cfg.mode = 'auto'; break;
        case 'reload':     window.location.reload(); break;
        case 'set-radius': cfg.geofenceRadiusM = parseFloat(cmd.value) || cfg.geofenceRadiusM; break;
        case 'force-sync':
            if (window.SyncEngine) SyncEngine.forceFullSync();
            break;
    }
    console.info('[galloli/native] Comando remoto:', cmd.type);
}

// ─── Ventas pendientes del servicio nativo ────────────────────────────────────
function _processPendingNativeSales() {
    var plugin = _getPlugin('BleForeground');
    if (!plugin) return;
    plugin.getPendingSales().then(function(result) {
        if (!result || !result.sales) return;
        var sales;
        try { sales = JSON.parse(result.sales); } catch(e) { return; }
        if (!Array.isArray(sales) || sales.length === 0) return;

        var processed = 0;
        sales.forEach(function(s) {
            try {
                var clientId = parseInt(s.clientId) || s.clientId;
                if (window.SalesModule && window.ClientsModule) {
                    var sale = SalesModule.addSale(clientId, s.weight, s.quantity || 1, s.salePrice, null, s.isPaid !== false);
                    ClientsModule.updateClientStats(clientId, s.weight, s.quantity || 1, sale.total);
                    processed++;
                }
            } catch(e) { console.error('[galloli/native] Error procesando venta:', e); }
        });

        if (processed > 0) {
            plugin.clearPendingSales().catch(function(){});
            if (window.Utils) {
                Utils.showNotification(processed + ' venta' + (processed > 1 ? 's' : '') + ' registrada' + (processed > 1 ? 's' : '') + ' en segundo plano', 'success', 4000);
            }
        }
    }).catch(function(){});
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
function _getClientsWithCoords() {
    if (!window.ClientsModule || !ClientsModule.clients) return [];
    return ClientsModule.clients
        .filter(function(c) {
            return c.isActive !== false &&
                   c.coordinates &&
                   c.coordinates.lat !== null && c.coordinates.lat !== undefined &&
                   c.coordinates.lng !== null && c.coordinates.lng !== undefined;
        })
        .map(function(c) {
            return {
                id: c.id,
                name: c.name,
                lat: parseFloat(c.coordinates.lat),
                lng: parseFloat(c.coordinates.lng)
            };
        })
        .filter(function(c) { return !isNaN(c.lat) && !isNaN(c.lng); });
}

function _haversineM(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function _getPlugin(name) {
    return window.Capacitor &&
           window.Capacitor.Plugins &&
           window.Capacitor.Plugins[name] || null;
}

function _getCapPlugin(name) {
    // Intenta obtener plugin de @capacitor/* si está disponible
    return _getPlugin(name);
}

})();
