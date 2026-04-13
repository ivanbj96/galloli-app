// android/app/src/main/java/store/ivapps/galloli/MainActivity.java
package store.ivapps.galloli;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // CRÍTICO: registerPlugin ANTES de super.onCreate()
        registerPlugin(BleForegroundPlugin.class);
        super.onCreate(savedInstanceState);

        requestAppPermissions();
        initFcmToken();
    }

    private void requestAppPermissions() {
        List<String> permissions = new ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED)
                permissions.add(Manifest.permission.BLUETOOTH_SCAN);
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED)
                permissions.add(Manifest.permission.BLUETOOTH_CONNECT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        if (!permissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), 1001);
        }
    }

    private void initFcmToken() {
        // Obtener token FCM y guardarlo para que el JS lo lea
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful()) return;
            String token = task.getResult();
            if (token == null) return;

            // Guardar en SharedPreferences
            getSharedPreferences("galloli_prefs", MODE_PRIVATE)
                .edit().putString("fcm_token", token).apply();

            // Pasar al WebView cuando esté listo
            WebView webView = getBridge().getWebView();
            String js = "window._fcmToken = '" + token.replace("'", "\\'") + "';"
                + "if(window.onFcmToken) window.onFcmToken('" + token.replace("'", "\\'") + "');";
            webView.post(() -> webView.evaluateJavascript(js, null));
        });
    }
}
