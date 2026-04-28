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
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.UUID;

public class BleForegroundService extends Service {

    public static final String CHANNEL_ID        = "galloli_ble_channel";
    public static final int    NOTIFICATION_ID   = 1001;
    public static final String ACTION_START      = "START_BLE_SERVICE";
    public static final String ACTION_STOP       = "STOP_BLE_SERVICE";
    public static final String ACTION_UPDATE_WEIGHT  = "UPDATE_WEIGHT";
    public static final String ACTION_SYNC_CLIENTS   = "SYNC_CLIENTS";
    public static final String ACTION_SYNC_PRICE     = "SYNC_PRICE";
    public static final String EXTRA_WEIGHT      = "weight";
    public static final String EXTRA_CLIENTS_JSON = "clients_json";
    public static final String EXTRA_PRICE       = "price";

    // SharedPreferences keys
    public static final String PREFS_NAME        = "galloli_prefs";
    public static final String KEY_CLIENTS       = "clients_json";
    public static final String KEY_SALE_PRICE    = "sale_price";
    public static final String KEY_PENDING_SALES = "pending_sales";
    public static final String KEY_BLE_DEVICE_ID = "ble_device_id";

    // BLE UUIDs CAMRY
    private static final UUID SERVICE_UUID = UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb");
    private static final UUID CHAR_UUID    = UUID.fromString("0000ffe1-0000-1000-8000-00805f9b34fb");
    private static final UUID CCCD_UUID    = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private static final String TAG = "GalloliService";

    // GPS
    private LocationManager  locationManager;
    private LocationListener locationListener;
    private static double  lastLat      = 0;
    private static double  lastLng      = 0;
    private static boolean hasLocation  = false;

    // BLE nativo (para pesaje en segundo plano)
    private BluetoothGatt bleGatt;
    private Handler       mainHandler;

    // Estado de pesaje automatico
    private double  lastRawWeight    = 0;
    private double  stableWeight     = 0;
    private boolean waitingForZero   = false;
    private Runnable stableRunnable  = null;
    private static final double MIN_WEIGHT_LB    = 3.50;
    private static final double ZERO_THRESHOLD   = 0.50;
    private static final long   STABLE_MS        = 1500;
    private static final double CLIENT_RADIUS_M  = 150.0;

    // Peso compartido con el Plugin (para que JS lo lea)
    private static double currentWeight = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        mainHandler = new Handler(Looper.getMainLooper());
        createNotificationChannel();
        startGpsTracking();
        // Intentar reconectar BLE si hay dispositivo guardado
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
                // JS nos pasa el peso actual (cuando la app está en primer plano)
                currentWeight = intent.getDoubleExtra(EXTRA_WEIGHT, 0);
                return START_STICKY;

            case ACTION_SYNC_CLIENTS:
                // JS nos pasa la lista de clientes serializada
                String clientsJson = intent.getStringExtra(EXTRA_CLIENTS_JSON);
                if (clientsJson != null) {
                    getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                        .edit().putString(KEY_CLIENTS, clientsJson).apply();
                    Log.d(TAG, "Clientes sincronizados en SharedPreferences");
                }
                return START_STICKY;

            case ACTION_SYNC_PRICE:
                // JS nos pasa el precio de venta del dia
                double price = intent.getDoubleExtra(EXTRA_PRICE, 0);
                if (price > 0) {
                    getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                        .edit().putFloat(KEY_SALE_PRICE, (float) price).apply();
                    Log.d(TAG, "Precio sincronizado: " + price);
                }
                return START_STICKY;

