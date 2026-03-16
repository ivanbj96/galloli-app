// Módulo de Clientes
const ClientsModule = {
    clients: [],

    async init() {
        await this.loadClients();
    },

    addClient(name, phone, address, locationData, coordinates = null) {
        const client = {
            id: Date.now(),
            name,
            phone,
            address,
            location: locationData.address || locationData,
            coordinates: coordinates || {
                lat: locationData.latitude,
                lng: locationData.longitude
            },
            timestamp: new Date().toISOString(),
            lastModified: Date.now(),
            date: Utils.formatDate(),
            isActive: true, // NUEVO: Estado activo por defecto
            totalSales: 0,
            totalAmount: 0,
            totalWeight: 0,
            totalQuantity: 0,
            totalOrders: 0
        };

        this.clients.push(client);
        this.saveClients();
        
        // Notificar creación de cliente (sin bloquear si falla)
        if (typeof NotificationsModule !== 'undefined') {
            try {
                NotificationsModule.notifyClientCreated(client.name).catch(err => {
                    console.warn('No se pudo enviar notificación:', err);
                });
            } catch (err) {
                console.warn('Error al notificar:', err);
            }
        }
        
        return client;
    },

    getClientById(id) {
        return this.clients.find(client => client.id === id);
    },
    
    /**
     * Busca clientes duplicados basándose en nombre, teléfono o dirección
     * @param {string} name - Nombre del cliente
     * @param {string} phone - Teléfono del cliente
     * @param {string} address - Dirección del cliente
     * @returns {object|null} - Cliente duplicado o null si no existe
     */
    findDuplicate(name, phone, address) {
        const nameLower = name.toLowerCase().trim();
        const phoneCleaned = phone.replace(/\D/g, ''); // Eliminar caracteres no numéricos
        const addressLower = address.toLowerCase().trim();
        
        return this.clients.find(client => {
            if (client.isActive === false) return false; // Ignorar clientes archivados
            
            const clientNameLower = client.name.toLowerCase().trim();
            const clientPhoneCleaned = client.phone.replace(/\D/g, '');
            const clientAddressLower = client.address.toLowerCase().trim();
            
            // Coincidencia exacta de nombre
            const nameMatch = clientNameLower === nameLower;
            
            // Coincidencia exacta de teléfono (sin formato)
            const phoneMatch = phoneCleaned && clientPhoneCleaned === phoneCleaned;
            
            // Coincidencia de dirección (similar)
            const addressMatch = clientAddressLower === addressLower;
            
            // Es duplicado si coincide nombre Y teléfono, o nombre Y dirección, o teléfono Y dirección
            return (nameMatch && phoneMatch) || (nameMatch && addressMatch) || (phoneMatch && addressMatch);
        });
    },

    updateClientList() {
    const clientList = document.getElementById('client-list');
    if (!clientList) return;

    clientList.innerHTML = '';

    // Filtrar solo clientes activos por defecto
    const activeClients = this.clients.filter(c => c.isActive !== false);

    if (activeClients.length === 0) {
        clientList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users empty-state-icon"></i>
                <p>No hay clientes activos</p>
                <button class="btn btn-outline" onclick="ClientsModule.toggleShowInactive()" style="margin-top: 10px;">
                    <i class="fas fa-archive"></i> Ver Archivados
                </button>
            </div>
        `;
        return;
    }

    activeClients.forEach(client => {
        const li = document.createElement('li');
        li.className = 'client-item';
        
        // Crear enlace de teléfono
        const phoneLink = client.phone ? 
            `<a href="tel:${client.phone}" class="client-phone">
                <i class="fas fa-phone"></i> ${client.phone}
            </a>` : 
            `<span class="client-phone"><i class="fas fa-phone"></i> ${client.phone}</span>`;
        
        // Crear enlace de ubicación si tiene coordenadas
        let locationLink = '';
        if (client.coordinates && client.coordinates.lat && client.coordinates.lng) {
            const mapsUrl = `https://www.google.com/maps?q=${client.coordinates.lat},${client.coordinates.lng}`;
            locationLink = `
                <p class="client-address">
                    <a href="${mapsUrl}" target="_blank" class="client-location-link">
                        <i class="fas fa-map-marker-alt"></i> ${client.address}
                    </a>
                </p>
            `;
        } else {
            locationLink = `<p class="client-address"><i class="fas fa-map-marker-alt"></i> ${client.address}</p>`;
        }
        
        li.innerHTML = `
            <div class="client-info">
                <h3 class="client-name"><i class="fas fa-user"></i> ${client.name}</h3>
                <p>${phoneLink}</p>
                ${locationLink}
                ${client.coordinates ? 
                    `<p class="client-location"><i class="fas fa-map-pin"></i> ${client.location || 'Ubicación seleccionada'}</p>` : ''}
                ${client.coordinates ? 
                    `<p class="client-location"><i class="fas fa-clock"></i> ${new Date(client.timestamp).toLocaleTimeString('es-ES')}</p>` : ''}
                <p class="client-location"><i class="fas fa-shopping-cart"></i> ${client.totalSales} ventas | ${client.totalOrders} pedidos</p>
            </div>
            <div class="client-actions">
                <button class="btn btn-outline" onclick="ClientsModule.editClient(${client.id})" title="Editar cliente">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-warning" onclick="ClientsModule.archiveClient(${client.id})" title="Archivar cliente">
                    <i class="fas fa-archive"></i>
                </button>
            </div>
        `;
        clientList.appendChild(li);
    });
    
    // Actualizar contador de clientes
    if (typeof App !== 'undefined' && App.updateClientCount) {
        App.updateClientCount();
    }
},

    updateClientSelect() {
        const select = document.getElementById('sale-client');
        const orderClientSelect = document.getElementById('order-client');
        
        // Solo mostrar clientes activos en los selects
        const activeClients = this.clients.filter(c => c.isActive !== false);
        
        if (select) {
            select.innerHTML = '<option value="">Seleccionar cliente</option>';
            activeClients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = `${client.name} - ${client.phone}`;
                select.appendChild(option);
            });
        }
        
        if (orderClientSelect) {
            orderClientSelect.innerHTML = '<option value="">Seleccionar cliente</option>';
            activeClients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = `${client.name} - ${client.phone}`;
                orderClientSelect.appendChild(option);
            });
        }
    },

    // Archivar cliente (en lugar de eliminar)
    archiveClient(id) {
        const client = this.getClientById(id);
        if (!client) {
            Utils.showNotification('Cliente no encontrado', 'error', 3000);
            return false;
        }

        const associatedData = this.hasAssociatedData(id);
        const hasData = associatedData.hasSales || associatedData.hasOrders || associatedData.hasCredits;
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header" style="background: var(--warning); color: white;">
                    <h3><i class="fas fa-archive"></i> Archivar Cliente</h3>
                    <button class="close-modal" onclick="this.closest('.modal').remove()" style="color: white;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <i class="fas fa-archive" style="font-size: 3rem; color: var(--warning); margin-bottom: 15px;"></i>
                        <h3 style="margin-bottom: 10px;">¿Archivar "${client.name}"?</h3>
                        <p style="color: var(--gray); margin-bottom: 20px;">El cliente se ocultará pero mantendrá su historial</p>
                    </div>
                    
                    <div style="background: var(--light); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <p style="margin: 5px 0;"><strong><i class="fas fa-user"></i> Cliente:</strong> ${client.name}</p>
                        <p style="margin: 5px 0;"><strong><i class="fas fa-phone"></i> Teléfono:</strong> ${client.phone}</p>
                        ${hasData ? `
                            <p style="margin: 5px 0;"><strong><i class="fas fa-receipt"></i> Ventas:</strong> ${associatedData.totalSales} registros</p>
                            <p style="margin: 5px 0;"><strong><i class="fas fa-clipboard-list"></i> Pedidos:</strong> ${associatedData.totalOrders} registros</p>
                            <p style="margin: 5px 0;"><strong><i class="fas fa-credit-card"></i> Créditos:</strong> ${associatedData.totalCredits} pendientes</p>
                        ` : '<p style="color: var(--gray);">Sin historial de datos</p>'}
                    </div>
                    
                    <div style="background: #FFF3CD; padding: 12px; border-radius: 8px; border-left: 4px solid var(--warning); margin-bottom: 20px;">
                        <p style="margin: 0; color: #856404; font-size: 0.9rem;">
                            <i class="fas fa-info-circle"></i> <strong>Al archivar:</strong>
                        </p>
                        <ul style="margin: 10px 0 0 20px; color: #856404; font-size: 0.85rem;">
                            <li>No aparecerá en la lista de clientes activos</li>
                            <li>No estará disponible para nuevas ventas/pedidos</li>
                            <li>Su historial se mantendrá intacto</li>
                            <li>Podrás reactivarlo cuando quieras</li>
                        </ul>
                    </div>
                    
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-outline" onclick="this.closest('.modal').remove()" style="flex: 1;">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                        <button class="btn btn-warning" id="archive-btn" style="flex: 1;">
                            <i class="fas fa-archive"></i> Archivar Cliente
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const archiveBtn = modal.querySelector('#archive-btn');
        archiveBtn.addEventListener('click', () => {
            client.isActive = false;
            client.archivedDate = Utils.formatDateTime();
            this.saveClients();
            this.updateClientList();
            this.updateClientSelect();
            modal.remove();
            Utils.showNotification('📦 Cliente archivado correctamente', 'success', 3000);
        });
        
        return true;
    },

    // Reactivar cliente archivado
    reactivateClient(id) {
        const client = this.getClientById(id);
        if (client) {
            client.isActive = true;
            delete client.archivedDate;
            this.saveClients();
            this.updateClientList();
            this.updateClientSelect();
            Utils.showNotification('✅ Cliente reactivado correctamente', 'success', 3000);
        }
    },

    // Alternar vista de clientes archivados
    toggleShowInactive() {
        const clientList = document.getElementById('client-list');
        if (!clientList) return;

        const inactiveClients = this.clients.filter(c => c.isActive === false);
        
        if (inactiveClients.length === 0) {
            Utils.showNotification('No hay clientes archivados', 'info', 3000);
            return;
        }

        clientList.innerHTML = `
            <div style="background: var(--warning); color: white; padding: 10px; border-radius: 8px; margin-bottom: 15px; text-align: center;">
                <h3><i class="fas fa-archive"></i> Clientes Archivados (${inactiveClients.length})</h3>
                <button class="btn btn-outline" onclick="ClientsModule.updateClientList()" style="margin-top: 10px; color: white; border-color: white;">
                    <i class="fas fa-arrow-left"></i> Volver a Activos
                </button>
            </div>
        `;

        inactiveClients.forEach(client => {
            const li = document.createElement('li');
            li.className = 'client-item';
            li.style.opacity = '0.7';
            li.style.border = '2px dashed var(--warning)';
            
            li.innerHTML = `
                <div class="client-info">
                    <h3><i class="fas fa-archive"></i> ${client.name} <span style="color: var(--warning); font-size: 0.8rem;">(Archivado)</span></h3>
                    <p><i class="fas fa-phone"></i> ${client.phone}</p>
                    <p class="client-location"><i class="fas fa-map-marker-alt"></i> ${client.address}</p>
                    <p class="client-location"><i class="fas fa-calendar"></i> Archivado: ${client.archivedDate || 'Fecha no disponible'}</p>
                    <p class="client-location"><i class="fas fa-shopping-cart"></i> ${client.totalSales} ventas | ${client.totalOrders} pedidos</p>
                </div>
                <div class="client-actions">
                    <button class="btn btn-success" onclick="ClientsModule.reactivateClient(${client.id})" title="Reactivar cliente">
                        <i class="fas fa-undo"></i> Reactivar
                    </button>
                </div>
            `;
            clientList.appendChild(li);
        });
    },

    updateClientStats(clientId, weight, quantity, amount) {
        const client = this.clients.find(c => c.id === clientId);
        if (client) {
            client.totalSales += 1;
            client.totalAmount += amount;
            client.totalWeight += weight;
            client.totalQuantity += quantity;
            this.saveClients();
        }
    },

    updateClientOrderStats(clientId) {
        const client = this.clients.find(c => c.id === clientId);
        if (client) {
            client.totalOrders += 1;
            this.saveClients();
        }
    },

    // Verificar si un cliente tiene datos asociados
    hasAssociatedData(clientId) {
        const sales = SalesModule.sales.filter(s => s.clientId === clientId);
        const orders = OrdersModule.orders.filter(o => o.clientId === clientId);
        const credits = SalesModule.getCreditsByClient(clientId);
        
        return {
            hasSales: sales.length > 0,
            hasOrders: orders.length > 0,
            hasCredits: credits.length > 0,
            totalSales: sales.length,
            totalOrders: orders.length,
            totalCredits: credits.length,
            totalDebt: SalesModule.getClientTotalDebt(clientId)
        };
    },

    // Editar cliente existente - NUEVA IMPLEMENTACIÓN LIMPIA
    editClient(clientId) {
        const client = this.getClientById(clientId);
        if (!client) {
            Utils.showNotification('Cliente no encontrado', 'error', 3000);
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.zIndex = '10000';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-edit"></i> Editar Cliente</h3>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="edit-client-form">
                        <div class="form-group">
                            <label class="form-label">Nombre del Cliente</label>
                            <input type="text" class="form-input" id="edit-client-name" 
                                   value="${client.name || ''}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Teléfono</label>
                            <input type="tel" class="form-input" id="edit-client-phone" 
                                   value="${client.phone || ''}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Dirección</label>
                            <input type="text" class="form-input" id="edit-client-address" 
                                   value="${client.address || ''}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Ubicación (Descripción)</label>
                            <input type="text" class="form-input" id="edit-client-location" 
                                   value="${client.location || ''}" placeholder="Descripción de la ubicación">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Coordenadas</label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <input type="number" step="any" class="form-input" id="edit-client-lat" 
                                       placeholder="Latitud" value="${client.coordinates?.lat || ''}">
                                <input type="number" step="any" class="form-input" id="edit-client-lng" 
                                       placeholder="Longitud" value="${client.coordinates?.lng || ''}">
                            </div>
                            <button type="button" class="btn btn-outline" onclick="ClientsModule.openMapForEdit(${clientId})" 
                                    style="width: 100%; margin-top: 10px;">
                                <i class="fas fa-map-marker-alt"></i> Seleccionar en Mapa
                            </button>
                        </div>
                        <button type="submit" class="btn btn-success" style="width: 100%;">
                            <i class="fas fa-save"></i> Guardar Cambios
                        </button>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const form = modal.querySelector('#edit-client-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveClientChanges(clientId, modal);
        });
    },

    // Guardar cambios del cliente - NUEVA IMPLEMENTACIÓN
    saveClientChanges(clientId, modal) {
        const client = this.getClientById(clientId);
        if (!client) return;

        const name = document.getElementById('edit-client-name').value.trim();
        const phone = document.getElementById('edit-client-phone').value.trim();
        const address = document.getElementById('edit-client-address').value.trim();
        const location = document.getElementById('edit-client-location').value.trim();
        const lat = document.getElementById('edit-client-lat').value;
        const lng = document.getElementById('edit-client-lng').value;

        if (!name || !phone || !address) {
            Utils.showNotification('Complete los campos obligatorios', 'error', 3000);
            return;
        }

        // Actualizar datos básicos
        client.name = name;
        client.phone = phone;
        client.address = address;
        client.location = location;
        client.lastModified = Date.now();

        // Actualizar coordenadas si están presentes
        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
            client.coordinates = {
                lat: parseFloat(lat),
                lng: parseFloat(lng)
            };
        }

        this.saveClients();
        this.updateClientList();
        this.updateClientSelect();
        
        modal.remove();
        Utils.showNotification('Cliente actualizado correctamente', 'success', 3000);
    },

    // Abrir mapa para editar ubicación - NUEVA IMPLEMENTACIÓN
    openMapForEdit(clientId) {
        const client = this.getClientById(clientId);
        if (!client) return;

        // Coordenadas por defecto o del cliente
        let lat = 14.6349;
        let lng = -90.5069;
        
        if (client.coordinates && client.coordinates.lat && client.coordinates.lng) {
            lat = client.coordinates.lat;
            lng = client.coordinates.lng;
        }

        // Crear modal del mapa
        const mapModal = document.createElement('div');
        mapModal.className = 'modal active';
        mapModal.style.zIndex = '10001';
        mapModal.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3><i class="fas fa-map-marker-alt"></i> Seleccionar Ubicación</h3>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div id="edit-location-map" style="height: 400px; width: 100%; margin-bottom: 15px;"></div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                        <div>
                            <label>Latitud:</label>
                            <input type="number" step="any" id="map-edit-lat" class="form-input" readonly>
                        </div>
                        <div>
                            <label>Longitud:</label>
                            <input type="number" step="any" id="map-edit-lng" class="form-input" readonly>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-outline" onclick="this.closest('.modal').remove()" style="flex: 1;">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                        <button class="btn btn-success" onclick="ClientsModule.saveMapLocation(${clientId})" style="flex: 1;">
                            <i class="fas fa-check"></i> Usar Esta Ubicación
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(mapModal);
        
        // Inicializar mapa después de un breve delay
        setTimeout(() => {
            if (typeof L !== 'undefined') {
                const map = L.map('edit-location-map').setView([lat, lng], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
                
                const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
                
                // Actualizar inputs cuando se mueve el marcador
                const updateInputs = (latlng) => {
                    document.getElementById('map-edit-lat').value = latlng.lat.toFixed(6);
                    document.getElementById('map-edit-lng').value = latlng.lng.toFixed(6);
                };
                
                updateInputs({ lat, lng });
                
                marker.on('dragend', (e) => {
                    const pos = e.target.getLatLng();
                    updateInputs(pos);
                });
                
                map.on('click', (e) => {
                    marker.setLatLng(e.latlng);
                    updateInputs(e.latlng);
                });
                
                // Guardar referencia del mapa
                this.editMap = map;
            }
        }, 200);
    },

    // Guardar ubicación del mapa - NUEVA IMPLEMENTACIÓN
    saveMapLocation(clientId) {
        const lat = document.getElementById('map-edit-lat').value;
        const lng = document.getElementById('map-edit-lng').value;
        
        if (!lat || !lng) {
            Utils.showNotification('Selecciona una ubicación en el mapa', 'error', 3000);
            return;
        }
        
        // Actualizar los campos en el formulario de edición
        const editLatInput = document.getElementById('edit-client-lat');
        const editLngInput = document.getElementById('edit-client-lng');
        
        if (editLatInput) editLatInput.value = lat;
        if (editLngInput) editLngInput.value = lng;
        
        // Cerrar modal del mapa
        const mapModal = document.querySelector('.modal[style*="10001"]');
        if (mapModal) mapModal.remove();
        
        Utils.showNotification('Ubicación seleccionada correctamente', 'success', 3000);
    },

    // Crear cliente rápido con ubicación automática - CON GEOCODIFICACIÓN
    async createQuickClient(name, phone, address = 'Sin dirección') {
        try {
            const position = await this.getCurrentPosition();
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // Intentar obtener dirección real de las coordenadas
            let realAddress = address;
            let locationDescription = 'Ubicación automática';
            
            try {
                const addressData = await this.getAddressFromCoordinates(lat, lng);
                if (addressData) {
                    realAddress = addressData.display_name || addressData.address || address;
                    locationDescription = addressData.display_name || 'Ubicación automática';
                }
            } catch (geoError) {
                console.log('No se pudo obtener dirección:', geoError);
                // Continuar con coordenadas sin dirección
            }
            
            const client = {
                id: Date.now(),
                name: name,
                phone: phone,
                address: realAddress,
                location: locationDescription,
                isActive: true, // NUEVO: Activo por defecto
                coordinates: {
                    lat: lat,
                    lng: lng
                },
                timestamp: new Date().toISOString(),
                date: Utils.formatDate(),
                totalSales: 0,
                totalAmount: 0,
                totalWeight: 0,
                totalQuantity: 0,
                totalOrders: 0
            };

            this.clients.push(client);
            this.saveClients();
            
            // Notificar creación de cliente (sin bloquear si falla)
            if (typeof NotificationsModule !== 'undefined') {
                try {
                    NotificationsModule.notifyClientCreated(client.name).catch(err => {
                        console.warn('No se pudo enviar notificación:', err);
                    });
                } catch (err) {
                    console.warn('Error al notificar:', err);
                }
            }
            
            Utils.showNotification('✅ Cliente creado con ubicación automática', 'success', 3000);
            return client;
        } catch (error) {
            const client = {
                id: Date.now(),
                name: name,
                phone: phone,
                address: address,
                location: 'Sin ubicación',
                isActive: true, // NUEVO: Activo por defecto
                coordinates: null,
                timestamp: new Date().toISOString(),
                date: Utils.formatDate(),
                totalSales: 0,
                totalAmount: 0,
                totalWeight: 0,
                totalQuantity: 0,
                totalOrders: 0
            };

            this.clients.push(client);
            this.saveClients();
            
            // Notificar creación de cliente (sin bloquear si falla)
            if (typeof NotificationsModule !== 'undefined') {
                try {
                    NotificationsModule.notifyClientCreated(client.name).catch(err => {
                        console.warn('No se pudo enviar notificación:', err);
                    });
                } catch (err) {
                    console.warn('Error al notificar:', err);
                }
            }
            
            Utils.showNotification('⚠️ Cliente creado sin ubicación (GPS no disponible)', 'warning', 3000);
            return client;
        }
    },

    // Obtener dirección desde coordenadas usando Nominatim (OpenStreetMap)
    async getAddressFromCoordinates(lat, lng) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
                {
                    headers: {
                        'User-Agent': 'GallOli-App/1.0'
                    }
                }
            );
            
            if (!response.ok) throw new Error('Error en geocodificación');
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.warn('Error obteniendo dirección:', error);
            return null;
        }
    },

    // Obtener posición actual
    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocalización no soportada'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000 // 5 minutos
                }
            );
        });
    },

    async saveClients() {
        if (DB.db) {
            for (const client of this.clients) {
                await DB.set('clients', client);
            }
        } else {
            localStorage.setItem('polloClients', JSON.stringify(this.clients));
        }
    },

    async loadClients() {
        if (DB.db) {
            this.clients = await DB.getAll('clients');
        } else {
            const saved = localStorage.getItem('polloClients');
            if (saved) this.clients = JSON.parse(saved);
        }
    }
};

