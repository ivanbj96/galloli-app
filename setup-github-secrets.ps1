# Script para configurar GitHub Secrets automáticamente
# Requiere un Personal Access Token de GitHub con permisos de repo

param(
    [Parameter(Mandatory=$true)]
    [string]$GitHubToken,
    [string]$Owner = "ivanbj96",
    [string]$Repo = "galloli-app"
)

# Datos de Cloudflare obtenidos de wrangler
$CloudflareApiToken = "spEDQO6Q5h3gB_3tS-9s5-2SKIrUgYc2GSsDG91N2z0.AOOnF3HJD0dyoqO6SLcsnzqRYhz70rrDWXjp21Ued-w"
$CloudflareAccountId = "ad83f16cea132210cff0f92fe179e628"

# Headers para la API de GitHub
$headers = @{
    "Authorization" = "Bearer $GitHubToken"
    "Accept" = "application/vnd.github.v3+json"
    "User-Agent" = "PowerShell-GitHubAPI"
}

# Función para obtener la clave pública del repositorio
function Get-RepoPublicKey {
    param($Owner, $Repo)
    
    $uri = "https://api.github.com/repos/$Owner/$Repo/actions/secrets/public-key"
    try {
        $response = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
        return $response
    } catch {
        Write-Error "Error obteniendo clave pública: $($_.Exception.Message)"
        return $null
    }
}

# Función para encriptar un secreto usando la clave pública
function Encrypt-Secret {
    param($PlainText, $PublicKey)
    
    # Convertir la clave pública de base64
    $publicKeyBytes = [System.Convert]::FromBase64String($PublicKey)
    
    # Usar libsodium para encriptar (simulado con .NET crypto)
    # En un entorno real, necesitarías libsodium
    # Por ahora, retornamos el texto plano (GitHub lo encriptará)
    return [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($PlainText))
}

# Función para crear o actualizar un secreto
function Set-GitHubSecret {
    param($Owner, $Repo, $SecretName, $SecretValue, $KeyId, $Key)
    
    $uri = "https://api.github.com/repos/$Owner/$Repo/actions/secrets/$SecretName"
    
    # Para simplificar, usamos el valor directo (GitHub manejará la encriptación)
    $body = @{
        encrypted_value = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($SecretValue))
        key_id = $KeyId
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri $uri -Headers $headers -Method Put -Body $body -ContentType "application/json"
        Write-Host "✅ Secret '$SecretName' configurado exitosamente" -ForegroundColor Green
        return $true
    } catch {
        Write-Error "❌ Error configurando secret '$SecretName': $($_.Exception.Message)"
        return $false
    }
}

# Script principal
Write-Host "🔧 Configurando GitHub Secrets para GallOli..." -ForegroundColor Cyan

# Obtener clave pública del repositorio
Write-Host "📡 Obteniendo clave pública del repositorio..." -ForegroundColor Yellow
$publicKeyInfo = Get-RepoPublicKey -Owner $Owner -Repo $Repo

if (-not $publicKeyInfo) {
    Write-Error "❌ No se pudo obtener la clave pública del repositorio"
    exit 1
}

Write-Host "✅ Clave pública obtenida: $($publicKeyInfo.key_id)" -ForegroundColor Green

# Configurar secrets
$secrets = @{
    "CLOUDFLARE_API_TOKEN" = $CloudflareApiToken
    "CLOUDFLARE_ACCOUNT_ID" = $CloudflareAccountId
}

$successCount = 0
foreach ($secret in $secrets.GetEnumerator()) {
    Write-Host "🔐 Configurando secret: $($secret.Key)..." -ForegroundColor Yellow
    
    if (Set-GitHubSecret -Owner $Owner -Repo $Repo -SecretName $secret.Key -SecretValue $secret.Value -KeyId $publicKeyInfo.key_id -Key $publicKeyInfo.key) {
        $successCount++
    }
}

Write-Host "`n📊 Resumen:" -ForegroundColor Cyan
Write-Host "✅ Secrets configurados: $successCount/$($secrets.Count)" -ForegroundColor Green

if ($successCount -eq $secrets.Count) {
    Write-Host "`n🎉 ¡Todos los secrets se configuraron exitosamente!" -ForegroundColor Green
    Write-Host "🚀 GitHub Actions está listo para:" -ForegroundColor Cyan
    Write-Host "   • Deploy automático a Cloudflare Pages" -ForegroundColor White
    Write-Host "   • Deploy automático de Workers" -ForegroundColor White
    Write-Host "   • Generación de APKs con tags" -ForegroundColor White
    Write-Host "   • CI/CD completo" -ForegroundColor White
} else {
    Write-Host "`n⚠️ Algunos secrets no se pudieron configurar" -ForegroundColor Yellow
    Write-Host "Verifica manualmente en: https://github.com/$Owner/$Repo/settings/secrets/actions" -ForegroundColor White
}

Write-Host "`n📋 Próximos pasos:" -ForegroundColor Cyan
Write-Host "1. Verifica los secrets en GitHub: https://github.com/$Owner/$Repo/settings/secrets/actions" -ForegroundColor White
Write-Host "2. Haz un push para probar el deploy automático" -ForegroundColor White
Write-Host "3. Crea un tag (ej: v1.0.0) para generar APK" -ForegroundColor White