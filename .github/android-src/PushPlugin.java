package store.ivapps.galloli;

import android.Manifest;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(
    name = "PushPlugin",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class PushPlugin extends Plugin {

    private String fcmToken = null;

    @Override
    public void load() {
        // Obtener token FCM al cargar el plugin
        FirebaseMessaging.getInstance().getToken()
            .addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) {
                    fcmToken = task.getResult();
                    JSObject data = new JSObject();
                    data.put("token", fcmToken);
                    notifyListeners("tokenReceived", data);
                }
            });
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        if (fcmToken != null) {
            JSObject ret = new JSObject();
            ret.put("token", fcmToken);
            call.resolve(ret);
        } else {
            FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    if (task.isSuccessful() && task.getResult() != null) {
                        fcmToken = task.getResult();
                        JSObject ret = new JSObject();
                        ret.put("token", fcmToken);
                        call.resolve(ret);
                    } else {
                        call.reject("No se pudo obtener el token FCM");
                    }
                });
        }
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        // En Android 13+ pedir permiso POST_NOTIFICATIONS
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("notifications", call, "permissionsCallback");
        } else {
            JSObject ret = new JSObject();
            ret.put("notifications", "granted");
            call.resolve(ret);
        }
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void permissionsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("notifications", getPermissionState("notifications").toString().toLowerCase());
        call.resolve(ret);
    }

    /** Llamado desde GalloliFirebaseService cuando llega un mensaje */
    public void onMessageReceived(String title, String body) {
        JSObject data = new JSObject();
        data.put("title", title);
        data.put("body", body);
        notifyListeners("pushReceived", data);
    }

    /** Llamado cuando se actualiza el token */
    public void onNewToken(String token) {
        fcmToken = token;
        JSObject data = new JSObject();
        data.put("token", token);
        notifyListeners("tokenReceived", data);
    }
}