// Módulo de Pedidos
const OrdersModule = {
    orders: [],

    async init() {
        await this.loadOrders();
    },

    addOrder(clientId, weight, quantity, price, deliveryDate = null, notes = '') {
        const todayMermaPrice = MermaModule.getTodayMermaPrice();
        const orderPrice = price || todayMermaPrice || price;
        
        const total = weight * orderPrice;
        const averageWeight = Utils.calculateAverageWeight(weight, quantity);
        
        const order = {
            id: Date.now(),
            clientId,
            weight: parseFloat(weight),
            quantity: parseInt(quantity),
            averageWeight: parseFloat(averageWeight.toFixed(2)),
            price: orderPrice,
            originalPrice: price,
            mermaPrice: todayMermaPrice,
            total,
            notes,
            status: 'pending', // pending, delivered, cancelled
            createdDate: Utils.formatDate(),
            createdTime: new Date().toLocaleTimeString('es-ES'),
            deliveryDate: deliveryDate ? Utils.formatDate(new Date(deliveryDate)) : null,
            deliveryTime: deliveryDate ? '12:00' : null,
            timestamp: new Date().getTime(),
            dayKey: Utils.getTodayDate()
        };

        this.orders.push(order);
        this.saveOrders();
        ClientsModule.updateClientOrderStats(clientId);
        
        // NUEVO: Notificar al módulo de rutas sobre nuevo pedido
        if (RutasModule.actualizarRutaAutomatica) {
            RutasModule.actualizarRutaAutomatica();
        }
        
        return order;
    },

    getOrdersByStatus(status = null) {
        if (!status) return this.orders;
        return this.orders.filter(order => order.status === status);
    },

    getPendingOrders() {
        return this.getOrdersByStatus('pending');
    },

    getTodayOrders() {
        return this.orders.filter(order => order.createdDate === Utils.getTodayDate());
    },

    updateOrderStatus(orderId, status) {
        const order = this.orders.find(o => o.id === orderId);
        if (order) {
            const estadoAnterior = order.status;
            order.status = status;
            if (status === 'delivered') {
                order.deliveredDate = Utils.formatDate();
                order.deliveredTime = new Date().toLocaleTimeString('es-ES');
            }
            this.saveOrders();
            
            // NUEVO: Notificar al módulo de rutas sobre el cambio de estado
            if (estadoAnterior !== status && RutasModule.actualizarRutaPorCambioPedido) {
                RutasModule.actualizarRutaPorCambioPedido(orderId, status);
            }
            
            return true;
        }
        return false;
    },

    deleteOrder(orderId) {
        this.orders = this.orders.filter(order => order.id !== orderId);
        this.saveOrders();
    },

    updateOrdersList(statusFilter = null) {
        const ordersList = document.getElementById('orders-list');
        if (!ordersList) return;

        ordersList.innerHTML = '';

        const filteredOrders = statusFilter ? 
            this.getOrdersByStatus(statusFilter) : 
            this.orders;

        const sortedOrders = filteredOrders.sort((a, b) => b.timestamp - a.timestamp);

        if (sortedOrders.length === 0) {
            ordersList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard-list empty-state-icon"></i>
                    <p>No hay pedidos ${statusFilter ? statusFilter : 'registrados'}</p>
                </div>
            `;
            return;
        }

        sortedOrders.forEach(order => {
            const client = ClientsModule.getClientById(order.clientId);
            const clientName = client ? client.name : 'Cliente no encontrado';
            
            const li = document.createElement('li');
            li.className = `order-item ${order.status}`;
            li.innerHTML = `
                <div class="order-info">
                    <h3>
                        ${clientName}
                        <span class="order-status ${order.status}">${this.getStatusText(order.status)}</span>
                    </h3>
                    <p class="order-details">
                        <i class="fas fa-weight"></i> ${order.weight.toFixed(2)} lb Á— 
                        <i class="fas fa-egg"></i> ${order.quantity} pollos
                    </p>
                    <p class="order-details">
                        <i class="fas fa-balance-scale"></i> ${order.averageWeight} lb/pollo Á— 
                        $${order.price.toFixed(2)}/lb
                    </p>
                    ${order.notes ? `<p class="order-details"><i class="fas fa-sticky-note"></i> ${order.notes}</p>` : ''}
                    ${order.deliveryDate ? 
                        `<p class="order-delivery"><i class="fas fa-calendar-alt"></i> Entrega: ${order.deliveryDate} ${order.deliveryTime || ''}</p>` : 
                        `<p class="order-details"><i class="fas fa-clock"></i> Creado: ${order.createdDate} ${order.createdTime}</p>`
                    }
                </div>
                <div class="order-actions">
                    ${order.status === 'pending' ? `
                        <button class="btn btn-success" onclick="OrdersModule.showDeliveryModal(${order.id})" style="padding: 5px 10px;">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-danger" onclick="OrdersModule.cancelOrder(${order.id})" style="padding: 5px 10px;">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : ''}
                    <button class="btn btn-outline" onclick="OrdersModule.showOrderDetails(${order.id})" style="padding: 5px 10px;">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            `;
            ordersList.appendChild(li);
        });
    },

    getStatusText(status) {
        const statusMap = {
            'pending': 'Pendiente',
            'delivered': 'Entregado',
            'cancelled': 'Cancelado'
        };
        return statusMap[status] || status;
    },

    showDeliveryModal(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;

        const client = ClientsModule.getClientById(order.clientId);
        if (!client) return;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-truck"></i> Confirmar Entrega</h3>
                    <button class="close-modal" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="delivery-form">
                        <div class="form-group">
                            <label class="form-label">Cliente</label>
                            <input type="text" class="form-input" value="${client.name}" readonly>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Peso del Pedido (lb)</label>
                            <input type="number" step="0.01" min="0.01" class="form-input" 
                                   id="delivery-weight" value="${order.weight}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Cantidad de Pollos</label>
                            <input type="number" min="1" class="form-input" 
                                   id="delivery-quantity" value="${order.quantity}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Precio por lb ($)</label>
                            <input type="number" step="0.01" min="0" class="form-input" 
                                   id="delivery-price" value="${order.price}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Notas de entrega (opcional)</label>
                            <textarea class="form-input" id="delivery-notes" rows="2" 
                                      placeholder="Observaciones de la entrega..."></textarea>
                        </div>
                        <button type="submit" class="btn btn-success" style="width: 100%;">
                            <i class="fas fa-check"></i> Confirmar Entrega y Registrar Venta
                        </button>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Configurar el formulario
        const deliveryForm = modal.querySelector('#delivery-form');
        if (deliveryForm) {
            deliveryForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.processDelivery(orderId, modal);
            });
        }
    },

    processDelivery(orderId, modalElement) {
        const weight = parseFloat(modalElement.querySelector('#delivery-weight').value);
        const quantity = parseInt(modalElement.querySelector('#delivery-quantity').value);
        const price = parseFloat(modalElement.querySelector('#delivery-price').value);
        const notes = modalElement.querySelector('#delivery-notes').value;
        
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;
        
        // Registrar como venta
        const sale = SalesModule.addSale(order.clientId, weight, quantity, price);
        
        // Actualizar estadísticas del cliente
        ClientsModule.updateClientStats(order.clientId, weight, quantity, sale.total);
        
        // Marcar pedido como entregado
        order.status = 'delivered';
        order.deliveredDate = Utils.formatDate();
        order.deliveredTime = new Date().toLocaleTimeString('es-ES');
        order.actualWeight = weight;
        order.actualQuantity = quantity;
        order.actualPrice = price;
        order.actualTotal = sale.total;
        order.deliveryNotes = notes;
        
        // Notificar pedido entregado (sin bloquear si falla)
        if (typeof NotificationsModule !== 'undefined') {
            try {
                const client = ClientsModule.getClientById(order.clientId);
                const clientName = client ? client.name : 'Cliente';
                NotificationsModule.notifyOrderDelivered(clientName).catch(err => {
                    console.warn('No se pudo enviar notificación:', err);
                });
            } catch (err) {
                console.warn('Error al notificar:', err);
            }
        }
        
        this.saveOrders();
        this.updateOrdersList();
        this.updateOrderBadges();
        
        // NUEVO: Actualizar mapa de rutas
        if (RutasModule.actualizarRutaPorCambioPedido) {
            RutasModule.actualizarRutaPorCambioPedido(orderId, 'delivered');
        }
        
        // Actualizar estadísticas y contabilidad
        StatsModule.updateStats(Utils.getTodayDate());
        AccountingModule.updateAccounting(Utils.getTodayDate());
        
        // Cerrar modal
        modalElement.remove();
        
        // Mostrar recibo
        App.showReceipt(sale.id);
        
        Utils.showNotification('Pedido entregado y venta registrada', 'success', 5000);
    },

    cancelOrder(orderId) {
        if (this.updateOrderStatus(orderId, 'cancelled')) {
            this.updateOrdersList();
            this.updateOrderBadges();
            
            // NUEVO: Actualizar mapa de rutas
            if (RutasModule.actualizarRutaPorCambioPedido) {
                RutasModule.actualizarRutaPorCambioPedido(orderId, 'cancelled');
            }
            
            Utils.showNotification('Pedido cancelado', 'warning', 5000);
        }
    },

    showOrderDetails(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return;

        const client = ClientsModule.getClientById(order.clientId);
        if (!client) return;

        const details = `
            <div class="order-details-modal">
                <h3><i class="fas fa-clipboard-list"></i> Detalles del Pedido #${orderId}</h3>
                <p><strong>Cliente:</strong> ${client.name}</p>
                <p><strong>Teléfono:</strong> ${client.phone}</p>
                <p><strong>Dirección:</strong> ${client.address}</p>
                <p><strong>Ubicación:</strong> ${client.location || 'No especificada'}</p>
                <hr>
                <p><strong>Peso Total:</strong> ${order.weight.toFixed(2)} lb</p>
                <p><strong>Cantidad de Pollos:</strong> ${order.quantity}</p>
                <p><strong>Peso Promedio:</strong> ${order.averageWeight} lb/pollo</p>
                <p><strong>Precio por lb:</strong> $${order.price.toFixed(2)}</p>
                <p><strong>Total:</strong> $${order.total.toFixed(2)}</p>
                <p><strong>Estado:</strong> <span class="order-status ${order.status}">${this.getStatusText(order.status)}</span></p>
                <p><strong>Fecha de creación:</strong> ${order.createdDate} ${order.createdTime}</p>
                ${order.deliveryDate ? `<p><strong>Fecha de entrega:</strong> ${order.deliveryDate} ${order.deliveryTime || ''}</p>` : ''}
                ${order.notes ? `<p><strong>Notas:</strong> ${order.notes}</p>` : ''}
                ${order.actualWeight ? `<p><strong>Peso real entregado:</strong> ${order.actualWeight.toFixed(2)} lb</p>` : ''}
                ${order.actualQuantity ? `<p><strong>Cantidad real entregada:</strong> ${order.actualQuantity} pollos</p>` : ''}
                ${order.deliveryNotes ? `<p><strong>Notas de entrega:</strong> ${order.deliveryNotes}</p>` : ''}
            </div>
        `;

        // Crear modal temporal
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-clipboard-list"></i> Detalles del Pedido</h3>
                    <button class="close-modal" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    ${details}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },

    updateOrderBadges() {
        const pendingOrders = this.getPendingOrders().length;
        
        // Actualizar badge en sidebar
        const sidebarBadge = document.getElementById('pending-orders-badge');
        if (sidebarBadge) {
            sidebarBadge.textContent = pendingOrders;
            sidebarBadge.style.display = pendingOrders > 0 ? 'inline-block' : 'none';
        }
        
        // Actualizar badge en mobile
        const mobileBadge = document.getElementById('mobile-pending-orders');
        if (mobileBadge) {
            mobileBadge.textContent = pendingOrders;
            mobileBadge.style.display = pendingOrders > 0 ? 'flex' : 'none';
        }
    },

    async saveOrders() {
        if (DB.db) {
            for (const order of this.orders) {
                await DB.set('orders', order);
            }
        } else {
            localStorage.setItem('polloOrders', JSON.stringify(this.orders));
        }
        this.updateOrderBadges();
    },

    async loadOrders() {
        if (DB.db) {
            this.orders = await DB.getAll('orders');
        } else {
            const saved = localStorage.getItem('polloOrders');
            if (saved) this.orders = JSON.parse(saved);
        }
        this.updateOrderBadges();
    }
};

