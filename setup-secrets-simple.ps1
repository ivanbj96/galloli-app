# Script simple para mostrar cómo configurar GitHub Secrets
# Los secrets deben configurarse manualmente en GitHub

Write-Host "🔧 Configuración de GitHub Secrets para GallOli" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Gray

Write-Host "`n📋 INSTRUCCIONES:" -ForegroundColor Yellow
Write-Host "1. Ve a: https://github.com/ivanbj96/galloli-app/settings/secrets/actions" -ForegroundColor White
Write-Host "2. Haz clic en 'New repository secret'" -ForegroundColor White
Write-Host "3. Configura los siguientes secrets:" -ForegroundColor White

Write-Host "`n🔐 SECRETS REQUERIDOS:" -ForegroundColor Green

Write-Host "`nNombre: CLOUDFLARE_API_TOKEN" -ForegroundColor Cyan
Write-Host "Valor: spEDQO6Q5h3gB_3tS-9s5-2SKIrUgYc2GSsDG91N2z0.AOOnF3HJD0dyoqO6SLcsnzqRYhz70rrDWXjp21Ued-w" -ForegroundColor White

Write-Host "`nNombre: CLOUDFLARE_ACCOUNT_ID" -ForegroundColor Cyan
Write-Host "Valor: ad83f16cea132210cff0f92fe179e628" -ForegroundColor White

Write-Host "`n✅ VERIFICACIÓN:" -ForegroundColor Yellow
Write-Host "Una vez configurados los secrets, GitHub Actions podrá:" -ForegroundColor White
Write-Host "• 🚀 Deploy automático a Cloudflare Pages en cada push" -ForegroundColor Green
Write-Host "• ⚙️ Deploy automático de Workers" -ForegroundColor Green
Write-Host "• 📱 Generar APKs automáticamente con tags" -ForegroundColor Green
Write-Host "• 🔍 Ejecutar CI/CD completo" -ForegroundColor Green

Write-Host "`n🧪 PRUEBAS:" -ForegroundColor Yellow
Write-Host "1. Haz un cambio y push para probar deploy automático" -ForegroundColor White
Write-Host "2. Crea un tag para probar generación de APK:" -ForegroundColor White
Write-Host "   git tag v1.0.0" -ForegroundColor Gray
Write-Host "   git push origin v1.0.0" -ForegroundColor Gray

Write-Host "`n🌐 URLs IMPORTANTES:" -ForegroundColor Cyan
Write-Host "• Repositorio: https://github.com/ivanbj96/galloli-app" -ForegroundColor White
Write-Host "• Actions: https://github.com/ivanbj96/galloli-app/actions" -ForegroundColor White
Write-Host "• Secrets: https://github.com/ivanbj96/galloli-app/settings/secrets/actions" -ForegroundColor White
Write-Host "• App Web: https://galloli.pages.dev" -ForegroundColor White

Write-Host "`n" -ForegroundColor White
Read-Host "Presiona Enter para abrir GitHub en el navegador"

# Abrir GitHub en el navegador
Start-Process "https://github.com/ivanbj96/galloli-app/settings/secrets/actions"