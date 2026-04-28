// android/app/src/main/java/com/galloli/app/BootReceiver.kt
package com.galloli.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON") {
            GeofenceBleService.start(context, "Reanudado tras reinicio")
        }
    }
}
