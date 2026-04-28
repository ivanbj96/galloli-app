// src/native/platform-guard.js
//
// Garantiza que el motor de venta automática SOLO corra en el APK nativo,
// nunca en la TWA pública ni en el navegador.
//
// La TWA reporta `Capacitor.isNativePlatform() === false` porque es un
// Trusted Web Activity (Chrome Custom Tab), no un WebView Capacitor.
// Aun así verificamos también el flag explícito y el User-Agent por triple
// seguridad.

export function isApkNative() {
  try {
    const cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function') return false;
    if (!cap.isNativePlatform()) return false;
    if (cap.getPlatform && cap.getPlatform() !== 'android') return false;

    // Flag inyectado por el shell APK (puedes setearlo en MainActivity si quieres
    // doble verificación; mientras tanto la detección Capacitor basta).
    const ua = navigator.userAgent || '';
    if (/Trusted Web Activity|wv\)/i.test(ua) && !cap.isNativePlatform()) return false;

    return true;
  } catch {
    return false;
  }
}

export function assertApkOrNoop(featureName) {
  if (!isApkNative()) {
    console.info(`[galloli/native] "${featureName}" desactivado (no es APK nativo).`);
    return false;
  }
  return true;
}