// Módulo de Ventas
const SalesModule = {
    sales: [],

    async init() {
        await this.loadSales();
    },

    addSale(clientId, weight, quantity, price, customDate = null, isPaid = true, initialPayment = 0) {
        const saleDate = customDate || Utils.formatDate();
        const mermaRecord = MermaModule.getMermaRecordByDate(saleDate);
        
        const salePrice = parseFloat(price) || 0;
        const total = weight * salePrice;
        const averageWeight = Utils.calculateAverageWeight(weight, quantity);
        const saleTime = new Date().toLocaleTimeString('es-ES');
        
        // Calcular pago inicial y deuda
        const initialPaid = parseFloat(initialPayment) || 0;
        const paidAmount = isPaid ? total : initialPaid;
        const remainingDebt = isPaid ? 0 : (total - initialPaid);
        
        const sale = {
            id: Date.now(),
            clientId,
            weight: parseFloat(weight),
            quantity: parseInt(quantity),
            averageWeight: parseFloat(averageWeight.toFixed(2)),
            price: salePrice,
            costPerLb: mermaRecord ? mermaRecord.realCostPerLb : 0,
            profitPerLb: mermaRecord ? (salePrice - mermaRecord.realCostPerLb) : salePrice,
            total,
            isPaid,
            paidAmount,
            remainingDebt,
            paymentHistory: initialPaid > 0 ? [{ amount: initialPaid, date: saleDate, time: saleTime }] : (isPaid ? [{ amount: total, date: saleDate, time: saleTime }] : []),
            date: saleDate,
            time: saleTime,
            timestamp: new Date().getTime(),
            lastModified: Date.now(),
            dayKey: saleDate
        };

        this.sales.push(sale);
        this.saveSales();
        ClientsModule.updateClientStats(clientId, weight, quantity, total);
        
        // Notificar venta completada (sin bloquear si falla)
        if (typeof NotificationsModule !== 'undefined') {
            try {
                const client = ClientsModule.getClientById(clientId);
                const clientName = client ? client.name : 'Cliente';
                NotificationsModule.notifySaleCompleted(total, clientName).catch(err => {
                    console.warn('No se pudo enviar notificación:', err);
                });
            } catch (err) {
                console.warn('Error al notificar:', err);
            }
        }
        
        return sale;
    },

    getSalesByDate(date) {
        // Normalizar formato de fecha para comparación
        const targetDate = date.includes('/') ? this.convertDateFormat(date) : date;
        return this.sales.filter(sale => {
            // FILTRAR VENTAS ELIMINADAS
            if (sale.deleted) return false;
            
            const saleDate = sale.date.includes('/') ? this.convertDateFormat(sale.date) : sale.date;
            return saleDate === targetDate;
        });
    },

    // Convertir fecha de DD/MM/YYYY a YYYY-MM-DD
    convertDateFormat(date) {
        if (date.includes('-') && date.split('-')[0].length === 4) {
            return date; // Ya está en formato correcto
        }
        const parts = date.split('/');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        return date;
    },

    getTodaySales() {
        return this.getSalesByDate(Utils.getTodayDate());
    },

    getSalesByDateRange(startDate, endDate) {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();
        
        return this.sales.filter(sale => {
            // FILTRAR VENTAS ELIMINADAS
            if (sale.deleted) return false;
            
            const saleDate = new Date(sale.date).getTime();
            return saleDate >= start && saleDate <= end;
        });
    },

    getTotalSalesByDate(date) {
        const sales = this.getSalesByDate(date);
        return sales.reduce((sum, sale) => sum + sale.total, 0);
    },

    getTotalWeightByDate(date) {
        const sales = this.getSalesByDate(date);
        return sales.reduce((sum, sale) => sum + sale.weight, 0);
    },

    getTotalQuantityByDate(date) {
        const sales = this.getSalesByDate(date);
        return sales.reduce((sum, sale) => sum + sale.quantity, 0);
    },

    getAverageWeightByDate(date) {
        const sales = this.getSalesByDate(date);
        if (sales.length === 0) return 0;
        
        const totalWeight = sales.reduce((sum, sale) => sum + sale.weight, 0);
        const totalQuantity = sales.reduce((sum, sale) => sum + sale.quantity, 0);
        
        if (totalQuantity === 0) return 0;
        return parseFloat((totalWeight / totalQuantity).toFixed(2));
    },

    updateSalesList(date = null) {
        const salesList = document.getElementById('sales-list');
        if (!salesList) return;

        salesList.innerHTML = '';

        const targetDate = date || Utils.getTodayDate();
        const targetSales = this.getSalesByDate(targetDate).reverse();

        if (targetSales.length === 0) {
            salesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-receipt empty-state-icon"></i>
                    <p>No hay ventas registradas para ${targetDate}</p>
                </div>
            `;
            return;
        }

        targetSales.forEach(sale => {
            const client = ClientsModule.getClientById(sale.clientId);
            const clientName = client ? client.name : 'Cliente no encontrado';
            
            const li = document.createElement('li');
            li.className = 'sale-item';
            li.innerHTML = `
                <div class="sale-info">
                    <h3><i class="fas fa-user"></i> ${clientName}</h3>
                    <p class="sale-details">
                        <i class="fas fa-weight"></i> ${sale.weight.toFixed(2)} lb × 
                        <i class="fas fa-egg"></i> ${sale.quantity} pollos
                    </p>
                    <p class="sale-details">
                        <i class="fas fa-balance-scale"></i> ${sale.averageWeight} lb/pollo × 
                        $${sale.price.toFixed(2)}/lb
                    </p>
                    <p class="sale-details"><i class="fas fa-clock"></i> ${sale.time}</p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 5px; align-items: flex-end;">
                    <div class="sale-amount">${Utils.formatCurrency(sale.total)}</div>
                    <button class="btn btn-outline" style="padding: 5px 10px; font-size: 0.8rem;" 
                            onclick="App.showReceipt(${sale.id})">
                        <i class="fas fa-receipt"></i> Recibo
                    </button>
                    <button class="btn btn-outline" style="padding: 5px 10px; font-size: 0.8rem;" 
                            onclick="SalesModule.showEditModal(${sale.id})">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.8rem;" 
                            onclick="SalesModule.showDeleteModal(${sale.id})">
                        <i class="fas fa-trash"></i> Eliminar
                    </button>
                </div>
            `;
            salesList.appendChild(li);
        });
    },

    showEditModal(saleId) {
        const sale = this.getSaleById(saleId);
        if (!sale) return;

        const client = ClientsModule.getClientById(sale.clientId);
        if (!client) return;

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-edit"></i> Editar Venta</h3>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="edit-sale-form">
                        <div class="form-group">
                            <label class="form-label">Cliente</label>
                            <select class="form-input" id="edit-sale-client" required>
                                ${ClientsModule.clients.map(c => 
                                    `<option value="${c.id}" ${c.id === sale.clientId ? 'selected' : ''}>${c.name} - ${c.phone}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Peso Total (lb)</label>
                            <input type="number" step="0.01" min="0.01" class="form-input" 
                                   id="edit-sale-weight" value="${sale.weight}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Cantidad de Pollos</label>
                            <input type="number" min="1" class="form-input" 
                                   id="edit-sale-quantity" value="${sale.quantity}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Precio por lb ($)</label>
                            <input type="number" step="0.01" min="0" class="form-input" 
                                   id="edit-sale-price" value="${sale.price}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Tipo de Pago</label>
                            <select class="form-input" id="edit-sale-payment" required>
                                <option value="paid" ${sale.isPaid ? 'selected' : ''}>Efectivo (Pagado)</option>
                                <option value="credit" ${!sale.isPaid ? 'selected' : ''}>Crédito (A deber)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Fecha</label>
                            <input type="date" class="form-input" 
                                   id="edit-sale-date" value="${sale.date}" required>
                        </div>
                        <button type="submit" class="btn btn-success" style="width: 100%;">
                            <i class="fas fa-save"></i> Guardar Cambios
                        </button>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const form = modal.querySelector('#edit-sale-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.updateSale(saleId, {
                clientId: parseInt(document.getElementById('edit-sale-client').value),
                weight: parseFloat(document.getElementById('edit-sale-weight').value),
                quantity: parseInt(document.getElementById('edit-sale-quantity').value),
                price: parseFloat(document.getElementById('edit-sale-price').value),
                date: document.getElementById('edit-sale-date').value,
                isPaid: document.getElementById('edit-sale-payment').value === 'paid'
            });
            modal.remove();
        });
    },

    async updateSale(saleId, updates) {
        const sale = this.getSaleById(saleId);
        if (!sale) return false;

        const oldClientId = sale.clientId;
        const oldWeight = sale.weight;
        const oldQuantity = sale.quantity;
        const oldTotal = sale.total;
        const oldDate = sale.date;
        const oldIsPaid = sale.isPaid;

        sale.clientId = updates.clientId;
        sale.weight = updates.weight;
        sale.quantity = updates.quantity;
        sale.price = updates.price;
        sale.date = updates.date;
        sale.averageWeight = parseFloat((updates.weight / updates.quantity).toFixed(2));
        sale.total = updates.weight * updates.price;
        sale.isPaid = updates.isPaid;
        sale.paidAmount = updates.isPaid ? sale.total : 0;
        sale.remainingDebt = updates.isPaid ? 0 : sale.total;
        sale.lastModified = Date.now();

        const mermaRecord = MermaModule.getMermaRecordByDate(sale.date);
        if (mermaRecord) {
            sale.costPerLb = mermaRecord.realCostPerLb;
            sale.profitPerLb = sale.price - mermaRecord.realCostPerLb;
        }

        if (oldClientId !== sale.clientId) {
            const oldClient = ClientsModule.getClientById(oldClientId);
            if (oldClient) {
                oldClient.totalSales -= 1;
                oldClient.totalAmount -= oldTotal;
                oldClient.totalWeight -= oldWeight;
                oldClient.totalQuantity -= oldQuantity;
            }
            ClientsModule.updateClientStats(sale.clientId, sale.weight, sale.quantity, sale.total);
        } else {
            const client = ClientsModule.getClientById(sale.clientId);
            if (client) {
                client.totalAmount = client.totalAmount - oldTotal + sale.total;
                client.totalWeight = client.totalWeight - oldWeight + sale.weight;
                client.totalQuantity = client.totalQuantity - oldQuantity + sale.quantity;
            }
        }

        await this.saveSales();
        await ClientsModule.saveClients();
        
        // CRÍTICO: Notificar al sistema de sincronización sobre la actualización
        if (typeof SyncEngine !== 'undefined' && SyncEngine.notifyChange) {
            await SyncEngine.notifyChange('sales', saleId, 'update');
            // Si cambió de cliente, notificar también los clientes
            if (oldClientId !== sale.clientId) {
                await SyncEngine.notifyChange('clients', oldClientId, 'update');
                await SyncEngine.notifyChange('clients', sale.clientId, 'update');
            }
        }
        
        // Actualizar contabilidad de ambas fechas si cambió la fecha
        if (typeof AccountingModule !== 'undefined') {
            AccountingModule.updateAccounting(oldDate);
            if (oldDate !== sale.date) {
                AccountingModule.updateAccounting(sale.date);
            }
        }
        
        // Actualizar badges de créditos si cambió el estado de pago
        if (oldIsPaid !== sale.isPaid && typeof CreditosModule !== 'undefined') {
            CreditosModule.updateCreditBadges();
        }
        
        this.updateSalesList(sale.date);
        Utils.showNotification('Venta actualizada correctamente', 'success', 3000);
        return true;
    },

    getSaleById(id) {
        return this.sales.find(sale => sale.id === id);
    },

    showDeleteModal(saleId) {
        const sale = this.getSaleById(saleId);
        if (!sale) return;

        const client = ClientsModule.getClientById(sale.clientId);
        const clientName = client ? client.name : 'Cliente no encontrado';

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-exclamation-triangle" style="color: #ff6b6b;"></i> Confirmar Eliminación</h3>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <p><strong>¿Estás seguro de que deseas eliminar esta venta?</strong></p>
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
                            <p><strong>Cliente:</strong> ${clientName}</p>
                            <p><strong>Peso:</strong> ${sale.weight.toFixed(2)} lb</p>
                            <p><strong>Cantidad:</strong> ${sale.quantity} pollos</p>
                            <p><strong>Total:</strong> ${Utils.formatCurrency(sale.total)}</p>
                            <p><strong>Fecha:</strong> ${sale.date}</p>
                            <p><strong>Estado:</strong> ${sale.isPaid ? 'Pagado' : 'Crédito'}</p>
                        </div>
                        <p style="color: #ff6b6b; font-size: 0.9rem;">
                            <i class="fas fa-warning"></i> Esta acción no se puede deshacer y se sincronizará en todos los dispositivos.
                        </p>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button class="btn btn-outline" onclick="this.closest('.modal').remove()">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                        <button class="btn btn-danger" onclick="SalesModule.deleteSale(${saleId}); this.closest('.modal').remove();">
                            <i class="fas fa-trash"></i> Eliminar Venta
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    },

    async deleteSale(saleId) {
        const sale = this.getSaleById(saleId);
        if (!sale) {
            Utils.showNotification('Venta no encontrada', 'error', 3000);
            return false;
        }

        try {
            console.log('🗑️ Eliminando venta:', saleId);
            
            // 1. MARCAR LA VENTA COMO ELIMINADA (igual que editar)
            // En lugar de eliminar inmediatamente, marcamos como eliminada
            sale.deleted = true;
            sale.deletedAt = Date.now();
            sale.lastModified = Date.now();
            
            // 2. ACTUALIZAR ESTADÍSTICAS DEL CLIENTE
            const client = ClientsModule.getClientById(sale.clientId);
            if (client) {
                client.totalSales -= 1;
                client.totalAmount -= sale.total;
                client.totalWeight -= sale.weight;
                client.totalQuantity -= sale.quantity;
                await ClientsModule.saveClients();
            }
            
            // 3. GUARDAR LA VENTA MARCADA COMO ELIMINADA
            // Esto activará los interceptores automáticos igual que la edición
            await this.saveSales();
            
            // 4. ACTUALIZAR CONTABILIDAD
            if (typeof AccountingModule !== 'undefined') {
                AccountingModule.updateAccounting(sale.date);
            }
            
            // 5. ACTUALIZAR BADGES DE CRÉDITOS
            if (!sale.isPaid && typeof CreditosModule !== 'undefined') {
                CreditosModule.updateCreditBadges();
            }
            
            // 6. ACTUALIZAR LA LISTA DE VENTAS
            this.updateSalesList(sale.date);
            
            console.log('✅ Venta marcada como eliminada');
            Utils.showNotification('Venta eliminada correctamente', 'success', 3000);
            return true;

        } catch (error) {
            console.error('❌ Error al eliminar venta:', error);
            Utils.showNotification('Error al eliminar la venta', 'error', 3000);
            return false;
        }
    },

    markAsCredit(saleId) {
        const sale = this.getSaleById(saleId);
        if (sale) {
            sale.isPaid = false;
            sale.paidAmount = 0;
            sale.remainingDebt = sale.total;
            sale.paymentHistory = [];
            this.saveSales();
            return true;
        }
        return false;
    },

    async registerPayment(saleId, amount, date = null, silent = false) {
        const sale = this.getSaleById(saleId);
        if (!sale) return false;

        const paymentDate = date || Utils.formatDate();
        const paymentTime = new Date().toLocaleTimeString('es-ES');
        const paymentAmount = parseFloat(amount);

        // Redondear a 2 decimales para evitar problemas de precisión
        const roundedAmount = Math.round(paymentAmount * 100) / 100;
        const roundedDebt = Math.round(sale.remainingDebt * 100) / 100;

        if (roundedAmount <= 0 || roundedAmount > roundedDebt + 0.01) return false;

        sale.paidAmount += paymentAmount;
        sale.remainingDebt -= paymentAmount;
        
        // CRÍTICO: Actualizar timestamp de última modificación para sincronización
        sale.lastModified = Date.now();
        
        if (!sale.paymentHistory) sale.paymentHistory = [];
        sale.paymentHistory.push({
            amount: paymentAmount,
            date: paymentDate,
            time: paymentTime,
            timestamp: Date.now()
        });

        // YA NO registrar en PaymentHistoryModule - se construye dinámicamente desde sale.paymentHistory

        if (sale.remainingDebt <= 0.01) {
            sale.isPaid = true;
            sale.remainingDebt = 0;
            
            // Notificar pago recibido SOLO si no es silencioso (sin bloquear si falla)
            if (!silent && typeof NotificationsModule !== 'undefined') {
                try {
                    const client = ClientsModule.getClientById(sale.clientId);
                    const clientName = client ? client.name : 'Cliente';
                    NotificationsModule.notifyPaymentReceived(paymentAmount, clientName).catch(err => {
                        console.warn('No se pudo enviar notificación de pago:', err);
                    });
                } catch (err) {
                    console.warn('Error al intentar notificar pago:', err);
                }
            }
        }

        await this.saveSales();
        
        // CRÍTICO: Notificar al sistema de sincronización si no es silencioso
        if (!silent && typeof SyncEngine !== 'undefined' && SyncEngine.notifyChange) {
            await SyncEngine.notifyChange('sales', sale.id, 'update');
        }
        
        return true;
    },

    getCreditSales() {
        return this.sales.filter(sale => !sale.deleted && !sale.isPaid && (sale.remainingDebt || 0) > 0);
    },

    getCreditsByClient(clientId) {
        return this.sales.filter(sale => 
            !sale.deleted &&
            sale.clientId === clientId && 
            !sale.isPaid && 
            (sale.remainingDebt || 0) > 0
        );
    },

    getClientTotalDebt(clientId) {
        return this.getCreditsByClient(clientId)
            .reduce((sum, sale) => sum + (sale.remainingDebt || 0), 0);
    },

    async saveSales() {
        if (DB.db) {
            // CRÍTICO: Primero obtener todas las ventas existentes en DB
            const existingSales = await DB.getAll('sales') || [];
            const currentIds = new Set(this.sales.map(s => s.id));
            
            // Eliminar ventas que ya no están en el array
            for (const existingSale of existingSales) {
                if (!currentIds.has(existingSale.id)) {
                    await DB.delete('sales', existingSale.id);
                    console.log('🗑️ Venta eliminada de IndexedDB:', existingSale.id);
                }
            }
            
            // Guardar/actualizar ventas actuales
            for (const sale of this.sales) {
                await DB.set('sales', sale);
            }
        } else {
            localStorage.setItem('polloSales', JSON.stringify(this.sales));
        }
    },

    async loadSales() {
        if (DB.db) {
            this.sales = await DB.getAll('sales');
        } else {
            const saved = localStorage.getItem('polloSales');
            if (saved) {
                this.sales = JSON.parse(saved);
            }
        }
        // FILTRAR VENTAS ELIMINADAS y normalizar datos
        this.sales = this.sales
            .filter(sale => !sale.deleted) // NO cargar ventas eliminadas
            .map(sale => ({
                ...sale,
                isPaid: sale.isPaid !== undefined ? sale.isPaid : true,
                paidAmount: sale.paidAmount !== undefined ? sale.paidAmount : sale.total,
                remainingDebt: sale.remainingDebt !== undefined ? sale.remainingDebt : 0,
                paymentHistory: sale.paymentHistory || []
            }));
    },

    // Función para agregar eliminaciones pendientes
    addPendingDeletion(saleId) {
        const pendingDeletions = JSON.parse(localStorage.getItem('pendingSalesDeletions') || '[]');
        if (!pendingDeletions.includes(saleId)) {
            pendingDeletions.push(saleId);
            localStorage.setItem('pendingSalesDeletions', JSON.stringify(pendingDeletions));
            console.log(`📝 Eliminación pendiente guardada: ${saleId}`);
        }
    },

    // Función para sincronizar eliminaciones pendientes cuando SyncEngine esté disponible
    async syncPendingDeletions() {
        if (typeof window.SyncEngine !== 'undefined' && 
            window.SyncEngine && 
            typeof window.SyncEngine.notifyChange === 'function') {
            
            // Verificar si hay eliminaciones pendientes en localStorage
            const pendingDeletions = JSON.parse(localStorage.getItem('pendingSalesDeletions') || '[]');
            
            if (pendingDeletions.length > 0) {
                console.log(`🔄 Sincronizando ${pendingDeletions.length} eliminaciones pendientes...`);
                
                for (const saleId of pendingDeletions) {
                    try {
                        await window.SyncEngine.notifyChange('sales', saleId, 'delete');
                        console.log(`✅ Eliminación sincronizada: ${saleId}`);
                    } catch (error) {
                        console.error(`❌ Error sincronizando eliminación ${saleId}:`, error);
                    }
                }
                
                // Limpiar eliminaciones pendientes
                localStorage.removeItem('pendingSalesDeletions');
                console.log('✅ Todas las eliminaciones pendientes sincronizadas');
            }
        }
    }
};

