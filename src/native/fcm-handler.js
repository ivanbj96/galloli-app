// src/native/fcm-handler.js
//
// Registro FCM (Firebase Cloud Messaging) para enviar comandos remotos al APK
// desde tu Cloudflare Worker o panel admin.
//
// Usa @capacitor-firebase/messaging (lee google-services.json que ya tienes
// como secret en GitHub Actions).
//
// Tipos de comando soportados (campo `type` en data payload):
//   pause            — cambia a modo confirmación
//   resume           — vuelve a modo auto
//   reload           — recarga la webview
//   set-radius       — { value: number } cambia radio de geofence
//   force-sync       — dispara sync-engine
//
// El payload va en `data` (no en `notification`) para que el SO lo entregue
// silenciosamente y no muestre nada al usuario.

import { FirebaseMessaging } from '@capacitor-firebase/messaging';

export async function initFcm({ onCommand }) {
  try {
    const perm = await FirebaseMessaging.requestPermissions();
    if (perm.receive !== 'granted') {
      console.warn('[fcm] permisos denegados');
      return;
    }

    const { token } = await FirebaseMessaging.getToken();
    console.info('[fcm] token:', token);

    // Envía el token a tu backend para que el panel pueda dirigirse al device
    try {
      await fetch('https://api.galloli.app/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, platform: 'android' }),
      });
    } catch (e) {
      console.warn('[fcm] no pude registrar token', e);
    }

    FirebaseMessaging.addListener('tokenReceived', ev => {
      console.info('[fcm] token refresh', ev.token);
    });

    FirebaseMessaging.addListener('notificationReceived', ev => {
      const data = ev.notification?.data;
      if (data && data.type) onCommand?.(data);
    });

    FirebaseMessaging.addListener('notificationActionPerformed', ev => {
      const data = ev.notification?.data;
      if (data && data.type) onCommand?.(data);
    });
  } catch (e) {
    console.error('[fcm] init failed', e);
  }
}
