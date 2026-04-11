package store.ivapps.galloli;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

public class GalloliFirebaseService extends FirebaseMessagingService {

    private static final String CHANNEL_ID = "galloli_push";
    private static PushPlugin pushPluginInstance = null;

    public static void setPushPlugin(PushPlugin plugin) {
        pushPluginInstance = plugin;
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        if (pushPluginInstance != null) {
            pushPluginInstance.onNewToken(token);
        }
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        String title = "GallOli";
        String body = "";

        if (remoteMessage.getNotification() != null) {
            title = remoteMessage.getNotification().getTitle() != null
                ? remoteMessage.getNotification().getTitle() : title;
            body = remoteMessage.getNotification().getBody() != null
                ? remoteMessage.getNotification().getBody() : body;
        } else if (remoteMessage.getData().size() > 0) {
            title = remoteMessage.getData().getOrDefault("title", title);
            body  = remoteMessage.getData().getOrDefault("body", body);
        }

        // Notificar al plugin JS si la app está en primer plano
        if (pushPluginInstance != null) {
            pushPluginInstance.onMessageReceived(title, body);
        }

        // Mostrar notificación del sistema (cuando la app está en segundo plano)
        showNotification(title, body);
    }

    private void showNotification(String title, String body) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "GallOli Notificaciones", NotificationManager.IMPORTANCE_HIGH);
            nm.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent,
            PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent);

        nm.notify((int) System.currentTimeMillis(), builder.build());
    }
}
