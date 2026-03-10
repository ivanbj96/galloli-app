# Script completo para configurar GitHub Actions
Write-Host "🚀 CONFIGURACIÓN COMPLETA DE GITHUB ACTIONS" -ForegroundColor Green
Write-Host "=" * 50 -ForegroundColor Gray

Write-Host "`n📋 PASO 1: Crear Personal Access Token" -ForegroundColor Cyan
Write-Host "1. Ve a: https://github.com/settings/tokens" -ForegroundColor White
Write-Host "2. Haz clic en 'Generate new token (classic)'" -ForegroundColor White
Write-Host "3. Configura estos permisos:" -ForegroundColor White
Write-Host "   ✅ repo (Full control of private repositories)" -ForegroundColor Green
Write-Host "   ✅ workflow (Update GitHub Action workflows)" -ForegroundColor Green
Write-Host "   ✅ admin:repo_hook (Full control of repository hooks)" -ForegroundColor Green
Write-Host "4. Copia el token generado" -ForegroundColor White

Write-Host "`n🔐 PASO 2: Configurar Token Localmente" -ForegroundColor Cyan
Write-Host "Ejecuta este comando con tu token:" -ForegroundColor White
Write-Host "`$env:GITHUB_TOKEN = 'tu_token_aqui'" -ForegroundColor Gray

Write-Host "`n⚙️ PASO 3: Configurar Secrets Automáticamente" -ForegroundColor Cyan
Write-Host "Una vez configurado el token, ejecuta:" -ForegroundColor White
Write-Host ".\configure-secrets.ps1" -ForegroundColor Gray

Write-Host "`n🎯 ALTERNATIVA MANUAL:" -ForegroundColor Yellow
Write-Host "Si prefieres configurar manualmente:" -ForegroundColor White
Write-Host "1. Ve a: https://github.com/ivanbj96/galloli-app/settings/secrets/actions" -ForegroundColor White
Write-Host "2. Agrega estos secrets:" -ForegroundColor White
Write-Host ""
Write-Host "   CLOUDFLARE_API_TOKEN:" -ForegroundColor Cyan
Write-Host "   spEDQO6Q5h3gB_3tS-9s5-2SKIrUgYc2GSsDG91N2z0.AOOnF3HJD0dyoqO6SLcsnzqRYhz70rrDWXjp21Ued-w" -ForegroundColor Gray
Write-Host ""
Write-Host "   CLOUDFLARE_ACCOUNT_ID:" -ForegroundColor Cyan
Write-Host "   ad83f16cea132210cff0f92fe179e628" -ForegroundColor Gray

Write-Host "`n🧪 PASO 4: Probar el Sistema" -ForegroundColor Cyan
Write-Host "Una vez configurados los secrets:" -ForegroundColor White
Write-Host "git add . && git commit -m 'test: deploy automático' && git push origin main" -ForegroundColor Gray

Write-Host "`n📱 PASO 5: Probar APK Build" -ForegroundColor Cyan
Write-Host "Para generar APK automáticamente:" -ForegroundColor White
Write-Host "git tag v1.0.0 && git push origin v1.0.0" -ForegroundColor Gray

Write-Host "`n🌐 URLs IMPORTANTES:" -ForegroundColor Green
Write-Host "• Repositorio: https://github.com/ivanbj96/galloli-app" -ForegroundColor White
Write-Host "• Actions: https://github.com/ivanbj96/galloli-app/actions" -ForegroundColor White
Write-Host "• Secrets: https://github.com/ivanbj96/galloli-app/settings/secrets/actions" -ForegroundColor White
Write-Host "• Tokens: https://github.com/settings/tokens" -ForegroundColor White

Write-Host "`n¿Quieres abrir GitHub para configurar el token? (Y/N): " -ForegroundColor Yellow -NoNewline
$response = Read-Host

if ($response -eq 'Y' -or $response -eq 'y') {
    Start-Process "https://github.com/settings/tokens"
    Write-Host "✅ Abriendo GitHub en el navegador..." -ForegroundColor Green
}

Write-Host "`n🎉 Una vez configurado, tu sistema funcionará como Lovable!" -ForegroundColor Green