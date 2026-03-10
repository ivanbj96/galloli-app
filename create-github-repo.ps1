# Script para crear repositorio en GitHub
# Ejecuta este script después de obtener tu token

$token = Read-Host "Ingresa tu GitHub token"
$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}

$body = @{
    "name" = "galloli-app"
    "description" = "Sistema completo de gestión para venta de pollos frescos"
    "private" = $false
    "auto_init" = $false
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method POST -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "✅ Repositorio creado exitosamente: $($response.html_url)"
    
    # Configurar remote y hacer push
    git remote add origin $response.clone_url
    git push -u origin main
    
    Write-Host "✅ Código subido a GitHub"
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)"
}