// Módulo de Merma
const MermaModule = {
    dailyPrices: [],
    mermaRecords: [], // NUEVO: Historial completo de cálculos de merma

    async init() {
        await this.loadDailyPrices();
        await this.loadMermaRecords();
    },

    calculateMerma(liveWeight, liveCost, processedWeight, processingCost, realCostPerLb = null) {
        // Contar cuántos valores faltan
        const hasLiveWeight = liveWeight && liveWeight > 0;
        const hasLiveCost = liveCost && liveCost > 0;
        const hasProcessedWeight = processedWeight && processedWeight > 0;
        const hasProcessingCost = processingCost >= 0; // Puede ser 0
        const hasRealCost = realCostPerLb && realCostPerLb > 0;
        
        const missingCount = [hasLiveWeight, hasLiveCost, hasProcessedWeight, hasProcessingCost, hasRealCost].filter(v => !v).length;
        
        if (missingCount > 1) {
            throw new Error('Debes llenar al menos 4 de los 5 campos');
        }
        
        let finalLiveWeight = liveWeight;
        let finalLiveCost = liveCost;
        let finalProcessedWeight = processedWeight;
        let finalProcessingCost = processingCost;
        let finalRealCost = realCostPerLb;
        let deducedValue = null;
        
        // Calcular el valor faltante
        if (!hasLiveWeight) {
            finalLiveWeight = (finalRealCost * finalProcessedWeight - finalProcessingCost) / finalLiveCost;
            if (finalLiveWeight <= 0) throw new Error('Peso vivo calculado inválido');
            deducedValue = 'liveWeight';
        } else if (!hasLiveCost) {
            finalLiveCost = (finalRealCost * finalProcessedWeight - finalProcessingCost) / finalLiveWeight;
            if (finalLiveCost <= 0) throw new Error('Costo por lb vivo calculado inválido');
            deducedValue = 'liveCost';
        } else if (!hasProcessedWeight) {
            finalProcessedWeight = (finalLiveWeight * finalLiveCost + finalProcessingCost) / finalRealCost;
            if (finalProcessedWeight <= 0) throw new Error('Peso pelado calculado inválido');
            deducedValue = 'processedWeight';
        } else if (!hasProcessingCost) {
            finalProcessingCost = finalRealCost * finalProcessedWeight - finalLiveWeight * finalLiveCost;
            deducedValue = 'processingCost';
        } else if (!hasRealCost) {
            finalRealCost = (finalLiveWeight * finalLiveCost + finalProcessingCost) / finalProcessedWeight;
            if (finalRealCost <= 0) throw new Error('Costo real calculado inválido');
            deducedValue = 'realCostPerLb';
        }
        
        // Calcular resultados finales
        const totalCost = (finalLiveWeight * finalLiveCost) + finalProcessingCost;
        const merma = ((finalLiveWeight - finalProcessedWeight) / finalLiveWeight) * 100;
        const lossAmount = (finalLiveWeight - finalProcessedWeight) * finalLiveCost;
        
        return {
            merma: parseFloat(merma.toFixed(2)),
            realCostPerLb: parseFloat(finalRealCost.toFixed(2)),
            lossAmount: parseFloat(lossAmount.toFixed(2)),
            totalCost: parseFloat(totalCost.toFixed(2)),
            liveWeight: parseFloat(finalLiveWeight.toFixed(2)),
            liveCost: parseFloat(finalLiveCost.toFixed(2)),
            processedWeight: parseFloat(finalProcessedWeight.toFixed(2)),
            processingCost: parseFloat(finalProcessingCost.toFixed(2)),
            deducedValue: deducedValue
        };
    },

    // NUEVO: Guardar registro completo de merma
    async saveMermaRecord(mermaData, date = Utils.getTodayDate()) {
        const existingIndex = this.mermaRecords.findIndex(r => r.date === date);
        
        const record = {
            id: existingIndex > -1 ? this.mermaRecords[existingIndex].id : Date.now(),
            date,
            ...mermaData,
            timestamp: new Date().getTime()
        };

        if (existingIndex > -1) {
            this.mermaRecords[existingIndex] = record;
        } else {
            this.mermaRecords.push(record);
        }

        await this.saveMermaRecords();
        
        // Guardar también el precio
        await this.saveDailyPrice(mermaData.realCostPerLb, date);
        
        // CRÁTICO: Recalcular todas las ventas de ese día
        await this.recalcularVentasPorFecha(date);
        
        return record;
    },

    // Recalcular costos y ganancias cuando cambia la merma
    async recalcularVentasPorFecha(date) {
        const ventasDelDia = SalesModule.getSalesByDate(date);
        const mermaRecord = this.getMermaRecordByDate(date);
        
        if (!mermaRecord || ventasDelDia.length === 0) return 0;

        let ventasActualizadas = 0;
        
        for (const venta of ventasDelDia) {
            // Actualizar costo y ganancia por libra
            venta.costPerLb = mermaRecord.realCostPerLb;
            venta.profitPerLb = venta.price - mermaRecord.realCostPerLb;
            ventasActualizadas++;
        }

        if (ventasActualizadas > 0) {
            await SalesModule.saveSales();
            
            // Recalcular contabilidad
            if (typeof AccountingModule !== 'undefined') {
                AccountingModule.updateAccounting(date);
            }
            
            // Recalcular estadísticas
            if (typeof StatsModule !== 'undefined') {
                StatsModule.updateStats(date);
            }
            
            // Actualizar UI
            if (typeof App !== 'undefined' && App.currentPage === 'accounting') {
                AccountingModule.updateAccounting(date);
            }
        }

        return ventasActualizadas;
    },

    // NUEVO: Obtener registro de merma por fecha
    getMermaRecordByDate(date) {
        return this.mermaRecords.find(r => r.date === date);
    },

    saveDailyPrice(price, date = Utils.getTodayDate()) {
        const existingIndex = this.dailyPrices.findIndex(p => p.date === date);
        
        if (existingIndex > -1) {
            this.dailyPrices[existingIndex].price = price;
        } else {
            this.dailyPrices.push({
                id: Date.now(),
                date,
                price,
                timestamp: new Date().getTime()
            });
        }
        
        this.saveDailyPrices();
        return price;
    },

    getTodayMermaPrice() {
        const today = Utils.getTodayDate();
        const todayPrice = this.dailyPrices.find(p => p.date === today);
        return todayPrice ? todayPrice.price : null;
    },

    getMermaPriceByDate(date) {
        return this.dailyPrices.find(p => p.date === date);
    },

    async saveDailyPrices() {
        if (DB.db) {
            for (const price of this.dailyPrices) {
                await DB.set('prices', price);
            }
        } else {
            localStorage.setItem('polloDailyPrices', JSON.stringify(this.dailyPrices));
        }
    },

    async loadDailyPrices() {
        if (DB.db) {
            this.dailyPrices = await DB.getAll('prices');
        } else {
            const saved = localStorage.getItem('polloDailyPrices');
            if (saved) {
                this.dailyPrices = JSON.parse(saved);
            }
        }
    },

    // NUEVO: Guardar/cargar registros de merma
    async saveMermaRecords() {
        if (DB.db) {
            await DB.set('config', { key: 'merma-records', value: this.mermaRecords });
        } else {
            localStorage.setItem('polloMermaRecords', JSON.stringify(this.mermaRecords));
        }
    },

    async loadMermaRecords() {
        if (DB.db) {
            const saved = await DB.get('config', 'merma-records');
            if (saved && saved.value) {
                this.mermaRecords = saved.value;
            }
        } else {
            const saved = localStorage.getItem('polloMermaRecords');
            if (saved) {
                this.mermaRecords = JSON.parse(saved);
            }
        }
    }
};

