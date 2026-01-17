// creditos.js - Módulo de Créditos y Control de Deudas
const CreditosModule = {
    async init() {
        this.updateCreditBadges();
    },

    updateCreditBadges() {
        const pendingCredits = SalesModule.getCreditSales().length;
        
        const sidebarBadge = document.getElementById('pending-credits-badge');
        if (sidebarBadge) {
            sidebarBadge.textContent = pendingCredits;
            sidebarBadge.style.display = pendingCredits > 0 ? 'inline-block' : 'none';
        }
    }
};
