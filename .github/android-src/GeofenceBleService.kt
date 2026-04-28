// android/app/src/main/java/com/galloli/app/GeofenceBleService.kt
package com.galloli.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Foreground Service que mantiene vivos:
 *   - escaneo/conexión BLE con la balanza
 *   - escucha del geofence
 * incluso con la app minimizada o en Doze.
 *
 * El JS (auto-sale-engine.js) envía intents a este servicio para arrancar/parar.
 */
class GeofenceBleService : Service() {

    companion object {
        const val CHANNEL_ID = "galloli_bg"
        const val NOTIFICATION_ID = 4711
        const val ACTION_START = "com.galloli.app.START_BG"
        const val ACTION_STOP = "com.galloli.app.STOP_BG"
        const val ACTION_UPDATE_TEXT = "com.galloli.app.UPDATE_TEXT"
        const val EXTRA_TEXT = "text"

        fun start(ctx: Context, text: String = "Esperando clientes") {
            val i = Intent(ctx, GeofenceBleService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TEXT, text)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(i)
            } else {
                ctx.startService(i)
            }
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                releaseWake()
                return START_NOT_STICKY
            }
            ACTION_UPDATE_TEXT -> {
                val txt = intent.getStringExtra(EXTRA_TEXT) ?: "Activo"
                val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
                nm.notify(NOTIFICATION_ID, buildNotification(txt))
                return START_STICKY
            }
            else -> {
                val txt = intent?.getStringExtra(EXTRA_TEXT) ?: "Esperando clientes"
                startForeground(NOTIFICATION_ID, buildNotification(txt))
                acquireWake()
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        releaseWake()
        super.onDestroy()
    }

    private fun buildNotification(text: String): Notification {
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pi = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Galloli activo")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(pi)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                val ch = NotificationChannel(
                    CHANNEL_ID,
                    "Servicio en background",
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = "Mantiene la balanza y el geofence activos"
                    setShowBadge(false)
                }
                nm.createNotificationChannel(ch)
            }
        }
    }

    private fun acquireWake() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "galloli:bg").apply {
            setReferenceCounted(false)
            acquire(12 * 60 * 60 * 1000L) // 12h máx por seguridad; se renueva al reiniciar
        }
    }

    private fun releaseWake() {
        try { wakeLock?.takeIf { it.isHeld }?.release() } catch (_: Exception) {}
        wakeLock = null
    }
}
