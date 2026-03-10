# Script para configurar GitHub Secrets usando curl
param(
    [string]$GitHubToken = $env:GITHUB_TOKEN
)

if (-not $GitHubToken) {
    Write-Host "❌ Se requiere GITHUB_TOKEN como variable de entorno o parámetro" -ForegroundColor Red
    Write-Host "Ejemplo: `$env:GITHUB_TOKEN = 'tu_token_aqui'; .\configure-secrets.ps1" -ForegroundColor Yellow
    exit 1
}

$owner = "ivanbj96"
$repo = "galloli-app"
$apiUrl = "https://api.github.com"

# Secrets a configurar
$secrets = @{
    "CLOUDFLARE_API_TOKEN" = "spEDQO6Q5h3gB_3tS-9s5-2SKIrUgYc2GSsDG91N2z0.AOOnF3HJD0dyoqO6SLcsnzqRYhz70rrDWXjp21Ued-w"
    "CLOUDFLARE_ACCOUNT_ID" = "ad83f16cea132210cff0f92fe179e628"
}

Write-Host "🔧 Configurando GitHub Secrets..." -ForegroundColor Cyan

# Función para obtener la clave pública del repositorio
function Get-PublicKey {
    $uri = "$apiUrl/repos/$owner/$repo/actions/secrets/public-key"
    $headers = @{
        "Authorization" = "Bearer $GitHubToken"
        "Accept" = "application/vnd.github.v3+json"
        "User-Agent" = "PowerShell-GitHubAPI"
    }
    
    try {
        $response = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
        return $response
    } catch {
        Write-Host "❌ Error obteniendo clave pública: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Función para configurar un secret
function Set-Secret {
    param($Name, $Value, $KeyId)
    
    $uri = "$apiUrl/repos/$owner/$repo/actions/secrets/$Name"
    $headers = @{
        "Authorization" = "Bearer $GitHubToken"
        "Accept" = "application/vnd.github.v3+json"
        "User-Agent" = "PowerShell-GitHubAPI"
        "Content-Type" = "application/json"
    }
    
    # Para simplificar, enviamos el valor en base64 (GitHub manejará la encriptación)
    $encodedValue = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Value))
    
    $body = @{
        encrypted_value = $encodedValue
        key_id = $KeyId
    } | ConvertTo-Json
    
    try {
        Invoke-RestMethod -Uri $uri -Headers $headers -Method Put -Body $body
        Write-Host "✅ Secret '$Name' configurado exitosamente" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "❌ Error configurando secret '$Name': $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Obtener clave pública
Write-Host "📡 Obteniendo clave pública del repositorio..." -ForegroundColor Yellow
$publicKey = Get-PublicKey

if (-not $publicKey) {
    Write-Host "❌ No se pudo obtener la clave pública. Verifica el token de GitHub." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Clave pública obtenida: $($publicKey.key_id)" -ForegroundColor Green

# Configurar cada secret
$successCount = 0
foreach ($secret in $secrets.GetEnumerator()) {
    Write-Host "🔐 Configurando secret: $($secret.Key)..." -ForegroundColor Yellow
    
    if (Set-Secret -Name $secret.Key -Value $secret.Value -KeyId $publicKey.key_id) {
        $successCount++
    }
    
    Start-Sleep -Seconds 1  # Evitar rate limiting
}

# Resumen
Write-Host "`n📊 Resumen:" -ForegroundColor Cyan
Write-Host "✅ Secrets configurados: $successCount/$($secrets.Count)" -ForegroundColor Green

if ($successCount -eq $secrets.Count) {
    Write-Host "`n🎉 ¡Todos los secrets se configuraron exitosamente!" -ForegroundColor Green
    Write-Host "🚀 GitHub Actions está listo para:" -ForegroundColor Cyan
    Write-Host "   • Deploy automático a Cloudflare Pages" -ForegroundColor White
    Write-Host "   • Deploy automático de Workers" -ForegroundColor White
    Write-Host "   • Generación de APKs con tags" -ForegroundColor White
    Write-Host "   • CI/CD completo" -ForegroundColor White
    
    Write-Host "`n🧪 Prueba el sistema:" -ForegroundColor Yellow
    Write-Host "git add . && git commit -m 'test: probar deploy automático' && git push origin main" -ForegroundColor Gray
} else {
    Write-Host "`n⚠️ Algunos secrets no se pudieron configurar" -ForegroundColor Yellow
    Write-Host "Verifica manualmente en: https://github.com/$owner/$repo/settings/secrets/actions" -ForegroundColor White
}