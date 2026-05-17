# 📱 Guía: Generar APK con Logo y Splash Personalizados

Esta guía explica cómo configurar tu proyecto para generar un APK con tu **logo propio** y **splash personalizado**, sin usar los defaults de Capacitor.

---

## 🎯 Conceptos Clave

### El Problema con Capacitor
Por defecto, Capacitor genera:
- **Logo**: Ícono de Capacitor genérico (feo)
- **Splash**: Pantalla blanca con nombre de la app (genérica)

### La Solución: Generar Assets Nativos
Tu proyecto **GallOli** resuelve esto generando los assets nativos **en el CI/CD**, sin depender de Capacitor:

```
capacitor.config.ts → Configuración genérica (se ignoran logo/splash)
                ↓
.github/workflows/build-android.yml → Genera assets propios
                ↓
android/app/src/main/res/ → Ícono y splash personalizados
                ↓
APK final → Con branding propio ✅
```

---

## 🔧 Requisitos Previos

1. **ImageMagick instalado** (en CI/CD):
   ```bash
   # En GitHub Actions (ya incluido en ubuntu-latest)
   sudo apt-get install imagemagick
   ```

2. **Tu logo en formato PNG**:
   - Ubicación recomendada: `icons/favicon.pub/android-chrome-512x512.png`
   - Mínimo: 512×512px
   - Color: Compatible con fondo de splash

3. **Estructura básica de Capacitor**:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap add android
   ```

---

## 📝 Paso 1: Preparar tu Logo

### Ubicación del Logo
```
proyecto/
├── icons/
│   └── favicon.pub/
│       ├── android-chrome-512x512.png    ← Tu logo aquí
│       └── ...
├── capacitor.config.ts
└── android/
```

### Crear el Logo (si no tienes)
```bash
# Crear logo desde imagen existente (ej: logo.png)
convert logo.png -resize 512x512 -background transparent -gravity center \
  -extent 512x512 icons/favicon.pub/android-chrome-512x512.png

# O crear un logo de prueba (rectángulo azul con texto)
convert -size 512x512 xc:'#185a83' \
  -gravity center -pointsize 100 -fill white -annotate +0+0 "G" \
  icons/favicon.pub/android-chrome-512x512.png
```

---

## 🎨 Paso 2: Configurar el Color de Base

Edita tu `capacitor.config.ts`:

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'store.ivapps.galloli',  // Mismo package name
  appName: 'GallOli',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,        // ← NO mostrar splash de Capacitor
      launchAutoHide: true,
      backgroundColor: '#185a83',   // Tu color de brand
      showSpinner: false
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#185a83'    // Mismo color
    }
  }
};

export default config;
```

**Puntos clave:**
- `launchShowDuration: 0` → Desactiva el splash de Capacitor
- `backgroundColor` → Tu color de brand (azul en GallOli)

---

## 🏗️ Paso 3: Generar Assets Nativos en CI/CD

### Estructura del Workflow

Crea `.github/workflows/build-android.yml`:

