# Galloli APK – Parche de venta automática con balanza + geofence + FCM

> **Alcance:** este parche solo afecta el **APK nativo** generado con Capacitor. La **TWA pública en Play Store no se toca** (se sigue construyendo desde `main`).
>
> **Modo por defecto:** venta 100% automática (sin facturación SRI por ahora).
>
> **Uso:** APK interno del dueño del negocio. No pasa por Play Console.

---

## 0. Requisitos previos

- Repo `galloli-app` clonado localmente.
- Android Studio Hedgehog o superior.
- Node 20+, JDK 17.
- `google-services.json` ya está en el repo como secret de GitHub Actions (lo confirmaste). El workflow lo coloca en `android/app/` durante el build → no hace falta tocar nada.

---

## 1. Crear branch aislado

```bash
git checkout main
git pull
git checkout -b apk-native
```

A partir de aquí **NUNCA** mergeamos `apk-native` → `main`. La TWA sigue saliendo de `main` y nunca recibe estos cambios. El APK se compila siempre desde `apk-native`.

> Recomendación CI: en `.github/workflows/` duplica el workflow del APK y cámbiale el trigger a `branches: [apk-native]`. Deja el workflow de la TWA disparándose solo en `main`.

---

## 2. Copiar archivos del parche

Copia el contenido de esta carpeta sobre la raíz de `galloli-app` respetando la estructura:

```
galloli-app/
├── android/app/src/main/
│   ├── AndroidManifest.xml          ← MERGEAR (ver diff en android/AndroidManifest.diff)
│   └── java/com/galloli/app/
│       ├── GeofenceBleService.kt    ← NUEVO
│       └── BootReceiver.kt          ← NUEVO
├── src/native/
│   ├── platform-guard.js            ← NUEVO
│   ├── auto-sale-engine.js          ← NUEVO
│   ├── geofence-manager.js          ← NUEVO
│   ├── ble-scale.js                 ← NUEVO
│   └── fcm-handler.js               ← NUEVO
├── workers/
│   └── fcm-send.js                  ← NUEVO (endpoint Cloudflare)
└── docs/
    ├── SECURITY_GUIDE.md            ← guía de mejoras y correcciones urgentes
    └── ARCHITECTURE.md              ← cómo funciona el flujo
```

---

## 3. Instalar plugins Capacitor

```bash
npm i @capacitor-community/bluetooth-le \
      @capacitor/geolocation \
      @capacitor/local-notifications \
      @capacitor/push-notifications \
      @capacitor/app \
      @capacitor/preferences \
      @capacitor-firebase/messaging
```

Luego:

```bash
npx cap sync android
```

---

## 4. Inicializar el motor desde tu `app.js`

Al final de `app.js` (o en el bootstrap principal), añade:

```js
import { initNativeAutoSale } from './src/native/auto-sale-engine.js';

document.addEventListener('DOMContentLoaded', () => {
  initNativeAutoSale({
    mode: 'auto',                  // 'auto' | 'confirm' (configurable desde Ajustes)
    minWeightKg: 0.5,
    stableReadings: 3,
    stableWindowMs: 2000,
    minIntervalSamePlaceMs: 60_000,
    geofenceRadiusM: 35,
    sriEnabled: false,             // ⚠️ deshabilitado a propósito
  });
});
```

El módulo se autodescarta si detecta TWA o navegador (no se ejecuta nada).

---

## 5. Compilar APK

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

APK firmado en `android/app/build/outputs/apk/release/app-release.apk`. Instálalo con `adb install -r` en tu dispositivo.

---

## 6. Permisos al primer arranque

El usuario debe conceder:
- Ubicación → **Permitir todo el tiempo** (sin esto, no hay geofence en background).
- Bluetooth (escanear y conectar).
- Notificaciones (Android 13+).
- Ignorar optimización de batería (la app pide la excepción al primer arranque).

Si rechaza alguno, el motor se queda en modo "confirm" hasta que se concedan.

---

## 7. Verificar que funciona

1. Abre la app, ve a Ajustes → "Servicio en background" → debe verse "Activo".
2. Deberías ver una notificación persistente: **"Galloli activo · Esperando clientes"**.
3. Camina al primer cliente registrado (con coordenadas válidas).
4. La notificación cambia a: **"En zona de Juan Pérez · Esperando peso"**.
5. Pon un pollo en la balanza, espera 2s.
6. Si modo `auto`: aparece notificación **"Venta registrada: Juan Pérez · 4.32 kg · $12.96"**.
7. Si modo `confirm`: aparece notificación con botones [Confirmar] [Cancelar].

---

## 8. Próximos pasos

Lee `docs/SECURITY_GUIDE.md` para las correcciones urgentes que detecté en el repo (XSS, secretos en código, etc.).
