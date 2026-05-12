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
     * Incluye accuracy para que el JS pueda filtrar lecturas imprecisas.
     */
    @PluginMethod
    public void getLocation(PluginCall call) {
        JSObject result = new JSObject();
        result.put("lat", BleForegroundService.getLastLat());
        result.put("lng", BleForegroundService.getLastLng());
        result.put("accuracy", BleForegroundService.getLastAccuracy());
        result.put("hasLocation", BleForegroundService.hasLocation());
        call.resolve(result);
    }

    /**
     * Devuelve la ubicacion fresca del servicio nativo (§2).
     * Equivalente a getLocation() pero con campo "fresh" para que el JS
     * sepa si el fix es valido y reciente.
     */
    @PluginMethod
    public void getFreshLocation(PluginCall call) {
        double[] fix = BleForegroundService.getFreshLocationStatic();
        JSObject result = new JSObject();
        if (fix != null) {
            result.put("lat", fix[0]);
            result.put("lng", fix[1]);
            result.put("acc", fix[2]);
            result.put("fresh", true);
        } else {
            result.put("fresh", false);
        }
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

    /**
     * JS llama esto cuando conecta la balanza exitosamente.
     * El servicio marca bleConnected=true y cede el control BLE al JS.
     * Corrige la notificacion que siempre mostraba "Balanza desconectada".
     */
    @PluginMethod
    public void notifyJsConnected(PluginCall call) {
        String deviceId = call.getString("deviceId", null);
        Intent intent = new Intent(getContext(), BleForegroundService.class);
        intent.setAction(BleForegroundService.ACTION_JS_CONNECTED);
        if (deviceId != null) {
            intent.putExtra(BleForegroundService.EXTRA_DEVICE_ID, deviceId);
        }
        getContext().startService(intent);
        call.resolve();
    }

    /**
     * JS llama esto cuando desconecta la balanza.
     * El servicio toma el control y reconecta en background.
     */
    @PluginMethod
    public void notifyJsDisconnected(PluginCall call) {
        Intent intent = new Intent(getContext(), BleForegroundService.class);
        intent.setAction(BleForegroundService.ACTION_JS_DISCONNECTED);
        getContext().startService(intent);
        call.resolve();
    }

    /**
     * Libera BLE al servicio nativo — alias de notifyJsDisconnected para handoff al minimizar.
     */
    @PluginMethod
    public void releaseBleToService(PluginCall call) {
        Intent intent = new Intent(getContext(), BleForegroundService.class);
        intent.setAction(BleForegroundService.ACTION_JS_DISCONNECTED);
        getContext().startService(intent);
        call.resolve();
    }

    /**
     * Activa/desactiva flag para evitar doble factura cuando el modal JS esta abierto.
     */
    @PluginMethod
    public void setChainModalActive(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        getContext()
            .getSharedPreferences(BleForegroundService.PREFS_NAME,
                android.content.Context.MODE_PRIVATE)
            .edit()
            .putBoolean("chain_modal_active", active)
            .apply();
        call.resolve();
    }

    /**
     * Lee el token FCM guardado por GalloliFirebaseService en SharedPreferences.
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