```yaml
name: Build Android APK

on:
  push:
    tags:
      - 'v*'  # Trigger cuando hagas git tag v1.0.0

jobs:
  build-android:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install dependencies
        run: npm install

      - name: Generate icons from source
        run: |
          SRC="icons/favicon.pub/android-chrome-512x512.png"
          RES="android/app/src/main/res"
          
          # Crear directorio de recursos si no existe
          mkdir -p "$RES/mipmap-hdpi" "$RES/mipmap-xhdpi" "$RES/mipmap-xxhdpi" "$RES/mipmap-xxxhdpi"
          
          # Generar ícono para cada densidad
          for cfg in "hdpi:72" "xhdpi:96" "xxhdpi:144" "xxxhdpi:192"; do
            d="${cfg%%:*}"
            size="${cfg##*:}"
            convert "$SRC" -resize ${size}x${size} \
              "$RES/mipmap-$d/ic_launcher.png"
            echo "✓ Generado: mipmap-$d/ic_launcher.png (${size}x${size})"
          done
          
          # Ícono foreground (versión más pequeña)
          for cfg in "hdpi:72" "xhdpi:96" "xxhdpi:144" "xxxhdpi:192"; do
            d="${cfg%%:*}"
            size="${cfg##*:}"
            fg=$((size * 75 / 100))  # 75% del tamaño
            convert "$SRC" -resize ${fg}x${fg} -gravity center \
              -extent ${size}x${size} "$RES/mipmap-$d/ic_launcher_foreground.png"
          done
          
          # Adaptive icon XML (Android 8+)
          mkdir -p "$RES/mipmap-anydpi-v26"
          cat > "$RES/mipmap-anydpi-v26/ic_launcher.xml" << 'EOF'
          <?xml version="1.0" encoding="utf-8"?>
          <adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
              <background android:drawable="@color/ic_launcher_background"/>
              <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
          </adaptive-icon>
          EOF
          
          # Color de fondo del ícono
          mkdir -p "$RES/values"
          cat > "$RES/values/ic_launcher_background.xml" << 'EOF'
          <?xml version="1.0" encoding="utf-8"?>
          <resources>
              <color name="ic_launcher_background">#185a83</color>
          </resources>
          EOF
          
          echo "✓ Ícono adaptativo configurado"

      - name: Generate splash screens
        run: |
          SRC="icons/favicon.pub/android-chrome-512x512.png"
          RES="android/app/src/main/res"
          
          # Splash para cada orientación y densidad
          # Formato: {orientación}-{densidad}:{ancho}x{alto}
          for cfg in \
            "port-mdpi:320x480" \
            "port-hdpi:480x800" \
            "port-xhdpi:720x1280" \
            "port-xxhdpi:960x1600" \
            "port-xxxhdpi:1280x1920" \
            "land-mdpi:480x320" \
            "land-hdpi:800x480" \
            "land-xhdpi:1280x720" \
            "land-xxhdpi:1600x960" \
            "land-xxxhdpi:1920x1280"; do
            
            d="${cfg%%:*}"
            dims="${cfg##*:}"
            w="${dims%%x*}"
            h="${dims##*x}"
            
            # Logo a 40% del ancho
            s=$((w * 40 / 100))
            
            mkdir -p "$RES/drawable-$d"
            
            # Fondo azul + logo centrado
            convert -size ${w}x${h} xc:"#185a83" \
              \( "$SRC" -resize ${s}x${s} \) \
              -gravity center -composite \
              "$RES/drawable-$d/splash.png"
            
            echo "✓ Generado: drawable-$d/splash.png (${w}x${h})"
          done

      - name: Disable Capacitor splash screen
        run: |
          # Cambiar tema para no mostrar splash de Capacitor
          sed -i 's|AppTheme\.NoActionBarLaunch|AppTheme.NoActionBar|g' \
            android/app/src/main/AndroidManifest.xml
          echo "✓ Splash de Capacitor desactivado"

      - name: Build APK
        run: |
          cd android
          ./gradlew assembleDebug
          echo "✓ APK compilado"

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: GallOli-APK
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 30
```

---

## 📊 Paso 4: Script Auxiliar para Desactivar Splash

Crea `.github/scripts/disable_splash.py`:

```python
#!/usr/bin/env python3
"""Desactiva el splash screen nativo de Capacitor."""

import os
import re

manifest_path = 'android/app/src/main/AndroidManifest.xml'

if os.path.exists(manifest_path):
    with open(manifest_path, 'r') as f:
        content = f.read()
    
    # Cambiar tema para que no muestre el splash
    content = re.sub(
        r'android:theme="@style/AppTheme\.NoActionBarLaunch"',
        'android:theme="@style/AppTheme.NoActionBar"',
        content
    )
    
    with open(manifest_path, 'w') as f:
        f.write(content)
    
    print("✓ Splash screen desactivado en AndroidManifest.xml")
else:
    print("⚠ AndroidManifest.xml no encontrado")
```

---

## 🚀 Paso 5: Compilar Localmente (Opcional)

Si quieres probar sin GitHub Actions:

```bash
# 1. Instalar dependencias
npm install

# 2. Sincronizar Capacitor
npx cap sync android

# 3. Generar assets (manualmente, imitando el script)
SRC="icons/favicon.pub/android-chrome-512x512.png"
RES="android/app/src/main/res"

# Ícono para cada densidad
for cfg in "hdpi:72" "xhdpi:96" "xxhdpi:144" "xxxhdpi:192"; do
  d="${cfg%%:*}"
  size="${cfg##*:}"
  convert "$SRC" -resize ${size}x${size} "$RES/mipmap-$d/ic_launcher.png"
done

# Splash
for cfg in "port-hdpi:480x800" "land-hdpi:800x480"; do
  d="${cfg%%:*}"
  dims="${cfg##*:}"
  w="${dims%%x*}"
  h="${dims##*x}"
  s=$((w * 40 / 100))
  mkdir -p "$RES/drawable-$d"
  convert -size ${w}x${h} xc:"#185a83" \
    \( "$SRC" -resize ${s}x${s} \) \
    -gravity center -composite \
    "$RES/drawable-$d/splash.png"
done

# 4. Compilar
cd android
./gradlew assembleDebug

# APK en: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 🎯 Paso 6: Crear Release con APK

```bash
# 1. Hacer cambios finales
git add .
git commit -m "chore: actualizar logo y splash"

# 2. Crear tag (dispara el workflow)
git tag v1.0.0
git push origin main --tags

