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

    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = new Intent(getContext(), BleForegroundService.class);
        intent.setAction(BleForegroundService.ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), BleForegroundService.class);
        intent.setAction(BleForegroundService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }

    /**
     * Llamado desde JS para actualizar el peso actual en el servicio nativo.
     * Permite que el servicio tenga el peso aunque el WebView esté suspendido.
     */
    @PluginMethod
    public void updateWeight(PluginCall call) {
        double weight = call.getDouble("weight", 0.0);
        BleForegroundService.setCurrentWeight(weight);

        // También enviar via Intent para que el servicio lo procese si está corriendo
        Intent intent = new Intent(getContext(), BleForegroundService.class);
        intent.setAction(BleForegroundService.ACTION_UPDATE_WEIGHT);
        intent.putExtra(BleForegroundService.EXTRA_WEIGHT, weight);
        getContext().startService(intent);

        call.resolve();
    }

    /**
     * Devuelve la ubicacion GPS actual del servicio nativo.
     * Funciona aunque el WebView esté suspendido porque el servicio sigue corriendo.
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
     * Devuelve el peso actual guardado en el servicio nativo.
     */
    @PluginMethod
    public void getWeight(PluginCall call) {
        JSObject result = new JSObject();
        result.put("weight", BleForegroundService.getCurrentWeight());
        call.resolve(result);
    }
}
