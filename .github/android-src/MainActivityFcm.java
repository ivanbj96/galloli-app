// android/app/src/main/java/store/ivapps/galloli/MainActivity.java
package store.ivapps.galloli;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import android.util.Log;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "GalloliFCM";
    private String pendingFcmToken = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BleForegroundPlugin.class);
        super.onCreate(savedInstanceState);
        requestAppPermissions();
        fetchFcmToken();
    }

    @Override
    public void onResume() {
        super.onResume();
        // Intentar inyectar token pendiente cuando la app vuelve al frente
        if (pendingFcmToken != null) {
            injectTokenToJs(pendingFcmToken);
        }
    }

    private void fetchFcmToken() {
        // Leer token guardado primero (sesiones anteriores)
        String saved = getSharedPreferences("galloli_prefs", MODE_PRIVATE)
            .getString("fcm_token", null);
        if (saved != null) {
            Log.d(TAG, "Token guardado encontrado: " + saved.substring(0, 20) + "...");
            pendingFcmToken = saved;
            // Intentar inyectar después de 2s (WebView puede no estar listo)
            new Handler(Looper.getMainLooper()).postDelayed(() -> injectTokenToJs(saved), 2000);
        }

        // Obtener token fresco de Firebase
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null) {
                Log.w(TAG, "Error obteniendo token FCM", task.getException());
                return;
            }
            String token = task.getResult();
            Log.d(TAG, "Token FCM obtenido: " + token.substring(0, 20) + "...");
            pendingFcmToken = token;
            getSharedPreferences("galloli_prefs", MODE_PRIVATE)
                .edit().putString("fcm_token", token).apply();
            // Inyectar con delay para asegurar que WebView esté listo
            new Handler(Looper.getMainLooper()).postDelayed(() -> injectTokenToJs(token), 2500);
        });
    }

    private void injectTokenToJs(String token) {
        try {
            WebView webView = getBridge().getWebView();
            if (webView == null) {
                Log.w(TAG, "WebView no disponible aún");
                return;
            }
            String escaped = token.replace("\\", "\\\\").replace("'", "\\'");
            String js = "window._fcmToken='" + escaped + "';"
                + "if(typeof window.onFcmToken==='function')window.onFcmToken('" + escaped + "');";
            webView.post(() -> {
                webView.evaluateJavascript(js, result -> {
                    Log.d(TAG, "Token inyectado al JS: " + result);
                    pendingFcmToken = null;
                });
            });
        } catch (Exception e) {
            Log.e(TAG, "Error inyectando token: " + e.getMessage());
        }
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
        if (!permissions.isEmpty())
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), 1001);
    }
}