// Módulo de Estadísticas
const StatsModule = {
    updateStats(date = null) {
        const targetDate = date || Utils.getTodayDate();
        const sales = SalesModule.getSalesByDate(targetDate);
        const orders = OrdersModule.getTodayOrders();
        const mermaPrice = MermaModule.getMermaPriceByDate(targetDate);
        
        // Actualizar estadísticas del día - SOLO si los elementos existen
        const salesTodayElement = document.getElementById('sales-today');
        const incomeTodayElement = document.getElementById('income-today');
        const weightTodayElement = document.getElementById('weight-today');
        const averageWeightElement = document.getElementById('average-weight-today');
        const activeClientsElement = document.getElementById('active-clients');
        const totalQuantityElement = document.getElementById('total-quantity-today');
        const pendingOrdersElement = document.getElementById('pending-orders-today');
        const mermaPriceElement = document.getElementById('merma-price-today');
        
        // Solo actualizar si el elemento existe
        if (salesTodayElement) {
            salesTodayElement.textContent = sales.length;
        }
        
        const todayIncome = sales.reduce((sum, sale) => sum + sale.total, 0);
        if (incomeTodayElement) {
            incomeTodayElement.textContent = Utils.formatCurrency(todayIncome);
        }
        
        const todayWeight = sales.reduce((sum, sale) => sum + sale.weight, 0);
        if (weightTodayElement) {
            weightTodayElement.textContent = todayWeight.toFixed(2) + ' lb';
        }
        
        // Peso promedio de pollos
        const averageWeight = SalesModule.getAverageWeightByDate(targetDate);
        if (averageWeightElement) {
            averageWeightElement.textContent = averageWeight.toFixed(2) + ' lb/pollo';
        }
        
        // Clientes activos hoy
        const todayClients = [...new Set(sales.map(sale => sale.clientId))];
        if (activeClientsElement) {
            activeClientsElement.textContent = todayClients.length;
        }
        
        // Cantidad total de pollos vendidos
        const totalQuantity = SalesModule.getTotalQuantityByDate(targetDate);
        if (totalQuantityElement) {
            totalQuantityElement.textContent = totalQuantity;
        }
        
        // Pedidos pendientes
        const pendingOrders = OrdersModule.getPendingOrders().length;
        if (pendingOrdersElement) {
            pendingOrdersElement.textContent = pendingOrders;
        }
        
        // Precio de merma del día
        if (mermaPriceElement) {
            mermaPriceElement.textContent = mermaPrice ? 
                Utils.formatCurrency(mermaPrice.price) + '/lb' : 'No definido';
        }
        
        // Actualizar estadísticas por cliente
        this.updateClientStats(sales);
    },

    updateClientStats(sales) {
        const clientStats = document.getElementById('client-stats');
        if (!clientStats) return;

        clientStats.innerHTML = '';

        // Agrupar ventas por cliente
        const clientSales = {};
        sales.forEach(sale => {
            if (!clientSales[sale.clientId]) {
                clientSales[sale.clientId] = {
                    sales: 0,
                    total: 0,
                    weight: 0,
                    quantity: 0
                };
            }
            clientSales[sale.clientId].sales += 1;
            clientSales[sale.clientId].total += sale.total;
            clientSales[sale.clientId].weight += sale.weight;
            clientSales[sale.clientId].quantity += sale.quantity;
        });

        if (Object.keys(clientSales).length === 0) {
            clientStats.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-bar empty-state-icon"></i>
                    <p>No hay datos de ventas por cliente</p>
                </div>
            `;
            return;
        }

        // Convertir a array y ordenar por total
        const sortedClients = Object.entries(clientSales)
            .map(([clientId, data]) => {
                const client = ClientsModule.getClientById(parseInt(clientId));
                return {
                    client,
                    ...data,
                    averageWeight: Utils.calculateAverageWeight(data.weight, data.quantity)
                };
            })
            .filter(item => item.client)
            .sort((a, b) => b.total - a.total);

        sortedClients.forEach(item => {
            const li = document.createElement('li');
            li.className = 'client-item';
            li.innerHTML = `
                <div class="client-info">
                    <h3><i class="fas fa-user"></i> ${item.client.name}</h3>
                    <p class="client-location">
                        <i class="fas fa-shopping-cart"></i> ${item.sales} ventas | 
                        <i class="fas fa-egg"></i> ${item.quantity} pollos
                    </p>
                    <p class="client-location">
                        <i class="fas fa-weight"></i> ${item.weight.toFixed(2)} lb | 
                        <i class="fas fa-balance-scale"></i> ${item.averageWeight.toFixed(2)} lb/pollo
                    </p>
                </div>
                <div class="sale-amount">${Utils.formatCurrency(item.total)}</div>
            `;
            clientStats.appendChild(li);
        });
    },

    getWeeklyStats() {
        const { start, end } = Utils.getDateRange(7);
        const sales = SalesModule.getSalesByDateRange(start, end);
        
        const statsByDay = {};
        const currentDate = new Date(start);
        const endDate = new Date(end);
        
        // Inicializar todos los días
        while (currentDate <= endDate) {
            const dateKey = Utils.formatDate(currentDate);
            statsByDay[dateKey] = {
                sales: 0,
                income: 0,
                weight: 0,
                quantity: 0,
                clients: new Set()
            };
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        // Agregar datos
        sales.forEach(sale => {
            if (statsByDay[sale.date]) {
                statsByDay[sale.date].sales += 1;
                statsByDay[sale.date].income += sale.total;
                statsByDay[sale.date].weight += sale.weight;
                statsByDay[sale.date].quantity += sale.quantity;
                statsByDay[sale.date].clients.add(sale.clientId);
            }
        });
        
        // Convertir a array y calcular promedios
        return Object.entries(statsByDay).map(([date, data]) => ({
            date,
            sales: data.sales,
            income: data.income,
            weight: data.weight,
            quantity: data.quantity,
            averageWeight: data.quantity > 0 ? parseFloat((data.weight / data.quantity).toFixed(2)) : 0,
            clients: data.clients.size
        }));
    }
};


// Módulo de Contabilidad
const AccountingModule = {
    expenses: [],

    async init() {
        this.loadExpenses();
    },

    addExpense(description, amount, category, customDate = null) {
        const expense = {
            id: Date.now(),
            description,
            amount: parseFloat(amount),
            category,
            date: customDate || Utils.formatDate(),
            time: new Date().toLocaleTimeString('es-ES'),
            timestamp: new Date().getTime()
        };

        this.expenses.push(expense);
        this.saveExpenses();
        return expense;
    },

    editExpense(expenseId, updates) {
        const expense = this.expenses.find(e => e.id === expenseId);
        if (!expense) return false;

        expense.description = updates.description;
        expense.amount = parseFloat(updates.amount);
        expense.category = updates.category;
        expense.date = updates.date;
        
        this.saveExpenses();
        return true;
    },

    deleteExpense(expenseId) {
        this.expenses = this.expenses.filter(e => e.id !== expenseId);
        this.saveExpenses();
        return true;
    },

    getExpenseById(id) {
        return this.expenses.find(expense => expense.id === id);
    },

    updateAccounting(date = null) {
        const targetDate = date || Utils.getTodayDate();
        const sales = SalesModule.getSalesByDate(targetDate);
        const expenses = this.getExpensesByDate(targetDate);
        
        const totalIncome = sales.reduce((sum, sale) => sum + sale.total, 0);
        const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
        
        // Calcular ganancia bruta: (PVP - Costo Merma) × Libras
        let grossProfit = 0;
        let totalMermaCost = 0;
        
        sales.forEach(sale => {
            const costPerLb = sale.costPerLb || 0;
            const profitPerLb = sale.price - costPerLb;
            grossProfit += profitPerLb * sale.weight;
            totalMermaCost += costPerLb * sale.weight;
        });
        
        // Ganancia neta = Ganancia bruta - Gastos (SIEMPRE se restan los gastos)
        const netProfit = grossProfit - totalExpenses;
        const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

        // Actualizar UI - SOLO si los elementos existen
        const totalIncomeElement = document.getElementById('total-income');
        const totalCostsElement = document.getElementById('total-costs');
        const netProfitElement = document.getElementById('net-profit');
        const profitMarginElement = document.getElementById('profit-margin');
        const costDetailsElement = document.getElementById('cost-details');
        
        if (totalIncomeElement) {
            totalIncomeElement.textContent = Utils.formatCurrency(totalIncome);
        }
        
        if (totalCostsElement) {
            totalCostsElement.textContent = Utils.formatCurrency(totalMermaCost + totalExpenses);
        }
        
        if (netProfitElement) {
            netProfitElement.textContent = Utils.formatCurrency(netProfit);
            netProfitElement.style.color = netProfit >= 0 ? 'var(--success)' : 'var(--danger)';
        }
        
        if (profitMarginElement) {
            profitMarginElement.textContent = profitMargin.toFixed(2) + '%';
        }
        
        // Detalles de costos
        if (costDetailsElement) {
            const totalWeight = sales.reduce((sum, sale) => sum + sale.weight, 0);
            const avgPVP = totalWeight > 0 ? totalIncome / totalWeight : 0;
            const avgCostPerLb = totalWeight > 0 ? totalMermaCost / totalWeight : 0;
            
            // Mostrar información relevante según lo que exista
            let detailsHTML = '';
            
            if (sales.length > 0) {
                detailsHTML += `
                    <p><i class="fas fa-balance-scale"></i> <strong>Libras vendidas:</strong> ${totalWeight.toFixed(2)} lb</p>
                    <p><i class="fas fa-dollar-sign"></i> <strong>PVP promedio:</strong> ${Utils.formatCurrency(avgPVP)}/lb</p>
                    <p><i class="fas fa-calculator"></i> <strong>Costo merma promedio:</strong> ${Utils.formatCurrency(avgCostPerLb)}/lb</p>
                    <p><i class="fas fa-chart-line"></i> <strong>Ganancia bruta:</strong> ${Utils.formatCurrency(grossProfit)} ${totalWeight > 0 ? '(' + Utils.formatCurrency((avgPVP - avgCostPerLb)) + '/lb)' : ''}</p>
                `;
            } else {
                detailsHTML += `<p style="color: var(--gray);"><i class="fas fa-info-circle"></i> No hay ventas registradas en esta fecha</p>`;
            }
            
            detailsHTML += `<p><i class="fas fa-receipt"></i> <strong>Gastos del día:</strong> ${Utils.formatCurrency(totalExpenses)}</p>`;
            
            if (expenses.length === 0) {
                detailsHTML += `<p style="color: var(--gray); font-size: 0.9rem;"><i class="fas fa-info-circle"></i> No hay gastos registrados</p>`;
            }
            
            detailsHTML += `
                <hr style="margin: 10px 0;">
                <p style="font-size: 1.1rem;"><i class="fas fa-money-bill-wave"></i> <strong>Ganancia Neta:</strong> <span style="color: ${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${Utils.formatCurrency(netProfit)}</span></p>
            `;
            
            costDetailsElement.innerHTML = detailsHTML;
        }
    },

    getExpensesByDate(date) {
        const targetDate = date.includes('/') ? this.convertDateFormat(date) : date;
        return this.expenses.filter(expense => {
            const expenseDate = expense.date.includes('/') ? this.convertDateFormat(expense.date) : expense.date;
            return expenseDate === targetDate;
        });
    },

    convertDateFormat(date) {
        if (date.includes('-') && date.split('-')[0].length === 4) {
            return date;
        }
        const parts = date.split('/');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        return date;
    },

    updateExpensesList(date = null) {
        const expensesList = document.getElementById('expenses-list');
        if (!expensesList) return;

        expensesList.innerHTML = '';

        const targetDate = date || Utils.getTodayDate();
        const targetExpenses = this.getExpensesByDate(targetDate);

        if (targetExpenses.length === 0) {
            expensesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-money-bill-wave empty-state-icon"></i>
                    <p>No hay gastos registrados para ${targetDate}</p>
                </div>
            `;
            return;
        }

        const sortedExpenses = [...targetExpenses].sort((a, b) => b.timestamp - a.timestamp);

        sortedExpenses.forEach(expense => {
            const li = document.createElement('li');
            li.className = 'sale-item';
            li.innerHTML = `
                <div class="sale-info">
                    <h3><i class="fas fa-receipt"></i> ${expense.description}</h3>
                    <p class="sale-details"><i class="fas fa-tag"></i> ${expense.category} - ${expense.time}</p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 5px; align-items: flex-end;">
                    <div class="sale-amount" style="color: var(--danger);">-${Utils.formatCurrency(expense.amount)}</div>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn btn-outline" onclick="App.editExpense(${expense.id})" 
                                style="padding: 5px 10px; font-size: 0.8rem;">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger" onclick="App.deleteExpense(${expense.id})" 
                                style="padding: 5px 10px; font-size: 0.8rem;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            expensesList.appendChild(li);
        });
    },

    async saveExpenses() {
        if (DB.db) {
            for (const expense of this.expenses) {
                await DB.set('expenses', expense);
            }
        } else {
            localStorage.setItem('polloExpenses', JSON.stringify(this.expenses));
        }
    },

    async loadExpenses() {
        if (DB.db) {
            this.expenses = await DB.getAll('expenses');
        } else {
            const saved = localStorage.getItem('polloExpenses');
            if (saved) {
                this.expenses = JSON.parse(saved);
            }
        }
    },

    getNetProfitByDate(date) {
        const sales = SalesModule.getSalesByDate(date);
        const expenses = this.getExpensesByDate(date);
        
        // Calcular ganancia bruta: (PVP - Costo Merma) × Libras
        let grossProfit = 0;
        sales.forEach(sale => {
            const costPerLb = sale.costPerLb || 0;
            const profitPerLb = sale.price - costPerLb;
            grossProfit += profitPerLb * sale.weight;
        });
        
        const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
        const netProfit = grossProfit - totalExpenses;
        return parseFloat(netProfit.toFixed(2));
    }
};

const DiezmosModule = {
    config: { diezmoPercent: 10, ofrendaPercent: 5 },
    records: [],

    async init() {
        await this.loadConfig();
        await this.loadRecords();
        await this.calcularDiezmosPendientes();
        // NUEVO: Recalcular todos los diezmos al inicializar
        await this.forzarRecalculoCompleto();
    },

    // NUEVO: Calcular automáticamente diezmos de días anteriores
    async calcularDiezmosPendientes() {
        // Obtener todas las fechas con ventas
        const fechasConVentas = [...new Set(SalesModule.sales.map(s => s.date))];
        let registrosCreados = 0;
        
        for (const fecha of fechasConVentas) {
            // Verificar si ya existe registro para esta fecha
            const existeRegistro = this.records.some(r => r.date === fecha);
            
            if (!existeRegistro) {
                // Calcular ganancia neta para esta fecha
                const netProfit = AccountingModule.getNetProfitByDate(fecha);
                
                // Solo crear registro si hay ganancia positiva
                if (netProfit > 0) {
                    const diezmo = (netProfit * this.config.diezmoPercent) / 100;
                    const ofrenda = (netProfit * this.config.ofrendaPercent) / 100;
                    
                    const record = {
                        id: Date.now() + registrosCreados, // Evitar IDs duplicados
                        date: fecha,
                        netProfit: Number(netProfit.toFixed(2)),
                        diezmo: Number(diezmo.toFixed(2)),
                        ofrenda: Number(ofrenda.toFixed(2)),
                        total: Number((diezmo + ofrenda).toFixed(2)),
                        diezmoPercent: this.config.diezmoPercent,
                        ofrendaPercent: this.config.ofrendaPercent,
                        timestamp: Date.now(),
                        autoCalculated: true // Marcar como calculado automáticamente
                    };
                    
                    this.records.push(record);
                    registrosCreados++;
                }
            }
        }
        
        if (registrosCreados > 0) {
            await this.saveRecords();
            console.log(`✅ Se calcularon automáticamente ${registrosCreados} registros de diezmos pendientes`);
        }
    },

    getPreview(date = Utils.getTodayDate()) {
        // Prevenir recursión infinita
        if (this._calculatingPreview) {
            return {
                netProfit: 0,
                diezmo: 0,
                ofrenda: 0,
                total: 0,
                diezmoPercent: this.config.diezmoPercent,
                ofrendaPercent: this.config.ofrendaPercent
            };
        }
        
        this._calculatingPreview = true;
        
        try {
            // Obtener ganancia neta desde AccountingModule
            const netProfit = AccountingModule.getNetProfitByDate(date);
            
            // Calcular diezmos y ofrendas SOLO si hay ganancia positiva
            const diezmo = netProfit > 0 ? (netProfit * this.config.diezmoPercent) / 100 : 0;
            const ofrenda = netProfit > 0 ? (netProfit * this.config.ofrendaPercent) / 100 : 0;
            
            return {
                netProfit: Number(netProfit.toFixed(2)) || 0,
                diezmo: Number(diezmo.toFixed(2)) || 0,
                ofrenda: Number(ofrenda.toFixed(2)) || 0,
                total: Number((diezmo + ofrenda).toFixed(2)) || 0,
                diezmoPercent: this.config.diezmoPercent,
                ofrendaPercent: this.config.ofrendaPercent
            };
        } finally {
            this._calculatingPreview = false;
        }
    },

    async saveDailyRecord(date = Utils.getTodayDate()) {
        const preview = this.getPreview(date);
        
        // Solo guardar si hay ganancia neta positiva
        if (preview.netProfit <= 0) {
            Utils.showNotification('No hay ganancia neta para calcular diezmos', 'warning', 3000);
            return null;
        }
        
        const existing = this.records.findIndex(r => r.date === date);
        
        const record = {
            id: existing > -1 ? this.records[existing].id : Date.now(),
            date,
            ...preview,
            timestamp: Date.now()
        };

        if (existing > -1) {
            this.records[existing] = record;
        } else {
            this.records.push(record);
        }

        await this.saveRecords();
        
        // Notificar cálculo de diezmos (sin bloquear si falla)
        if (typeof NotificationsModule !== 'undefined') {
            try {
                NotificationsModule.notifyDiezmosCalculated(record.total).catch(err => {
                    console.warn('No se pudo enviar notificación:', err);
                });
            } catch (err) {
                console.warn('Error al notificar:', err);
            }
        }
        
        return record;
    },

    getRecordsByDateRange(startDate, endDate) {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();
        return this.records.filter(r => {
            const recordDate = new Date(r.date).getTime();
            return recordDate >= start && recordDate <= end;
        });
    },

    updateConfig(diezmoPercent, ofrendaPercent) {
        this.config.diezmoPercent = parseFloat(diezmoPercent);
        this.config.ofrendaPercent = parseFloat(ofrendaPercent);
        this.saveConfig();
        // Recalcular todos los registros existentes con los nuevos porcentajes
        this.recalcularTodosLosRegistros();
    },

    // NUEVO: Recalcular todos los registros con los nuevos porcentajes
    async recalcularTodosLosRegistros() {
        let registrosActualizados = 0;
        
        for (const record of this.records) {
            const netProfit = record.netProfit;
            if (netProfit > 0) {
                const nuevoDiezmo = (netProfit * this.config.diezmoPercent) / 100;
                const nuevaOfrenda = (netProfit * this.config.ofrendaPercent) / 100;
                
                record.diezmo = Number(nuevoDiezmo.toFixed(2));
                record.ofrenda = Number(nuevaOfrenda.toFixed(2));
                record.total = Number((nuevoDiezmo + nuevaOfrenda).toFixed(2));
                record.diezmoPercent = this.config.diezmoPercent;
                record.ofrendaPercent = this.config.ofrendaPercent;
                record.lastUpdated = Date.now();
                
                registrosActualizados++;
            }
        }
        
        if (registrosActualizados > 0) {
            await this.saveRecords();
            Utils.showNotification(`✅ Se recalcularon ${registrosActualizados} registros con los nuevos porcentajes`, 'success', 3000);
        }
    },

    async saveConfig() {
        if (DB.db) {
            await DB.set('config', { key: 'diezmos-config', value: this.config });
        }
        localStorage.setItem('polloDiezmosConfig', JSON.stringify(this.config));
    },

    async loadConfig() {
        if (DB.db) {
            const saved = await DB.get('config', 'diezmos-config');
            if (saved?.value) this.config = saved.value;
        }
        const savedLocal = localStorage.getItem('polloDiezmosConfig');
        if (savedLocal) this.config = JSON.parse(savedLocal);
    },

    async saveRecords() {
        if (DB.db) {
            await DB.set('config', { key: 'diezmos-records', value: this.records });
        }
        localStorage.setItem('polloDiezmosRecords', JSON.stringify(this.records));
    },

    async loadRecords() {
        if (DB.db) {
            const saved = await DB.get('config', 'diezmos-records');
            if (saved?.value) this.records = saved.value;
        }
        const savedLocal = localStorage.getItem('polloDiezmosRecords');
        if (savedLocal) this.records = JSON.parse(savedLocal);
    },

    // NUEVO: Función para forzar recálculo de todos los diezmos pendientes
    async forzarRecalculoCompleto() {
        const fechasConVentas = [...new Set(SalesModule.sales.map(s => s.date))];
        let registrosCreados = 0;
        let registrosActualizados = 0;
        
        for (const fecha of fechasConVentas) {
            const netProfit = AccountingModule.getNetProfitByDate(fecha);
            
            if (netProfit > 0) {
                const diezmo = (netProfit * this.config.diezmoPercent) / 100;
                const ofrenda = (netProfit * this.config.ofrendaPercent) / 100;
                
                const existingIndex = this.records.findIndex(r => r.date === fecha);
                
                const record = {
                    id: existingIndex > -1 ? this.records[existingIndex].id : Date.now() + registrosCreados,
                    date: fecha,
                    netProfit: Number(netProfit.toFixed(2)),
                    diezmo: Number(diezmo.toFixed(2)),
                    ofrenda: Number(ofrenda.toFixed(2)),
                    total: Number((diezmo + ofrenda).toFixed(2)),
                    diezmoPercent: this.config.diezmoPercent,
                    ofrendaPercent: this.config.ofrendaPercent,
                    timestamp: existingIndex > -1 ? this.records[existingIndex].timestamp : Date.now(),
                    lastUpdated: Date.now(),
                    autoCalculated: existingIndex === -1 // Solo marcar como auto si es nuevo
                };
                
                if (existingIndex > -1) {
                    this.records[existingIndex] = record;
                    registrosActualizados++;
                } else {
                    this.records.push(record);
                    registrosCreados++;
                }
            }
        }
        
        if (registrosCreados > 0 || registrosActualizados > 0) {
            await this.saveRecords();
            const mensaje = `✅ Recálculo completo: ${registrosCreados} nuevos registros, ${registrosActualizados} actualizados`;
            Utils.showNotification(mensaje, 'success', 4000);
            return { creados: registrosCreados, actualizados: registrosActualizados };
        }
        
        return { creados: 0, actualizados: 0 };
    }
};

const ConfigModule = {
    currentConfig: {
        appName: 'GallOli',
        appShortName: 'GallOli',
        theme: 'default',
        logoType: 'emoji',
        logoEmoji: '🐔',
        logoImage: null,
        colors: {
            primary: '#4CAF50',
            'primary-dark': '#388E3C',
            secondary: '#FF9800',
            light: '#f5f5f5',
            dark: '#333',
            gray: '#757575',
            white: '#ffffff',
            danger: '#f44336',
            success: '#4CAF50',
            warning: '#FF9800'
        }
    },
    themes: {
        default: { name: 'Verde Clásico', colors: { primary: '#4CAF50', secondary: '#FF9800', light: '#f5f5f5' } },
        blue: { name: 'Azul Profesional', colors: { primary: '#2196F3', secondary: '#FF5722', light: '#E3F2FD' } },
        purple: { name: 'Morado Moderno', colors: { primary: '#9C27B0', secondary: '#FFC107', light: '#F3E5F5' } },
        red: { name: 'Rojo Intenso', colors: { primary: '#F44336', secondary: '#4CAF50', light: '#FFEBEE' } }
    },
    emojis: ['🐔', '🍗', '🐓', '🥚', '🍖', '🦃', '🐥', '🍴'],

    async init() {
        await this.loadConfig();
        this.applyConfig();
    },

    setTheme(themeName) {
        if (this.themes[themeName]) {
            this.currentConfig.theme = themeName;
            Object.assign(this.currentConfig.colors, this.themes[themeName].colors);
            this.applyConfig();
            this.saveConfig();
        }
    },

    setAppName(name) {
        this.currentConfig.appName = name;
        this.applyConfig();
        this.saveConfig();
    },

    setLogoEmoji(emoji) {
        this.currentConfig.logoType = 'emoji';
        this.currentConfig.logoEmoji = emoji;
        this.currentConfig.logoImage = null;
        this.applyLogo();
        this.saveConfig();
    },

    applyConfig() {
        Object.entries(this.currentConfig.colors).forEach(([key, value]) => {
            document.documentElement.style.setProperty(`--${key}`, value);
        });
        this.applyLogo();
        this.updateDynamicManifest();
    },

    applyLogo() {
        const logoElements = document.querySelectorAll('.logo-icon, .sidebar-logo');
        logoElements.forEach(el => {
            if (this.currentConfig.logoType === 'emoji') {
                el.textContent = this.currentConfig.logoEmoji;
                el.className = el.className.replace('logo-image-custom', 'logo-emoji');
            } else if (this.currentConfig.logoImage) {
                el.innerHTML = `<img src="${this.currentConfig.logoImage}" class="logo-image-custom" alt="Logo">`;
            }
        });
        
        const titleElements = document.querySelectorAll('.logo h1, .sidebar-header h2');
        titleElements.forEach(el => el.textContent = this.currentConfig.appName);
    },

    updateDynamicManifest() {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'UPDATE_CONFIG',
                config: this.currentConfig
            });
        }
    },

    saveConfig() {
        // Guardar en localStorage (rápido)
        localStorage.setItem('polloConfig', JSON.stringify(this.currentConfig));
        
        // Guardar en IndexedDB (persistente)
        if (DB.db) {
            DB.set('config', { key: 'app-config', value: this.currentConfig });
        }
        
        this.applyConfig();
        this.updateDynamicManifest();
        if (typeof Utils !== 'undefined') {
            Utils.showNotification('✅ Configuración guardada correctamente', 'success', 3000);
        }
    },

    async loadConfig() {
        // Intentar cargar desde IndexedDB primero (más confiable)
        if (DB.db) {
            try {
                const saved = await DB.get('config', 'app-config');
                if (saved?.value) {
                    this.currentConfig = { ...this.currentConfig, ...saved.value };
                    // Sincronizar con localStorage
                    localStorage.setItem('polloConfig', JSON.stringify(this.currentConfig));
                    return;
                }
            } catch (e) {
                console.warn('Error cargando config desde IndexedDB:', e);
            }
        }
        
        // Fallback a localStorage
        const saved = localStorage.getItem('polloConfig');
        if (saved) {
            try {
                this.currentConfig = { ...this.currentConfig, ...JSON.parse(saved) };
                // Guardar en IndexedDB para próxima vez
                if (DB.db) {
                    DB.set('config', { key: 'app-config', value: this.currentConfig });
                }
            } catch (e) {
                console.error('Error loading config:', e);
            }
        }
    },

    async resetToDefault() {
        const confirmed = await Utils.showDangerConfirm(
            'Se restaurará la configuración por defecto y se recargará la aplicación.',
            '¿Restaurar Configuración?',
            'Restaurar'
        );
        
        if (confirmed) {
            localStorage.removeItem('polloConfig');
            location.reload();
        }
    },

    exportConfig() {
        const dataStr = JSON.stringify(this.currentConfig, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pollos-config-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    async importConfig(file) {
        const text = await file.text();
        const config = JSON.parse(text);
        this.currentConfig = { ...this.currentConfig, ...config };
        this.saveConfig();
        this.applyConfig();
    }
};

// Módulo de Historial de Pagos - Registro permanente de todos los pagos
const PaymentHistoryModule = {
    // YA NO se usa payments[] - se construye dinámicamente desde SalesModule.sales
    
    // Obtener todos los pagos (construido dinámicamente desde sale.paymentHistory)
    getAllPayments() {
        const allPayments = [];
        
        // Recorrer todas las ventas y extraer sus pagos
        if (typeof SalesModule !== 'undefined' && SalesModule.sales) {
            SalesModule.sales.forEach(sale => {
                if (sale.paymentHistory && sale.paymentHistory.length > 0) {
                    const client = ClientsModule.getClientById(sale.clientId);
                    const clientName = client ? client.name : 'Cliente Desconocido';
                    
                    sale.paymentHistory.forEach(payment => {
                        allPayments.push({
                            id: payment.timestamp || Date.now(),
                            saleId: sale.id,
                            clientId: sale.clientId,
                            clientName: clientName,
                            amount: payment.amount,
                            date: payment.date,
                            time: payment.time,
                            timestamp: payment.timestamp || new Date(payment.date).getTime(),
                            saleDetails: {
                                totalAmount: sale.totalAmount || sale.total,
                                weight: sale.weight,
                                quantity: sale.quantity,
                                saleDate: sale.date
                            }
                        });
                    });
                }
            });
        }
        
        return allPayments.sort((a, b) => b.timestamp - a.timestamp);
    },

    // Obtener pagos por cliente
    getPaymentsByClient(clientId) {
        return this.getAllPayments()
            .filter(p => p.clientId === clientId);
    },

    // Obtener pagos por rango de fechas
    getPaymentsByDateRange(startDate, endDate) {
        return this.getAllPayments()
            .filter(p => p.date >= startDate && p.date <= endDate);
    },

    // Obtener pagos por cliente y rango de fechas
    getPaymentsByClientAndDateRange(clientId, startDate, endDate) {
        return this.getAllPayments()
            .filter(p => p.clientId === clientId && p.date >= startDate && p.date <= endDate);
    },

    // Obtener total pagado por cliente
    getTotalPaidByClient(clientId) {
        return this.getPaymentsByClient(clientId)
            .reduce((sum, p) => sum + p.amount, 0);
    },

    // Obtener estadísticas de pagos
    getStats() {
        const allPayments = this.getAllPayments();
        const totalPayments = allPayments.length;
        const totalAmount = allPayments.reduce((sum, p) => sum + p.amount, 0);
        const uniqueClients = [...new Set(allPayments.map(p => p.clientId))].length;
        
        return {
            totalPayments,
            totalAmount,
            uniqueClients,
            averagePayment: totalPayments > 0 ? totalAmount / totalPayments : 0
        };
    },

    
    // YA NO se necesitan estas funciones - los datos vienen de sale.paymentHistory
    async init() {
        // No hacer nada - los datos se construyen dinámicamente
        console.log('✅ PaymentHistoryModule inicializado (modo dinámico desde ventas)');
    },

    exportPayments(clientId = null) {
        const payments = clientId ? this.getPaymentsByClient(clientId) : this.getAllPayments();
        const dataStr = JSON.stringify(payments, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `historial_pagos_${clientId || 'todos'}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
};

const RutasModule = {
    actualizarRutaAutomatica() {},
    actualizarRutaPorCambioPedido() {},
    optimizarRuta(clientes) { return clientes; }
};






const BackupModule = {
    telegramBotToken: null,
    telegramChatId: null,
    autoBackupEnabled: false,
    lastAutoBackup: null,

    async init() {
        await this.loadTelegramConfig();
        this.loadAutoBackupConfig();
    },

    async createBackup() {
        const data = {
            // Datos principales
            clients: ClientsModule.clients || [],
            sales: SalesModule.sales || [],
            orders: OrdersModule.orders || [],
            expenses: AccountingModule.expenses || [],
            
            // Merma completa
            mermaPrices: MermaModule.dailyPrices || [],
            mermaRecords: MermaModule.mermaRecords || [],
            
            // Diezmos completos
            diezmosRecords: DiezmosModule.records || [],
            diezmosConfig: DiezmosModule.config || { diezmoPercent: 10, ofrendaPercent: 5 },
            
            // Historial de pagos permanente
            paymentHistory: PaymentHistoryModule.payments || [],
            
            // Créditos (incluido en sales pero separado para claridad)
            creditosData: {
                creditSales: SalesModule.sales.filter(s => !s.isPaid) || [],
                paymentHistory: SalesModule.sales.filter(s => s.paymentHistory && s.paymentHistory.length > 0) || []
            },
            
            // Configuración completa de la app
            config: ConfigModule.currentConfig || {},
            
            // Configuración de Telegram
            telegramConfig: {
                botToken: BackupModule.telegramBotToken || null,
                chatId: BackupModule.telegramChatId || null
            },
            
            // Metadatos del backup
            metadata: {
                exportDate: Utils.formatDateTime(),
                version: '2.1',
                totalClients: ClientsModule.clients.length,
                totalSales: SalesModule.sales.length,
                totalOrders: OrdersModule.orders.length,
                totalExpenses: AccountingModule.expenses.length,
                totalPayments: PaymentHistoryModule.getAllPayments().length,
                appName: ConfigModule.currentConfig.appName || 'GallOli'
            }
        };
        
        const dataStr = JSON.stringify(data, null, 2);
        const filename = `pollos_backup_${Utils.formatDate()}_${Date.now()}.json`;
        
        localStorage.setItem('lastBackup', new Date().toISOString());
        
        // Notificar backup creado (sin bloquear si falla)
        if (typeof NotificationsModule !== 'undefined') {
            try {
                NotificationsModule.notifyBackupCreated().catch(err => {
                    console.warn('No se pudo enviar notificación:', err);
                });
            } catch (err) {
                console.warn('Error al notificar:', err);
            }
        }
        
        return { data: dataStr, filename };
    },

    async importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    Utils.showLoading(true);
                    const data = JSON.parse(e.target.result);
                    
                    // Cargar datos en memoria Y guardar en IndexedDB
                    if (data.clients) {
                        ClientsModule.clients = data.clients;
                        await ClientsModule.saveClients();
                    }
                    
                    if (data.sales) {
                        SalesModule.sales = data.sales;
                        await SalesModule.saveSales();
                    }
                    
                    if (data.orders) {
                        OrdersModule.orders = data.orders;
                        await OrdersModule.saveOrders();
                    }
                    
                    if (data.expenses) {
                        AccountingModule.expenses = data.expenses;
                        await AccountingModule.saveExpenses();
                    }
                    
                    if (data.mermaPrices) {
                        MermaModule.dailyPrices = data.mermaPrices;
                        await MermaModule.saveDailyPrices();
                    }
                    
                    if (data.mermaRecords) {
                        MermaModule.mermaRecords = data.mermaRecords;
                        await MermaModule.saveMermaRecords();
                    }
                    
                    if (data.diezmosRecords) {
                        DiezmosModule.records = data.diezmosRecords;
                        await DiezmosModule.saveRecords();
                    }
                    
                    if (data.diezmosConfig) {
                        DiezmosModule.config = data.diezmosConfig;
                        await DiezmosModule.saveConfig();
                    }
                    
                    // Restaurar historial de pagos
                    if (data.paymentHistory) {
                        PaymentHistoryModule.payments = data.paymentHistory;
                        await PaymentHistoryModule.savePayments();
                    }
                    
                    if (data.config) {
                        ConfigModule.currentConfig = data.config;
                        ConfigModule.saveConfig();
                    }
                    
                    // Restaurar configuración de Telegram
                    if (data.telegramConfig) {
                        if (data.telegramConfig.botToken) {
                            BackupModule.telegramBotToken = data.telegramConfig.botToken;
                            localStorage.setItem('telegramBotToken', data.telegramConfig.botToken);
                        }
                        if (data.telegramConfig.chatId) {
                            BackupModule.telegramChatId = data.telegramConfig.chatId;
                            localStorage.setItem('telegramChatId', data.telegramConfig.chatId);
                        }
                    }
                    
                    Utils.showLoading(false);
                    Utils.showNotification('✅ Backup restaurado correctamente. Todos los datos han sido recuperados.', 'success', 5000);
                    resolve(true);
                } catch (error) {
                    Utils.showLoading(false);
                    Utils.showNotification('❌ Error al restaurar backup: ' + error.message, 'error', 5000);
                    reject(error);
                }
            };
            reader.onerror = () => {
                Utils.showLoading(false);
                reject(new Error('Error al leer el archivo'));
            };
            reader.readAsText(file);
        });
    },

    getBackupStats() {
        return {
            totalClients: ClientsModule.clients.length,
            totalSales: SalesModule.sales.length,
            totalOrders: OrdersModule.orders.length,
            totalExpenses: AccountingModule.expenses.length,
            totalPrices: MermaModule.dailyPrices.length,
            totalSize: this.calculateSize(),
            lastBackup: localStorage.getItem('lastBackup') || 'Nunca'
        };
    },

    calculateSize() {
        const data = JSON.stringify({
            clients: ClientsModule.clients,
            sales: SalesModule.sales,
            orders: OrdersModule.orders,
            expenses: AccountingModule.expenses
        });
        const bytes = new Blob([data]).size;
        return bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(2) + ' KB';
    },

    initTelegram(token, chatId) {
        this.telegramBotToken = token;
        this.telegramChatId = chatId;
        localStorage.setItem('telegramBotToken', token);
        localStorage.setItem('telegramChatId', chatId);
        
        // Guardar también en AutoBackup para backups automáticos (IndexedDB seguro)
        if (typeof AutoBackup !== 'undefined') {
            AutoBackup.saveCredentials(token, chatId);
        }
    },

    async loadTelegramConfig() {
        // Intentar cargar desde versión encriptada primero
        const encryptedToken = localStorage.getItem('tg_bt');
        const encryptedChatId = localStorage.getItem('tg_ci');
        
        if (encryptedToken) {
            this.telegramBotToken = this.decrypt(encryptedToken);
        }
        if (encryptedChatId) {
            this.telegramChatId = this.decrypt(encryptedChatId);
        }
        
        // Si no hay encriptadas, intentar cargar las sin encriptar (para AutoBackup)
        if (!this.telegramBotToken) {
            this.telegramBotToken = localStorage.getItem('telegramBotToken');
        }
        if (!this.telegramChatId) {
            this.telegramChatId = localStorage.getItem('telegramChatId');
        }
        
        // Si aún no hay, intentar cargar desde IndexedDB (AutoBackup)
        if ((!this.telegramBotToken || !this.telegramChatId) && typeof AutoBackup !== 'undefined') {
            try {
                const credentials = await AutoBackup.getCredentials();
                if (credentials.botToken && credentials.chatId) {
                    this.telegramBotToken = credentials.botToken;
                    this.telegramChatId = credentials.chatId;
                    console.log('✅ Credenciales cargadas desde IndexedDB');
                }
            } catch (error) {
                console.error('Error cargando desde IndexedDB:', error);
            }
        }
        
        console.log('📱 Credenciales de Telegram cargadas:', {
            hasToken: !!this.telegramBotToken,
            hasChatId: !!this.telegramChatId
        });
    },

    loadAutoBackupConfig() {
        this.autoBackupEnabled = localStorage.getItem('autoBackupEnabled') === 'true';
        this.lastAutoBackup = localStorage.getItem('lastAutoBackup');
    },

    // Encriptación simple (ofuscación)
    encrypt(text) {
        if (!text) return null;
        return btoa(encodeURIComponent(text).split('').reverse().join(''));
    },

    decrypt(encrypted) {
        if (!encrypted) return null;
        try {
            return decodeURIComponent(atob(encrypted).split('').reverse().join(''));
        } catch (e) {
            return null;
        }
    },

    saveTelegramConfig(token, chatId) {
        if (token) {
            this.telegramBotToken = token;
            localStorage.setItem('tg_bt', this.encrypt(token));
            localStorage.setItem('telegramBotToken', token); // También sin encriptar para compatibilidad
        }
        if (chatId) {
            this.telegramChatId = chatId;
            localStorage.setItem('tg_ci', this.encrypt(chatId));
            localStorage.setItem('telegramChatId', chatId); // También sin encriptar para compatibilidad
        }
        
        // Guardar también en AutoBackup para backups automáticos (IndexedDB seguro)
        if (typeof AutoBackup !== 'undefined' && token && chatId) {
            AutoBackup.saveCredentials(token, chatId);
        }
        
        Utils.showNotification('✅ Configuración de Telegram guardada de forma segura', 'success', 3000);
    },

    clearTelegramConfig() {
        this.telegramBotToken = null;
        this.telegramChatId = null;
        localStorage.removeItem('tg_bt');
        localStorage.removeItem('tg_ci');
        Utils.showNotification('🗑️ Configuración de Telegram eliminada', 'info', 3000);
    },

    async testTelegramConnection() {
        if (!this.telegramBotToken || !this.telegramChatId) {
            throw new Error('Configura token y chat ID primero');
        }

        try {
            const response = await fetch(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.telegramChatId,
                    text: '✅ Conexión exitosa con GallOli\n\n🐔 Tu bot está configurado correctamente y listo para recibir backups automáticos.'
                })
            });

            const result = await response.json();
            
            if (!result.ok) {
                throw new Error(result.description || 'Error desconocido');
            }

            return result;
        } catch (error) {
            throw new Error(`Error de conexión: ${error.message}`);
        }
    },

    async sendToTelegram(backup) {
        if (!this.telegramBotToken || !this.telegramChatId) {
            throw new Error('Configura Telegram primero');
        }

        try {
            const stats = this.getBackupStats();
            const blob = new Blob([backup.data], { type: 'application/json' });
            const formData = new FormData();
            
            formData.append('chat_id', this.telegramChatId);
            formData.append('document', blob, backup.filename);
            formData.append('caption', 
                `📦 Backup Automático GallOli\n` +
                `📅 ${Utils.formatDateTime()}\n\n` +
                `📊 Estadísticas:\n` +
                `👥 Clientes: ${stats.totalClients}\n` +
                `💰 Ventas: ${stats.totalSales}\n` +
                `📋 Pedidos: ${stats.totalOrders}\n` +
                `💸 Gastos: ${stats.totalExpenses}\n` +
                `📦 Tamaño: ${stats.totalSize}`
            );

            const response = await fetch(
                `https://api.telegram.org/bot${this.telegramBotToken}/sendDocument`,
                {
                    method: 'POST',
                    body: formData
                }
            );

            const result = await response.json();
            
            if (!result.ok) {
                throw new Error(result.description || 'Error al enviar backup');
            }

            localStorage.setItem('lastTelegramBackup', new Date().toISOString());
            
            // Notificación de éxito
            if (typeof PushNotifications !== 'undefined') {
                try {
                    PushNotifications.notifyBackupSuccess(backup.filename).catch(err => {
                        console.warn('No se pudo enviar notificación:', err);
                    });
                } catch (err) {
                    console.warn('Error al notificar:', err);
                }
            }
            
            return result;
        } catch (error) {
            // Notificación de error
            if (typeof PushNotifications !== 'undefined') {
                try {
                    PushNotifications.notifyBackupError(error.message).catch(err => {
                        console.warn('No se pudo enviar notificación de error:', err);
                    });
                } catch (err) {
                    console.warn('Error al notificar error:', err);
                }
            }
            
            throw new Error(`Error enviando a Telegram: ${error.message}`);
        }
    },

    async createAndSendBackup() {
        try {
            Utils.showLoading(true);
            const backup = await this.createBackup();
            const result = await this.sendToTelegram(backup);
            
            if (result.ok) {
                Utils.showNotification('✅ Backup enviado a Telegram correctamente', 'success', 5000);
                return true;
            }
            return false;
        } catch (error) {
            Utils.showNotification(`❌ ${error.message}`, 'error', 5000);
            return false;
        } finally {
            Utils.showLoading(false);
        }
    },

    toggleAutoBackup(enabled) {
        this.autoBackupEnabled = enabled;
        localStorage.setItem('autoBackupEnabled', enabled ? 'true' : 'false');
        
        if (enabled) {
            this.scheduleAutoBackup();
            Utils.showNotification('✅ Backup automático activado', 'success', 3000);
        } else {
            Utils.showNotification('⏸️ Backup automático desactivado', 'info', 3000);
        }
    },

    scheduleAutoBackup() {
        if (!this.autoBackupEnabled) return;
        
        // Backup automático cada 24 horas
        const lastBackup = localStorage.getItem('lastTelegramBackup');
        const now = new Date().getTime();
        const dayInMs = 24 * 60 * 60 * 1000;
        
        if (!lastBackup || (now - new Date(lastBackup).getTime()) > dayInMs) {
            this.createAndSendBackup();
        }
    }
};

