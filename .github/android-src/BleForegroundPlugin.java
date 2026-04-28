// android/app/src/main/java/store/ivapps/galloli/BleForegroundPlugin.java
package store.ivapps.galloli;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BleForeground")
public class BleForegroundPlugin extends Plugin {

    // ─── Control del servicio ─────────────────────────────────────────────────

    @PluginMethod
    public void start(PluginCall call) {
        startService(BleForegroundService.ACTION_START);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        startService(BleForegroundService.ACTION_STOP);
        call.resolve();
    }

    // ─── Sincronización de datos desde JS al servicio nativo ─────────────────

    /**
     * JS llama esto al iniciar la app para sincronizar clientes al servicio nativo.
     * El servicio los guarda en SharedPreferences y los usa para detectar cliente cercano
     * aunque el WebView esté suspendido.
     */
    @PluginMethod
    public void syncClients(PluginCall call) {
        String clientsJson = call.getString("clientsJson", "[]");
        Intent intent = new Intent(getContext(), BleForegroundService.class);
        intent.setAction(BleForegroundService.ACTION_SYNC_CLIENTS);
        intent.putExtra(BleForegroundService.EXTRA_CLIENTS_JSON, clientsJson);
        getContext().startService(intent);
        call.resolve();
    }

    /**
     * JS llama esto al iniciar la app para sincronizar el precio de venta del día.
     */
    @PluginMethod
    public void syncSalePrice(PluginCall call) {
        double price = call.getDouble("price", 0.0);
        Intent intent = new Intent(getContext(), BleForegroundService.class);
        intent.setAction(BleForegroundService.ACTION_SYNC_PRICE);
        intent.putExtra(BleForegroundService.EXTRA_PRICE, price);
        getContext().startService(intent);
        call.resolve();
    }

    /**
     * JS llama esto para guardar el ID del dispositivo BLE activo,
     * para que el servicio pueda reconectarse en segundo plano.
     */
    @PluginMethod
    public void saveBleDeviceId(PluginCall call) {
        String deviceId = call.getString("deviceId", null);
        if (deviceId != null) {
            getContext().getSharedPreferences(BleForegroundService.PREFS_NAME,
                android.content.Context.MODE_PRIVATE)
                .edit()
                .putString(BleForegroundService.KEY_BLE_DEVICE_ID, deviceId)
                .apply();
        }
        call.resolve();
    }

    // ─── Lectura de datos del servicio nativo ─────────────────────────────────

    /**
     * JS llama esto al volver a primer plano para procesar ventas registradas
     * en segundo plano mientras la app estaba minimizada.
     */
    @PluginMethod
    public void getPendingSales(PluginCall call) {
        String json = getContext()
            .getSharedPreferences(BleForegroundService.PREFS_NAME,
                android.content.Context.MODE_PRIVATE)
            .getString(BleForegroundService.KEY_PENDING_SALES, "[]");
        JSObject result = new JSObject();
        result.put("sales", json);
        call.resolve(result);
    }

    /**
     * JS llama esto después de procesar las ventas pendientes para limpiar la cola.
     */
    @PluginMethod
    public void clearPendingSales(PluginCall call) {
        getContext()
            .getSharedPreferences(BleForegroundService.PREFS_NAME,
                android.content.Context.MODE_PRIVATE)
            .edit()
            .putString(BleForegroundService.KEY_PENDING_SALES, "[]")
            .apply();
        call.resolve();
    }

    /**
     * Resetea los contadores del día en el servicio nativo.
     * JS llama esto al inicio de cada día o al sincronizar datos.
     */
    @PluginMethod
    public void resetDayCounters(PluginCall call) {
        getContext()
            .getSharedPreferences(BleForegroundService.PREFS_NAME,
                android.content.Context.MODE_PRIVATE)
            .edit()
            .putInt(BleForegroundService.KEY_SALES_TODAY, 0)
            .putFloat(BleForegroundService.KEY_TOTAL_TODAY, 0)
            .apply();
        call.resolve();
    }

    /**
     * Devuelve la ubicación GPS actual del servicio nativo.
     */
    @PluginMethod
    public void getLocation(PluginCall call) {
        JSObject result = new JSObject();
        result.put("lat", BleForegroundService.getLastLat());
        result.put("lng", BleForegroundService.getLastLng());
        result.put("hasLocation", BleForegroundService.hasLocation());
        call.resolve(result);
    }

    /**
     * Devuelve el peso actual leído por el servicio nativo.
     */
    @PluginMethod
    public void getWeight(PluginCall call) {
        JSObject result = new JSObject();
        result.put("weight", BleForegroundService.getCurrentWeight());
        call.resolve(result);
    }

    /**
     * Lee el token FCM guardado por GalloliFirebaseService en SharedPreferences.
     * Llamar al iniciar la app para registrarlo en el Worker.
     */
    @PluginMethod
    public void getFcmToken(PluginCall call) {
        String token = getContext()
            .getSharedPreferences(BleForegroundService.PREFS_NAME,
                android.content.Context.MODE_PRIVATE)
            .getString("fcm_token", null);
        JSObject result = new JSObject();
        result.put("token", token != null ? token : "");
        result.put("hasToken", token != null && !token.isEmpty());
        call.resolve(result);
    }

    /**
     * JS actualiza el peso en el servicio (cuando la app está en primer plano).
     */
    @PluginMethod
    public void updateWeight(PluginCall call) {
        double weight = call.getDouble("weight", 0.0);
        BleForegroundService.setCurrentWeight(weight);
        Intent intent = new Intent(getContext(), BleForegroundService.class);
        intent.setAction(BleForegroundService.ACTION_UPDATE_WEIGHT);
        intent.putExtra(BleForegroundService.EXTRA_WEIGHT, weight);
        getContext().startService(intent);
        call.resolve();
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

    private void startService(String action) {
        Intent intent = new Intent(getContext(), BleForegroundService.class);
        intent.setAction(action);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
    }
}
