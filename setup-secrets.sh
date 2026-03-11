#!/bin/bash

# Script interactivo simple para configurar Secrets de Cloudflare
# Este es el script más fácil de usar - simplemente pregunta por los valores

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🚀 Asistente de Configuración de Cloudflare para GitHub  ║"
echo "║                  (Interactivo)                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "Este script te ayudará a configurar los secrets de Cloudflare"
echo "en GitHub Actions para que el deploy automático funcione."
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# Paso 1: Account ID
echo ""
echo "📍 PASO 1: Tu CLOUDFLARE_ACCOUNT_ID"
echo ""
echo "¿Dónde obtenerlo?"
echo "  Opción A: https://dash.cloudflare.com/profile/overview"
echo "           (busca 'Account ID' en el panel derecho)"
echo ""
echo "  Opción B: En la URL del dashboard"
echo "           https://dash.cloudflare.com/<TU_ACCOUNT_ID>"
echo ""
read -p "Ingresa tu Account ID: " ACCOUNT_ID

if [ -z "$ACCOUNT_ID" ]; then
    echo "❌ Account ID no puede estar vacío"
    exit 1
fi

echo "✅ Account ID guardado: $ACCOUNT_ID"
echo ""

# Paso 2: API Token
echo "📍 PASO 2: Tu CLOUDFLARE_API_TOKEN"
echo ""
echo "¿Cómo obtenerlo?"
echo "  1. Ve a: https://dash.cloudflare.com/profile/api-tokens"
echo ""
echo "  2. Haz clic en 'Create Token'"
echo ""
echo "  3. Permisos necesarios:"
echo "     ✓ Cloudflare Pages - Edit"
echo "     ✓ Workers Scripts - Edit"
echo "     ✓ D1 Database - Edit"
echo ""
echo "  4. En 'Account Resources' selecciona tu cuenta"
echo "  5. En 'Zone Resources' selecciona 'All zones'"
echo ""
echo "  ⚠️  IMPORTANTE: Copia el token INMEDIATAMENTE"
echo "     (solo se muestra una vez)"
echo ""
read -p "Ingresa tu API Token: " -r API_TOKEN

if [ -z "$API_TOKEN" ]; then
    echo "❌ API Token no puede estar vacío"
    exit 1
fi

echo "✅ API Token guardado (primeros 10 caracteres: ${API_TOKEN:0:10}...)"
echo ""

# Paso 3: Confirmación
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📋 Resumen de configuración:"
echo ""
echo "   CLOUDFLARE_ACCOUNT_ID = $ACCOUNT_ID"
echo "   CLOUDFLARE_API_TOKEN  = ${API_TOKEN:0:10}...${API_TOKEN: -10}"
echo ""
echo "Estos secrets se agregarán a tu repositorio de GitHub"
echo "y se usarán para deploys automáticos."
echo ""
read -p "¿Continuar? (s/n) " -n 1 -r CONFIRM
echo ""

if [[ ! $CONFIRM =~ ^[Ss]$ ]]; then
    echo "❌ Configuración cancelada"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# Verificar GitHub CLI
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI no está instalado"
    echo ""
    echo "Instálalo desde: https://cli.github.com/"
    echo "O agrega los secrets manualmente:"
    echo ""
    echo "  1. Ve a: https://github.com/ivanbj96/galloli-app"
    echo "  2. Settings → Secrets and variables → Actions"
    echo "  3. New repository secret (dos secretos)"
    exit 1
fi

# Verificar autenticación de GitHub
if ! gh auth status > /dev/null 2>&1; then
    echo "⚠️  No estás autenticado en GitHub"
    echo ""
    echo "⏳ Iniciando autenticación..."
    gh auth login
    
    if [ $? -ne 0 ]; then
        echo "❌ Autenticación cancelada"
        exit 1
    fi
fi

echo "🔐 Agregando secrets a GitHub..."
echo ""

# Agregar secrets
echo "  ⏳ CLOUDFLARE_API_TOKEN..."
if gh secret set CLOUDFLARE_API_TOKEN --body "$API_TOKEN" 2>/dev/null; then
    echo "  ✅ CLOUDFLARE_API_TOKEN agregado"
else
    echo "  ❌ Error al agregar CLOUDFLARE_API_TOKEN"
    exit 1
fi

echo "  ⏳ CLOUDFLARE_ACCOUNT_ID..."
if gh secret set CLOUDFLARE_ACCOUNT_ID --body "$ACCOUNT_ID" 2>/dev/null; then
    echo "  ✅ CLOUDFLARE_ACCOUNT_ID agregado"
else
    echo "  ❌ Error al agregar CLOUDFLARE_ACCOUNT_ID"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                             ║"
echo "║  ✅ ¡Configuración completada!                             ║"
echo "║                                                             ║"
echo "║  Los secrets han sido agregados a GitHub                   ║"
echo "║  El deploy automático está ACTIVADO 🚀                     ║"
echo "║                                                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "📊 Próximos pasos:"
echo ""
echo "  1. Ve a GitHub Actions:"
echo "     https://github.com/ivanbj96/galloli-app/actions"
echo ""
echo "  2. Haz un push para activar el deploy:"
echo "     git push origin main"
echo ""
echo "  3. Tu app estará en Cloudflare Pages en ~5 minutos"
echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