const ReportsModule = {
    generateSalesReport(startDate, endDate) {
        const sales = SalesModule.getSalesByDateRange(startDate, endDate);
        if (sales.length === 0) return null;

        const totalIncome = sales.reduce((sum, sale) => sum + sale.total, 0);
        const totalWeight = sales.reduce((sum, sale) => sum + sale.weight, 0);
        const totalQuantity = sales.reduce((sum, sale) => sum + sale.quantity, 0);

        return {
            startDate,
            endDate,
            totalSales: sales.length,
            totalIncome,
            totalWeight,
            totalQuantity,
            averageWeight: totalQuantity > 0 ? totalWeight / totalQuantity : 0,
            sales
        };
    },

    generatePDFReport(report, title) {
        Utils.showNotification('Generación de PDF no implementada aún', 'info', 3000);
        return `reporte_${Utils.formatDate()}.pdf`;
    }
};

const MapModule = {
    map: null,
    marker: null,
    selectedLocation: null,

    initMap(lat, lng) {
        const mapElement = document.getElementById('location-map');
        if (!mapElement) return;

        if (this.map) {
            this.map.remove();
        }

        this.map = L.map('location-map').setView([lat, lng], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(this.map);

        this.marker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
        
        this.map.on('click', (e) => {
            this.setLocation(e.latlng.lat, e.latlng.lng);
        });

        this.marker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            this.setLocation(pos.lat, pos.lng);
        });

        this.setLocation(lat, lng);
    },

    setLocation(lat, lng) {
        this.selectedLocation = { lat, lng };
        if (this.marker) {
            this.marker.setLatLng([lat, lng]);
        }
        document.getElementById('map-latitude').value = lat.toFixed(6);
        document.getElementById('map-longitude').value = lng.toFixed(6);
        document.getElementById('map-address').value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    },

    setCurrentLocation(lat, lng) {
        if (this.map) {
            this.map.setView([lat, lng], 13);
            this.setLocation(lat, lng);
        }
    },

    getSelectedLocation() {
        return this.selectedLocation;
    },

    destroyMap() {
        if (this.map) {
            this.map.remove();
            this.map = null;
            this.marker = null;
            this.selectedLocation = null;
        }
    }
};