# 3. GitHub Actions genera el APK automáticamente
# 4. Descargarlo de Actions → Artifacts
```

---

## 📂 Estructura Final

Después de ejecutar el workflow:

```
android/app/src/main/res/
├── mipmap-hdpi/
│   ├── ic_launcher.png          ← Tu logo (72x72)
│   └── ic_launcher_foreground.png
├── mipmap-xhdpi/
│   ├── ic_launcher.png          ← Tu logo (96x96)
│   └── ic_launcher_foreground.png
├── mipmap-xxhdpi/
│   ├── ic_launcher.png          ← Tu logo (144x144)
│   └── ic_launcher_foreground.png
├── mipmap-xxxhdpi/
│   ├── ic_launcher.png          ← Tu logo (192x192)
│   └── ic_launcher_foreground.png
├── mipmap-anydpi-v26/
│   └── ic_launcher.xml          ← Adaptive icon
├── drawable-port-mdpi/
│   └── splash.png               ← Splash vertical (320x480)
├── drawable-port-hdpi/
│   └── splash.png               ← Splash vertical (480x800)
├── drawable-port-xhdpi/
│   └── splash.png               ← Splash vertical (720x1280)
├── drawable-land-hdpi/
│   └── splash.png               ← Splash horizontal (800x480)
├── drawable-land-xhdpi/
│   └── splash.png               ← Splash horizontal (1280x720)
└── values/
    └── ic_launcher_background.xml   ← Color de fondo
```

---

## ✅ Verificación

Después de generar el APK:

```bash
# Inspeccionar archivos dentro del APK
unzip -l app-debug.apk | grep -E "drawable|mipmap"

# Debería mostrar tus assets personalizados:
# res/mipmap-hdpi/ic_launcher.png ✓
# res/drawable-port-hdpi/splash.png ✓
```

---

## 🎨 Personalización Avanzada

### Cambiar Color de Splash
En el workflow, modifica:
```bash
convert -size ${w}x${h} xc:"#TU_COLOR_HEX" ...
```

### Cambiar Tamaño del Logo en Splash
```bash
s=$((w * 50 / 100))  # 50% en lugar de 40%
```

### Agregar Texto al Splash
```bash
convert -size ${w}x${h} xc:"#185a83" \
  \( "$SRC" -resize ${s}x${s} \) \
  -gravity center -composite \
  -gravity south -pointsize 30 -fill white -annotate +0+50 "v1.0.0" \
  "$RES/drawable-$d/splash.png"
```

### Usar Logo Circular
```bash
convert "$SRC" \
  -resize ${size}x${size} \
  -background none -gravity center \
  -extent ${size}x${size} \
  -bordercolor none -border 10 \
  \( +clone -alpha extract -compose Dst_out -composite \) \
  -compose over -composite \
  -define png:color-type=6 \
  "$RES/mipmap-$d/ic_launcher.png"
```

---

## 🐛 Troubleshooting

### ❌ "convert: command not found"
**Solución:** Instalar ImageMagick
```bash
sudo apt-get update && sudo apt-get install imagemagick
```

### ❌ "APK no muestra mi logo, sigue siendo el de Capacitor"
**Causas:**
1. ✅ Verificar que los archivos estén en `android/app/src/main/res/`
2. ✅ Ejecutar `npx cap sync android` después de los cambios
3. ✅ Hacer clean build: `./gradlew clean && ./gradlew assembleDebug`

### ❌ "Splash no aparece"
**Solución:**
1. Verificar que `AndroidManifest.xml` tenga `AppTheme.NoActionBar` (no `NoActionBarLaunch`)
2. Verificar que `drawable-*-v` directorios existan
3. En `capacitor.config.ts`, confirmar `launchShowDuration: 0`

### ❌ "Ícono se ve pixelado"
**Causas:**
1. Logo source es muy pequeño (mínimo 512x512)
2. Redimensionamiento incorrecto en ImageMagick

**Solución:**
```bash
# Verificar tamaño original
identify icons/favicon.pub/android-chrome-512x512.png

# Si es muy pequeño, escalarlo sin perder calidad
convert icons/favicon.pub/android-chrome-512x512.png \
  -resize 1024x1024 -filter Lanczos \
  icons/favicon.pub/android-chrome-512x512.png
```

---

## 📖 Referencias

- [Android App Icons Guide](https://developer.android.com/google-play/resources/icon-design-specifications)
- [Adaptive Icons (Android 8+)](https://developer.android.com/guide/practices/ui_guidelines/icon_design_adaptive)
- [ImageMagick Documentation](https://imagemagick.org/Usage/annotating/)
- [Capacitor Android Guide](https://capacitorjs.com/docs/android)

---

## 🎓 Resumen

**Lo que hace esta guía:**

| Paso | Qué Hace | Resultado |
|------|----------|-----------|
| 1 | Prepara el logo PNG | Archivo fuente para todo |
| 2 | Configura colores en `capacitor.config.ts` | Desactiva splash nativo |
| 3 | Genera 20+ versiones del ícono | Logo en todas las densidades |
| 4 | Genera 10 splash screens | Portada personalizada en todas las orientaciones |
| 5 | Compila el APK | Tu app con branding propio |

**Resultado final:** APK profesional con tu logo y splash, sin defaults de Capacitor ✨

---

**¿Dudas?** Revisa `.github/workflows/build-android.yml` en tu repo para ver la implementación actual en GallOli.
