// android/app/src/main/java/store/ivapps/galloli/BleForegroundService.java
package store.ivapps.galloli;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;
import androidx.core.app.NotificationCompat;

public class BleForegroundService extends Service {

    public static final String CHANNEL_ID = "galloli_ble_channel";
    public static final int NOTIFICATION_ID = 1001;
    public static final String ACTION_START = "START_BLE_SERVICE";
    public static final String ACTION_STOP = "STOP_BLE_SERVICE";
    public static final String ACTION_UPDATE_WEIGHT = "UPDATE_WEIGHT";
    public static final String EXTRA_WEIGHT = "weight";

    private static final String TAG = "GalloliService";

    // GPS
    private LocationManager locationManager;
    private LocationListener locationListener;
    private static double lastLat = 0;
    private static double lastLng = 0;
    private static boolean hasLocation = false;

    // Peso actual desde BLE
    private static double currentWeight = 0;

    // Broadcast para enviar datos al JS
    public static final String BROADCAST_LOCATION = "store.ivapps.galloli.LOCATION_UPDATE";
    public static final String BROADCAST_AUTO_SALE = "store.ivapps.galloli.AUTO_SALE";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startGpsTracking();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopGpsTracking();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
            stopSelf();
            return START_NOT_STICKY;
        }

        // Actualizar peso desde JS via plugin
        if (intent != null && ACTION_UPDATE_WEIGHT.equals(intent.getAction())) {
            currentWeight = intent.getDoubleExtra(EXTRA_WEIGHT, 0);
            Log.d(TAG, "Peso actualizado: " + currentWeight + " lb");
            return START_STICKY;
        }

        // Iniciar foreground con tipo connectedDevice + location
        Notification notification = createNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Android 14+: location es tipo separado
                serviceType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
            } else {
                serviceType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
            }
            try {
                startForeground(NOTIFICATION_ID, notification, serviceType);
            } catch (Exception e) {
                // Fallback si location type no está disponible
                startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            }
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        return START_STICKY;
    }

    private void startGpsTracking() {
        try {
            locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
            if (locationManager == null) return;

            locationListener = new LocationListener() {
                @Override
                public void onLocationChanged(Location location) {
                    lastLat = location.getLatitude();
                    lastLng = location.getLongitude();
                    hasLocation = true;
                    Log.d(TAG, "GPS: " + lastLat + ", " + lastLng);

                    // Enviar broadcast al JS con la ubicacion actual
                    Intent broadcast = new Intent(BROADCAST_LOCATION);
                    broadcast.putExtra("lat", lastLat);
                    broadcast.putExtra("lng", lastLng);
                    sendBroadcast(broadcast);
                }

                @Override
                public void onStatusChanged(String provider, int status, Bundle extras) {}

                @Override
                public void onProviderEnabled(String provider) {}

                @Override
                public void onProviderDisabled(String provider) {}
            };

            // Actualizar cada 5 segundos o 3 metros de movimiento
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    5000,   // 5 segundos
                    3,      // 3 metros
                    locationListener
                );
            }
            // Tambien usar network para interior/inicio rapido
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    10000,  // 10 segundos
                    5,      // 5 metros
                    locationListener
                );
            }

            // Obtener ultima ubicacion conocida inmediatamente
            Location lastKnown = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (lastKnown == null) {
                lastKnown = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            }
            if (lastKnown != null) {
                lastLat = lastKnown.getLatitude();
                lastLng = lastKnown.getLongitude();
                hasLocation = true;
            }

            Log.d(TAG, "GPS tracking iniciado");
        } catch (SecurityException e) {
            Log.e(TAG, "Sin permiso de ubicacion: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error iniciando GPS: " + e.getMessage());
        }
    }

    private void stopGpsTracking() {
        try {
            if (locationManager != null && locationListener != null) {
                locationManager.removeUpdates(locationListener);
                locationListener = null;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error deteniendo GPS: " + e.getMessage());
        }
    }

    // Metodos estaticos para que el Plugin lea los datos
    public static double getLastLat() { return lastLat; }
    public static double getLastLng() { return lastLng; }
    public static boolean hasLocation() { return hasLocation; }
    public static double getCurrentWeight() { return currentWeight; }
    public static void setCurrentWeight(double w) { currentWeight = w; }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "GallOli - Balanza BLE",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Mantiene la conexion con la balanza Bluetooth y GPS activos");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification createNotification() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String text = hasLocation
            ? "Balanza BLE + GPS activos"
            : "Balanza BLE conectada - buscando GPS...";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("GallOli")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build();
    }

    @Override
    public void onDestroy() {
        stopGpsTracking();
        super.onDestroy();
    }
}
