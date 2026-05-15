// android/app/src/main/java/store/ivapps/galloli/MainActivity.java
package store.ivapps.galloli;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // CRITICO: registerPlugin ANTES de super.onCreate()
        registerPlugin(BleForegroundPlugin.class);
        super.onCreate(savedInstanceState);
        requestAppPermissions();
        // Inyectar token FCM al WebView cuando este listo
        injectFcmTokenToWebView();
    }

    /**
     * Lee el token FCM de SharedPreferences y lo inyecta al WebView
     * llamando window.onFcmToken(token).
     * Esto permite que notify-system.js lo registre en el Worker.
     * Se reintenta cada segundo hasta 30s para dar tiempo a Firebase.
     */
    private void injectFcmTokenToWebView() {
        final Handler handler = new Handler(Looper.getMainLooper());
        final int[] attempts = {0};

        Runnable checkToken = new Runnable() {
            @Override
            public void run() {
                attempts[0]++;
                String token = getSharedPreferences("galloli_prefs", MODE_PRIVATE)
                    .getString("fcm_token", null);

                if (token != null && !token.isEmpty()) {
                    // Token disponible — inyectar al WebView
                    final String safeToken = token.replace("'", "\\'");
                    runOnUiThread(() -> {
                        try {
                            getBridge().getWebView().evaluateJavascript(
                                "if(typeof window.onFcmToken==='function'){window.onFcmToken('" + safeToken + "');}else{window._fcmToken='" + safeToken + "';localStorage.setItem('galloli_fcm_token','" + safeToken + "');}",
                                null
                            );
                        } catch (Exception e) {
                            android.util.Log.e("GalloliFCM", "Error inyectando token: " + e.getMessage());
                        }
                    });
                } else if (attempts[0] < 30) {
                    // Reintentar en 1s
                    handler.postDelayed(this, 1000);
                } else {
                    android.util.Log.w("GalloliFCM", "Token FCM no disponible despues de 30s");
                }
            }
        };

        // Esperar 3s para que el WebView este listo antes del primer intento
        handler.postDelayed(checkToken, 3000);
    }

    private void requestAppPermissions() {
        List<String> permissions = new ArrayList<>();

        // Permisos BLE (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED)
                permissions.add(Manifest.permission.BLUETOOTH_SCAN);
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED)
                permissions.add(Manifest.permission.BLUETOOTH_CONNECT);
        }

        // Permiso de notificaciones (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        // Permisos GPS
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED)
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);

        if (!permissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), 1001);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    != PackageManager.PERMISSION_GRANTED) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(this,
                        new String[]{ Manifest.permission.ACCESS_BACKGROUND_LOCATION }, 1002);
                }
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == 1001 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(this,
                        new String[]{ Manifest.permission.ACCESS_BACKGROUND_LOCATION }, 1002);
                }
            }
        }
    }
}
