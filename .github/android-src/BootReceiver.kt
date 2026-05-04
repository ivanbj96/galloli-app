// android/app/src/main/java/store/ivapps/galloli/BootReceiver.kt
package store.ivapps.galloli

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON") {
            // Arrancar BleForegroundService (no GeofenceBleService que tiene package incorrecto)
            val serviceIntent = Intent(context, BleForegroundService::class.java).apply {
                setAction(BleForegroundService.ACTION_START)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }
    }
}
