# 🔐 Configurar Secrets de Cloudflare en GitHub Actions

Este documento te guía a través de los pasos para configurar los secrets necesarios para que GitHub Actions pueda desplegar automáticamente tu app a Cloudflare Pages.

## 📋 Lo que necesitas

Para que el deploy automático funcione, necesitamos 2 secrets:

1. `CLOUDFLARE_API_TOKEN` - Token de autorización para Cloudflare API
2. `CLOUDFLARE_ACCOUNT_ID` - Tu ID de cuenta en Cloudflare

---

## 🔑 Paso 1: Obtener tu CLOUDFLARE_ACCOUNT_ID

### Opción A: Desde el Dashboard (Más fácil)

1. Ve a https://dash.cloudflare.com/profile/overview
2. Busca en el panel derecho una sección que diga "Account ID" o "ID de cuenta"
3. Copia el valor (es un ID largo tipo `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)

### Opción B: Desde la URL

1. Ve a https://dash.cloudflare.com/
2. Mira la URL actual
3. Será algo como: `https://dash.cloudflare.com/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
4. El Account ID es la parte larga al final

### Opción C: Desde wrangler (si tienes permisos)

```bash
wrangler login
wrangler whoami
# Mostrará tu Account ID
```

---

## 🔑 Paso 2: Obtener tu CLOUDFLARE_API_TOKEN

### ⚠️ IMPORTANTE: Crear un token con permisos específicos

1. Ve a https://dash.cloudflare.com/profile/api-tokens
2. Haz clic en **"Create Token"** (Crear Token)
3. Busca **"Edit Cloudflare Workers"** o similar, haz clic en **"Use template"**
4. O crea uno personalizado con estos permisos:
   - ✅ **Cloudflare Pages** - Edit
   - ✅ **Workers Scripts** - Edit  
   - ✅ **D1 Database** - Edit
   - ✅ **Account Settings** - Read
5. **IMPORTANTE:** En "Account Resources" selecciona tu cuenta
6. En "Zone Resources" selecciona "All zones"
7. Haz clic en **"Continue to summary"**
8. Revisa y marca los permisos correctos
9. Haz clic en **"Create Token"**
10. **COPIA EL TOKEN INMEDIATAMENTE** (solo se muestra una vez) 🚨

---

## 🚀 Paso 3: Agregar los Secrets a GitHub

### Método A: Desde la interfaz web (Recomendado)

1. Ve a tu repositorio: https://github.com/ivanbj96/galloli-app
2. Haz clic en **Settings** (en la esquina superior derecha)
3. En el menú izquierdo, ve a **Secrets and variables** → **Actions**
4. Haz clic en **"New repository secret"** (Nuevo secret del repositorio)

#### Primer Secret:
```
Name: CLOUDFLARE_API_TOKEN
Value: (pega tu token aquí)
```
Haz clic en **"Add secret"**

#### Segundo Secret:
```
Name: CLOUDFLARE_ACCOUNT_ID
Value: (pega tu Account ID aquí)
```
Haz clic en **"Add secret"**

### Método B: Desde la terminal (CLI de GitHub)

```bash
# Instalar GitHub CLI si no lo tienes
# https://cli.github.com/

# Autenticarse
gh auth login

# Agregar los secrets
gh secret set CLOUDFLARE_API_TOKEN --body "tu_token_aqui"
gh secret set CLOUDFLARE_ACCOUNT_ID --body "tu_account_id_aqui"

# Verificar que se agregaron
gh secret list
```

---

## ✅ Verificar que todo funciona

Después de agregar los secrets:

1. Ve a tu repositorio en GitHub
2. Haz clic en **"Actions"** en la barra superior
3. Deberías ver tus workflows:
   - ✅ **Continuous Integration** (CI) - Verde ✓
   - **Deploy to Cloudflare Pages** - Debería estar verde si todo está bien
   - **Build Android APK** - Normal si aún no lo configuraste
4. Espera a que se ejecute el siguiente push/workflow

---

## 🔍 Testear el Deploy

Para verificar que funciona:

```bash
# Realiza un pequeño cambio en tu código
echo "# Test" >> README.md

# Haz commit y push
git add README.md
git commit -m "test: verificar deploy"
git push origin main
```

Luego:
1. Ve a GitHub → Actions
2. Deberías ver un nuevo workflow ejecutándose
3. Espera a que termine (5-10 minutos)
4. Si tiene color 🟢 verde, ¡el deploy funcionó!

---

## ❌ Troubleshooting

### "Invalid API Token"
- Verifica que copiaste el token completo sin espacios
- El token debe tener permisos para Cloudflare Pages y Workers
- Intenta generar uno nuevo

### "Account ID not found"
- Asegúrate de que el Account ID es correcto (son esos IDs largos)
- No confundas con Zone ID o otros IDs
- Copia exactamente como aparece en el dashboard

### "Deploy fails with 404"
- Verifica que el secret `CLOUDFLARE_ACCOUNT_ID` es válido
- Asegúrate que exista un Cloudflare Pages project llamado "galloli"
- En Cloudflare, ve a Pages y verifica que el proyecto existe

### "Permission denied"
- El token no tiene suficientes permisos
- Regenera un token con los permisos específicos listados arriba

---

## 🔒 Notas de Seguridad

⚠️ **IMPORTANTE:**
- **NUNCA** compartas tu API Token
- **NUNCA** lo commites a GitHub visiblemente
- Los secrets que agregues en GitHub no son visibles en los logs
- Si expones tu token, regenera uno nuevo inmediatamente
- Los tokens tienen fecha de vencimiento (configurable)

---

## 📊 Una vez configurado

Tus workflows funcionarán así:

```
Haces push a main
         ↓
GitHub Actions se ejecuta
         ├→ Continuous Integration (Valida código) ✅
         └→ Deploy to Cloudflare Pages (Publica tu app) 🚀
```

Tu aplicación estará en línea en ~5 minutos después de cada push.

---

**¿Preguntas?** 
- Verifica el Dashboard de Cloudflare: https://dash.cloudflare.com
- GitHub Secrets: https://github.com/ivanbj96/galloli-app/settings/secrets/actions
- Documentación oficial: https://developers.cloudflare.com/pages/
