// Procesador de Pagos desde Notificaciones
const PaymentProcessor = {
    isProcessing: false, // Flag para evitar procesamiento duplicado
    
    // Procesar pagos desde notificaciones
    async processPaymentFromNotification(paymentData) {
        // Evitar procesamiento duplicado
        if (this.isProcessing) {
            console.log('⚠️ Ya se está procesando un pago, ignorando duplicado');
            return;
        }
        
        this.isProcessing = true;
        
        console.log('========================================');
        console.log('💰 PROCESANDO PAGO DESDE NOTIFICACIÓN');
        console.log('Datos:', paymentData);
        console.log('========================================');
        
        try {
            const { action, clientId, clientName, amount, salesIds } = paymentData;
            
            if (!clientId || !amount || !salesIds) {
                throw new Error('Datos de pago incompletos');
            }
            
            // Obtener las ventas ANTES de recargar
            const sales = salesIds.map(id => SalesModule.getSaleById(id)).filter(s => s);
            
            if (sales.length === 0) {
                throw new Error('No se encontraron ventas');
            }
            
            // Usar el nombre del cliente que viene en los datos
            const displayName = clientName || 'Cliente';
            
            if (action === 'pay-full') {
                // Pagar todas las ventas completamente (modo silencioso)
                for (const sale of sales) {
                    const remainingDebt = sale.remainingDebt;
                    if (remainingDebt > 0) {
                        await SalesModule.registerPayment(sale.id, remainingDebt, null, true);
                    }
                }
                
                // Enviar UNA SOLA notificación de confirmación
                Utils.showNotification(
                    `✅ Pago completo: ${displayName}`,
                    'success',
                    5000
                );
                
            } else if (action === 'pay-partial') {
                // Distribuir el abono entre las ventas (modo silencioso)
                let remainingAmount = amount;
                
                for (const sale of sales) {
                    if (remainingAmount <= 0) break;
                    
                    const saleDebt = sale.remainingDebt;
                    const paymentForThisSale = Math.min(remainingAmount, saleDebt);
                    
                    if (paymentForThisSale > 0) {
                        await SalesModule.registerPayment(sale.id, paymentForThisSale, null, true);
                        remainingAmount -= paymentForThisSale;
                    }
                }
                
                // Enviar UNA SOLA notificación de confirmación
                Utils.showNotification(
                    `✅ Abono registrado: ${displayName} - ${Utils.formatCurrency(amount)}`,
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
        } finally {
            // Liberar el flag después de un pequeño delay
            setTimeout(() => {
                this.isProcessing = false;
            }, 1000);
        }
    }
};
