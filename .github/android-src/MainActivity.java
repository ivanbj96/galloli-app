package store.ivapps.galloli;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private BleJsBridge bleJsBridge;
    private PushJsBridge pushJsBridge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Obtener el WebView de Capacitor
        WebView webView = getBridge().getWebView();

        // Registrar el bridge de BLE
        bleJsBridge = new BleJsBridge(this, webView);
        webView.addJavascriptInterface(bleJsBridge, "AndroidBle");

        // Registrar el bridge de Push
        pushJsBridge = new PushJsBridge(webView);
        webView.addJavascriptInterface(pushJsBridge, "AndroidPush");

        // Pedir permisos necesarios
        requestPermissions();
    }

    private void requestPermissions() {
        List<String> permissions = new ArrayList<>();

        // Bluetooth (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN)
                    != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.BLUETOOTH_SCAN);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                    != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
        }

        // Notificaciones (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (!permissions.isEmpty()) {
            ActivityCompat.requestPermissions(this,
                permissions.toArray(new String[0]), 1001);
        }
    }

    /** Llamado por GalloliFirebaseService cuando llega un token FCM */
    public void onFcmToken(String token) {
        if (pushJsBridge != null) {
            pushJsBridge.setFcmToken(token);
        }
    }
}
