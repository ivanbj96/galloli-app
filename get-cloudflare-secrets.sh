#!/bin/bash

# Script para obtener Account ID desde Cloudflare usando wrangler
# Este script intenta autenticarse con wrangler y luego obtener el Account ID

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🔐 Obtener Secrets de Cloudflare con wrangler             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Verificar si wrangler está instalado
if ! command -v wrangler &> /dev/null; then
    echo "⚠️  wrangler no está instalado"
    echo ""
    echo "Instalando wrangler..."
    npm install -g wrangler
    echo "✅ wrangler instalado"
    echo ""
fi

echo "ℹ️  Usando wrangler para obtener credenciales de Cloudflare"
echo ""

# Verificar si ya está autenticado
echo "🔍 Verificando autenticación de wrangler..."
if wrangler whoami > /tmp/wrangler_auth.txt 2>&1; then
    echo ""
    cat /tmp/wrangler_auth.txt
    echo ""
    echo "✅ Ya estás autenticado en Cloudflare"
else
    echo ""
    echo "⏳ Necesitas autenticarte en Cloudflare"
    echo ""
    echo "Se abrirá una ventana en tu navegador para autorizar wrangler."
    echo "Haz clic en 'Autorizar' y regresa a esta terminal."
    echo ""
    read -p "Presiona ENTER para continuar..." -r
    echo ""
    
    # Ejecutar login
    wrangler login
    
    if [ $? -ne 0 ]; then
        echo ""
        echo "❌ Error durante la autenticación"
        echo ""
        echo "Intenta manualmente:"
        echo "  1. Ve a: https://dash.cloudflare.com/"
        echo "  2. Obtén tu Account ID del dashboard"
        echo "  3. Obtén tu API Token de: https://dash.cloudflare.com/profile/api-tokens"
        echo "  4. Ejecuta: bash configure-secrets.sh '<TOKEN>' '<ACCOUNT_ID>'"
        exit 1
    fi
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# Intentar obtener el Account ID
echo "🔄 Intentando obtener tu Account ID..."
echo ""

# Una forma de obtener el Account ID es usando wrangler publish --dry-run
# o verificando los datos de la API
ACCOUNT_ID=$(wrangler publish --dry-run 2>&1 | grep -i "account" | head -1 | grep -oE '[a-z0-9]{32}' || echo "")

if [ -z "$ACCOUNT_ID" ]; then
    echo "⚠️  No se pudo extraer el Account ID automáticamente"
    echo ""
    echo "Obtén manualmente tu Account ID de:"
    echo "  https://dash.cloudflare.com/profile/overview"
    echo ""
    read -p "Ingresa tu ACCOUNT_ID: " ACCOUNT_ID
fi

if [ -z "$ACCOUNT_ID" ]; then
    echo "❌ Account ID vacío, abortando..."
    exit 1
fi

echo "✅ Account ID detectado: $ACCOUNT_ID"
echo ""

# Ahora obtener el API Token usando curl
echo "📝 Para completar la configuración, necesitamos tu API Token"
echo ""
echo "   Ve a: https://dash.cloudflare.com/profile/api-tokens"
echo "   Crea o copia un token existente con permisos:"
echo "     • Cloudflare Pages - Edit"
echo "     • Workers Scripts - Edit"
echo "     • D1 Database - Edit"
echo ""
read -p "Ingresa tu CLOUDFLARE_API_TOKEN: " -s API_TOKEN
echo ""
echo ""

if [ -z "$API_TOKEN" ]; then
    echo "❌ API Token vacío"
    exit 1
fi

echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Resumo de configuración:"
echo "  • Account ID: $ACCOUNT_ID"
echo "  • API Token: ${API_TOKEN:0:10}...${API_TOKEN: -10}"
echo ""
read -p "¿Agregar estos secrets a GitHub? (s/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Ss]$ ]]; then
    bash "$(dirname "$0")/configure-secrets.sh" "$API_TOKEN" "$ACCOUNT_ID"
else
    echo "Configuración cancelada"
fi