// ============================================
// MÓDULO: SINCRONIZACIÓN EN LA NUBE
// ============================================
const CloudSyncModule = {
    name: 'cloud-sync',
    
    async load() {
        const isAuthenticated = window.AuthManager.isAuthenticated();
        
        if (!isAuthenticated) {
            return this.renderLoginPage();
        } else {
            return this.renderSyncPage();
        }
    },
    
    renderLoginPage() {
        return `
            <div class="page-header">
                <h1><i class="fas fa-cloud"></i> Sincronización en la Nube</h1>
                <p>Accede a tus datos desde cualquier dispositivo</p>
            </div>
            
            <div class="login-container" style="max-width: 500px; margin: 2rem auto; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 2rem;">
                    <i class="fas fa-cloud" style="font-size: 4rem; color: #2196F3; margin-bottom: 1rem;"></i>
                    <h2 style="margin: 0 0 0.5rem 0;">Bienvenido a GallOli Cloud</h2>
                    <p style="color: #666; margin: 0;">Sincroniza tus datos en tiempo real</p>
                </div>
                
                <!-- Tabs -->
                <div class="login-tabs" style="display: flex; gap: 0.5rem; margin-bottom: 2rem; border-bottom: 2px solid #eee;">
                    <button class="login-tab active" onclick="CloudSyncModule.switchTab('telegram')" style="flex: 1; padding: 1rem; border: none; background: none; cursor: pointer; border-bottom: 3px solid #2196F3; color: #2196F3; font-weight: bold;">
                        <i class="fab fa-telegram"></i> Telegram
                    </button>
                    <button class="login-tab" onclick="CloudSyncModule.switchTab('email')" style="flex: 1; padding: 1rem; border: none; background: none; cursor: pointer; border-bottom: 3px solid transparent; color: #666;">
                        <i class="fas fa-envelope"></i> Email
                    </button>
                </div>
                
                <!-- Telegram Login -->
                <div class="login-form" id="telegram-form">
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Tu ID de Telegram</label>
                        <input type="text" id="telegram-id" placeholder="Ej: 123456789" style="width: 100%; padding: 0.75rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem;">
                        <small style="color: #666; display: block; margin-top: 0.5rem;">
                            <i class="fas fa-info-circle"></i> Envía /start a @userinfobot para obtener tu ID
                        </small>
                    </div>
                    
                    <div id="telegram-code-section" style="display: none; margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Código de Verificación</label>
                        <input type="text" id="telegram-code" placeholder="123456" maxlength="6" style="width: 100%; padding: 0.75rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1.5rem; text-align: center; letter-spacing: 0.5rem;">
                        <small style="color: #666; display: block; margin-top: 0.5rem;">
                            <i class="fas fa-info-circle"></i> Revisa tu Telegram, te enviamos un código
                        </small>
                    </div>
                    
                    <button id="telegram-login-btn" onclick="CloudSyncModule.handleTelegramLogin()" style="width: 100%; padding: 1rem; background: linear-gradient(135deg, #2196F3, #1976D2); color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer;">
                        <i class="fab fa-telegram"></i> Continuar con Telegram
                    </button>
                </div>
                
                <!-- Email Login -->
                <div class="login-form" id="email-form" style="display: none;">
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Email</label>
                        <input type="email" id="email-input" placeholder="tu@email.com" style="width: 100%; padding: 0.75rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem;">
                    </div>
                    
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Contraseña</label>
                        <input type="password" id="password-input" placeholder="••••••••" style="width: 100%; padding: 0.75rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem;">
                    </div>
                    
                    <button onclick="CloudSyncModule.handleEmailLogin()" style="width: 100%; padding: 1rem; background: linear-gradient(135deg, #4CAF50, #388E3C); color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer; margin-bottom: 1rem;">
                        <i class="fas fa-sign-in-alt"></i> Iniciar Sesión
                    </button>
                    
                    <button onclick="CloudSyncModule.handleEmailRegister()" style="width: 100%; padding: 1rem; background: white; color: #4CAF50; border: 2px solid #4CAF50; border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer;">
                        <i class="fas fa-user-plus"></i> Crear Cuenta
                    </button>
                </div>
                
                <div id="login-message" style="margin-top: 1rem; padding: 1rem; border-radius: 8px; display: none;"></div>
            </div>
        `;
    },
    
    renderSyncPage() {
        const user = window.AuthManager.user;
        const business = window.AuthManager.business;
        const isAdmin = ['super_admin', 'admin'].includes(user.role);
        
        return `
            <div class="page-header">
                <h1><i class="fas fa-cloud"></i> Sincronización en la Nube</h1>
                <p>Conectado como ${user.name}</p>
            </div>
            
            <div style="max-width: 1000px; margin: 2rem auto;">
                <!-- Tabs de navegación -->
                <div style="display: flex; gap: 0.5rem; margin-bottom: 2rem; border-bottom: 2px solid #eee; background: white; padding: 1rem; border-radius: 12px 12px 0 0;">
                    <button class="sync-tab active" onclick="CloudSyncModule.switchSyncTab('account')" style="padding: 0.75rem 1.5rem; border: none; background: none; cursor: pointer; border-bottom: 3px solid #2196F3; color: #2196F3; font-weight: bold;">
                        <i class="fas fa-user"></i> Mi Cuenta
                    </button>
                    ${isAdmin ? `
                    <button class="sync-tab" onclick="CloudSyncModule.switchSyncTab('users')" style="padding: 0.75rem 1.5rem; border: none; background: none; cursor: pointer; border-bottom: 3px solid transparent; color: #666;">
                        <i class="fas fa-users"></i> Usuarios
                    </button>
                    <button class="sync-tab" onclick="CloudSyncModule.switchSyncTab('invitations')" style="padding: 0.75rem 1.5rem; border: none; background: none; cursor: pointer; border-bottom: 3px solid transparent; color: #666;">
                        <i class="fas fa-ticket-alt"></i> Invitaciones
                    </button>
                    ` : ''}
                </div>
                
                <!-- Tab: Mi Cuenta -->
                <div class="sync-tab-content" id="account-tab" style="background: white; padding: 2rem; border-radius: 0 0 12px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <div style="text-align: center; margin-bottom: 2rem;">
                        <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #4CAF50, #388E3C); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
                            <i class="fas fa-check" style="font-size: 2.5rem; color: white;"></i>
                        </div>
                        <h2 style="margin: 0 0 0.5rem 0; color: #4CAF50;">¡Conectado!</h2>
                        <p style="color: #666; margin: 0;">${business.name}</p>
                    </div>
                    
                    <div style="display: grid; gap: 1rem; margin-bottom: 2rem;">
                        <div style="padding: 1.5rem; background: #f5f5f5; border-radius: 8px;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <i class="fas fa-user-circle" style="font-size: 2rem; color: #2196F3;"></i>
                                <div style="flex: 1;">
                                    <div style="font-weight: bold;">${user.name}</div>
                                    <div style="color: #666; font-size: 0.9rem;">${this.getRoleLabel(user.role)}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div style="padding: 1.5rem; background: #f5f5f5; border-radius: 8px;">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <i class="fas fa-sync" style="font-size: 2rem; color: #4CAF50;"></i>
                                <div style="flex: 1;">
                                    <div style="font-weight: bold;">Sincronización Automática</div>
                                    <div style="color: #666; font-size: 0.9rem;">Activa - Tiempo real</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: grid; gap: 1rem;">
                        <button onclick="CloudSyncModule.syncNow()" style="padding: 1rem; background: linear-gradient(135deg, #2196F3, #1976D2); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
                            <i class="fas fa-sync"></i> Sincronizar Ahora
                        </button>
                        
                        <button onclick="CloudSyncModule.logout()" style="padding: 1rem; background: white; color: #f44336; border: 2px solid #f44336; border-radius: 8px; font-weight: bold; cursor: pointer;">
                            <i class="fas fa-sign-out-alt"></i> Cerrar Sesión
                        </button>
                    </div>
                </div>
                
                ${isAdmin ? `
                <!-- Tab: Usuarios -->
                <div class="sync-tab-content" id="users-tab" style="display: none; background: white; padding: 2rem; border-radius: 0 0 12px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                        <h2 style="margin: 0;"><i class="fas fa-users"></i> Usuarios del Negocio</h2>
                        <button onclick="CloudSyncModule.loadUsers()" style="padding: 0.5rem 1rem; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            <i class="fas fa-sync"></i> Recargar
                        </button>
                    </div>
                    <div id="users-list">
                        <div style="text-align: center; padding: 2rem; color: #666;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <p>Cargando usuarios...</p>
                        </div>
                    </div>
                </div>
                
                <!-- Tab: Invitaciones -->
                <div class="sync-tab-content" id="invitations-tab" style="display: none; background: white; padding: 2rem; border-radius: 0 0 12px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                        <h2 style="margin: 0;"><i class="fas fa-ticket-alt"></i> Códigos de Invitación</h2>
                        <button onclick="CloudSyncModule.showCreateInvitation()" style="padding: 0.5rem 1rem; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer;">
                            <i class="fas fa-plus"></i> Crear Código
                        </button>
                    </div>
                    <div id="invitations-list">
                        <div style="text-align: center; padding: 2rem; color: #666;">
                            <p>Crea códigos de invitación para agregar nuevos usuarios</p>
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    },
    
    async init() {
        // AuthManager y SyncEngine ya están inicializados globalmente en App.init()
        // Solo verificar estado
        if (window.AuthManager.isAuthenticated()) {
            console.log('✅ Sesión activa en CloudSync');
        } else {
            console.log('⚠️ No hay sesión en CloudSync');
        }
    },
    
    switchTab(tabName) {
        // Actualizar estilos de tabs
        document.querySelectorAll('.login-tab').forEach(tab => {
            tab.classList.remove('active');
            tab.style.borderBottom = '3px solid transparent';
            tab.style.color = '#666';
        });
        
        const activeTab = event.target.closest('.login-tab');
        if (activeTab) {
            activeTab.classList.add('active');
            activeTab.style.borderBottom = '3px solid #2196F3';
            activeTab.style.color = '#2196F3';
        }
        
        // Mostrar formulario correspondiente
        document.querySelectorAll('.login-form').forEach(form => {
            form.style.display = 'none';
        });
        
        const targetForm = document.getElementById(`${tabName}-form`);
        if (targetForm) {
            targetForm.style.display = 'block';
        }
    },
    
    async handleTelegramLogin() {
        const telegramId = document.getElementById('telegram-id').value.trim();
        const codeSection = document.getElementById('telegram-code-section');
        const codeInput = document.getElementById('telegram-code');
        const btn = document.getElementById('telegram-login-btn');
        
        if (!telegramId) {
            this.showMessage('Por favor ingresa tu ID de Telegram', 'error');
            return;
        }
        
        // Si ya se mostró el código, verificar
        if (codeSection.style.display !== 'none') {
            const code = codeInput.value.trim();
            if (!code || code.length !== 6) {
                this.showMessage('Ingresa el código de 6 dígitos', 'error');
                return;
            }
            
            try {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
                
                const result = await window.AuthManager.verifyTelegramCode(telegramId, code);
                
                if (result.success) {
                    this.showMessage('¡Login exitoso! Recargando...', 'success');
                    setTimeout(() => App.loadPage('cloud-sync'), 1000);
                }
            } catch (error) {
                this.showMessage(error.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fab fa-telegram"></i> Verificar Código';
            }
            return;
        }
        
        // Solicitar código
        try {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando código...';
            
            await window.AuthManager.loginWithTelegram(telegramId);
            
            codeSection.style.display = 'block';
            btn.innerHTML = '<i class="fab fa-telegram"></i> Verificar Código';
            btn.disabled = false;
            codeInput.focus();
            
            this.showMessage('Código enviado a tu Telegram', 'success');
        } catch (error) {
            this.showMessage(error.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fab fa-telegram"></i> Continuar con Telegram';
        }
    },
    
    async handleEmailLogin() {
        const email = document.getElementById('email-input').value.trim();
        const password = document.getElementById('password-input').value;
        
        if (!email || !password) {
            this.showMessage('Completa todos los campos', 'error');
            return;
        }
        
        try {
            const result = await window.AuthManager.loginWithEmail(email, password);
            if (result.success) {
                this.showMessage('¡Login exitoso! Recargando...', 'success');
                setTimeout(() => App.loadPage('cloud-sync'), 1000);
            }
        } catch (error) {
            this.showMessage(error.message, 'error');
        }
    },
    
    async handleEmailRegister() {
        const email = document.getElementById('email-input').value.trim();
        const password = document.getElementById('password-input').value;
        
        if (!email || !password) {
            this.showMessage('Completa todos los campos', 'error');
            return;
        }
        
        const name = prompt('¿Cómo te llamas?');
        if (!name) return;
        
        try {
            const result = await window.AuthManager.registerWithEmail(email, password, name);
            if (result.success) {
                this.showMessage('¡Registro exitoso! Recargando...', 'success');
                setTimeout(() => App.loadPage('cloud-sync'), 1000);
            }
        } catch (error) {
            this.showMessage(error.message, 'error');
        }
    },
    
    async syncNow() {
        try {
            Utils.showLoading(true);
            await window.SyncEngine.smartSync();
            Utils.showLoading(false);
            Utils.showNotification('✅ Sincronización completada', 'success', 3000);
        } catch (error) {
            Utils.showLoading(false);
            Utils.showNotification('❌ Error: ' + error.message, 'error', 3000);
        }
    },
    
    switchSyncTab(tabName) {
        // Actualizar tabs
        document.querySelectorAll('.sync-tab').forEach(tab => {
            tab.classList.remove('active');
            tab.style.borderBottom = '3px solid transparent';
            tab.style.color = '#666';
        });
        
        const activeTab = event.target.closest('.sync-tab');
        if (activeTab) {
            activeTab.classList.add('active');
            activeTab.style.borderBottom = '3px solid #2196F3';
            activeTab.style.color = '#2196F3';
        }
        
        // Mostrar contenido
        document.querySelectorAll('.sync-tab-content').forEach(content => {
            content.style.display = 'none';
        });
        
        const targetContent = document.getElementById(`${tabName}-tab`);
        if (targetContent) {
            targetContent.style.display = 'block';
        }
        
        // Cargar datos si es necesario
        if (tabName === 'users') {
            this.loadUsers();
        }
    },
    
    async loadUsers() {
        const listDiv = document.getElementById('users-list');
        if (!listDiv) return;
        
        listDiv.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i></div>';
        
        try {
            const response = await fetch('https://galloli-sync.ivanbj-96.workers.dev/api/users', {
                headers: window.AuthManager.getAuthHeaders()
            });
            
            if (!response.ok) throw new Error('Error cargando usuarios');
            
            const data = await response.json();
            const users = data.users || [];
            
            if (users.length === 0) {
                listDiv.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">No hay usuarios</div>';
                return;
            }
            
            listDiv.innerHTML = users.map(u => `
                <div style="padding: 1.5rem; background: ${u.is_active ? '#f5f5f5' : '#ffebee'}; border-radius: 8px; margin-bottom: 1rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;">
                                <i class="fas fa-user-circle" style="font-size: 2rem; color: ${u.is_active ? '#2196F3' : '#999'};"></i>
                                <div>
                                    <div style="font-weight: bold; ${u.is_active ? '' : 'text-decoration: line-through;'}">${u.name}</div>
                                    <div style="color: #666; font-size: 0.9rem;">${this.getRoleLabel(u.role)}</div>
                                </div>
                            </div>
                            <div style="font-size: 0.85rem; color: #666;">
                                ${u.email ? `<i class="fas fa-envelope"></i> ${u.email}` : ''}
                                ${u.telegram_username ? `<i class="fab fa-telegram"></i> @${u.telegram_username}` : ''}
                            </div>
                            <div style="font-size: 0.85rem; color: #999; margin-top: 0.25rem;">
                                <i class="fas fa-clock"></i> Última actividad: ${u.last_seen ? new Date(u.last_seen).toLocaleString('es-ES') : 'Nunca'}
                            </div>
                        </div>
                        ${u.id !== window.AuthManager.user.id && u.role !== 'super_admin' ? `
                        <div style="display: flex; gap: 0.5rem;">
                            <button onclick="CloudSyncModule.changeUserRole('${u.id}', '${u.name}')" style="padding: 0.5rem 1rem; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                <i class="fas fa-user-tag"></i> Cambiar Rol
                            </button>
                            ${u.is_active ? `
                            <button onclick="CloudSyncModule.deactivateUser('${u.id}', '${u.name}')" style="padding: 0.5rem 1rem; background: #f44336; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                <i class="fas fa-ban"></i> Desactivar
                            </button>
                            ` : `
                            <button onclick="CloudSyncModule.activateUser('${u.id}', '${u.name}')" style="padding: 0.5rem 1rem; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                <i class="fas fa-check"></i> Activar
                            </button>
                            `}
                        </div>
                        ` : ''}
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            listDiv.innerHTML = `<div style="text-align: center; padding: 2rem; color: #f44336;">Error: ${error.message}</div>`;
        }
    },
    
    async changeUserRole(userId, userName) {
        const roles = [
            { value: 'admin', label: 'Administrador' },
            { value: 'vendedor', label: 'Vendedor' },
            { value: 'repartidor', label: 'Repartidor' },
            { value: 'contador', label: 'Contador' },
            { value: 'viewer', label: 'Visor (Solo lectura)' }
        ];
        
        const roleOptions = roles.map(r => `<option value="${r.value}">${r.label}</option>`).join('');
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3><i class="fas fa-user-tag"></i> Cambiar Rol</h3>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem;">Usuario: <strong>${userName}</strong></p>
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Nuevo Rol:</label>
                    <select id="new-role" style="width: 100%; padding: 0.75rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem; margin-bottom: 1rem;">
                        ${roleOptions}
                    </select>
                    <button onclick="CloudSyncModule.saveUserRole('${userId}')" style="width: 100%; padding: 1rem; background: #2196F3; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
                        <i class="fas fa-save"></i> Guardar Cambios
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },
    
    async saveUserRole(userId) {
        const newRole = document.getElementById('new-role').value;
        
        try {
            const response = await fetch(`https://galloli-sync.ivanbj-96.workers.dev/api/users/${userId}`, {
                method: 'PUT',
                headers: window.AuthManager.getAuthHeaders(),
                body: JSON.stringify({ role: newRole })
            });
            
            if (!response.ok) throw new Error('Error actualizando rol');
            
            document.querySelector('.modal').remove();
            Utils.showNotification('✅ Rol actualizado correctamente', 'success', 3000);
            this.loadUsers();
        } catch (error) {
            Utils.showNotification('❌ Error: ' + error.message, 'error', 3000);
        }
    },
    
    async deactivateUser(userId, userName) {
        if (!confirm(`¿Desactivar a ${userName}?\n\nNo podrá acceder al sistema hasta que lo reactives.`)) return;
        
        try {
            const response = await fetch(`https://galloli-sync.ivanbj-96.workers.dev/api/users/${userId}`, {
                method: 'DELETE',
                headers: window.AuthManager.getAuthHeaders()
            });
            
            if (!response.ok) throw new Error('Error desactivando usuario');
            
            Utils.showNotification('✅ Usuario desactivado', 'success', 3000);
            this.loadUsers();
        } catch (error) {
            Utils.showNotification('❌ Error: ' + error.message, 'error', 3000);
        }
    },
    
    async activateUser(userId, userName) {
        try {
            const response = await fetch(`https://galloli-sync.ivanbj-96.workers.dev/api/users/${userId}`, {
                method: 'PUT',
                headers: window.AuthManager.getAuthHeaders(),
                body: JSON.stringify({ is_active: 1 })
            });
            
            if (!response.ok) throw new Error('Error activando usuario');
            
            Utils.showNotification('✅ Usuario activado', 'success', 3000);
            this.loadUsers();
        } catch (error) {
            Utils.showNotification('❌ Error: ' + error.message, 'error', 3000);
        }
    },
    
    showCreateInvitation() {
        const roles = [
            { value: 'admin', label: 'Administrador' },
            { value: 'vendedor', label: 'Vendedor' },
            { value: 'repartidor', label: 'Repartidor' },
            { value: 'contador', label: 'Contador' },
            { value: 'viewer', label: 'Visor (Solo lectura)' }
        ];
        
        const roleOptions = roles.map(r => `<option value="${r.value}">${r.label}</option>`).join('');
        
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3><i class="fas fa-ticket-alt"></i> Crear Código de Invitación</h3>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Rol del Usuario:</label>
                        <select id="invitation-role" style="width: 100%; padding: 0.75rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem;">
                            ${roleOptions}
                        </select>
                    </div>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Usos Máximos:</label>
                        <input type="number" id="invitation-max-uses" value="1" min="1" max="100" style="width: 100%; padding: 0.75rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem;">
                    </div>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Expira en (horas):</label>
                        <input type="number" id="invitation-expires" value="24" min="1" max="720" style="width: 100%; padding: 0.75rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem;">
                        <small style="color: #666; display: block; margin-top: 0.5rem;">Dejar vacío para que no expire</small>
                    </div>
                    
                    <button onclick="CloudSyncModule.createInvitation()" style="width: 100%; padding: 1rem; background: #4CAF50; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
                        <i class="fas fa-plus"></i> Generar Código
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },
    
    async createInvitation() {
        const role = document.getElementById('invitation-role').value;
        const maxUses = parseInt(document.getElementById('invitation-max-uses').value);
        const expiresIn = parseInt(document.getElementById('invitation-expires').value) || null;
        
        try {
            const response = await fetch('https://galloli-sync.ivanbj-96.workers.dev/api/business/invitation', {
                method: 'POST',
                headers: window.AuthManager.getAuthHeaders(),
                body: JSON.stringify({
                    role,
                    max_uses: maxUses,
                    expires_in_hours: expiresIn
                })
            });
            
            if (!response.ok) throw new Error('Error creando código');
            
            const data = await response.json();
            
            document.querySelector('.modal').remove();
            
            // Mostrar código generado
            const codeModal = document.createElement('div');
            codeModal.className = 'modal active';
            codeModal.innerHTML = `
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header" style="background: #4CAF50; color: white;">
                        <h3><i class="fas fa-check-circle"></i> Código Generado</h3>
                        <button class="close-modal" onclick="this.closest('.modal').remove()" style="color: white;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body" style="text-align: center;">
                        <p style="margin-bottom: 1rem;">Comparte este código con el nuevo usuario:</p>
                        <div style="padding: 1.5rem; background: #f5f5f5; border-radius: 8px; margin-bottom: 1rem;">
                            <div style="font-size: 2rem; font-weight: bold; letter-spacing: 0.5rem; color: #4CAF50;">${data.code}</div>
                        </div>
                        <p style="color: #666; font-size: 0.9rem; margin-bottom: 1rem;">
                            Rol: <strong>${this.getRoleLabel(data.role)}</strong><br>
                            Usos: <strong>${data.max_uses}</strong><br>
                            ${data.expires_at ? `Expira: <strong>${new Date(data.expires_at).toLocaleString('es-ES')}</strong>` : 'Sin expiración'}
                        </p>
                        <button onclick="navigator.clipboard.writeText('${data.code}'); alert('Código copiado')" style="padding: 1rem; background: #2196F3; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; width: 100%;">
                            <i class="fas fa-copy"></i> Copiar Código
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(codeModal);
            
        } catch (error) {
            Utils.showNotification('❌ Error: ' + error.message, 'error', 3000);
        }
    },
    
    getRoleLabel(role) {
        const labels = {
            'super_admin': '👑 Super Administrador',
            'admin': '⚙️ Administrador',
            'vendedor': '💼 Vendedor',
            'repartidor': '🚚 Repartidor',
            'contador': '📊 Contador',
            'viewer': '👁️ Visor'
        };
        return labels[role] || role;
    },
    
    async showInvitationCode() {
        this.showCreateInvitation();
    },
    
    async logout() {
        if (confirm('¿Cerrar sesión?')) {
            await window.AuthManager.logout();
            App.loadPage('cloud-sync');
        }
    },
    
    showMessage(message, type) {
        const msgDiv = document.getElementById('login-message');
        msgDiv.textContent = message;
        msgDiv.style.display = 'block';
        msgDiv.style.background = type === 'error' ? '#ffebee' : '#e8f5e9';
        msgDiv.style.color = type === 'error' ? '#c62828' : '#2e7d32';
        msgDiv.style.border = `2px solid ${type === 'error' ? '#ef5350' : '#66bb6a'}`;
    }
};


// Exportar módulos a window para que SyncEngine pueda interceptarlos
window.ClientsModule = ClientsModule;
window.SalesModule = SalesModule;
window.OrdersModule = OrdersModule;
window.AccountingModule = AccountingModule;
window.MermaModule = MermaModule;
window.DiezmosModule = DiezmosModule;
window.PaymentHistoryModule = PaymentHistoryModule;
window.ConfigModule = ConfigModule;
window.StatsModule = StatsModule;
window.RutasModule = RutasModule;
window.ReportsModule = ReportsModule;
window.MapModule = MapModule;
window.CloudSyncModule = CloudSyncModule;
