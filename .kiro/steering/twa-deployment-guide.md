---
inclusion: manual
---

# Guia TWA + Dominio Personalizado + Bubblewrap — GallOli

## Datos del proyecto

- Package ID Play Store: `dev.pages.galloli.twa`
- Dominio: `galloli.ivapps.store`
- Cloudflare Pages: `galloli.pages.dev`
- Account ID Cloudflare: `ad83f16cea132210cff0f92fe179e628`
- Zone ID ivapps.store: `4460c7a9ce1624d09b750f5bf23100bc`
- Keystore: `GallOli - Google Play package2\signing.keystore`
- Key alias: `galloli-iQ-Apps`
- Key password: en signing-key-info.txt
- Fingerprint Google Play Signing: `B5:09:51:3F:F2:D5:DF:34:A2:0D:9F:EE:CE:5C:1C:07:7A:40:09:60:9B:DF:F0:48:FE:C7:C2:4A:8E:56:C6:CF`

---

## Flujo de trabajo

### Cambio solo en codigo PWA (JS/CSS/HTML)
```
1. Editar archivos
2. Incrementar APP_VERSION en sw.js
3. git add . ; git commit -m "vX.X.X - descripcion"
4. wrangler pages deploy . --project-name=galloli --branch=main
```
NO necesitas tocar el AAB ni Play Store.

### Cambio en Worker (workers/index.js)
```
1. Editar workers/index.js
2. cd workers ; wrangler deploy
3. Luego desplegar Pages como arriba
```

### Nuevo build TWA para Play Store
Solo cuando cambias: dominio, permisos Android, version minima SDK, o configuracion nativa.
```
1. Editar twa-manifest.json y app/build.gradle (incrementar versionCode y versionName)
2. Ejecutar build (ver seccion Bubblewrap abajo)
3. Subir app-release.aab a Play Store
```

---

## Dominio personalizado en Cloudflare Pages via API

### Paso 1: Crear CNAME en DNS
```powershell
$t = "TU_API_TOKEN"
$body = '{"type":"CNAME","name":"subdominio","content":"proyecto.pages.dev","proxied":true,"ttl":1}'
$bytes = [System.Text.Encoding]::ASCII.GetBytes($body)
[System.IO.File]::WriteAllBytes("C:\temp\cname.json", $bytes)
curl.exe -s -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/dns_records" -H "Authorization: Bearer $t" -H "Content-Type: application/json" --data-binary "@C:\temp\cname.json"
```

### Paso 2: Vincular dominio al proyecto Pages
```powershell
$t = "TU_API_TOKEN"
$body = '{"name":"subdominio.tudominio.com"}'
$bytes = [System.Text.Encoding]::ASCII.GetBytes($body)
[System.IO.File]::WriteAllBytes("C:\temp\domain.json", $bytes)
curl.exe -s -X POST "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/pages/projects/NOMBRE-PROYECTO/domains" -H "Authorization: Bearer $t" -H "Content-Type: application/json" --data-binary "@C:\temp\domain.json"
```

IMPORTANTE: Usar siempre `[System.Text.Encoding]::ASCII.GetBytes()` para escribir JSON — evita BOM y problemas de encoding en PowerShell.

### Paso 3: Verificar estado
```powershell
curl.exe -s "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/pages/projects/NOMBRE-PROYECTO/domains" -H "Authorization: Bearer $t"
```
El campo `status` debe ser `active`.

NOTA: La API de Cloudflare Pages tiene un bug con TLDs no estandar como `.store` — si da error `8000015 invalid TLD`, el dominio igual se puede vincular desde el dashboard manualmente.

---

## Bubblewrap — Build TWA

### Requisitos
- JDK 17: `C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot`
- Android SDK: `C:\AndroidSDK`
- Bubblewrap: `npm install -g @bubblewrap/cli`
- JAVA_HOME debe apuntar al JDK 17

### Inicializar proyecto (solo primera vez o si se corrompe)
```powershell
cd "GallOli - Google Play package2"
bubblewrap init --manifest "https://galloli.ivapps.store/manifest.json"
```

