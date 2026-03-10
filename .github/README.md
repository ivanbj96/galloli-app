# GitHub Actions Configuration

Este directorio contiene los workflows de GitHub Actions para automatizar el desarrollo y despliegue de GallOli.

## 🚀 Workflows Disponibles

### 1. **CI (Continuous Integration)** - `ci.yml`
- **Trigger**: Push a main/master/develop, Pull Requests
- **Funciones**:
  - Validación de sintaxis JavaScript
  - Verificación de HTML
  - Análisis de tamaño de archivos
  - Escaneo básico de seguridad
  - Verificación de rendimiento

### 2. **Deploy** - `deploy.yml`
- **Trigger**: Push a main/master
- **Funciones**:
  - Despliegue automático a Cloudflare Pages
  - Despliegue del Worker de sincronización
  - Instalación de dependencias

### 3. **Build Android** - `build-android.yml`
- **Trigger**: Tags `v*` o manual
- **Funciones**:
  - Configuración automática de Capacitor
  - Compilación de APK Android
  - Subida de artefactos
  - Creación de release con APK

### 4. **Release** - `release.yml`
- **Trigger**: Tags `v*`
- **Funciones**:
  - Creación automática de releases
  - Generación de changelog
  - Documentación de características

## 🔧 Configuración Requerida

### Secrets de GitHub
Configura estos secrets en tu repositorio:

```
CLOUDFLARE_API_TOKEN=tu_token_de_cloudflare
CLOUDFLARE_ACCOUNT_ID=tu_account_id
```

### Variables de Entorno
- `GITHUB_TOKEN`: Se proporciona automáticamente

## 📱 Uso

### Despliegue Automático
1. Haz push a `main` o `master`
2. GitHub Actions desplegará automáticamente

### Generar APK Android
1. Crea un tag: `git tag v1.0.0`
2. Push el tag: `git push origin v1.0.0`
3. El APK se generará automáticamente

### Release Manual
1. Ve a Actions → Build Android APK
2. Haz clic en "Run workflow"
3. Especifica la versión

## 🛠️ Desarrollo Local

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo
npm run dev

# Sincronizar Capacitor
npm run capacitor:sync

# Abrir Android Studio
npm run capacitor:open
```

## 📊 Estado de los Workflows

Los badges de estado aparecerán en el README principal una vez configurados.

## 🔍 Troubleshooting

### Error de permisos de Cloudflare
- Verifica que `CLOUDFLARE_API_TOKEN` tenga permisos de Pages y Workers
- Confirma que `CLOUDFLARE_ACCOUNT_ID` sea correcto

### Error de compilación Android
- Asegúrate de que `capacitor.config.ts` esté configurado
- Verifica que las dependencias de Capacitor estén instaladas

### Error de despliegue
- Revisa los logs en la pestaña Actions
- Confirma que el branch sea `main` o `master`