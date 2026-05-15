// android/app/src/main/java/store/ivapps/galloli/BleForegroundService.java
package store.ivapps.galloli;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.UUID;

public class BleForegroundService extends Service {

    // ─── Canales de notificación ──────────────────────────────────────────────
    // Canal persistente (baja prioridad) — siempre visible en la barra
    public static final String CHANNEL_PERSISTENT = "galloli_ble_channel";
    // Canal de alertas v2 — ID nuevo para forzar IMPORTANCE_HIGH en dispositivos con canal viejo
    public static final String CHANNEL_ALERTS     = "galloli_alerts_channel_v2";

    public static final int NOTIFICATION_ID       = 1001;
    public static final int NOTIFICATION_SALE_ID  = 1002; // heads-up de venta registrada

    // Acciones
    public static final String ACTION_START           = "START_BLE_SERVICE";
    public static final String ACTION_STOP            = "STOP_BLE_SERVICE";
    public static final String ACTION_UPDATE_WEIGHT   = "UPDATE_WEIGHT";
    public static final String ACTION_SYNC_CLIENTS    = "SYNC_CLIENTS";
    public static final String ACTION_SYNC_PRICE      = "SYNC_PRICE";
    public static final String ACTION_JS_CONNECTED    = "JS_BLE_CONNECTED";   // JS conectó la balanza
    public static final String ACTION_JS_DISCONNECTED = "JS_BLE_DISCONNECTED"; // JS desconectó
    public static final String EXTRA_WEIGHT           = "weight";
    public static final String EXTRA_CLIENTS_JSON     = "clients_json";
    public static final String EXTRA_PRICE            = "price";
    public static final String EXTRA_DEVICE_ID        = "device_id";

    // SharedPreferences keys
    public static final String PREFS_NAME         = "galloli_prefs";
    public static final String KEY_CLIENTS        = "clients_json";
    public static final String KEY_SALE_PRICE     = "sale_price";
    public static final String KEY_PENDING_SALES  = "pending_sales";
    public static final String KEY_BLE_DEVICE_ID  = "ble_device_id";
    public static final String KEY_SALES_TODAY    = "sales_today_count";
    public static final String KEY_TOTAL_TODAY    = "sales_today_total";

    // BLE UUIDs CAMRY
    private static final UUID SERVICE_UUID = UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb");
    private static final UUID CHAR_UUID    = UUID.fromString("0000ffe1-0000-1000-8000-00805f9b34fb");
    private static final UUID CCCD_UUID    = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private static final String TAG = "GalloliService";

    // GPS — FusedLocationProviderClient (alta precision)
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback            locationCallback;
    private static double  lastLat     = 0;
    private static double  lastLng     = 0;
    private static float   lastAccuracy = 999f;
    private static boolean hasLocation = false;

    // BLE nativo
    private BluetoothGatt bleGatt;
    private boolean       bleConnected    = false;
    private boolean       jsHasControl    = false; // true = JS controla BLE, servicio no reconecta
    private Handler       mainHandler;

    // Estado de pesaje automático
    private double   lastRawWeight  = 0;
    private boolean  waitingForZero = false;
    private Runnable stableRunnable = null;
    private static final double MIN_WEIGHT_LB   = 3.50;
    private static final double ZERO_THRESHOLD  = 0.50;
    private static final long   STABLE_MS       = 1500;
    private static final double CLIENT_RADIUS_M = 500.0;

    // Deduplicacion de ventas por cliente
    private static final String KEY_LAST_CLIENT_ID = "last_sale_client_id";
    private static final String KEY_LAST_SALE_TS   = "last_sale_ts";
    private static final long   MIN_INTERVAL_SAME_CLIENT_MS = 60_000;

    // Peso compartido con el Plugin
    private static double currentWeight = 0;
    private int    salesToday = 0;
    private double totalToday = 0.0;
    private String nearestClientName = null;