Respuestas correctas:
- Domain: `galloli.ivapps.store` (SIN https:// ni slash final)
- URL path: `/`
- Application ID: `dev.pages.galloli.twa`
- Display mode: `standalone`
- Play Billing: No
- Geolocation: Si
- Key store: `C:\Users\Ivan Quiñonez\Desktop\github-repos\GalloApp\GallOli - Google Play package2\signing.keystore`
- Key alias: `galloli-iQ-Apps`
- Create new keystore: No

### Despues del init — correcciones obligatorias

1. Agregar en `gradle.properties`:
```
android.overridePathCheck=true
```

2. Corregir ruta del keystore en `twa-manifest.json` si tiene caracteres extra (`& '...'`):
```json
"signingKey": {
  "path": "C:\\Users\\Ivan Quiñonez\\Desktop\\github-repos\\GalloApp\\GallOli - Google Play package2\\signing.keystore",
  "alias": "galloli-iQ-Apps"
}
```

3. Agregar permisos en `app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
```

4. CRITICO — Eliminar `.json` como mimeType en AndroidManifest.xml. `.json` NO es un MIME type valido, causa `INSTALL_PARSE_FAILED_MANIFEST_MALFORMED`. Solo dejar `application/json`:
```xml
<!-- MAL — esto rompe la instalacion -->
<data android:mimeType=".json" />

<!-- BIEN -->
<data android:mimeType="application/json" />
```

### Build del AAB para Play Store
```powershell
$keystore = "C:\Users\Ivan Quiñonez\Desktop\github-repos\GalloApp\GallOli - Google Play package2\signing.keystore"
.\gradlew clean bundleRelease "-Pandroid.injected.signing.store.file=$keystore" "-Pandroid.injected.signing.store.password=KEYSTORE_PASSWORD" "-Pandroid.injected.signing.key.alias=galloli-iQ-Apps" "-Pandroid.injected.signing.key.password=KEY_PASSWORD"
```

El AAB queda en: `app\build\outputs\bundle\release\app-release.aab`

### Build del APK para prueba directa (sideload)
```powershell
.\gradlew assembleRelease "-Pandroid.injected.signing.store.file=$keystore" ...
```
El APK queda en: `app\build\outputs\apk\release\app-release.apk`

### Instalar APK via ADB para diagnostico
```powershell
C:\AndroidSDK\platform-tools\adb.exe install -r "app\build\outputs\apk\release\app-release.apk"
```
Si da error, el mensaje exacto indica el problema (ej: `INSTALL_PARSE_FAILED_MANIFEST_MALFORMED`).

---

## assetlinks.json — CRITICO para TWA

El archivo `.well-known/assetlinks.json` debe tener el fingerprint de **Google Play App Signing**, NO el de tu keystore local.

Para obtenerlo: Play Console → tu app → Configuracion → Integridad de la app → Certificado de firma de la app → SHA-256.

Verificar que Google lo reconoce:
```powershell
curl.exe -s "https://digitalassetlinks.googleapis.com/v1/assetlinks:check?source.web.site=https://galloli.ivapps.store&relation=delegate_permission/common.handle_all_urls&target.android_app.package_name=dev.pages.galloli.twa&target.android_app.certificate.sha256_fingerprint=FINGERPRINT"
```
Debe devolver `"linked": true`.

---

## Errores comunes y soluciones

| Error | Causa | Solucion |
|-------|-------|----------|
| `INSTALL_PARSE_FAILED_MANIFEST_MALFORMED: .json` | `.json` como mimeType en AndroidManifest | Eliminar `<data android:mimeType=".json"/>` |
| `Your project path contains non-ASCII characters` | La `ñ` en la ruta | Agregar `android.overridePathCheck=true` en gradle.properties |
| `Invalid EC key in JSON Web Key` | VAPID keys mal formateadas | Regenerar keys con `crypto.subtle.generateKey` |
| `SW timeout` al activar push | `serviceWorker.ready` bloqueado | Usar `App._swRegistration` guardado al registrar el SW |
| `Cannot install` en Play Store | APK corrupto o mimeType invalido | Probar con ADB para ver error exacto |
| `bubblewrap update` falla con TypeError | Bug interno de bubblewrap | Editar archivos manualmente en lugar de usar update |
| Keystore path truncado `C:\Users\Ivan` | PowerShell interpreta mal la ruta con espacios | Corregir manualmente en twa-manifest.json |
| `8000015 invalid TLD` en API Cloudflare Pages | Bug de la API con TLDs no estandar | Vincular desde el dashboard manualmente |

---

## Incrementar version para nuevo build

En `app/build.gradle`:
```groovy
versionCode 10  // siempre mayor al anterior
versionName "10"
```

En `twa-manifest.json`:
```json
"appVersionCode": 10,
"appVersionName": "10"
```

Luego ejecutar `clean bundleRelease`.

---

## Verificaciones antes de subir a Play Store

```powershell
# 1. Verificar assetlink
curl.exe -s "https://digitalassetlinks.googleapis.com/v1/assetlinks:check?..."

# 2. Probar APK con ADB antes de subir AAB
C:\AndroidSDK\platform-tools\adb.exe install -r app-release.apk

# 3. Verificar que el AAB existe y tiene fecha reciente
Get-Item "app\build\outputs\bundle\release\app-release.aab" | Select-Object LastWriteTime
```
