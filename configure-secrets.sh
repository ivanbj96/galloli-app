#!/bin/bash

# Script para configurar Secrets de Cloudflare en GitHub Actions
# Uso: bash configure-secrets.sh <API_TOKEN> <ACCOUNT_ID>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🚀 Configurar Secrets de Cloudflare en GitHub Actions    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Verificar argumentos
if [ $# -lt 2 ]; then
    echo "❌ Error: Faltan argumentos"
    echo ""
    echo "Uso: bash configure-secrets.sh <API_TOKEN> <ACCOUNT_ID>"
    echo ""
    echo "Ejemplos:"
    echo "  bash configure-secrets.sh 'v1.0abc123xyz...' 'a1b2c3d4e5f6...'"
    echo ""
    echo "Para obtener estos valores, ve a:"
    echo "  1. API Token: https://dash.cloudflare.com/profile/api-tokens"
    echo "  2. Account ID: https://dash.cloudflare.com/profile/overview"
    echo ""
    exit 1
fi

API_TOKEN="$1"
ACCOUNT_ID="$2"

# Validaciones básicas
if [ -z "$API_TOKEN" ] || [ -z "$ACCOUNT_ID" ]; then
    echo "❌ Error: API_TOKEN y ACCOUNT_ID no pueden estar vacíos"
    exit 1
fi

if [ ${#API_TOKEN} -lt 10 ]; then
    echo "❌ Error: API_TOKEN parece demasiado corto"
    exit 1
fi

if [ ${#ACCOUNT_ID} -lt 10 ]; then
    echo "❌ Error: ACCOUNT_ID parece demasiado corto"
    exit 1
fi

echo "✅ Validación básica completada"
echo ""

# Verificar si gh CLI está disponible
if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI (gh) no está instalado"
    echo ""
    echo "Para instalar GitHub CLI:"
    echo "  macOS: brew install gh"
    echo "  Linux: https://github.com/cli/cli/releases"
    echo "  Windows: choco install gh"
    echo ""
    echo "O agrega manualmente en GitHub:"
    echo "  Settings → Secrets and variables → Actions"
    echo ""
    exit 1
fi

echo "ℹ️  GitHub CLI encontrada"
echo ""

# Verificar autenticación
echo "🔐 Verificando autenticación de GitHub..."
if ! gh auth status > /dev/null 2>&1; then
    echo "❌ No estás autenticado en GitHub"
    echo ""
    echo "Ejecuta: gh auth login"
    exit 1
fi

GITHUB_USER=$(gh auth status 2>&1 | grep "Logged in to" | awk '{print $1}' || echo "unknown")
echo "✅ Autenticado como: $GITHUB_USER"
echo ""

# Estamos en el directorio correcto
echo "📁 Repositorio detectado: galloli-app"
echo ""

# Confirmar antes de hacer cambios
echo "📋 Los siguientes secrets se van a agregar:"
echo "   1. CLOUDFLARE_API_TOKEN = ${API_TOKEN:0:10}...${API_TOKEN: -10}"
echo "   2. CLOUDFLARE_ACCOUNT_ID = $ACCOUNT_ID"
echo ""
read -p "¿Continuar? (s/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo "❌ Operación cancelada"
    exit 1
fi

echo ""
echo "🔄 Agregando secrets a GitHub..."
echo ""

# Agregar secretos
echo "⏳ Configurando CLOUDFLARE_API_TOKEN..."
if gh secret set CLOUDFLARE_API_TOKEN --body "$API_TOKEN" 2>/dev/null; then
    echo "✅ CLOUDFLARE_API_TOKEN configurado"
else
    echo "⚠️  Error al configurar CLOUDFLARE_API_TOKEN"
    exit 1
fi

echo ""
echo "⏳ Configurando CLOUDFLARE_ACCOUNT_ID..."
if gh secret set CLOUDFLARE_ACCOUNT_ID --body "$ACCOUNT_ID" 2>/dev/null; then
    echo "✅ CLOUDFLARE_ACCOUNT_ID configurado"
else
    echo "⚠️  Error al configurar CLOUDFLARE_ACCOUNT_ID"
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ Secrets configurados correctamente                      ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║                                                             ║"
echo "║  Los siguientes secrets están ahora en GitHub:            ║"
echo "║  • CLOUDFLARE_API_TOKEN                                   ║"
echo "║  • CLOUDFLARE_ACCOUNT_ID                                  ║"
echo "║                                                             ║"
echo "║  El deploy automático está ACTIVADO 🚀                     ║"
echo "║                                                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Verificar que se agregaron
echo "🔍 Verificando secrets..."
echo ""
if gh secret list | grep -q "CLOUDFLARE_API_TOKEN"; then
    echo "✅ CLOUDFLARE_API_TOKEN verificado"
fi
if gh secret list | grep -q "CLOUDFLARE_ACCOUNT_ID"; then
    echo "✅ CLOUDFLARE_ACCOUNT_ID verificado"
fi

echo ""
echo "📊 Próximos pasos:"
echo ""
echo "1. Los workflows de GitHub Actions usarán automáticamente"
echo "   estos secrets para desplegar tu app"
echo ""
echo "2. Haz push de cualquier cambio:"
echo "   git push origin main"
echo ""
echo "3. Ve a GitHub Actions para ver el deploy:"
echo "   https://github.com/ivanbj96/galloli-app/actions"
echo ""
echo "4. Tu app estará disponible en Cloudflare Pages en ~5 minutos"
echo ""
echo "✨ ¡Listo! Tu deploy automático está configurado."
echo ""
