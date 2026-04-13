// android/app/src/main/java/store/ivapps/galloli/MainActivity.java
// VERSIÓN CON FIREBASE - se usa cuando GOOGLE_SERVICES_JSON está configurado
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
        if (!permissions.isEmpty())
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), 1001);
    }

    private void initFcmToken() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null) return;
            String token = task.getResult();
            getSharedPreferences("galloli_prefs", MODE_PRIVATE)
                .edit().putString("fcm_token", token).apply();
            WebView webView = getBridge().getWebView();
            String escaped = token.replace("'", "\\'");
            String js = "window._fcmToken='" + escaped + "';"
                + "if(window.onFcmToken)window.onFcmToken('" + escaped + "');";
            webView.post(() -> webView.evaluateJavascript(js, null));
        });
    }
}