            default:
                startForegroundCompat();
                return START_STICKY;
        }
    }

    // ─── Foreground ──────────────────────────────────────────────────────────

    private void startForegroundCompat() {
        Notification notification = createNotification("GallOli activo", "Pesaje automatico en segundo plano");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE;
            try {
                type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
                startForeground(NOTIFICATION_ID, notification, type);
            } catch (Exception e) {
                startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            }
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    // ─── GPS ─────────────────────────────────────────────────────────────────

    private void startGpsTracking() {
        try {
            locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
            if (locationManager == null) return;

            locationListener = new LocationListener() {
                @Override public void onLocationChanged(Location loc) {
                    lastLat = loc.getLatitude();
                    lastLng = loc.getLongitude();
                    hasLocation = true;
                }
                @Override public void onStatusChanged(String p, int s, Bundle e) {}
                @Override public void onProviderEnabled(String p) {}
                @Override public void onProviderDisabled(String p) {}
            };

            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER, 5000, 3, locationListener);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER, 10000, 5, locationListener);
            }

            Location last = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (last == null) last = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            if (last != null) { lastLat = last.getLatitude(); lastLng = last.getLongitude(); hasLocation = true; }

        } catch (SecurityException e) {
            Log.e(TAG, "Sin permiso GPS: " + e.getMessage());
        }
    }

    private void stopGpsTracking() {
        try {
            if (locationManager != null && locationListener != null) {
                locationManager.removeUpdates(locationListener);
            }
        } catch (Exception e) { /* ignorar */ }
    }

    // ─── BLE nativo en segundo plano ─────────────────────────────────────────

    private void reconnectBleIfNeeded() {
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
                    Log.d(TAG, "BLE conectado en background");
                    updateNotification("GallOli activo", "Balanza conectada - pesaje automatico ON");
                    gatt.discoverServices();
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    Log.d(TAG, "BLE desconectado, reintentando en 5s...");
                    updateNotification("GallOli activo", "Balanza desconectada - reconectando...");
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
        if (bleGatt != null) {
            try { bleGatt.disconnect(); bleGatt.close(); } catch (Exception e) { /* ignorar */ }
            bleGatt = null;
        }
    }

    // ─── Parseo de peso (mismo protocolo que bluetooth-scale.js) ─────────────

    private double parseWeightFromBytes(byte[] data) {
        try {
            // Intentar ASCII primero (CAMRY: "001.70kg")
            String text = new String(data, "UTF-8").trim();
            java.util.regex.Pattern p = java.util.regex.Pattern.compile(
                "([+-]?\\s*\\d+\\.?\\d*)\\s*(kg|lb|g|KG|LB|G)",
                java.util.regex.Pattern.CASE_INSENSITIVE);
            java.util.regex.Matcher m = p.matcher(text);
            if (m.find()) {
                double val = Double.parseDouble(m.group(1).replaceAll("\\s", ""));
                String unit = m.group(2).toLowerCase();
                if (val > 0) {
                    if (unit.equals("kg")) return Math.round(val * 2 * 100.0) / 100.0; // kg → lb (CAMRY)
                    if (unit.equals("g"))  return Math.round((val / 453.592) * 100.0) / 100.0;
                    return val; // ya en lb
                }
            }
        } catch (Exception e) { /* ignorar */ }

        // Fallback BLE Weight Scale estándar
        if (data.length >= 3) {
            int flags = data[0] & 0xFF;
            int raw = ((data[2] & 0xFF) << 8) | (data[1] & 0xFF);
            if (raw > 0) {
                if ((flags & 0x01) != 0) return raw * 0.01;
                return Math.round(raw * 0.005 * 2.20462 * 1000.0) / 1000.0;
            }
        }
        return 0;
    }

    // ─── Lógica de pesaje automático ─────────────────────────────────────────

    private void handleWeightReading(double weight) {
        currentWeight = weight;

        // Si esperamos que retiren el pollo
        if (waitingForZero) {
            if (weight < ZERO_THRESHOLD) {
                waitingForZero = false;
                lastRawWeight = 0;
                Log.d(TAG, "Balanza vaciada, listo para siguiente pollo");
            }
            return;
        }

        // Detectar cambio significativo
        if (Math.abs(weight - lastRawWeight) > 0.01) {
            lastRawWeight = weight;

            // Cancelar timer anterior
            if (stableRunnable != null) {
                mainHandler.removeCallbacks(stableRunnable);
                stableRunnable = null;
            }

            if (weight > MIN_WEIGHT_LB) {
                // Esperar estabilización
                final double capturedWeight = weight;
                stableRunnable = () -> {
                    // Verificar que sigue estable
                    if (Math.abs(currentWeight - capturedWeight) < 0.05) {
                        tryAutoSale(capturedWeight);
                    }
                };
                mainHandler.postDelayed(stableRunnable, STABLE_MS);
            }
        }
    }

    private void tryAutoSale(double weight) {
        if (!hasLocation) {
            Log.w(TAG, "Sin GPS, no se puede detectar cliente");
            return;
        }

        String nearestClientId = findNearestClientId();
        if (nearestClientId == null) {
            Log.w(TAG, "Sin cliente cercano en radio " + CLIENT_RADIUS_M + "m");
            return;
        }

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        double salePrice = prefs.getFloat(KEY_SALE_PRICE, 0);
        if (salePrice <= 0) {
            Log.w(TAG, "Sin precio de venta configurado");
            return;
        }

        // Guardar venta pendiente en SharedPreferences (el JS la procesará al abrir la app)
        savePendingSale(nearestClientId, weight, salePrice);
        waitingForZero = true;

        Log.d(TAG, "Venta automatica guardada: clientId=" + nearestClientId +
              " peso=" + weight + " precio=" + salePrice);

        // Notificación visible al usuario
        String clientName = getClientName(nearestClientId);
        double total = weight * salePrice;
        updateNotification(
            "Venta registrada",
            clientName + " — " + String.format("%.3f", weight) + " lb — $" + String.format("%.2f", total)
        );
    }

    // ─── Clientes desde SharedPreferences ────────────────────────────────────

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
                if (c.optBoolean("isActive", true) == false) continue;

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
            sale.put("isPaid", true);   // efectivo por defecto
            sale.put("quantity", 1);
            sale.put("source", "background_auto");

            sales.put(sale);
            prefs.edit().putString(KEY_PENDING_SALES, sales.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Error guardando venta pendiente: " + e.getMessage());
        }
    }

    // ─── Utilidades ──────────────────────────────────────────────────────────

    private double haversineM(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                 * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private void updateNotification(String title, String text) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID, createNotification(title, text));
    }

    // ─── Métodos estáticos para el Plugin ────────────────────────────────────

    public static double getLastLat()      { return lastLat; }
    public static double getLastLng()      { return lastLng; }
    public static boolean hasLocation()    { return hasLocation; }
    public static double getCurrentWeight(){ return currentWeight; }
    public static void setCurrentWeight(double w) { currentWeight = w; }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "GallOli - Pesaje Automatico", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Pesaje automatico con balanza BLE y GPS en segundo plano");
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification createNotification(String title, String text) {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setContentIntent(pi)
            .build();
    }

    @Override
    public void onDestroy() {
        stopGpsTracking();
        disconnectBle();
        if (stableRunnable != null) mainHandler.removeCallbacks(stableRunnable);
        super.onDestroy();
    }
}
