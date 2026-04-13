// android/app/src/main/java/store/ivapps/galloli/BleForegroundPlugin.java
package store.ivapps.galloli;

import android.content.Intent;
import android.os.Build;
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
}