    @Override
    public void onCreate() {
        super.onCreate();
        mainHandler = new Handler(Looper.getMainLooper());
        currentWeight = 0;
        // Resetear chain_modal_active para evitar bloqueo tras cierres bruscos
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit().putBoolean("chain_modal_active", false).apply();
        createNotificationChannels();
        // Restaurar contadores del día desde SharedPreferences
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        salesToday = prefs.getInt(KEY_SALES_TODAY, 0);
        totalToday = prefs.getFloat(KEY_TOTAL_TODAY, 0);
        startGpsTracking();
        reconnectBleIfNeeded();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            startForegroundCompat();
            return START_STICKY;
        }

        switch (intent.getAction() != null ? intent.getAction() : "") {

            case ACTION_STOP:
                stopGpsTracking();
                disconnectBle();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_REMOVE);
                } else {
                    stopForeground(true);
                }
                stopSelf();
                return START_NOT_STICKY;

            case ACTION_UPDATE_WEIGHT:
                currentWeight = intent.getDoubleExtra(EXTRA_WEIGHT, 0);
                // Si el JS está enviando peso, significa que tiene la conexión activa
                if (currentWeight > 0 && !bleConnected) {
                    bleConnected = true;
                    refreshPersistentNotification();
                }
                return START_STICKY;

            case ACTION_JS_CONNECTED:
                // JS conectó la balanza — marcar como conectada y ceder control al JS
                jsHasControl = true;
                bleConnected = true;
                String devId = intent.getStringExtra(EXTRA_DEVICE_ID);
                if (devId != null) {
                    getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                        .edit().putString(KEY_BLE_DEVICE_ID, devId).apply();
                }
                // Cerrar solo el GATT nativo para no competir con JS,
                // pero NO marcar la balanza como desconectada.
                closeNativeGattOnly();
                Log.d(TAG, "JS tiene control BLE — servicio en modo pasivo conectado");
                refreshPersistentNotification();
                return START_STICKY;

            case ACTION_JS_DISCONNECTED:
                // JS desconectó — servicio toma el control y reconecta
                jsHasControl = false;
                bleConnected = false;
                Log.d(TAG, "JS liberó BLE — servicio reconectando...");
                refreshPersistentNotification();
                mainHandler.postDelayed(() -> reconnectBleIfNeeded(), 2000);
                return START_STICKY;

            case ACTION_SYNC_CLIENTS:
                String clientsJson = intent.getStringExtra(EXTRA_CLIENTS_JSON);
                if (clientsJson != null) {
                    getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                        .edit().putString(KEY_CLIENTS, clientsJson).apply();
                    Log.d(TAG, "Clientes sincronizados");
                    refreshNearestClient();
                    refreshPersistentNotification();
                }
                return START_STICKY;

            case ACTION_SYNC_PRICE:
                double price = intent.getDoubleExtra(EXTRA_PRICE, 0);
                if (price > 0) {
                    getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                        .edit().putFloat(KEY_SALE_PRICE, (float) price).apply();
                    Log.d(TAG, "Precio sincronizado: " + price);
                    refreshPersistentNotification();
                }
                return START_STICKY;

            default:
                startForegroundCompat();
                return START_STICKY;
        }
    }

    // ─── Foreground ───────────────────────────────────────────────────────────

    private void startForegroundCompat() {
        Notification n = buildPersistentNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE;
            try {
                type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
                startForeground(NOTIFICATION_ID, n, type);
            } catch (Exception e) {
                startForeground(NOTIFICATION_ID, n,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            }
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    // ─── GPS — FusedLocationProviderClient alta precision ─────────────────────

    private void startGpsTracking() {
        try {
            fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);

            // Solicitar ultima ubicacion conocida como punto de partida
            fusedLocationClient.getLastLocation().addOnSuccessListener(loc -> {
                if (loc != null && loc.getAccuracy() <= 50f) {
                    lastLat = loc.getLatitude();
                    lastLng = loc.getLongitude();
                    lastAccuracy = loc.getAccuracy();
                    hasLocation = true;
                    refreshNearestClient();
                    refreshPersistentNotification();
                }
            });

            // Configurar solicitud de alta precision: intervalo 2s, descartar accuracy > 8m
            LocationRequest req = new LocationRequest.Builder(
                    Priority.PRIORITY_HIGH_ACCURACY, 2000L)
                .setMinUpdateIntervalMillis(1000L)
                .setMinUpdateDistanceMeters(0f)
                .setWaitForAccurateLocation(true)
                .setMaxUpdateDelayMillis(2000L)
                .build();

            locationCallback = new LocationCallback() {
                @Override
                public void onLocationResult(@NonNull LocationResult result) {
                    Location loc = result.getLastLocation();
                    if (loc == null) return;
                    // Descartar lecturas con precision peor que 8m
                    if (loc.getAccuracy() > 8f) {
                        Log.d(TAG, "GPS descartado: accuracy=" + loc.getAccuracy() + "m");
                        return;
                    }
                    lastLat = loc.getLatitude();
                    lastLng = loc.getLongitude();
                    lastAccuracy = loc.getAccuracy();
                    hasLocation = true;
                    Log.d(TAG, "GPS actualizado: " + lastLat + "," + lastLng + " acc=" + lastAccuracy + "m");
                    refreshNearestClient();
                    refreshPersistentNotification();
                }
            };

            fusedLocationClient.requestLocationUpdates(req, locationCallback, Looper.getMainLooper());
            Log.d(TAG, "GPS FusedLocation iniciado (alta precision, 2s)");
        } catch (SecurityException e) {
            Log.e(TAG, "Sin permiso GPS: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error iniciando GPS: " + e.getMessage());
        }
    }

    private void stopGpsTracking() {
        try {
            if (fusedLocationClient != null && locationCallback != null) {
                fusedLocationClient.removeLocationUpdates(locationCallback);
            }
        } catch (Exception e) { /* ignorar */ }
    }

    // ─── BLE nativo ───────────────────────────────────────────────────────────

    private void reconnectBleIfNeeded() {
        // Si el JS tiene el control BLE, no reconectar desde Java
        if (jsHasControl) {
            Log.d(TAG, "JS tiene control BLE — no reconectar desde servicio");
            return;
        }
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String deviceId = prefs.getString(KEY_BLE_DEVICE_ID, null);
        if (deviceId == null) return;
        try {
            BluetoothManager bm = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
            if (bm == null) return;
            BluetoothAdapter adapter = bm.getAdapter();
            if (adapter == null || !adapter.isEnabled()) return;
            BluetoothDevice device = adapter.getRemoteDevice(deviceId);
            connectBleDevice(device);
        } catch (Exception e) {
            Log.e(TAG, "Error reconectando BLE: " + e.getMessage());
        }
    }

    private void connectBleDevice(BluetoothDevice device) {
        if (bleGatt != null) {
            try { bleGatt.close(); } catch (Exception e) { /* ignorar */ }
            bleGatt = null;
        }
        bleGatt = device.connectGatt(this, true, new BluetoothGattCallback() {

            @Override
            public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    bleConnected = true;
                    Log.d(TAG, "BLE conectado en background");
                    refreshPersistentNotification();
                    gatt.discoverServices();
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    bleConnected = false;
                    Log.d(TAG, "BLE desconectado, reintentando en 5s...");
                    refreshPersistentNotification();
                    mainHandler.postDelayed(() -> reconnectBleIfNeeded(), 5000);
                }
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                BluetoothGattService service = gatt.getService(SERVICE_UUID);
                if (service == null) return;
                BluetoothGattCharacteristic ch = service.getCharacteristic(CHAR_UUID);
                if (ch == null) return;
                gatt.setCharacteristicNotification(ch, true);
                BluetoothGattDescriptor desc = ch.getDescriptor(CCCD_UUID);
                if (desc != null) {
                    desc.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    gatt.writeDescriptor(desc);
                }
                Log.d(TAG, "BLE notificaciones activadas en background");
            }

            @Override
            public void onCharacteristicChanged(BluetoothGatt gatt,
                                                BluetoothGattCharacteristic characteristic) {
                byte[] data = characteristic.getValue();
                if (data == null) return;
                double weight = parseWeightFromBytes(data);
                handleWeightReading(weight);
            }
        });
    }

    private void disconnectBle() {
        bleConnected = false;
        if (bleGatt != null) {
            try { bleGatt.disconnect(); bleGatt.close(); } catch (Exception e) { /* ignorar */ }
            bleGatt = null;
        }
    }

    // Cierra solo el GATT nativo sin cambiar bleConnected — usado cuando JS toma control
    private void closeNativeGattOnly() {
        if (bleGatt != null) {
            try { bleGatt.disconnect(); bleGatt.close(); } catch (Exception e) { /* ignorar */ }
            bleGatt = null;
        }
    }

    // ─── Parseo de peso (mismo protocolo que bluetooth-scale.js) ─────────────

    private double parseWeightFromBytes(byte[] data) {
        // 1) Intento ASCII (formato CAMRY) — siempre retorna si hay match (incluido 0)
        boolean asciiOk = false;
        try {
            String text = new String(data, "UTF-8").trim();
            if (text.length() > 0) {
                java.util.regex.Pattern p = java.util.regex.Pattern.compile(
                    "([+-]?\\s*\\d+\\.?\\d*)\\s*(kg|lb|g)",
                    java.util.regex.Pattern.CASE_INSENSITIVE);
                java.util.regex.Matcher m = p.matcher(text);
                if (m.find()) {
                    asciiOk = true;
                    double val = Double.parseDouble(m.group(1).replaceAll("\\s", ""));
                    String unit = m.group(2).toLowerCase();
                    if (!Double.isFinite(val)) return -1;
                    // CAMRY reporta kg pero display muestra lb — x2 es correcto para esta balanza
                    double lb;
                    if (unit.equals("kg"))      lb = val * 2;
                    else if (unit.equals("g"))  lb = val / 453.592;
                    else                        lb = val;
                    // Retornar SIEMPRE (incluido 0) — no caer al parser binario
                    return Math.round(lb * 100.0) / 100.0;
                }
            }
        } catch (Exception e) { /* ignorar */ }

        // 2) Fallback binario SOLO si el frame NO era ASCII legible
        if (asciiOk) return -1;

        // Sanity check: si los bytes parecen ASCII imprimible, no reinterpretar como binario
        boolean looksAscii = true;
        for (int i = 0; i < Math.min(8, data.length); i++) {
            int b = data[i] & 0xFF;
            if (b != 0 && (b < 0x20 || b > 0x7E)) { looksAscii = false; break; }
        }
        if (looksAscii) return -1;

        if (data.length >= 3) {
            int flags = data[0] & 0xFF;
            int raw = ((data[2] & 0xFF) << 8) | (data[1] & 0xFF);
            if (raw > 0 && raw < 60000) {
                if ((flags & 0x01) != 0) return raw * 0.01;
                return Math.round(raw * 0.005 * 2.20462 * 1000.0) / 1000.0;
            }
        }
        return -1; // frame invalido
    }

    // ─── Logica de pesaje automatico ──────────────────────────────────────────

    private void handleWeightReading(double weight) {
        // -1 = frame invalido del parser → reset a 0, no congelar valor anterior
        if (weight < 0) {
            if (currentWeight != 0) {
                currentWeight = 0;
                refreshPersistentNotification();
            }
            return;
        }

        currentWeight = weight; // Siempre actualizar (incluido 0)

        // Si el JS tiene el modal de cadena abierto, no registrar desde Java
        SharedPreferences chainPrefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (chainPrefs.getBoolean("chain_modal_active", false)) {
            return;
        }

        if (waitingForZero) {
            if (weight < ZERO_THRESHOLD) {
                waitingForZero = false;
                lastRawWeight = 0;
                refreshPersistentNotification();
            }
            return;
        }

        if (Math.abs(weight - lastRawWeight) > 0.01) {
            lastRawWeight = weight;
            if (stableRunnable != null) {
                mainHandler.removeCallbacks(stableRunnable);
                stableRunnable = null;
            }
            if (weight > MIN_WEIGHT_LB) {
                // Actualizar notificación con el peso en tiempo real
                updatePersistentNotificationText(
                    buildTitle(),
                    "Pesando: " + String.format("%.3f", weight) + " lb — estabilizando..."
                );
                final double captured = weight;
                stableRunnable = () -> {
                    if (Math.abs(currentWeight - captured) < 0.05) {
                        tryAutoSale(captured);
                    }
                };
                mainHandler.postDelayed(stableRunnable, STABLE_MS);
            } else if (weight < ZERO_THRESHOLD) {
                refreshPersistentNotification();
            }
        }
    }

    private void tryAutoSale(double weight) {
        if (!hasLocation) {
            updatePersistentNotificationText(buildTitle(), "Sin GPS — activa la ubicacion");
            return;
        }

        String nearestId = findNearestClientId();
        if (nearestId == null) {
            updatePersistentNotificationText(buildTitle(),
                "Sin cliente en " + (int) CLIENT_RADIUS_M + "m — " +
                String.format("%.3f", weight) + " lb no registrado");
            return;
        }

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        double salePrice = prefs.getFloat(KEY_SALE_PRICE, 0);
        if (salePrice <= 0) {
            updatePersistentNotificationText(buildTitle(), "Sin precio del dia configurado");
            return;
        }

        // Deduplicacion: evitar doble venta al mismo cliente en menos de 60s
        String lastClientId = prefs.getString(KEY_LAST_CLIENT_ID, null);
        long lastSaleTs = prefs.getLong(KEY_LAST_SALE_TS, 0);
        long nowMs = System.currentTimeMillis();
        if (nearestId.equals(lastClientId) && nowMs - lastSaleTs < MIN_INTERVAL_SAME_CLIENT_MS) {
            updatePersistentNotificationText(buildTitle(), "Venta duplicada evitada — retira el pollo");
            waitingForZero = true;
            return;
        }

        savePendingSale(nearestId, weight, salePrice);
        waitingForZero = true;

        // Guardar para deduplicacion
        prefs.edit()
            .putString(KEY_LAST_CLIENT_ID, nearestId)
            .putLong(KEY_LAST_SALE_TS, nowMs)
            .apply();

        String clientName = getClientName(nearestId);
        double total = weight * salePrice;

        // Actualizar contadores del día
        salesToday++;
        totalToday += total;
        prefs.edit()
            .putInt(KEY_SALES_TODAY, salesToday)
            .putFloat(KEY_TOTAL_TODAY, (float) totalToday)
            .apply();

        Log.d(TAG, "Venta automatica: " + clientName + " " + weight + "lb $" + total);

        // 1. Actualizar notificación persistente con resumen del día
        refreshPersistentNotification();

        // 2. Mostrar heads-up (notificación emergente) con el detalle de la venta
        showSaleHeadsUp(clientName, weight, total);
    }

    // ─── Notificaciones ───────────────────────────────────────────────────────

    /**
     * Construye el título de la notificación persistente según el estado actual.
     */
    private String buildTitle() {
        if (!bleConnected) return "GallOli — Balanza desconectada";
        if (!hasLocation)  return "GallOli — Sin GPS";
        if (nearestClientName != null) return "GallOli — " + nearestClientName;
        return "GallOli — Pesaje activo";
    }

    /**
     * Construye el texto de la notificación persistente según el estado actual.
     */
    private String buildText() {
        StringBuilder sb = new StringBuilder();

        if (!bleConnected) {
            sb.append("Reconectando balanza...");
        } else if (waitingForZero) {
            sb.append("Retira el pollo de la balanza");
        } else if (nearestClientName != null) {
            sb.append("Pon un pollo");
            if (salesToday > 0) {
                sb.append(" | Hoy: ").append(salesToday).append(" venta")
                  .append(salesToday > 1 ? "s" : "")
                  .append(" $").append(String.format("%.2f", totalToday));
            }
        } else if (hasLocation) {
            sb.append("Sin cliente en ").append((int) CLIENT_RADIUS_M).append("m");
            if (salesToday > 0) {
                sb.append(" | Hoy: ").append(salesToday)
                  .append(" $").append(String.format("%.2f", totalToday));
            }
        } else {
            sb.append("Buscando GPS...");
        }

        return sb.toString();
    }

    /**
     * Reconstruye y actualiza la notificación persistente con el estado actual.
     */
    private void refreshPersistentNotification() {
        updatePersistentNotificationText(buildTitle(), buildText());
    }

    /**
     * Actualiza el texto de la notificación persistente (barra de estado).
     */
    private void updatePersistentNotificationText(String title, String text) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.notify(NOTIFICATION_ID, buildPersistentNotification(title, text));
    }

    /**
     * Construye la notificación persistente con el estado actual.
     */
    private Notification buildPersistentNotification() {
        return buildPersistentNotification(buildTitle(), buildText());
    }

    private Notification buildPersistentNotification(String title, String text) {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_PERSISTENT)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setContentIntent(pi)
            .setOnlyAlertOnce(true)   // no hacer sonido al actualizar
            .build();
    }

    /**
     * Muestra una notificación emergente (heads-up) cuando se registra una venta.
     * Esta notificación aparece aunque la pantalla esté apagada.
     */
    private void showSaleHeadsUp(String clientName, double weight, double total) {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 1, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String title = "Venta registrada — " + clientName;
        String text  = String.format("%.3f", weight) + " lb — $" + String.format("%.2f", total)
                     + " | Hoy: " + salesToday + " ventas $" + String.format("%.2f", totalToday);

        Notification n = new NotificationCompat.Builder(this, CHANNEL_ALERTS)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_VIBRATE)
            .build();

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_SALE_ID, n);
    }

    // ─── Clientes ─────────────────────────────────────────────────────────────

    private void refreshNearestClient() {
        if (!hasLocation) { nearestClientName = null; return; }
        String id = findNearestClientId();
        nearestClientName = id != null ? getClientName(id) : null;
    }

    private String findNearestClientId() {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String json = prefs.getString(KEY_CLIENTS, null);
            if (json == null) return null;

            JSONArray clients = new JSONArray(json);
            String nearestId = null;
            double minDist = Double.MAX_VALUE;

            for (int i = 0; i < clients.length(); i++) {
                JSONObject c = clients.getJSONObject(i);
                if (!c.optBoolean("isActive", true)) continue;
                JSONObject coords = c.optJSONObject("coordinates");
                if (coords == null) continue;
                double cLat = coords.optDouble("lat", 0);
                double cLng = coords.optDouble("lng", 0);
                if (cLat == 0 && cLng == 0) continue;
                double dist = haversineM(lastLat, lastLng, cLat, cLng);
                if (dist < CLIENT_RADIUS_M && dist < minDist) {
                    minDist = dist;
                    nearestId = String.valueOf(c.opt("id"));
                }
            }
            return nearestId;
        } catch (Exception e) {
            Log.e(TAG, "Error buscando cliente: " + e.getMessage());
            return null;
        }
    }

    private String getClientName(String clientId) {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String json = prefs.getString(KEY_CLIENTS, null);
            if (json == null) return "Cliente";
            JSONArray clients = new JSONArray(json);
            for (int i = 0; i < clients.length(); i++) {
                JSONObject c = clients.getJSONObject(i);
                if (String.valueOf(c.opt("id")).equals(clientId)) {
                    return c.optString("name", "Cliente");
                }
            }
        } catch (Exception e) { /* ignorar */ }
        return "Cliente";
    }

    // ─── Cola de ventas pendientes ────────────────────────────────────────────

    private void savePendingSale(String clientId, double weight, double salePrice) {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String existing = prefs.getString(KEY_PENDING_SALES, "[]");
            JSONArray sales = new JSONArray(existing);
            JSONObject sale = new JSONObject();
            sale.put("clientId", clientId);
            sale.put("weight", weight);
            sale.put("salePrice", salePrice);
            sale.put("total", weight * salePrice);
            sale.put("timestamp", System.currentTimeMillis());
            // Ventas background siempre a credito — el usuario confirma al abrir la app
            sale.put("isPaid", false);
            sale.put("paidAmount", 0);
            sale.put("remainingDebt", weight * salePrice);
            sale.put("paymentHistory", new JSONArray());
            sale.put("autoCredit", true);
            sale.put("quantity", 1);
            sale.put("source", "background_auto");
            // Guardar GPS fresco en el momento exacto de la venta (§1.2)
            JSONObject geo = new JSONObject();
            if (hasLocation) {
                geo.put("lat", lastLat);
                geo.put("lng", lastLng);
                geo.put("acc", lastAccuracy);
                geo.put("ts", System.currentTimeMillis());
                geo.put("stale", false);
            } else {
                geo.put("stale", true);
            }
            sale.put("location", geo);
            sales.put(sale);
            prefs.edit().putString(KEY_PENDING_SALES, sales.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Error guardando venta pendiente: " + e.getMessage());
        }
    }

    // ─── Utilidades ───────────────────────────────────────────────────────────

    private double haversineM(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                 * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // ─── Métodos estáticos para el Plugin ────────────────────────────────────

    public static double  getLastLat()       { return lastLat; }
    public static double  getLastLng()       { return lastLng; }
    public static float   getLastAccuracy()  { return lastAccuracy; }
    public static boolean hasLocation()      { return hasLocation; }
    public static double  getCurrentWeight() { return currentWeight; }
    public static void    setCurrentWeight(double w) { currentWeight = w; }

    /** Devuelve la ubicacion fresca actual o null si no hay fix valido (§2) */
    @androidx.annotation.Nullable
    public static double[] getFreshLocationStatic() {
        if (!hasLocation) return null;
        return new double[]{ lastLat, lastLng, lastAccuracy };
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;

            // Canal persistente — baja prioridad, sin sonido
            NotificationChannel persistent = new NotificationChannel(
                CHANNEL_PERSISTENT,
                "GallOli — Estado del pesaje",
                NotificationManager.IMPORTANCE_LOW);
            persistent.setDescription("Muestra el estado de la balanza y ventas del dia");
            persistent.setShowBadge(false);
            persistent.enableVibration(false);
            persistent.setSound(null, null);
            nm.createNotificationChannel(persistent);

            // Canal de alertas v2 — ID nuevo para forzar IMPORTANCE_HIGH en dispositivos con canal viejo
            NotificationChannel alerts = new NotificationChannel(
                CHANNEL_ALERTS,
                "GallOli — Ventas automaticas",
                NotificationManager.IMPORTANCE_HIGH);
            alerts.setDescription("Alertas emergentes de ventas automaticas registradas");
            alerts.enableVibration(true);
            alerts.setVibrationPattern(new long[]{0, 100, 50, 100});
            nm.createNotificationChannel(alerts);
        }
    }

    @Override
    public void onDestroy() {
        stopGpsTracking();
        disconnectBle();
        if (stableRunnable != null) mainHandler.removeCallbacks(stableRunnable);
        super.onDestroy();
    }
}
