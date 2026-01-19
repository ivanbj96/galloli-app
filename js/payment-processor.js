// Procesador de Pagos desde Notificaciones
const PaymentProcessor = {
    // Procesar pagos desde notificaciones
    async processPaymentFromNotification(paymentData) {
        console.log('========================================');
        console.log('💰 PROCESANDO PAGO DESDE NOTIFICACIÓN');
        console.log('Datos:', paymentData);
        console.log('========================================');
        
        try {
            const { action, clientId, amount, salesIds } = paymentData;
            
            if (!clientId || !amount || !salesIds) {
                throw new Error('Datos de pago incompletos');
            }
            
            // Obtener las ventas
            const sales = salesIds.map(id => SalesModule.getSaleById(id)).filter(s => s);
            
            if (sales.length === 0) {
                throw new Error('No se encontraron ventas');
            }
            
            if (action === 'pay-full') {
                // Pagar todas las ventas completamente
                for (const sale of sales) {
                    const remainingDebt = sale.remainingDebt;
                    if (remainingDebt > 0) {
                        await SalesModule.registerPayment(sale.id, remainingDebt);
                    }
                }
                
                const client = ClientsModule.getClientById(clientId);
                Utils.showNotification(
                    `✅ Pago completo registrado para ${client.name}`,
                    'success',
                    5000
                );
                
            } else if (action === 'pay-partial') {
                // Distribuir el abono entre las ventas
                let remainingAmount = amount;
                
                for (const sale of sales) {
                    if (remainingAmount <= 0) break;
                    
                    const saleDebt = sale.remainingDebt;
                    const paymentForThisSale = Math.min(remainingAmount, saleDebt);
                    
                    if (paymentForThisSale > 0) {
                        await SalesModule.registerPayment(sale.id, paymentForThisSale);
                        remainingAmount -= paymentForThisSale;
                    }
                }
                
                const client = ClientsModule.getClientById(clientId);
                Utils.showNotification(
                    `✅ Abono de ${Utils.formatCurrency(amount)} registrado para ${client.name}`,
                    'success',
                    5000
                );
            }
            
            // IMPORTANTE: Recargar todos los datos para reflejar los cambios
            console.log('🔄 Recargando datos después del pago...');
            await SalesModule.init();
            await ClientsModule.init();
            await CreditosModule.init();
            
            // Recargar la página actual si App está disponible
            if (typeof App !== 'undefined' && App.loadPage) {
                App.loadPage(App.currentPage);
                console.log('✅ Interfaz actualizada');
            }
            
        } catch (error) {
            console.error('❌ Error procesando pago:', error);
            Utils.showNotification(
                `❌ Error: ${error.message}`,
                'error',
                5000
            );
        }
    }
};
