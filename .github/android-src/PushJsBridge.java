package store.ivapps.galloli;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.os.Handler;
import android.os.Looper;

/**
 * Bridge para Push Notifications nativas.
 * El token FCM se obtiene en MainActivity y se pasa al WebView via este bridge.
 */
public class PushJsBridge {

    private final WebView webView;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private String pendingToken = null;

    public PushJsBridge(WebView webView) {
        this.webView = webView;
    }

    /** Llamado desde MainActivity cuando FCM entrega el token */
    public void setFcmToken(String token) {
        this.pendingToken = token;
        sendTokenToJs(token);
    }

    /** JS llama esto para pedir el token actual */
    @JavascriptInterface
    public String getToken() {
        return pendingToken != null ? pendingToken : "";
    }

    /** JS llama esto para solicitar permisos de notificación */
    @JavascriptInterface
    public void requestPermission() {
        // En Android 13+ los permisos se piden desde MainActivity
        mainHandler.post(() ->
            webView.evaluateJavascript("PushNative.onPermissionResult('granted')", null)
        );
    }

    private void sendTokenToJs(String token) {
        if (token == null) return;
        mainHandler.post(() ->
            webView.evaluateJavascript(
                "if(window.PushNative) PushNative.onToken('" + token.replace("'", "\\'") + "')",
                null
            )
        );
    }
}
