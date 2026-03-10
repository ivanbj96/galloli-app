# Guía Completa: Build Automático de APK Android con Lovable + Capacitor + GitHub Actions

> Documentación basada en la experiencia real del proyecto **TeleCloud**. Válida para Lovable y cualquier IDE (Kiro, VS Code, etc.).

---

## 📋 Requisitos Previos

| Componente | Versión Mínima | Notas |
|---|---|---|
| Node.js | 22.x | Requerido por dependencias modernas |
| JDK | **21** | Capacitor 8 genera código Java 21. No usar JDK 17. |
| Android SDK | 35 | `platforms;android-35`, `build-tools;35.0.0` |
| Gradle | 8.14+ | Se descarga automáticamente via wrapper |
| Capacitor | 8.x | `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` |

---

## 🚀 Paso 1: Configurar el Proyecto Web

### 1.1 Instalar dependencias de Capacitor

```bash
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
```

> Si hay conflictos de peer dependencies, usar `npm install --legacy-peer-deps`.

### 1.2 Crear `capacitor.config.ts`

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tuempresa.tuapp',   // ⚠️ DEBE ser formato Java package válido
  appName: 'NombreDeTuApp',
  webDir: 'dist',
  // Para desarrollo con hot-reload, descomentar:
  // server: {
  //   url: 'https://TU-ID.lovableproject.com?forceHideBadge=true',
  //   cleartext: true,
  // },
};

export default config;
```

### ⚠️ Reglas críticas del `appId`

| ✅ Válido | ❌ Inválido |
|---|---|
| `com.miempresa.miapp` | `app.lovable.9bae58a1-16f1-4917...` |
| `app.lovable.telecloud` | `com.mi-empresa.mi-app` (guiones) |
| `io.myapp.project` | `com.123app.name` (empieza con número) |

**Reglas:**
- Solo letras minúsculas, números y puntos
- Cada segmento debe empezar con letra
- Mínimo 2 segmentos (`com.app`)
- Sin guiones, espacios ni caracteres especiales

---

## 🏗️ Paso 2: Build Local (Opcional, para verificar)

```bash
# 1. Construir la app web
npm run build

# 2. Agregar plataforma Android
npx cap add android

# 3. Sincronizar
npx cap sync android

# 4. Compilar APK debug
cd android && ./gradlew assembleDebug

# El APK estará en: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## ⚙️ Paso 3: GitHub Actions (Build Automático)

Crear el archivo `.github/workflows/build-android.yml`:

```yaml
name: Build Android APK

on:
  push:
    branches: [main]
  workflow_dispatch:  # Permite ejecutar manualmente

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm install --legacy-peer-deps

      - name: Build web app
        run: npm run build

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '21'          # ⚠️ MUST be 21 for Capacitor 8

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Accept Android SDK licenses
        run: yes | sdkmanager --licenses || true

      - name: Install Android SDK components
        run: |
          sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"

      - name: Add Android platform
        run: npx cap add android

      - name: Sync Capacitor
        run: npx cap sync android

      - name: Make Gradle executable
        run: chmod +x android/gradlew

      - name: Build Debug APK
        working-directory: android
        run: ./gradlew assembleDebug

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: app-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 30
```

---

## 📱 Paso 4: Descargar e Instalar el APK

1. Ve a tu repositorio en GitHub → **Actions**
2. Selecciona el workflow exitoso más reciente
3. En la sección **Artifacts**, descarga `app-debug`
4. Transfiere el `.apk` a tu teléfono Android
5. Habilita **"Instalar desde fuentes desconocidas"** en ajustes
6. Abre el archivo y toca **Instalar**

---

## 🐛 Errores Comunes y Soluciones

### Error: `invalid source release: 21`
**Causa:** JDK configurado en versión < 21.
**Solución:** Cambiar `java-version` a `'21'` en el workflow.

### Error: `Invalid Java package name` o crash al instalar
**Causa:** `appId` en `capacitor.config.ts` contiene caracteres inválidos (guiones, UUIDs largos).
**Solución:** Usar formato `com.empresa.app` con solo letras, números y puntos.

### Error: `SDK location not found`
**Causa:** Android SDK no configurado en CI.
**Solución:** Agregar el step `android-actions/setup-android@v3`.

### Error: `Could not determine the dependencies of task ':app:compileDebugJavaWithJavac'`
**Causa:** Componentes del SDK no instalados.
**Solución:** Asegurar el step con `sdkmanager "platforms;android-35" "build-tools;35.0.0"`.

### Error: `peer dependency conflict`
**Causa:** Versiones incompatibles de npm packages.
**Solución:** Usar `npm install --legacy-peer-deps`.

---

## 🔐 APK Firmado para Producción (Release)

Para publicar en Google Play Store, necesitas firmar el APK:

### 1. Generar keystore (una sola vez, en tu máquina local)

```bash
keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias
```

### 2. Agregar secrets en GitHub

Ve a **Settings → Secrets and variables → Actions** y agrega:

| Secret | Valor |
|---|---|
| `KEYSTORE_BASE64` | Tu keystore codificado en base64: `base64 -i my-release-key.jks` |
| `KEYSTORE_PASSWORD` | Password del keystore |
| `KEY_ALIAS` | Alias de la key |
| `KEY_PASSWORD` | Password de la key |

### 3. Agregar steps al workflow para release

```yaml
      - name: Decode keystore
        run: echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 -d > android/app/my-release-key.jks

      - name: Build Release APK
        working-directory: android
        run: |
          ./gradlew assembleRelease \
            -Pandroid.injected.signing.store.file=$PWD/app/my-release-key.jks \
            -Pandroid.injected.signing.store.password=${{ secrets.KEYSTORE_PASSWORD }} \
            -Pandroid.injected.signing.key.alias=${{ secrets.KEY_ALIAS }} \
            -Pandroid.injected.signing.key.password=${{ secrets.KEY_PASSWORD }}

      - name: Upload Release APK
        uses: actions/upload-artifact@v4
        with:
          name: app-release
          path: android/app/build/outputs/apk/release/app-release.apk
```

---

## 📂 Estructura de Archivos Esperada

```
proyecto/
├── .github/
│   └── workflows/
│       └── build-android.yml      # Workflow de CI/CD
├── capacitor.config.ts            # Config de Capacitor
├── package.json                   # Con dependencias de Capacitor
├── src/                           # Código fuente React/Vite
├── dist/                          # Build output (generado)
└── android/                       # Proyecto Android (generado por cap add)
```

> **Nota:** La carpeta `android/` NO se sube al repo. Se genera automáticamente en el CI con `npx cap add android`.

---

## 🔄 Flujo de Trabajo Recomendado

```
Lovable/Kiro (editar código)
        ↓
   Push a GitHub (automático en Lovable)
        ↓
   GitHub Actions se ejecuta
        ↓
   APK generado como artifact
        ↓
   Descargar e instalar en dispositivo
```

---

## 📌 Checklist Rápido para Nuevo Proyecto

- [ ] Instalar `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`
- [ ] Crear `capacitor.config.ts` con `appId` válido (formato Java package)
- [ ] Verificar que `webDir` apunte al directorio de build (`dist` para Vite)
- [ ] Crear `.github/workflows/build-android.yml`
- [ ] Confirmar JDK 21 en el workflow
- [ ] Confirmar Android SDK 35 en el workflow
- [ ] Usar `--legacy-peer-deps` si hay conflictos
- [ ] Primer push a `main` → verificar que el Action pase ✅
- [ ] Descargar APK desde Artifacts

---

*Última actualización: Marzo 2026 — Capacitor 8.1, Android SDK 35, JDK 21*
