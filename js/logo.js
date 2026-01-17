// logo.js - Logo personalizado SVG
const CUSTOM_LOGO = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj4KICA8Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iIzRDQUY1MCIvPgogIDx0ZXh0IHg9IjUwIiB5PSI2NSIgZm9udC1zaXplPSI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPvCfkpQ8L3RleHQ+Cjwvc3ZnPg==';

// Función para obtener el logo actual
function getAppLogo() {
    if (typeof ConfigModule !== 'undefined' && ConfigModule.currentConfig) {
        if (ConfigModule.currentConfig.logoType === 'image' && ConfigModule.currentConfig.logoImage) {
            return ConfigModule.currentConfig.logoImage;
        }
        if (ConfigModule.currentConfig.logoType === 'custom') {
            return CUSTOM_LOGO;
        }
    }
    return CUSTOM_LOGO;
}

// Función para insertar logo en elemento
function insertLogo(elementId, size = 40) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const logo = getAppLogo();
    element.innerHTML = `<img src="${logo}" alt="Logo" style="width: ${size}px; height: ${size}px; object-fit: contain;">`;
}

// Función para obtener logo como imagen para PDF
function getLogoForPDF() {
    return getAppLogo();
}
