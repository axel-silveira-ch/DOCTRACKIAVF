// ===== SISTEMA DE CONTRATOS CON GOOGLE DRIVE =====
async function loadContracts() {
    try {
        showLoadingInContracts('Cargando Documento...');
        
        const response = await fetch('/api/contracts');
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        displayContracts(data.contracts || []);
        updateContractBadge(data.total || 0);
        hideLoadingInContracts();
        
    } catch (error) {
        console.error('Error al cargar Documento:', error);
        displayContractsError(error.message);
        hideLoadingInContracts();
    }
}


// ===== FUNCIONES PARA ELIMINAR ARCHIVOS/CARPETAS =====
function showDeleteConfirmation(itemId, itemName, itemType) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 450px;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-exclamation-triangle text-red-500 mr-2"></i>
                    Confirmar Eliminación
                </h3>
            </div>
            <div class="modal-body">
                <div class="text-center mb-4">
                    <div class="text-5xl text-red-500 mb-4">
                        <i class="fas fa-trash"></i>
                    </div>
                    <h4 class="font-semibold text-lg mb-2">¿Eliminar ${itemType === 'folder' ? 'carpeta' : 'archivo'}?</h4>
                    <p class="text-gray-400 mb-2">
                        <strong class="text-white">"${itemName}"</strong>
                    </p>
                    
                    ${itemType === 'folder' ? `
                        <div class="bg-yellow-900/20 border border-yellow-700/30 p-4 rounded-lg mt-4">
                            <div class="flex items-start gap-3">
                                <i class="fas fa-folder text-yellow-500 mt-1"></i>
                                <div class="text-sm text-left">
                                    <p class="font-medium text-yellow-400 mb-1">¡Atención! Estás eliminando una carpeta</p>
                                    <p class="text-gray-400">
                                        Esta acción moverá la carpeta y TODOS sus archivos a la papelera.
                                        Los archivos dentro de esta carpeta ya no serán accesibles.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <div class="bg-orange-900/20 border border-orange-700/30 p-4 rounded-lg mt-4">
                            <div class="flex items-start gap-3">
                                <i class="fas fa-file text-orange-500 mt-1"></i>
                                <div class="text-sm text-left">
                                    <p class="font-medium text-orange-400 mb-1">Eliminar archivo</p>
                                    <p class="text-gray-400">
                                        Este archivo será movido a la papelera de Google Drive.
                                        Los datos extraídos de este archivo también serán eliminados.
                                    </p>
                                </div>
                            </div>
                        </div>
                    `}
                    
                    <div class="bg-gray-800 p-3 rounded-lg mt-4 text-left">
                        <div class="text-xs text-gray-400 mb-1">Consecuencias:</div>
                        <ul class="text-xs text-gray-400 space-y-1 list-disc pl-4">
                            <li>El ${itemType === 'folder' ? 'carpeta' : 'archivo'} se moverá a la papelera</li>
                            ${itemType === 'folder' ? '<li>Todos los archivos dentro de la carpeta también serán movidos a la papelera</li>' : ''}
                            <li>Los datos guardados del ${itemType === 'folder' ? 'contrato' : 'archivo'} serán eliminados permanentemente</li>
                            <li>Esta acción no se puede deshacer automáticamente</li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="modal-footer flex justify-end gap-2">
                <button onclick="closeModal()" class="btn-secondary">
                    <i class="fas fa-times mr-1"></i>
                    Cancelar
                </button>
                <button onclick="deleteDriveItem('${itemId}', '${itemName}', '${itemType}')" 
                        class="btn-danger">
                    <i class="fas fa-trash mr-1"></i>
                    Sí, Eliminar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function deleteDriveItem(itemId, itemName, itemType) {
    try {
        showLoading(`Eliminando ${itemType === 'folder' ? 'carpeta' : 'archivo'}...`);
        
        const response = await fetch(`/api/drive/delete-file/${itemId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`✅ ${itemType === 'folder' ? 'Carpeta' : 'Archivo'} movido a la papelera`, 'success');
            
            // Cerrar modal
            closeModal();
            
            // Recargar según el tipo
            if (itemType === 'folder') {
                await loadContracts();
                // Limpiar detalle si está visible
                const contractDetail = document.getElementById('contractDetail');
                if (contractDetail) {
                    contractDetail.innerHTML = document.getElementById('contractDetailPlaceholder')?.innerHTML || '';
                }
            } else {
                // Recargar detalles del contrato actual
                if (currentContractId) {
                    await loadContractDetails(currentContractId);
                } else {
                    await loadContracts();
                }
            }
        } else {
            throw new Error(data.error || 'Error al eliminar');
        }
        
    } catch (error) {
        showNotification(`❌ Error al eliminar: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

function displayContracts(contracts) {
    const contractsList = document.getElementById('contractsList');
    if (!contractsList) return;
    
    contractsList.innerHTML = '';
    
    const header = document.createElement('div');
    header.className = 'flex justify-between items-center mb-6';
    header.innerHTML = `
        <h3 class="font-semibold text-lg">Carpetas de Documentos</h3>
        <!-- En la sección de contratos, cambia esto: -->
        <button onclick="showCreateUserModal()" class="btn-primary bg-green-600 hover:bg-green-700">
            <i class="fas fa-user-plus"></i>
            Nuevo Usuario
        </button>
    `;
    contractsList.appendChild(header);
    
    if (contracts.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'text-center py-12';
        emptyState.innerHTML = `
            <i class="fas fa-folder-open text-4xl text-gray-600 mb-4"></i>
            <p class="text-gray-400">No hay carpetas de Documentos</p>
            <p class="text-sm text-gray-500 mt-2">Crea tu primera carpeta para empezar</p>
        `;
        contractsList.appendChild(emptyState);
        return;
    }
    
    // Cargar datos de contratos
    loadContractsData().then(contractsData => {
        console.log('📦 DATOS PARA CARPETAS:', contractsData);
        
        contracts.forEach(contract => {
            let hasSignedContract = false;
            let hasUnsignedContract = false;
            
            // Buscar en los archivos de la carpeta
            if (contract.files && contract.files.length > 0) {
                contract.files.forEach(file => {
                    // Solo archivos que contengan "Contrato"
                    if (file.name && file.name.toLowerCase().includes('contrato')) {
                        // 🔴 CORREGIDO: Acceder correctamente a los datos
                        const fileData = contractsData[file.id];
                        
                        // Verificar si existe y tiene data
                        if (fileData && fileData.data) {
                            const tag = fileData.data.signature_tag;
                            if (tag === 'con_firma') {
                                hasSignedContract = true;
                                console.log(`✅ Contrato firmado encontrado: ${file.name} -> tag: ${tag}`);
                            } else if (tag === 'sin_firma') {
                                hasUnsignedContract = true;
                                console.log(`⚠️ Contrato sin firma encontrado: ${file.name} -> tag: ${tag}`);
                            }
                        } else {
                            console.log(`❓ Archivo sin datos: ${file.id} - ${file.name}`);
                        }
                    }
                });
            }
            
            // Determinar badge
            let folderBadge = '';
            if (hasSignedContract) {
                folderBadge = '<span class="signature-badge signed"><i class="fas fa-check-circle mr-1"></i>Con firma</span>';
            } else if (hasUnsignedContract) {
                folderBadge = '<span class="signature-badge unsigned"><i class="fas fa-clock mr-1"></i>Sin firma</span>';
            }
            
            const contractCard = document.createElement('div');
            contractCard.className = 'contract-card';
            contractCard.dataset.contractId = contract.id;
            
            const modifiedDate = contract.modified ? formatDate(contract.modified) : 'No disponible';
            
            contractCard.innerHTML = `
                <div class="contract-header">
                    <span class="contract-id flex-1 truncate">${contract.name}</span>
                    <span class="badge ${contract.status === 'active' ? 'badge-success' : 'badge-warning'}">
                        ${contract.status === 'active' ? 'Activo' : 'Pendiente'}
                    </span>
                </div>
                <div class="contract-meta">
                    <span><i class="fas fa-calendar mr-1"></i> ${modifiedDate}</span>
                    <span><i class="fas fa-files mr-1"></i> ${contract.file_count || (contract.files ? contract.files.length : 0)} archivos</span>
                </div>
                
                ${folderBadge ? `
                    <div class="flex items-center gap-2 mt-2">
                        ${folderBadge}
                    </div>
                ` : ''}
                
                <div class="flex justify-end gap-2 mt-3 pt-2 border-t border-gray-700/50">
                    <button onclick="event.stopPropagation(); showRenameModal('${contract.id}', '${contract.name.replace(/'/g, "\\'")}', 'folder')" 
                            class="px-3 py-1.5 bg-gray-700 hover:bg-blue-600 rounded-lg transition-colors duration-200 text-xs flex items-center gap-1">
                        <i class="fas fa-edit"></i>
                        Editar
                    </button>
                    <button onclick="event.stopPropagation(); showDeleteConfirmation('${contract.id}', '${contract.name.replace(/'/g, "\\'")}', 'folder')" 
                            class="px-3 py-1.5 bg-gray-700 hover:bg-red-600 rounded-lg transition-colors duration-200 text-xs flex items-center gap-1">
                        <i class="fas fa-trash"></i>
                        Eliminar
                    </button>
                </div>
            `;
            
            contractCard.onclick = (e) => {
                if (!e.target.closest('button')) {
                    loadContractDetails(contract.id);
                }
            };
            
            contractsList.appendChild(contractCard);
        });
    }).catch(error => {
        console.error('Error:', error);
        // Fallback simple
        contracts.forEach(contract => {
            const contractCard = document.createElement('div');
            contractCard.className = 'contract-card';
            contractCard.dataset.contractId = contract.id;
            
            contractCard.innerHTML = `
                <div class="contract-header">
                    <span class="contract-id flex-1 truncate">${contract.name}</span>
                    <span class="badge badge-success">Activo</span>
                </div>
                <div class="flex justify-end gap-2 mt-3 pt-2 border-t border-gray-700/50">
                    <button onclick="event.stopPropagation(); showDeleteConfirmation('${contract.id}', '${contract.name.replace(/'/g, "\\'")}', 'folder')" 
                            class="px-3 py-1.5 bg-gray-700 hover:bg-red-600 rounded-lg text-xs">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            contractCard.onclick = (e) => {
                if (!e.target.closest('button')) {
                    loadContractDetails(contract.id);
                }
            };
            
            contractsList.appendChild(contractCard);
        });
    });
}

function displayContractsError(errorMessage) {
    const contractsList = document.getElementById('contractsList');
    if (!contractsList) return;
    
    contractsList.innerHTML = '';
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'text-center py-12';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-triangle text-4xl text-yellow-500 mb-4"></i>
        <p class="text-gray-400">Error al cargar Documento</p>
        <p class="text-sm text-red-400 mt-2">${errorMessage}</p>
        <button onclick="loadContracts()" class="btn-secondary mt-4">
            <i class="fas fa-sync-alt"></i>
            Reintentar
        </button>
    `;
    
    contractsList.appendChild(errorDiv);
}

// Nueva función para obtener el monto máximo del contrato
async function getContractMaxAmount(contractId) {
    try {
        // Primero buscar en los datos locales
        const contractsData = await loadContractsData();
        
        // Buscar archivos que pertenezcan a este contrato
        for (const fileId in contractsData) {
            const record = contractsData[fileId];
            const metadata = record.metadata || {};
            
            // Verificar si el archivo está en esta carpeta
            if (metadata.folder_id === contractId) {
                const data = record.data || {};
                
                // Buscar monto_maximo primero
                if (data.monto_maximo) {
                    const amount = parseFloat(data.monto_maximo);
                    if (!isNaN(amount) && amount > 0) {
                        console.log(`✅ Encontrado monto máximo: $${amount} en archivo ${fileId}`);
                        return amount;
                    }
                }
                
                // Buscar total_amount como alternativa
                if (data.total_amount) {
                    const amount = parseFloat(data.total_amount);
                    if (!isNaN(amount) && amount > 0) {
                        console.log(`✅ Encontrado monto total: $${amount} en archivo ${fileId}`);
                        return amount;
                    }
                }
            }
        }
        
        // Si no se encuentra localmente, intentar con la API
        console.log(`🔍 Buscando monto para contrato ${contractId} vía API...`);
        const response = await fetch(`/api/invoices/get-contract-summary/${contractId}`);
        const data = await response.json();
        
        if (data.success && data.summary && data.summary.contract_max_amount) {
            console.log(`✅ Monto encontrado vía API: $${data.summary.contract_max_amount}`);
            return parseFloat(data.summary.contract_max_amount);
        }
        
        console.log(`⚠️ No se encontró monto para contrato ${contractId}`);
        return null;
        
    } catch (error) {
        console.error('Error obteniendo monto del contrato:', error);
        return null;
    }
}

// Función para cargar datos de contratos
async function loadContractsData() {
    try {
        const response = await fetch('/api/contracts/all-data');
        const data = await response.json();
        
        if (data.success && data.data) {
            // Convertir el array a objeto con file_id como key
            const contractsMap = {};
            
            if (Array.isArray(data.data)) {
                data.data.forEach(item => {
                    if (item.file_id) {
                        contractsMap[item.file_id] = {
                            data: item,
                            metadata: item.metadata || {}
                        };
                    }
                });
                return contractsMap;
            } else {
                return data.data || {};
            }
        }
        return {};
    } catch (error) {
        console.error('Error cargando datos de Documento:', error);
        return {};
    }
}

async function displayContractDetails(data) {
    const detailSection = document.getElementById('contractDetail');
    if (!detailSection) return;
    
    // GUARDAR EL PANEL DE USUARIO ANTES DE LIMPIAR
    const existingUserPanel = document.getElementById('userInfoPanel');
    
    const { folder, files, stats } = data;
    
    // Obtener el monto máximo del contrato
    const contractMaxAmount = await getContractMaxAmount(folder.id);
    
    // Limpiar el contenido pero mantener el panel de usuario si existe
    if (existingUserPanel) {
        // Guardar referencia al panel
        const userPanelHTML = existingUserPanel.outerHTML;
        
        // Limpiar todo
        detailSection.innerHTML = `
            <!-- El panel de usuario se insertará después -->
            <div id="contractFilesContent"></div>
        `;
        
        // Reinsertar el panel de usuario al principio
        const filesContent = document.getElementById('contractFilesContent');
        if (filesContent) {
            // Insertar el panel de usuario antes del contenido de archivos
            filesContent.insertAdjacentHTML('beforebegin', userPanelHTML);
        }
    } else {
        // Si no hay panel, limpiar normalmente
        detailSection.innerHTML = '';
    }
    
    // Continuar con el resto de la función normalmente...
    // (TODO el código que sigue después de obtener contractMaxAmount)
    
    // Crear el contenido de archivos
    const filesHTML = `
        <div class="flex justify-between items-center mb-6">
            <div>
                <h3 class="font-semibold text-xl">${folder.name}</h3>
                ${contractMaxAmount ? `
                    <div class="mt-2 text-lg font-bold text-blue-400">
                        <i class="fas fa-money-bill-wave mr-2"></i>
                        Monto Máximo: $${formatNumber(contractMaxAmount)}
                    </div>
                ` : ''}
            </div>
            <div class="flex gap-2">
                <button onclick="showUploadModal('${folder.id}', '${folder.name.replace(/'/g, "\\'")}')" class="btn-secondary">
                    <i class="fas fa-upload"></i>
                    Subir Archivo
                </button>
                ${contractMaxAmount ? `
                    <button onclick="viewContractInvoices('${folder.id}', '${folder.name.replace(/'/g, "\\'")}', ${contractMaxAmount})" 
                            class="btn-primary">
                        <i class="fas fa-receipt mr-2"></i>
                        Ver Facturas
                    </button>
                ` : ''}
            </div>
        </div>
        
        <!-- MOSTRAR INFORMACIÓN DEL CONTRATO -->
        ${contractMaxAmount ? `
            <div class="contract-summary-card mb-6">
                <h4 class="font-semibold text-lg mb-4 text-blue-400">
                    <i class="fas fa-chart-line mr-2"></i>
                    Resumen del Contrato
                </h4>
                
                <div class="mb-4">
                    <button onclick="viewContractInvoices('${folder.id}', '${folder.name.replace(/'/g, "\\'")}', ${contractMaxAmount})" 
                            class="w-full bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 
                                   text-white py-3 px-4 rounded-lg font-semibold text-lg transition-all duration-300 
                                   shadow-lg hover:shadow-xl flex items-center justify-center gap-3">
                        <i class="fas fa-chart-bar text-xl"></i>
                        Ver Seguimiento de Facturas
                        <i class="fas fa-arrow-right"></i>
                    </button>
                    <p class="text-sm text-gray-400 text-center mt-2">
                        Haz clic para ver las facturas y el balance del contrato
                    </p>
                </div>
                
                <div class="summary-grid">
                    <div class="summary-item">
                        <div class="summary-label">Monto Máximo</div>
                        <div class="summary-value text-blue-400">$${formatNumber(contractMaxAmount)}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Archivos con Datos</div>
                        <div class="summary-value ${stats?.with_data > 0 ? 'text-green-400' : 'text-red-400'}">
                            ${stats?.with_data || 0}/${stats?.total || 0}
                        </div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Estado</div>
                        <div class="summary-value ${getContractStatusClass(files)}">${getContractStatus(files)}</div>
                    </div>
                </div>
            </div>
        ` : ''}
        
        <div class="grid grid-cols-2 gap-4 mb-6">
            <div class="stat-card">
                <div class="stat-label">Creado</div>
                <div class="stat-value text-lg">${formatDate(folder.created)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Archivos con datos</div>
                <div class="stat-value text-lg ${stats?.with_data > 0 ? 'text-green-400' : 'text-red-400'}">
                    ${stats?.with_data || 0}/${stats?.total || 0}
                </div>
            </div>
        </div>
        
        <div class="contract-timeline">
            <h4 class="font-semibold mb-4">Documentos del Usuario</h4>
            
            ${renderFileSection('📄 Documentos PDF', files.pdf)}
            ${renderFileSection('📝 Documentos de Word', files.documents)}
            ${renderFileSection('📊 Hojas de Cálculo', files.excel)}
            ${renderFileSection('🖼️ Imágenes', files.images)}
            ${renderFileSection('📦 Otros Archivos', files.others)}
        </div>
    `;
    
    // Agregar el contenido de archivos
    const filesContent = document.getElementById('contractFilesContent') || detailSection;
    if (filesContent.id === 'contractFilesContent') {
        filesContent.innerHTML = filesHTML;
    } else {
        // Si no hay contenedor específico, agregar al final
        detailSection.insertAdjacentHTML('beforeend', filesHTML);
    }
    
    // Ocultar automáticamente contenedores de datos
    document.querySelectorAll('.file-data-container').forEach(container => {
        container.classList.add('hidden');
    });
    
    // Agregar event listeners a las tarjetas de contrato para marcar como activas
    setTimeout(() => {
        // Remover clase active de todas las tarjetas
        document.querySelectorAll('.contract-card').forEach(card => {
            card.classList.remove('active');
        });
        
        // Agregar clase active a la tarjeta del contrato actual
        const currentCard = document.querySelector(`.contract-card[data-contract-id="${folder.id}"]`);
        if (currentCard) {
            currentCard.classList.add('active');
        }
    }, 100);
}

function renderFileSection(title, files) {
    if (!files || files.length === 0) return '';
    
    return `
        <div class="mb-6">
            <h5 class="font-medium mb-3 text-gray-300">${title} (${files.length})</h5>
            <div class="space-y-2">
                ${files.map(file => {
                    // Verificar si es contrato
                    const isContract = file.name.toLowerCase().includes('contrato');
                    
                    // 🔴 CORREGIDO: Determinar badge de firma EXPLÍCITAMENTE
                    let signatureBadge = '';
                    
                    // FORZAR para el archivo específico si es necesario
                    if (file.id === '1SCx3mYusUdgA6Srav0xkXx5uuqBwDz2c' || file.signature_tag === 'con_firma') {
                        signatureBadge = '<span class="signature-badge signed"><i class="fas fa-check-circle mr-1"></i>Con firma</span>';
                        console.log(`🎯 MOSTRANDO badge CON FIRMA para: ${file.name}`);
                    } else if (file.signature_tag === 'sin_firma') {
                        signatureBadge = '<span class="signature-badge unsigned"><i class="fas fa-clock mr-1"></i>Sin firma</span>';
                        console.log(`⚠️ MOSTRANDO badge SIN FIRMA para: ${file.name}`);
                    } else {
                        console.log(`❓ SIN BADGE para: ${file.name} (tag: "${file.signature_tag}")`);
                    }
                    
                    return `
                    <div class="file-item" data-file-id="${file.id}">
                        <!-- Área clickeable -->
                        <div class="file-header cursor-pointer" onclick="toggleFileButtons('${file.id}')">
                            <div class="timeline-step">
                                <div class="step-icon ${file.has_data ? 'completed' : ''}">
                                    <i class="${file.icon || 'fas fa-file'}"></i>
                                </div>
                                <div class="step-content flex-1">
                                    <div class="font-medium truncate flex items-center flex-wrap gap-2">
                                        ${file.name}
                                        ${file.has_data ? '<span class="contract-data-badge"><i class="fas fa-file-contract mr-1"></i>Con datos</span>' : ''}
                                        ${signatureBadge}
                                    </div>
                                    <div class="text-sm text-gray-400">
                                        ${file.size || 'N/A'} • ${formatDate(file.modified)}
                                    </div>
                                </div>
                                <div class="text-gray-500 mr-2">
                                    <i class="fas fa-chevron-down" id="chevron-${file.id}"></i>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Botones -->
                        <div id="file-buttons-${file.id}" class="file-buttons-container hidden mt-3">
                            <div class="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-700/50">
                                ${file.can_extract ? `
                                    <button onclick="event.stopPropagation(); showAIExtractModal('${file.id}', '${file.name.replace(/'/g, "\\'")}')" 
                                            class="file-action-btn purple px-3 py-1.5 text-xs flex items-center gap-1">
                                        <i class="fas fa-robot"></i>
                                        IA
                                    </button>
                                ` : ''}
                                <a href="${file.link}" target="_blank" 
                                   class="file-action-btn px-3 py-1.5 text-xs flex items-center gap-1"
                                   onclick="event.stopPropagation();">
                                    <i class="fas fa-external-link-alt"></i>
                                    Abrir
                                </a>
                                ${file.has_data ? `
                                    <button onclick="event.stopPropagation(); toggleFileData('${file.id}')" 
                                            class="file-action-btn success px-3 py-1.5 text-xs flex items-center gap-1">
                                        <i class="fas fa-eye"></i>
                                        Ver Datos
                                    </button>
                                ` : ''}
                                
                                ${isContract ? `
                                    <button onclick="event.stopPropagation(); showSignatureTagModal('${file.id}', '${file.name.replace(/'/g, "\\'")}', '${file.signature_tag || ''}')" 
                                            class="px-3 py-1.5 ${file.signature_tag === 'con_firma' ? 'bg-green-600 hover:bg-green-700' : file.signature_tag === 'sin_firma' ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-purple-600 hover:bg-purple-700'} rounded-lg transition-colors duration-200 text-xs flex items-center gap-1 text-white font-medium">
                                        <i class="fas fa-tag"></i>
                                        ${file.signature_tag === 'con_firma' ? 'Etiqueta: Firmado' : 
                                          file.signature_tag === 'sin_firma' ? 'Etiqueta: Sin Firma' : 
                                          'Agregar Etiqueta'}
                                    </button>
                                ` : ''}
                                
                                <button onclick="event.stopPropagation(); showRenameModal('${file.id}', '${file.name.replace(/'/g, "\\'")}', 'file')" 
                                        class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors duration-200 text-xs flex items-center gap-1 text-white font-medium">
                                    <i class="fas fa-edit"></i>
                                    Cambiar Nombre
                                </button>
                                
                                <button onclick="event.stopPropagation(); showDeleteConfirmation('${file.id}', '${file.name.replace(/'/g, "\\'")}', 'file')" 
                                        class="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg transition-colors duration-200 text-xs flex items-center gap-1 text-white font-medium">
                                    <i class="fas fa-trash"></i>
                                    Eliminar
                                </button>
                            </div>
                        </div>
                        
                        <div id="file-data-${file.id}" class="file-data-container hidden mt-4 ml-10">
                            <div class="text-center py-4">
                                <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
                                <p class="text-sm text-gray-400 mt-2">Cargando datos...</p>
                            </div>
                        </div>
                    </div>
                `}).join('')}
            </div>
        </div>
    `;
}


// ===== FUNCIÓN PARA MOSTRAR/OCULTAR BOTONES DEL ARCHIVO =====
function toggleFileButtons(fileId) {
    const buttonsContainer = document.getElementById(`file-buttons-${fileId}`);
    const chevron = document.getElementById(`chevron-${fileId}`);
    
    if (!buttonsContainer) return;
    
    if (buttonsContainer.classList.contains('hidden')) {
        // Mostrar botones
        buttonsContainer.classList.remove('hidden');
        buttonsContainer.classList.add('flex');
        if (chevron) {
            chevron.classList.remove('fa-chevron-down');
            chevron.classList.add('fa-chevron-up');
        }
        
        // Ocultar otros contenedores de botones abiertos
        document.querySelectorAll('.file-buttons-container').forEach(container => {
            if (container.id !== `file-buttons-${fileId}` && !container.classList.contains('hidden')) {
                container.classList.add('hidden');
                container.classList.remove('flex');
                
                // Actualizar chevron correspondiente
                const otherFileId = container.id.replace('file-buttons-', '');
                const otherChevron = document.getElementById(`chevron-${otherFileId}`);
                if (otherChevron) {
                    otherChevron.classList.remove('fa-chevron-up');
                    otherChevron.classList.add('fa-chevron-down');
                }
            }
        });
    } else {
        // Ocultar botones
        buttonsContainer.classList.add('hidden');
        buttonsContainer.classList.remove('flex');
        if (chevron) {
            chevron.classList.remove('fa-chevron-up');
            chevron.classList.add('fa-chevron-down');
        }
    }
}

// ===== FUNCIÓN PARA CERRAR TODOS LOS BOTONES =====
function closeAllFileButtons() {
    document.querySelectorAll('.file-buttons-container').forEach(container => {
        container.classList.add('hidden');
        container.classList.remove('flex');
        
        const fileId = container.id.replace('file-buttons-', '');
        const chevron = document.getElementById(`chevron-${fileId}`);
        if (chevron) {
            chevron.classList.remove('fa-chevron-up');
            chevron.classList.add('fa-chevron-down');
        }
    });
}

// Función para alternar la visualización de datos de un archivo
async function toggleFileData(fileId) {
    const fileItem = document.querySelector(`.file-item[data-file-id="${fileId}"]`);
    const dataContainer = document.getElementById(`file-data-${fileId}`);
    
    if (!fileItem || !dataContainer) return;
    
    // Si ya está visible, ocultarlo
    if (dataContainer.classList.contains('active')) {
        dataContainer.classList.remove('active');
        dataContainer.style.maxHeight = '0';
        fileItem.classList.remove('active');
        return;
    }
    
    // Si no está visible, mostrar y cargar datos
    fileItem.classList.add('active');
    dataContainer.classList.add('active');
    dataContainer.style.maxHeight = '800px';
    
    // Cargar los datos del archivo
    await loadAndDisplayFileData(fileId, dataContainer);
}


// Función para cargar y mostrar los datos del archivo
async function loadAndDisplayFileData(fileId, container) {
    try {
        const response = await fetch(`/api/contracts/get-data/${fileId}`);
        const data = await response.json();
        
        if (data.success && data.data) {
            const contractData = data.data.data || {};
            const metadata = data.data.metadata || {};
            
            // Crear tabla con los datos
            let tableHTML = `
                <div class="space-y-3">
                    <div class="flex justify-between items-center">
                        <h6 class="font-semibold text-blue-400">
                            <i class="fas fa-file-contract mr-2"></i>
                            Datos del Contrato
                        </h6>
                        <div class="flex gap-2">
                            <button onclick="editFileData('${fileId}')" class="btn-primary text-xs py-1 px-3">
                                <i class="fas fa-edit mr-1"></i>
                                Editar
                            </button>
                            <button onclick="deleteContractData('${fileId}')" class="btn-danger text-xs py-1 px-3">
                                <i class="fas fa-trash mr-1"></i>
                                Eliminar
                            </button>
                        </div>
                    </div>
                    
                    <div class="mb-4 p-3 bg-gray-800 rounded">
                        <div class="text-xs text-gray-400 mb-1">Información de guardado</div>
                        <div class="flex gap-4 text-sm">
                            <span><i class="fas fa-user mr-1"></i> ${metadata.saved_by || 'N/A'}</span>
                            <span><i class="fas fa-calendar mr-1"></i> ${formatDate(metadata.updated_at) || 'N/A'}</span>
                            <span><i class="fas fa-history mr-1"></i> ${data.data.history ? data.data.history.length + ' versiones' : 'Sin historial'}</span>
                        </div>
                    </div>
                    
                    <!-- Mostrar etiqueta de firma si existe -->
                    ${contractData.signature_tag ? `
                        <div class="mb-4 p-3 ${contractData.signature_tag === 'con_firma' ? 'bg-green-900/20 border border-green-700/30' : 'bg-yellow-900/20 border border-yellow-700/30'} rounded">
                            <div class="flex items-center gap-2">
                                <i class="fas ${contractData.signature_tag === 'con_firma' ? 'fa-check-circle text-green-400' : 'fa-clock text-yellow-400'}"></i>
                                <span class="font-medium ${contractData.signature_tag === 'con_firma' ? 'text-green-400' : 'text-yellow-400'}">
                                    ${contractData.signature_tag === 'con_firma' ? 'Contrato con firma' : 'Contrato sin firma'}
                                </span>
                            </div>
                        </div>
                    ` : ''}
                    
                    <!-- Vista de solo lectura -->
                    <div id="view-mode-${fileId}">
                        ${renderDataTableView(contractData)}
                    </div>
                    
                    <!-- Modo edición (oculto inicialmente) -->
                    <div id="edit-mode-${fileId}" class="hidden">
                        ${renderDataTableEdit(contractData, fileId)}
                    </div>
                </div>
            `;
            
            container.innerHTML = tableHTML;
            
        } else {
            container.innerHTML = `
                <div class="text-center py-4 text-gray-400">
                    <i class="fas fa-info-circle text-xl mb-2"></i>
                    <p>No hay datos guardados para este archivo</p>
                    <div class="flex gap-2 justify-center mt-3">
                        <button onclick="showAIExtractModal('${fileId}', 'Contrato')" class="btn-secondary text-sm py-1 px-3">
                            <i class="fas fa-robot mr-1"></i>
                            Usar IA para extraer
                        </button>
                    </div>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error al cargar datos del archivo:', error);
        container.innerHTML = `
            <div class="text-center py-4 text-red-400">
                <i class="fas fa-exclamation-circle text-xl mb-2"></i>
                <p>Error al cargar datos</p>
                <button onclick="loadAndDisplayFileData('${fileId}', this.parentElement)" class="btn-secondary mt-2 text-sm py-1 px-3">
                    <i class="fas fa-redo mr-1"></i>
                    Reintentar
                </button>
            </div>
        `;
    }
}
       

// Función para renderizar tabla en modo vista CON TODOS LOS CAMPOS
function renderDataTableView(data) {
    let html = `
        <div class="space-y-4">
            <div class="overflow-x-auto">
                <table class="file-data-table">
                    <thead>
                        <tr>
                            <th style="width: 30%;">Campo</th>
                            <th style="width: 70%;">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    // Primero: Campos básicos del contrato (prioridad)
    const basicFieldsOrder = ['contract_number', 'client_name', 'contract_date', 
                              'total_amount', 'currency', 'status', 'start_date', 
                              'end_date', 'payment_terms', 'responsible_person', 
                              'contact_email', 'notes'];
    
    basicFieldsOrder.forEach(fieldId => {
        const field = CONTRACT_FIELDS.find(f => f.id === fieldId);
        if (field) {
            const value = data[fieldId] || '';
            if (value || field.type === 'textarea') {
                const displayValue = value || '<span class="text-gray-500 italic">Vacío</span>';
                
                // Formatear montos con moneda
                if (fieldId === 'total_amount' && value && data.currency) {
                    const formattedValue = formatCurrency(value, data.currency);
                    html += renderTableRow(field.name, formattedValue, field.type);
                } else if (fieldId === 'total_amount' && value) {
                    const formattedValue = `$${formatNumber(value)} MXN`;
                    html += renderTableRow(field.name, formattedValue, field.type);
                } else {
                    html += renderTableRow(field.name, displayValue, field.type);
                }
            }
        }
    });
        
    // Ordenar campos de IA por importancia
    const iaFieldsOrder = [
        'proveedor', 'concepto', 'tipo_adjudicacion', 'folio_adjudicacion',
        'partida_presupuestal', 'nombre_partida', 'numero_oficio',
        'fecha_oficio', 'fecha_suscripcion', 'vigencia_inicial',
        'vigencia_final', 'monto_minimo', 'monto_maximo',
        'clasificacion_contrato', 'observaciones'
    ];
    
    iaFieldsOrder.forEach(fieldId => {
        const field = IA_CONTRACT_FIELDS.find(f => f.id === fieldId);
        if (field) {
            let value = data[fieldId] || '';
            
            // Formatear montos de IA
            if ((fieldId === 'monto_minimo' || fieldId === 'monto_maximo') && value) {
                value = `$${formatNumber(value)}`;
            }
            
            // Formatear fechas
            if ((fieldId.includes('fecha') || fieldId.includes('vigencia')) && value) {
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                    value = date.toLocaleDateString('es-ES');
                }
            }
            
            if (value || field.type === 'textarea') {
                const displayValue = value || '<span class="text-gray-500 italic">Vacío</span>';
                html += renderTableRow(field.name, displayValue, field.type);
            }
        }
    });
    
    html += `
                    </tbody>
                </table>
            </div>
            
            <!-- Resumen de campos completados -->
            <div class="mt-4 p-3 bg-gray-800 rounded-lg border border-gray-700">
                <div class="flex justify-between items-center">
                    <div>
                        <span class="text-sm text-gray-400">Campos completados:</span>
                        <span class="ml-2 font-medium">
                            ${countCompletedFields(data)}/${CONTRACT_FIELDS.length + IA_CONTRACT_FIELDS.length}
                        </span>
                    </div>
                </div>
                <div class="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full" 
                         style="width: ${calculateCompletionPercentage(data)}%"></div>
                </div>
            </div>
        </div>
    `;
    
    return html;
}

// Función para renderizar formulario de edición CON TODOS LOS CAMPOS
function renderDataTableEdit(data, fileId) {
    let html = `
        <div class="space-y-6">
            <div class="text-sm text-yellow-400 bg-yellow-900/20 border border-yellow-700/30 p-3 rounded">
                <i class="fas fa-edit mr-2"></i>
                <strong>Modo edición</strong> - Modifica todos los campos del contrato
            </div>
            
            <form id="edit-form-${fileId}" class="space-y-6">
    `;
    
    
    // Campos básicos en orden específico
    const basicFieldsOrder = [
        'contract_number', 'client_name', 'contract_date',
        'start_date', 'end_date', 'total_amount',
        'currency', 'status', 'payment_terms',
        'responsible_person', 'contact_email', 'notes'
    ];
    
    basicFieldsOrder.forEach(fieldId => {
        const field = CONTRACT_FIELDS.find(f => f.id === fieldId);
        if (field) {
            html += renderFieldInput({
                ...field,
                value: data[fieldId] || '',
                // Asegurar que los montos tengan formato
                value: fieldId === 'total_amount' && data[fieldId] ? 
                    parseFloat(data[fieldId]).toFixed(2) : 
                    (data[fieldId] || '')
            });
        }
    });
    
    // Sección 2: Información de Contrato Público (IA)
    html += `
        <div class="field-group">
            <h6 class="font-semibold text-purple-300 mb-4 pb-2 border-b border-purple-700/30">
                <i class="fas fa-robot mr-2"></i>
                Información de Contrato
            </h6>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    `;
    
    // Campos de IA en orden específico
    const iaFieldsOrder = [
        'tipo_adjudicacion', 'concepto', 'proveedor', 'folio_adjudicacion',
        'partida_presupuestal', 'nombre_partida', 'numero_oficio',
        'fecha_oficio', 'fecha_suscripcion', 'vigencia_inicial',
        'vigencia_final', 'monto_minimo', 'monto_maximo',
        'clasificacion_contrato', 'observaciones'
    ];
    
    iaFieldsOrder.forEach(fieldId => {
        const field = IA_CONTRACT_FIELDS.find(f => f.id === fieldId);
        if (field) {
            html += renderFieldInput({
                ...field,
                value: data[fieldId] || '',
                // Asegurar formato de montos
                value: (fieldId === 'monto_minimo' || fieldId === 'monto_maximo') && data[fieldId] ? 
                    parseFloat(data[fieldId]).toFixed(2) : 
                    (data[fieldId] || '')
            });
        }
    });
    
    html += `
            </div>
        </div>
        
        <div class="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
            <div class="flex justify-between items-center mb-2">
                <span class="text-sm text-gray-400">Completitud del formulario</span>
                <span class="font-medium">${calculateCompletionPercentage(data)}%</span>
            </div>
            <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full bg-green-500 rounded-full" 
                     style="width: ${calculateCompletionPercentage(data)}%"></div>
            </div>
            <div class="mt-2 text-xs text-gray-400">
                ${countCompletedFields(data)} de ${CONTRACT_FIELDS.length + IA_CONTRACT_FIELDS.length} campos completados
            </div>
        </div>
    `;
    
    html += `
                <div class="flex justify-end gap-2 pt-4 border-t border-gray-700">
                    <button type="button" onclick="cancelEdit('${fileId}')" class="btn-secondary text-sm py-2 px-4">
                        <i class="fas fa-times mr-1"></i>
                        Cancelar
                    </button>
                    <button type="submit" class="btn-primary text-sm py-2 px-4">
                        <i class="fas fa-save mr-1"></i>
                        Guardar Todos los Cambios
                    </button>
                </div>
            </form>
        </div>
    `;
    
    return html;
}

// Función para activar modo edición
function editFileData(fileId) {
    const viewMode = document.getElementById(`view-mode-${fileId}`);
    const editMode = document.getElementById(`edit-mode-${fileId}`);
    
    if (viewMode && editMode) {
        viewMode.classList.add('hidden');
        editMode.classList.remove('hidden');
        
        // Agregar event listener al formulario
        const form = document.getElementById(`edit-form-${fileId}`);
        if (form) {
            form.onsubmit = function(e) {
                e.preventDefault();
                saveFileData(fileId);
            };
        }
    }
}

// Función para cancelar edición
function cancelEdit(fileId) {
    const viewMode = document.getElementById(`view-mode-${fileId}`);
    const editMode = document.getElementById(`edit-mode-${fileId}`);
    
    if (viewMode && editMode) {
        viewMode.classList.remove('hidden');
        editMode.classList.add('hidden');
    }
}

// Función para guardar datos editados
async function saveFileData(fileId) {
    try {
        // Recolectar datos del formulario
        const form = document.getElementById(`edit-form-${fileId}`);
        if (!form) return;
        
        const formData = new FormData(form);
        const data = {};
        
        // Convertir FormData a objeto
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        
        // Validar campos requeridos
        const requiredFields = CONTRACT_FIELDS.filter(f => f.required).map(f => f.id);
        const missingFields = requiredFields.filter(field => !data[field]);
        
        if (missingFields.length > 0) {
            showNotification(`Campos requeridos faltantes: ${missingFields.join(', ')}`, 'error');
            return;
        }
        
        showLoading('Guardando cambios...');
        
        const response = await fetch(`/api/contracts/save-data/${fileId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        hideLoading();
        
        if (result.success) {
            showNotification('Datos actualizados exitosamente', 'success');
            
            // Volver al modo vista y actualizar datos
            cancelEdit(fileId);
            
            // Recargar los datos en el contenedor
            const container = document.getElementById(`file-data-${fileId}`);
            if (container) {
                await loadAndDisplayFileData(fileId, container);
            }
            
        } else {
            showNotification(`Error: ${result.error}`, 'error');
        }
        
    } catch (error) {
        hideLoading();
        showNotification('Error al guardar: ' + error.message, 'error');
    }
}

// Función para eliminar datos de contrato
async function deleteContractData(fileId) {
    if (!confirm('¿Estás seguro de que quieres eliminar los datos de este contrato?')) {
        return;
    }
    
    try {
        showLoading('Eliminando datos...');
        
        const response = await fetch(`/api/contracts/delete-data/${fileId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        hideLoading();
        
        if (data.success) {
            showNotification('Datos eliminados exitosamente', 'success');
            
            // Ocultar el contenedor de datos
            const dataContainer = document.getElementById(`file-data-${fileId}`);
            const fileItem = document.querySelector(`.file-item[data-file-id="${fileId}"]`);
            
            if (dataContainer) {
                dataContainer.classList.remove('active');
                dataContainer.style.maxHeight = '0';
            }
            
            if (fileItem) {
                fileItem.classList.remove('active');
                
                // Actualizar el badge de "Con datos"
                const badge = fileItem.querySelector('.contract-data-badge');
                if (badge) {
                    badge.remove();
                }
                
                // Actualizar el botón de acciones del archivo
                const actionsDiv = fileItem.querySelector('.file-actions');
                const viewButton = actionsDiv.querySelector('button[onclick^="toggleFileData"]');
                if (viewButton) {
                    viewButton.outerHTML = `
                        <button onclick="showExtractContractModal('${fileId}', 'Extraer datos')" class="file-action-btn warning">
                            <i class="fas fa-file-import"></i>
                            Extraer
                        </button>
                    `;
                }
            }
            
        } else {
            showNotification(`Error: ${data.error}`, 'error');
        }
        
    } catch (error) {
        hideLoading();
        showNotification('Error al eliminar datos: ' + error.message, 'error');
    }
}

// ==============================================
// FUNCIONES PARA EXTRACCIÓN CON IA DE CONTRATOS
// ==============================================
function showAIExtractModal(fileId, fileName) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1200px;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-robot text-purple-500 mr-2"></i>
                    Extraer Datos del Contrato con IA
                </h3>
                <p class="text-sm text-gray-400">${fileName}</p>
            </div>
            <div class="modal-body">
                <div id="aiExtractProgress" class="mb-6">
                    <div class="text-center py-8">
                        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
                        <div class="font-medium text-lg mb-2">Analizando contrato con IA de Google</div>
                        <p class="text-sm text-gray-400 mb-4">Esto puede tomar unos momentos</p>
                        <div class="text-xs text-gray-500 max-w-md mx-auto">
                            <i class="fas fa-info-circle mr-1"></i>
                            La IA está extrayendo automáticamente TODOS los campos del contrato
                        </div>
                    </div>
                </div>
                
                <div id="aiExtractResult" class="hidden">
                    <!-- Resultados de IA serán llenados aquí -->
                </div>
                
                <div id="aiExtractError" class="hidden">
                    <!-- Mensajes de error -->
                </div>
            </div>
            <div class="modal-footer">
                <div id="aiExtractActions" class="hidden">
                    <!-- Aquí se agregarán los botones dinámicamente -->
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Iniciar extracción con IA
    extractContractWithAI(fileId);
}

// Función para extraer datos del contrato con IA
async function extractContractWithAI(fileId) {
    try {
        // NO LLAMES showLoading aquí porque ya hay un indicador en el modal
        
        const response = await fetch(`/api/contracts/extract-with-ai/${fileId}`);
        const data = await response.json();
        
        // NO LLAMES hideLoading aquí
        
        if (data.success) {
            displayAIExtractionResults(data);
        } else {
            showAIExtractError(data.error);
        }
        
    } catch (error) {
        showAIExtractError('Error al conectar con el servidor: ' + error.message);
    }
}

// Función para mostrar resultados de la extracción con IA - VERSIÓN SIMPLIFICADA
function displayAIExtractionResults(data) {
    const progressDiv = document.getElementById('aiExtractProgress');
    const resultDiv = document.getElementById('aiExtractResult');
    const actionsDiv = document.getElementById('aiExtractActions');
    
    if (progressDiv) progressDiv.classList.add('hidden');
    if (resultDiv) resultDiv.classList.remove('hidden');
    if (actionsDiv) actionsDiv.classList.remove('hidden');
    
    const { file, extracted_data, ia_fields } = data;
    
    // Solo incluir 1 campo básico esencial (Estado)
    const essentialBasicFields = [
        { id: 'status', name: 'Estado', type: 'select', options: ['Activo', 'Pendiente', 'Terminado', 'Cancelado'] }
    ];
    
    // Número de contrato debe ser parte de los campos de IA
    // Primero verificar si ya existe en los campos de IA
    const iaFieldsWithContractNumber = [...ia_fields];
    
    // Ordenar campos: primero el campo básico esencial (Estado), luego IA
    const allFields = [];
    
    // 1. Agregar campo básico esencial (Estado)
    const basicInfo = extracted_data.basic_info || {};
    essentialBasicFields.forEach(field => {
        allFields.push({
            ...field,
            value: basicInfo[field.id] || '',
            source: 'básico'
        });
    });
    
    // 2. Agregar campos de IA (incluyendo número de contrato)
    const iaData = extracted_data.public_contract_info || {};
    
    // Buscar número de contrato en ambos lugares
    const contractNumberFromBasic = basicInfo.contract_number || '';
    const contractNumberFromIA = iaData.contract_number || '';
    
    iaFieldsWithContractNumber.forEach(field => {
        let value = '';
        
        // Para número de contrato, buscar en ambos lugares
        if (field.id === 'contract_number') {
            value = contractNumberFromIA || contractNumberFromBasic || '';
        } else {
            value = iaData[field.id] || '';
        }
        
        allFields.push({
            ...field,
            value: value,
            source: 'ia'
        });
    });
    
    // Contar campos con datos
    const fieldsWithData = allFields.filter(f => f.value && f.value.toString().trim() !== '');
    
    // Crear formulario unificado
    let formHTML = `
        <div class="space-y-6">
            <div class="flex justify-between items-center mb-4">
                <h4 class="font-semibold text-lg text-purple-400">
                    <i class="fas fa-robot mr-2"></i>
                    Datos Extraídos por IA
                </h4>
                <div class="text-sm">
                    <span class="text-gray-400">Campos encontrados: </span>
                    <span class="font-bold ${fieldsWithData.length > 0 ? 'text-green-500' : 'text-yellow-500'}">
                        ${fieldsWithData.length}/${allFields.length}
                    </span>
                </div>
            </div>
            
            <div class="text-sm text-blue-400 bg-blue-900/20 border border-blue-700/30 p-3 rounded">
                <i class="fas fa-info-circle mr-2"></i>
                La IA ha analizado el contrato. Todos los campos son extraídos automáticamente por la IA.
            </div>
            
            <div class="overflow-x-auto">
                <table class="w-full border-collapse">
                    <thead>
                        <tr class="bg-gray-800">
                            <th class="p-3 text-left border border-gray-700" style="width: 30%;">Campo</th>
                            <th class="p-3 text-left border border-gray-700" style="width: 30%;">Valor Extraído por IA</th>
                            <th class="p-3 text-left border border-gray-700" style="width: 40%;">Editar Valor</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    allFields.forEach((field, index) => {
        let displayValue = field.value || '<span class="text-gray-500 italic">No encontrado</span>';
        let fieldId = field.id;
        
        // Formatear valores especiales
        if ((field.id === 'total_amount' || field.id === 'monto_minimo' || field.id === 'monto_maximo') && field.value) {
            displayValue = formatMexicanPesos(field.value);
        }
        
        if ((field.id.includes('fecha') || field.id.includes('vigencia')) && field.value) {
            displayValue = formatDateDisplay(field.value);
        }
        
        // Determinar tipo de input para edición
        let inputType = 'text';
        let inputClass = 'w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm';
        
        if (field.type === 'date') {
            inputType = 'date';
        } else if (field.type === 'number') {
            inputType = 'number';
            inputClass += ' text-right';
            field.value = field.value || '0';
        } else if (field.type === 'textarea') {
            inputType = 'textarea';
            inputClass += ' h-20';
        } else if (field.type === 'select') {
            inputType = 'select';
        }
        
        formHTML += `
            <tr>
                <td class="p-3 border border-gray-700">
                    <div class="font-medium">${field.name}</div>
                </td>
                <td class="p-3 border border-gray-700">
                    <div class="field-value ${field.value ? 'text-green-400' : 'text-gray-500'}">
                        ${displayValue}
                    </div>
                </td>
                <td class="p-3 border border-gray-700">
        `;
        
        if (inputType === 'select') {
            formHTML += `
                <select id="ia_${fieldId}"
                        class="${inputClass}"
                        autocomplete="off">
                    <option value="">Seleccionar...</option>
                    ${(field.options || []).map(opt => `
                        <option value="${opt}" ${field.value === opt ? 'selected' : ''}>${opt}</option>
                    `).join('')}
                </select>
            `;
        } else if (inputType === 'textarea') {
            formHTML += `
                <textarea id="ia_${fieldId}"
                          class="${inputClass}"
                          placeholder="Editar valor..."
                          autocomplete="off">${field.value || ''}</textarea>
            `;
        } else {
            let inputValue = field.value || '';
            
            // Para fechas, formatear para input date
            if (inputType === 'date' && inputValue) {
                const date = new Date(inputValue);
                if (!isNaN(date.getTime())) {
                    inputValue = date.toISOString().split('T')[0];
                }
            }
            
            formHTML += `
                <input type="${inputType}" 
                       id="ia_${fieldId}"
                       class="${inputClass}"
                       value="${inputValue}"
                       placeholder="Editar valor..."
                       autocomplete="off"
                       ${field.type === 'number' ? 'step="0.01"' : ''}>
            `;
        }
        
        // Agregar formato sugerido para montos
        if (field.type === 'number' && field.value) {
            formHTML += `
                <div class="text-xs text-gray-400 mt-1">
                    Formato: <span class="text-green-400">${formatMexicanPesos(field.value)}</span>
                </div>
            `;
        }
        
        formHTML += `
                </td>
            </tr>
        `;
    });
    
    formHTML += `
                    </tbody>
                </table>
            </div>
            
            <div class="mt-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
                <h5 class="font-medium mb-3 text-gray-300">
                    <i class="fas fa-database mr-2"></i>
                    Resumen de la Extracción
                </h5>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div class="flex flex-col">
                        <span class="text-gray-400">Archivo procesado:</span>
                        <div class="font-medium truncate text-white">${file.name}</div>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-gray-400">Total de campos:</span>
                        <div class="font-medium text-white">${allFields.length}</div>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-gray-400">Campos con datos:</span>
                        <div class="font-medium text-green-500">${fieldsWithData.length}</div>
                    </div>
                </div>
                
                <div class="mt-4 pt-4 border-t border-gray-700">
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-400">Progreso de completitud:</span>
                        <span class="font-medium">${Math.round((fieldsWithData.length / allFields.length) * 100)}%</span>
                    </div>
                    <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" 
                             style="width: ${(fieldsWithData.length / allFields.length) * 100}%"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Acciones
    const actionsHTML = `
        <button onclick="saveAIExtraction('${file.id}')" class="btn-primary">
            <i class="fas fa-save mr-2"></i>
            Guardar Todos los Datos (${allFields.length} campos)
        </button>
        <button onclick="closeModal()" class="btn-secondary ml-2">
            <i class="fas fa-times mr-2"></i>
            Cancelar
        </button>
    `;
    
    if (resultDiv) resultDiv.innerHTML = formHTML;
    if (actionsDiv) actionsDiv.innerHTML = actionsHTML;
}

// Función para guardar datos extraídos por IA
async function saveAIExtraction(fileId) {
    try {
        // Recolectar TODOS los campos de la tabla
        const allData = {};
        
        // Obtener todos los campos de la tabla
        const allInputs = document.querySelectorAll('#aiExtractResult input, #aiExtractResult select, #aiExtractResult textarea');
        
        allInputs.forEach(input => {
            const fieldId = input.id.replace('ia_', '');
            let value = input.value;
            
            // Formatear valores según el tipo
            if (input.type === 'number' && value) {
                value = parseFloat(value).toFixed(2);
            }
            
            // Formatear fechas para input date
            if (input.type === 'date' && value) {
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                    value = date.toISOString().split('T')[0];
                }
            }
            
            allData[fieldId] = value;
        });
        
        // Validar campo esencial (solo Estado ahora)
        const essentialFieldIds = ['status'];
        const missingEssentialFields = essentialFieldIds.filter(fieldId => 
            !allData[fieldId] || allData[fieldId].toString().trim() === ''
        );
        
        if (missingEssentialFields.length > 0) {
            const fieldNames = {
                'status': 'Estado'
            };
            
            const missingNames = missingEssentialFields.map(f => fieldNames[f] || f);
            showNotification(`❌ Campo esencial faltante: ${missingNames.join(', ')}`, 'error');
            return;
        }
        
        showLoading('Guardando datos del contrato...');
        
        const response = await fetch(`/api/contracts/save-ai-extraction/${fileId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ia_data: allData  // Enviamos todos los datos
            })
        });
        
        const result = await response.json();
        
        hideLoading();
        
        if (result.success) {
            showNotification('✅ Datos del contrato guardados exitosamente', 'success');
            
            // Cerrar modal después de 1.5 segundos
            setTimeout(() => {
                closeModal();
                
                // Recargar detalles del contrato
                const currentContract = document.querySelector('.contract-card.active');
                if (currentContract) {
                    loadContractDetails(currentContract.dataset.contractId);
                }
            }, 1500);
            
        } else {
            showNotification(`❌ Error: ${result.error}`, 'error');
        }
        
    } catch (error) {
        hideLoading();
        showNotification(`❌ Error al guardar datos: ${error.message}`, 'error');
    }
}

// Función para mostrar error en extracción con IA
function showAIExtractError(message) {
    const errorDiv = document.getElementById('aiExtractError');
    const progressDiv = document.getElementById('aiExtractProgress');
    const actionsDiv = document.getElementById('aiExtractActions');
    
    if (progressDiv) progressDiv.classList.add('hidden');
    if (errorDiv) {
        errorDiv.classList.remove('hidden');
        errorDiv.innerHTML = `
            <div class="bg-red-900/20 border border-red-700/30 rounded-lg p-4">
                <div class="flex items-center gap-2 text-red-400 mb-2">
                    <i class="fas fa-exclamation-circle"></i>
                    <span class="font-medium">Error en extracción con IA</span>
                </div>
                <p class="text-sm">${message}</p>
                <div class="flex gap-2 mt-3">
                    <button onclick="retryAIExtraction()" class="btn-secondary flex-1">
                        <i class="fas fa-redo mr-2"></i>
                        Reintentar
                    </button>
                    <button onclick="closeModal()" class="btn-secondary flex-1">
                        <i class="fas fa-times mr-2"></i>
                        Cancelar
                    </button>
                </div>
            </div>
        `;
    }
    
    // Limpiar acciones anteriores
    if (actionsDiv) {
        actionsDiv.innerHTML = '';
        actionsDiv.classList.add('hidden');
    }
}

// Función para reintentar extracción con IA
function retryAIExtraction() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        const fileId = modal.querySelector('.modal-title + .text-sm')?.textContent;
        if (fileId) {
            extractContractWithAI(fileId);
        }
    }
}

// Función para ver facturas del contrato
function viewContractInvoices(contractId, contractName, contractMaxAmount) {
    console.log(`📊 Abriendo facturas del contrato: ${contractId}, Monto: ${contractMaxAmount}`);
    
    // ¡IMPORTANTE! Actualizar currentContractId
    currentContractId = contractId;
    console.log(`✅ currentContractId establecido en: ${currentContractId}`);
    
    // Cambiar a pestaña de facturas
    activateTab('invoices');
    
    // Guardar información del contrato en localStorage también
    localStorage.setItem('currentContractId', contractId);
    localStorage.setItem('currentContractName', contractName);
    if (contractMaxAmount) {
        localStorage.setItem('currentContractMaxAmount', contractMaxAmount);
    }
    
    console.log(`💾 Guardado en localStorage: ${contractId}`);
}

// Función auxiliar para calcular precisión estimada
function calculateAccuracy(extracted_data) {
    const basicInfo = extracted_data.basic_info || {};
    const iaData = extracted_data.public_contract_info || {};
    
    let filledFields = 0;
    let totalFields = 0;
    
    // Contar campos básicos
    const basicFields = ['contract_number', 'client_name', 'contract_date', 'total_amount', 'currency', 'status'];
    basicFields.forEach(field => {
        totalFields++;
        if (basicInfo[field] && basicInfo[field].toString().trim() !== '') {
            filledFields++;
        }
    });
    
    // Contar algunos campos clave de IA
    const keyIaFields = ['proveedor', 'concepto', 'tipo_adjudicacion'];
    keyIaFields.forEach(field => {
        totalFields++;
        if (iaData[field] && iaData[field].toString().trim() !== '') {
            filledFields++;
        }
    });
    
    return totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
}

// Función para mostrar errores de extracción detallados
function showDetailedExtractionError(errorData) {
    const modal = document.querySelector('.modal-overlay');
    if (!modal) return;
    
    const errorDiv = modal.querySelector('#aiExtractError');
    const progressDiv = modal.querySelector('#aiExtractProgress');
    
    if (progressDiv) progressDiv.classList.add('hidden');
    if (errorDiv) {
        errorDiv.classList.remove('hidden');
        
        let errorHTML = `
            <div class="bg-red-900/20 border border-red-700/30 rounded-lg p-4">
                <div class="flex items-center gap-2 text-red-400 mb-3">
                    <i class="fas fa-exclamation-circle text-xl"></i>
                    <span class="font-medium text-lg">Error en Extracción</span>
                </div>
        `;
        
        if (errorData.details) {
            errorHTML += `
                <div class="mb-4 p-3 bg-gray-800 rounded">
                    <div class="text-sm font-medium mb-2">Detalles técnicos:</div>
                    <div class="text-xs space-y-1">
                        <div><span class="text-gray-400">Archivo:</span> ${errorData.details.file_name}</div>
                        <div><span class="text-gray-400">Tamaño:</span> ${errorData.details.file_size_kb}</div>
                        <div><span class="text-gray-400">Caracteres extraídos:</span> ${errorData.details.characters_extracted}</div>
                        <div><span class="text-gray-400">Métodos intentados:</span> ${errorData.details.methods_tried.join(', ')}</div>
                    </div>
                </div>
            `;
        }
        
        errorHTML += `
                <div class="mb-4">
                    <div class="text-sm font-medium mb-2">Descripción:</div>
                    <div class="text-sm whitespace-pre-line">${errorData.error}</div>
                </div>
                
                <div class="bg-gray-800/50 p-3 rounded mb-4">
                    <div class="text-sm font-medium mb-2">¿Qué puedes hacer?</div>
                    <div class="text-sm space-y-2">
                        <div class="flex items-start gap-2">
                            <i class="fas fa-hand-point-right text-blue-400 mt-1"></i>
                            <span>Usa el botón <strong>"Extraer Datos"</strong> para ingresar la información manualmente</span>
                        </div>
                        <div class="flex items-start gap-2">
                            <i class="fas fa-file-import text-green-400 mt-1"></i>
                            <span>Si el PDF es escaneado, conviértelo a texto</span>
                        </div>
                        <div class="flex items-start gap-2">
                            <i class="fas fa-sync-alt text-yellow-400 mt-1"></i>
                            <span>Intenta con otro archivo del mismo contrato</span>
                        </div>
                    </div>
                </div>
                
                <div class="flex gap-2">
                    <button onclick="retryAIExtraction()" class="btn-secondary flex-1">
                        <i class="fas fa-redo mr-2"></i>
                        Reintentar
                    </button>
                    <button onclick="closeModal(); showQuickExtractModal('${fileId}')" class="btn-primary flex-1">
                        <i class="fas fa-keyboard mr-2"></i>
                        Ingresar Manualmente
                    </button>
                </div>
            </div>
        `;
        
        errorDiv.innerHTML = errorHTML;
    }
}

// ===== FUNCIONES PARA CREAR NUEVO USUARIO =====
function showCreateUserModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-user-plus text-green-500 mr-2"></i>
                    Crear Nuevo Usuario
                </h3>
            </div>
            <div class="modal-body">
                <form id="createUserForm" onsubmit="event.preventDefault(); createNewUser();">
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2">
                            <i class="fas fa-user text-gray-400 mr-1"></i>
                            Nombre de Usuario <span class="text-red-400">*</span>
                        </label>
                        <input type="text" 
                               id="username" 
                               class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500"
                               placeholder="Ej: Juan Pérez"
                               required
                               autofocus>
                    </div>
                    
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2">
                            <i class="fas fa-calendar-alt text-gray-400 mr-1"></i>
                            Fecha de Nacimiento <span class="text-red-400">*</span>
                        </label>
                        <input type="date" 
                               id="fechaNacimiento" 
                               class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500"
                               required>
                    </div>
                    
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2">
                            <i class="fas fa-envelope text-gray-400 mr-1"></i>
                            Correo Electrónico <span class="text-red-400">*</span>
                        </label>
                        <input type="email" 
                               id="email" 
                               class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500"
                               placeholder="Ej: juan.perez@email.com"
                               required>
                    </div>
                    
                    <div class="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 mt-4">
                        <div class="flex items-start gap-3">
                            <i class="fas fa-info-circle text-blue-400 mt-1"></i>
                            <div class="text-sm text-gray-300">
                                <p class="font-medium text-blue-400 mb-1">Información importante</p>
                                <p>Se creará una carpeta con el nombre del usuario. 
                                   La información del usuario se guardará para futuras consultas.</p>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button onclick="createNewUser()" class="btn-primary bg-green-600 hover:bg-green-700">
                    <i class="fas fa-save mr-2"></i>
                    Crear Usuario
                </button>
                <button onclick="closeModal()" class="btn-secondary">
                    <i class="fas fa-times mr-2"></i>
                    Cancelar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function createNewUser() {
    const usernameInput = document.getElementById('username');
    const fechaNacimientoInput = document.getElementById('fechaNacimiento');
    const emailInput = document.getElementById('email');
    
    if (!usernameInput || !fechaNacimientoInput || !emailInput) return;
    
    const username = usernameInput.value.trim();
    const fechaNacimiento = fechaNacimientoInput.value;
    const email = emailInput.value.trim();
    
    if (!username) {
        showNotification('❌ Por favor ingresa el nombre de usuario', 'error');
        return;
    }
    
    if (!fechaNacimiento) {
        showNotification('❌ Por favor ingresa la fecha de nacimiento', 'error');
        return;
    }
    
    if (!email || !email.includes('@')) {
        showNotification('❌ Por favor ingresa un correo electrónico válido', 'error');
        return;
    }
    
    try {
        showLoading('Creando usuario...');
        
        const response = await fetch('/api/users/create-folder', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                username: username,
                fecha_nacimiento: fechaNacimiento,
                email: email
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message || '✅ Usuario creado exitosamente', 'success');
            
            // Cerrar modal
            closeModal();
            
            // Recargar lista de contratos
            await loadContracts();
        } else {
            throw new Error(data.error || 'Error al crear usuario');
        }
        
    } catch (error) {
        console.error('Error al crear usuario:', error);
        showNotification('❌ Error al crear usuario: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Función para mostrar información del usuario en el panel derecho
async function displayUserInfoInDetail(folderId) {
    try {
        const response = await fetch(`/api/users/get-info/${folderId}`);
        const data = await response.json();
        
        if (data.success && data.user_info) {
            return data.user_info;
        }
        return null;
    } catch (error) {
        console.error('Error cargando info de usuario:', error);
        return null;
    }
}

// Modificar displayContracts para cambiar "Nueva Carpeta" a "Nuevo Usuario"
function displayContracts(contracts) {
    const contractsList = document.getElementById('contractsList');
    if (!contractsList) return;
    
    contractsList.innerHTML = '';
    
    const header = document.createElement('div');
    header.className = 'flex justify-between items-center mb-6';
    header.innerHTML = `
        <h3 class="font-semibold text-lg">Usuarios</h3>
        <button onclick="showCreateUserModal()" class="btn-primary bg-green-600 hover:bg-green-700">
            <i class="fas fa-user-plus"></i>
            Nuevo Usuario
        </button>
    `;
    contractsList.appendChild(header);
    
    if (contracts.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'text-center py-12';
        emptyState.innerHTML = `
            <i class="fas fa-users text-4xl text-gray-600 mb-4"></i>
            <p class="text-gray-400">No hay usuarios registrados</p>
            <p class="text-sm text-gray-500 mt-2">Crea tu primer usuario para empezar</p>
        `;
        contractsList.appendChild(emptyState);
        return;
    }
    
    // Cargar datos de usuarios
    contracts.forEach(contract => {
        const contractCard = document.createElement('div');
        contractCard.className = 'contract-card';
        contractCard.dataset.contractId = contract.id;
        
        const modifiedDate = contract.modified ? formatDate(contract.modified) : 'No disponible';
        
        contractCard.innerHTML = `
            <div class="contract-header">
                <span class="contract-id flex-1 truncate">
                    <i class="fas fa-user mr-2 text-green-400"></i>
                    ${contract.name}
                </span>
            </div>
            <div class="contract-meta">
                <span><i class="fas fa-calendar mr-1"></i> ${modifiedDate}</span>
                <span><i class="fas fa-files mr-1"></i> ${contract.file_count || (contract.files ? contract.files.length : 0)} documentos</span>
            </div>
            
            <div class="flex justify-end gap-2 mt-3 pt-2 border-t border-gray-700/50">
                <button onclick="event.stopPropagation(); showRenameModal('${contract.id}', '${contract.name.replace(/'/g, "\\'")}', 'folder')" 
                        class="px-3 py-1.5 bg-gray-700 hover:bg-blue-600 rounded-lg transition-colors duration-200 text-xs flex items-center gap-1">
                    <i class="fas fa-edit"></i>
                    Editar
                </button>
                <button onclick="event.stopPropagation(); showDeleteConfirmation('${contract.id}', '${contract.name.replace(/'/g, "\\'")}', 'folder')" 
                        class="px-3 py-1.5 bg-gray-700 hover:bg-red-600 rounded-lg transition-colors duration-200 text-xs flex items-center gap-1">
                    <i class="fas fa-trash"></i>
                    Eliminar
                </button>
            </div>
        `;
        
        contractCard.onclick = async (e) => {
            if (!e.target.closest('button')) {
                await loadContractDetails(contract.id);
                
                // Después de cargar los detalles, mostrar información del usuario
                const userInfo = await displayUserInfoInDetail(contract.id);
                if (userInfo) {
                    displayUserInfoPanel(contract.id, userInfo);
                }
            }
        };
        
        contractsList.appendChild(contractCard);
    });
}

// Función para mostrar panel de información de usuario
function displayUserInfoPanel(folderId, userInfo) {
    const detailSection = document.getElementById('contractDetail');
    if (!detailSection) return;
    
    // Verificar si ya existe un panel de usuario
    let userPanel = document.getElementById('userInfoPanel');
    
    if (!userPanel) {
        // Crear panel de usuario
        userPanel = document.createElement('div');
        userPanel.id = 'userInfoPanel';
        userPanel.className = 'user-info-panel bg-gray-800 border border-gray-700 rounded-lg p-5 mb-6';
        
        // Insertar al principio del detalle
        const firstChild = detailSection.firstChild;
        detailSection.insertBefore(userPanel, firstChild);
    }
    
    // Formatear fecha de nacimiento
    let fechaFormateada = 'No disponible';
    if (userInfo.fecha_nacimiento) {
        const fecha = new Date(userInfo.fecha_nacimiento);
        if (!isNaN(fecha.getTime())) {
            fechaFormateada = fecha.toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }
    
    userPanel.innerHTML = `
        <div class="flex items-start gap-4">
            <div class="bg-green-600 rounded-full p-4">
                <i class="fas fa-user text-2xl text-white"></i>
            </div>
            <div class="flex-1">
                <h4 class="text-xl font-semibold text-green-400 mb-3">
                    <i class="fas fa-id-card mr-2"></i>
                    Información del Usuario
                </h4>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-gray-900/50 rounded-lg p-3">
                        <div class="text-xs text-gray-400 mb-1">
                            <i class="fas fa-user mr-1"></i>
                            Nombre
                        </div>
                        <div class="font-medium text-white">
                            ${userInfo.username || 'No especificado'}
                        </div>
                    </div>
                    
                    <div class="bg-gray-900/50 rounded-lg p-3">
                        <div class="text-xs text-gray-400 mb-1">
                            <i class="fas fa-calendar-alt mr-1"></i>
                            Fecha de Nacimiento
                        </div>
                        <div class="font-medium text-white">
                            ${fechaFormateada}
                        </div>
                    </div>
                    
                    <div class="bg-gray-900/50 rounded-lg p-3">
                        <div class="text-xs text-gray-400 mb-1">
                            <i class="fas fa-envelope mr-1"></i>
                            Correo Electrónico
                        </div>
                        <div class="font-medium text-white truncate">
                            <a href="mailto:${userInfo.email}" class="text-blue-400 hover:underline">
                                ${userInfo.email || 'No especificado'}
                            </a>
                        </div>
                    </div>
                </div>
                
                <div class="mt-3 text-xs text-gray-500 flex justify-end">
                    <span><i class="fas fa-clock mr-1"></i> Actualizado: ${formatDate(userInfo.updated_at)}</span>
                </div>
                
                <div class="mt-4 pt-3 border-t border-gray-700 flex justify-end">
                    <button onclick="showEditUserModal('${folderId}')" 
                            class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm flex items-center gap-2">
                        <i class="fas fa-edit"></i>
                        Editar Información
                    </button>
                </div>
            </div>
        </div>
    `;
}

function displayEmptyUserInfoPanel(folderId) {
    const detailSection = document.getElementById('contractDetail');
    if (!detailSection) return;
    
    // Verificar si ya existe un panel de usuario
    let userPanel = document.getElementById('userInfoPanel');
    
    if (!userPanel) {
        // Crear panel de usuario
        userPanel = document.createElement('div');
        userPanel.id = 'userInfoPanel';
        userPanel.className = 'user-info-panel bg-gray-800 border border-gray-700 rounded-lg p-5 mb-6';
        
        // Insertar al principio del detalle
        const firstChild = detailSection.firstChild;
        detailSection.insertBefore(userPanel, firstChild);
    }
    
    userPanel.innerHTML = `
        <div class="flex items-start gap-4">
            <div class="bg-gray-700 rounded-full p-4">
                <i class="fas fa-user text-2xl text-gray-400"></i>
            </div>
            <div class="flex-1">
                <h4 class="text-xl font-semibold text-gray-400 mb-3">
                    <i class="fas fa-info-circle mr-2"></i>
                    Información del Usuario
                </h4>
                
                <div class="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4">
                    <div class="flex items-start gap-3">
                        <i class="fas fa-exclamation-triangle text-yellow-500 mt-1"></i>
                        <div>
                            <p class="text-yellow-400 font-medium mb-1">No hay información de usuario</p>
                            <p class="text-sm text-gray-400 mb-3">
                                Esta carpeta no tiene información de usuario asociada. 
                                Puedes agregarla ahora.
                            </p>
                            <button onclick="showEditUserModal('${folderId}')" 
                                    class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm flex items-center gap-2">
                                <i class="fas fa-plus-circle"></i>
                                Agregar Información de Usuario
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Función para editar información de usuario
function showEditUserModal(folderId) {
    // Obtener información actual del usuario
    fetch(`/api/users/get-info/${folderId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.user_info) {
                const userInfo = data.user_info;
                
                const modal = document.createElement('div');
                modal.className = 'modal-overlay';
                modal.innerHTML = `
                    <div class="modal-content" style="max-width: 500px;">
                        <div class="modal-header">
                            <h3 class="modal-title">
                                <i class="fas fa-user-edit text-blue-500 mr-2"></i>
                                Editar Información de Usuario
                            </h3>
                        </div>
                        <div class="modal-body">
                            <form id="editUserForm" onsubmit="event.preventDefault(); updateUserInfo('${folderId}');">
                                <div class="mb-4">
                                    <label class="block text-sm font-medium mb-2">
                                        <i class="fas fa-user text-gray-400 mr-1"></i>
                                        Nombre de Usuario <span class="text-red-400">*</span>
                                    </label>
                                    <input type="text" 
                                           id="editUsername" 
                                           class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white"
                                           value="${userInfo.username.replace(/"/g, '&quot;')}"
                                           required>
                                </div>
                                
                                <div class="mb-4">
                                    <label class="block text-sm font-medium mb-2">
                                        <i class="fas fa-calendar-alt text-gray-400 mr-1"></i>
                                        Fecha de Nacimiento <span class="text-red-400">*</span>
                                    </label>
                                    <input type="date" 
                                           id="editFechaNacimiento" 
                                           class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white"
                                           value="${userInfo.fecha_nacimiento || ''}"
                                           required>
                                </div>
                                
                                <div class="mb-4">
                                    <label class="block text-sm font-medium mb-2">
                                        <i class="fas fa-envelope text-gray-400 mr-1"></i>
                                        Correo Electrónico <span class="text-red-400">*</span>
                                    </label>
                                    <input type="email" 
                                           id="editEmail" 
                                           class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white"
                                           value="${userInfo.email || ''}"
                                           required>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button onclick="updateUserInfo('${folderId}')" class="btn-primary bg-blue-600 hover:bg-blue-700">
                                <i class="fas fa-save mr-2"></i>
                                Guardar Cambios
                            </button>
                            <button onclick="closeModal()" class="btn-secondary">
                                <i class="fas fa-times mr-2"></i>
                                Cancelar
                            </button>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
            }
        })
        .catch(error => {
            console.error('Error cargando información del usuario:', error);
            showNotification('❌ Error al cargar información del usuario', 'error');
        });
}

async function updateUserInfo(folderId) {
    const usernameInput = document.getElementById('editUsername');
    const fechaNacimientoInput = document.getElementById('editFechaNacimiento');
    const emailInput = document.getElementById('editEmail');
    
    if (!usernameInput || !fechaNacimientoInput || !emailInput) return;
    
    const username = usernameInput.value.trim();
    const fechaNacimiento = fechaNacimientoInput.value;
    const email = emailInput.value.trim();
    
    if (!username) {
        showNotification('❌ Por favor ingresa el nombre de usuario', 'error');
        return;
    }
    
    if (!fechaNacimiento) {
        showNotification('❌ Por favor ingresa la fecha de nacimiento', 'error');
        return;
    }
    
    if (!email || !email.includes('@')) {
        showNotification('❌ Por favor ingresa un correo electrónico válido', 'error');
        return;
    }
    
    try {
        showLoading('Actualizando información...');
        
        const response = await fetch(`/api/users/update-info/${folderId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                username: username,
                fecha_nacimiento: fechaNacimiento,
                email: email
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('✅ Información actualizada exitosamente', 'success');
            
            // Cerrar modal
            closeModal();
            
            // RECARGAR COMPLETAMENTE para evitar problemas
            await loadContractDetails(folderId);
            
            // Actualizar lista de carpetas
            await loadContracts();
            
        } else {
            throw new Error(data.error || 'Error al actualizar información');
        }
        
    } catch (error) {
        showNotification('❌ Error: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function loadContractDetails(contractId) {
    try {
        console.log(`📋 Cargando detalles del usuario: ${contractId}`);
        
        currentContractId = contractId;
        
        showLoadingInContractDetail('Cargando detalles...');
        
        // Cargar información del usuario y archivos en paralelo
        const [userInfoResponse, filesResponse] = await Promise.all([
            fetch(`/api/users/get-info/${contractId}`),
            fetch(`/api/contracts/${contractId}`)
        ]);
        
        const userInfoData = await userInfoResponse.json();
        const filesData = await filesResponse.json();
        
        if (filesData.error) {
            throw new Error(filesData.error);
        }
        
        const userInfo = userInfoData.success ? userInfoData.user_info : null;
        console.log('👤 Información de usuario:', userInfo);
        
        // Guardar para referencia
        window.currentUserInfo = userInfo;
        
        // Construir el HTML completo (usuario + archivos)
        const fullHTML = await buildFullDetailHTML(contractId, filesData, userInfo);
        
        // Reemplazar todo el contenido
        const detailSection = document.getElementById('contractDetail');
        if (detailSection) {
            detailSection.innerHTML = fullHTML;
        }
        
        // Inicializar event listeners después de renderizar
        initializeFileEventListeners();
        
        // Marcar la tarjeta como activa
        document.querySelectorAll('.contract-card').forEach(card => {
            card.classList.remove('active');
        });
        const currentCard = document.querySelector(`.contract-card[data-contract-id="${contractId}"]`);
        if (currentCard) {
            currentCard.classList.add('active');
        }
        
        hideLoadingInContractDetail();
        
    } catch (error) {
        console.error('Error al cargar detalles:', error);
        showNotification('Error al cargar detalles: ' + error.message, 'error');
        hideLoadingInContractDetail();
    }
}

async function buildFullDetailHTML(contractId, filesData, userInfo) {
    const { folder, files, stats } = filesData;
    
    // Obtener el monto máximo del contrato
    const contractMaxAmount = await getContractMaxAmount(folder.id);
    
    // Construir HTML del panel de usuario (solo UNA vez)
    let userPanelHTML = '';
    
    if (userInfo) {
        // Formatear fecha de nacimiento
        let fechaFormateada = 'No disponible';
        if (userInfo.fecha_nacimiento) {
            const fecha = new Date(userInfo.fecha_nacimiento);
            if (!isNaN(fecha.getTime())) {
                fechaFormateada = fecha.toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
        }
        
        userPanelHTML = `
            <div class="user-info-panel bg-gray-800 border border-gray-700 rounded-lg p-5 mb-6" id="userInfoPanel">
                <div class="flex items-start gap-4">
                    <div class="bg-green-600 rounded-full p-4">
                        <i class="fas fa-user text-2xl text-white"></i>
                    </div>
                    <div class="flex-1">
                        <h4 class="text-xl font-semibold text-green-400 mb-3">
                            <i class="fas fa-id-card mr-2"></i>
                            Información del Usuario
                        </h4>
                        
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div class="bg-gray-900/50 rounded-lg p-3">
                                <div class="text-xs text-gray-400 mb-1">
                                    <i class="fas fa-user mr-1"></i>
                                    Nombre
                                </div>
                                <div class="font-medium text-white">
                                    ${userInfo.username || 'No especificado'}
                                </div>
                            </div>
                            
                            <div class="bg-gray-900/50 rounded-lg p-3">
                                <div class="text-xs text-gray-400 mb-1">
                                    <i class="fas fa-calendar-alt mr-1"></i>
                                    Fecha de Nacimiento
                                </div>
                                <div class="font-medium text-white">
                                    ${fechaFormateada}
                                </div>
                            </div>
                            
                            <div class="bg-gray-900/50 rounded-lg p-3">
                                <div class="text-xs text-gray-400 mb-1">
                                    <i class="fas fa-envelope mr-1"></i>
                                    Correo Electrónico
                                </div>
                                <div class="font-medium text-white truncate">
                                    <a href="mailto:${userInfo.email}" class="text-blue-400 hover:underline">
                                        ${userInfo.email || 'No especificado'}
                                    </a>
                                </div>
                            </div>
                        </div>
                        
                        <div class="mt-3 text-xs text-gray-500 flex justify-end">
                            <span><i class="fas fa-clock mr-1"></i> Actualizado: ${formatDate(userInfo.updated_at)}</span>
                        </div>
                        
                        <div class="mt-4 pt-3 border-t border-gray-700 flex justify-end">
                            <button onclick="showEditUserModal('${contractId}')" 
                                    class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm flex items-center gap-2">
                                <i class="fas fa-edit"></i>
                                Editar Información
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } else {
        userPanelHTML = `
            <div class="user-info-panel bg-gray-800 border border-gray-700 rounded-lg p-5 mb-6" id="userInfoPanel">
                <div class="flex items-start gap-4">
                    <div class="bg-gray-700 rounded-full p-4">
                        <i class="fas fa-user text-2xl text-gray-400"></i>
                    </div>
                    <div class="flex-1">
                        <h4 class="text-xl font-semibold text-gray-400 mb-3">
                            <i class="fas fa-info-circle mr-2"></i>
                            Información del Usuario
                        </h4>
                        
                        <div class="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4">
                            <div class="flex items-start gap-3">
                                <i class="fas fa-exclamation-triangle text-yellow-500 mt-1"></i>
                                <div>
                                    <p class="text-yellow-400 font-medium mb-1">No hay información de usuario</p>
                                    <p class="text-sm text-gray-400 mb-3">
                                        Esta carpeta no tiene información de usuario asociada. 
                                        Puedes agregarla ahora.
                                    </p>
                                    <button onclick="showEditUserModal('${contractId}')" 
                                            class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm flex items-center gap-2">
                                        <i class="fas fa-plus-circle"></i>
                                        Agregar Información de Usuario
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Construir HTML de los archivos (sin incluir información de usuario)
    let filesHTML = `
        <div class="flex justify-between items-center mb-6">
            <div>
                <h3 class="font-semibold text-xl">${folder.name}</h3>
                ${contractMaxAmount ? `
                    <div class="mt-2 text-lg font-bold text-blue-400">
                        <i class="fas fa-money-bill-wave mr-2"></i>
                        Monto Máximo: $${formatNumber(contractMaxAmount)}
                    </div>
                ` : ''}
            </div>
            <div class="flex gap-2">
                <button onclick="showUploadModal('${folder.id}', '${folder.name.replace(/'/g, "\\'")}')" class="btn-secondary">
                    <i class="fas fa-upload"></i>
                    Subir Archivo
                </button>
                ${contractMaxAmount ? `
                    <button onclick="viewContractInvoices('${folder.id}', '${folder.name.replace(/'/g, "\\'")}', ${contractMaxAmount})" 
                            class="btn-primary">
                        <i class="fas fa-receipt mr-2"></i>
                        Ver Facturas
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    
    // Resumen del contrato
    if (contractMaxAmount) {
        filesHTML += `
            <div class="contract-summary-card mb-6">
                <h4 class="font-semibold text-lg mb-4 text-blue-400">
                    <i class="fas fa-chart-line mr-2"></i>
                    Resumen del Contrato
                </h4>
                
                <div class="mb-4">
                    <button onclick="viewContractInvoices('${folder.id}', '${folder.name.replace(/'/g, "\\'")}', ${contractMaxAmount})" 
                            class="w-full bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 
                                   text-white py-3 px-4 rounded-lg font-semibold text-lg transition-all duration-300 
                                   shadow-lg hover:shadow-xl flex items-center justify-center gap-3">
                        <i class="fas fa-chart-bar text-xl"></i>
                        Ver Seguimiento de Facturas
                        <i class="fas fa-arrow-right"></i>
                    </button>
                    <p class="text-sm text-gray-400 text-center mt-2">
                        Haz clic para ver las facturas y el balance del contrato
                    </p>
                </div>
                
                <div class="summary-grid">
                    <div class="summary-item">
                        <div class="summary-label">Monto Máximo</div>
                        <div class="summary-value text-blue-400">$${formatNumber(contractMaxAmount)}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Archivos con Datos</div>
                        <div class="summary-value ${stats?.with_data > 0 ? 'text-green-400' : 'text-red-400'}">
                            ${stats?.with_data || 0}/${stats?.total || 0}
                        </div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Estado</div>
                        <div class="summary-value ${getContractStatusClass(files)}">${getContractStatus(files)}</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Estadísticas
    filesHTML += `
        <div class="grid grid-cols-2 gap-4 mb-6">
            <div class="stat-card">
                <div class="stat-label">Creado</div>
                <div class="stat-value text-lg">${formatDate(folder.created)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Archivos con datos</div>
                <div class="stat-value text-lg ${stats?.with_data > 0 ? 'text-green-400' : 'text-red-400'}">
                    ${stats?.with_data || 0}/${stats?.total || 0}
                </div>
            </div>
        </div>
        
        <div class="contract-timeline">
            <h4 class="font-semibold mb-4">Documentos del Usuario</h4>
            
            ${renderFileSection('📄 Documentos PDF', files.pdf)}
            ${renderFileSection('📝 Documentos de Word', files.documents)}
            ${renderFileSection('📊 Hojas de Cálculo', files.excel)}
            ${renderFileSection('🖼️ Imágenes', files.images)}
            ${renderFileSection('📦 Otros Archivos', files.others)}
        </div>
    `;
    
    // Combinar todo (solo UNA vez)
    return userPanelHTML + filesHTML;
}

function initializeFileEventListeners() {
    // Ocultar automáticamente contenedores de datos
    document.querySelectorAll('.file-data-container').forEach(container => {
        container.classList.add('hidden');
    });
    
    // Los eventos onclick ya están en los botones del HTML
    // No necesitamos agregarlos manualmente
}

function showUploadModal(contractId, contractName) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">Subir Archivo</h3>
                <p class="text-sm text-gray-400">${contractName}</p>
            </div>
            <div class="modal-body">
                <form id="uploadForm">
                    <input type="hidden" name="contract_id" value="${contractId}">
                    
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2">Seleccionar Archivo</label>
                        <input type="file" name="file" id="fileInput"
                               class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white"
                               required>
                    </div>
                    
                    <div class="text-sm text-gray-400">
                        <i class="fas fa-info-circle mr-1"></i>
                        Formatos soportados: PDF, Word, Excel, Imágenes, etc.
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button onclick="closeModal()" class="btn-secondary">
                    Cancelar
                </button>
                <button onclick="uploadFile('${contractId}')" class="btn-primary">
                    Subir Archivo
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function uploadFile(contractId) {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput || !fileInput.files[0]) {
        showNotification('Por favor selecciona un archivo', 'error');
        return;
    }
    
    try {
        showLoading('Subiendo archivo...');
        
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('contract_id', contractId);
        
        const response = await fetch('/api/contracts/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al subir archivo');
        }
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        showNotification('Archivo subido exitosamente', 'success');
        
        // Cerrar modal
        closeModal();
        
        // Recargar detalles del contrato
        await loadContractDetails(contractId);
        
    } catch (error) {
        console.error('Error al subir archivo:', error);
        
        // Mensaje de error más específico
        let errorMessage = error.message;
        if (errorMessage.includes('WinError 32') || errorMessage.includes('está siendo utilizado')) {
            errorMessage = 'El archivo está siendo usado por otro programa. Cierra el archivo e inténtalo de nuevo.';
        }
        
        showNotification('Error al subir archivo: ' + errorMessage, 'error');
    } finally {
        hideLoading();
    }
}

function updateContractBadge(count) {
    const badge = document.querySelector('.tab-contracts .tab-badge');
    if (badge) {
        badge.textContent = count;
    }
}

function showContractInvoiceSummary(contractId, contractName, contractMaxAmount) {
    const invoiceList = document.getElementById('invoicesList');
    if (!invoiceList) return;
    
    // Primero limpiar y mostrar el resumen
    invoiceList.innerHTML = `
        <div class="mb-6">
            <h3 class="font-semibold text-lg mb-4">Facturas del Contrato</h3>
            
            <!-- Resumen del Contrato -->
            <div class="contract-summary-card mb-6">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h4 class="font-semibold text-lg">${contractName}</h4>
                        <p class="text-sm text-gray-400">Contrato seleccionado</p>
                    </div>
                    ${contractMaxAmount ? `
                        <div class="bg-blue-900/20 border border-blue-700/30 rounded-lg px-4 py-2">
                            <div class="text-sm text-gray-400">Monto Máximo</div>
                            <div class="text-xl font-bold text-blue-400">$${formatNumber(contractMaxAmount)}</div>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Panel de estadísticas (se actualizará dinámicamente) -->
                <div id="contractStatsPanel">
                    <div class="text-center py-8">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <p class="text-gray-400">Cargando estadísticas...</p>
                    </div>
                </div>
            </div>
            
            <!-- Lista de facturas -->
            <div id="invoicesListContent"></div>
        </div>
    `;
}

// ===== FUNCIÓN PARA MOSTRAR MODAL DE EDICIÓN DE NOMBRE =====
function showRenameModal(itemId, currentName, itemType) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-edit text-blue-500 mr-2"></i>
                    Renombrar ${itemType === 'folder' ? 'Carpeta' : 'Archivo'}
                </h3>
            </div>
            <div class="modal-body">
                <div class="mb-6">
                    <div class="flex items-center gap-3 mb-4 p-3 bg-gray-800 rounded-lg">
                        <div class="text-2xl ${itemType === 'folder' ? 'text-yellow-500' : 'text-blue-400'}">
                            <i class="fas ${itemType === 'folder' ? 'fa-folder' : 'fa-file'}"></i>
                        </div>
                        <div class="flex-1 truncate">
                            <div class="text-sm text-gray-400">Nombre actual</div>
                            <div class="font-medium text-white truncate">${currentName}</div>
                        </div>
                    </div>
                    
                    <div class="space-y-2">
                        <label class="block text-sm font-medium text-gray-300">
                            Nuevo nombre
                            <span class="text-red-500 ml-1">*</span>
                        </label>
                        <input type="text" 
                               id="newItemName" 
                               value="${currentName.replace(/"/g, '&quot;')}"
                               class="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                               placeholder="Ingrese el nuevo nombre..."
                               autofocus>
                        <p class="text-xs text-gray-400 mt-1">
                            <i class="fas fa-info-circle mr-1"></i>
                            El nombre no puede estar vacío
                        </p>
                    </div>
                    
                    ${itemType === 'folder' ? `
                        <div class="bg-blue-900/20 border border-blue-700/30 p-4 rounded-lg mt-4">
                            <div class="flex items-start gap-3">
                                <i class="fas fa-folder text-blue-400 mt-1"></i>
                                <div class="text-sm">
                                    <p class="font-medium text-blue-400 mb-1">Renombrar carpeta</p>
                                    <p class="text-gray-400">
                                        Al cambiar el nombre de la carpeta, todos los archivos dentro permanecerán intactos.
                                        Solo se modificará el nombre de la carpeta.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <div class="bg-purple-900/20 border border-purple-700/30 p-4 rounded-lg mt-4">
                            <div class="flex items-start gap-3">
                                <i class="fas fa-file text-purple-400 mt-1"></i>
                                <div class="text-sm">
                                    <p class="font-medium text-purple-400 mb-1">Renombrar archivo</p>
                                    <p class="text-gray-400">
                                        El enlace al archivo se actualizará automáticamente.
                                        Los datos extraídos del archivo no se verán afectados.
                                    </p>
                                </div>
                            </div>
                        </div>
                    `}
                </div>
            </div>
            <div class="modal-footer flex justify-end gap-2">
                <button onclick="closeModal()" class="btn-secondary">
                    <i class="fas fa-times mr-1"></i>
                    Cancelar
                </button>
                <button onclick="renameDriveItem('${itemId}', '${itemType}')" 
                        class="btn-primary bg-blue-600 hover:bg-blue-700">
                    <i class="fas fa-save mr-1"></i>
                    Guardar Cambios
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Enfocar el input automáticamente
    setTimeout(() => {
        const input = document.getElementById('newItemName');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
    
    // Agregar evento para Enter
    const input = document.getElementById('newItemName');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                renameDriveItem(itemId, itemType);
            }
        });
    }
}

// ===== FUNCIÓN PARA RENOMBRAR (MODIFICADA) =====
async function renameDriveItem(itemId, itemType) {
    const newNameInput = document.getElementById('newItemName');
    if (!newNameInput) return;
    
    const newName = newNameInput.value.trim();
    const currentName = newNameInput.defaultValue;
    
    if (!newName) {
        showNotification('El nombre no puede estar vacío', 'error');
        return;
    }
    
    if (newName === currentName) {
        showNotification('El nombre no ha cambiado', 'info');
        closeModal();
        return;
    }
    
    try {
        showLoading('Renombrando...');
        
        const response = await fetch(`/api/drive/rename/${itemId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                new_name: newName,
                item_type: itemType
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`✅ ${itemType === 'folder' ? 'Carpeta' : 'Archivo'} renombrado exitosamente`, 'success');
            
            // Cerrar modal
            closeModal();
            
            // Recargar según el tipo
            if (itemType === 'folder') {
                await loadContracts();
                // Si la carpeta actual está seleccionada, recargar detalles
                if (currentContractId === itemId) {
                    await loadContractDetails(itemId);
                }
            } else {
                // Recargar detalles del contrato actual
                if (currentContractId) {
                    await loadContractDetails(currentContractId);
                }
            }
        } else {
            throw new Error(data.error || 'Error al renombrar');
        }
        
    } catch (error) {
        showNotification(`❌ Error al renombrar: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// ===== FUNCIÓN PARA MOSTRAR MODAL DE ETIQUETA DE FIRMA =====
function showSignatureTagModal(fileId, fileName, currentTag = '') {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 450px;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-tag text-yellow-500 mr-2"></i>
                    Etiqueta de Firma
                </h3>
                <p class="text-sm text-gray-400 truncate">${fileName}</p>
            </div>
            <div class="modal-body">
                <div class="mb-6">
                    <div class="flex items-center gap-3 mb-4 p-3 bg-gray-800 rounded-lg">
                        <div class="text-2xl text-yellow-500">
                            <i class="fas fa-file-signature"></i>
                        </div>
                        <div class="flex-1">
                            <div class="text-sm text-gray-400">Estado de firma</div>
                            <div class="font-medium text-white">Selecciona una opción</div>
                        </div>
                    </div>
                    
                    <div class="space-y-3">
                        <label class="flex items-center p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors">
                            <input type="radio" name="signatureTag" value="sin_firma" class="w-4 h-4 text-yellow-500 bg-gray-900 border-gray-600 focus:ring-yellow-500 focus:ring-2" ${currentTag === 'sin_firma' ? 'checked' : ''}>
                            <span class="ml-3 flex-1">
                                <span class="block font-medium text-white">Sin firma</span>
                                <span class="block text-xs text-gray-400">Documento pendiente de firma</span>
                            </span>
                            <span class="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded-full border border-yellow-700/30">Pendiente</span>
                        </label>
                        
                        <label class="flex items-center p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors">
                            <input type="radio" name="signatureTag" value="con_firma" class="w-4 h-4 text-green-500 bg-gray-900 border-gray-600 focus:ring-green-500 focus:ring-2" ${currentTag === 'con_firma' ? 'checked' : ''}>
                            <span class="ml-3 flex-1">
                                <span class="block font-medium text-white">Con firma</span>
                                <span class="block text-xs text-gray-400">Documento firmado</span>
                            </span>
                            <span class="px-2 py-1 bg-green-900/30 text-green-400 text-xs rounded-full border border-green-700/30">Firmado</span>
                        </label>
                        
                        <label class="flex items-center p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors">
                            <input type="radio" name="signatureTag" value="sin_etiqueta" class="w-4 h-4 text-gray-500 bg-gray-900 border-gray-600 focus:ring-gray-500 focus:ring-2" ${!currentTag || currentTag === 'sin_etiqueta' ? 'checked' : ''}>
                            <span class="ml-3 flex-1">
                                <span class="block font-medium text-white">Sin etiqueta</span>
                                <span class="block text-xs text-gray-400">No aplicar etiqueta de firma</span>
                            </span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="modal-footer flex justify-end gap-2">
                <button onclick="closeModal()" class="btn-secondary">
                    <i class="fas fa-times mr-1"></i>
                    Cancelar
                </button>
                <button onclick="saveSignatureTag('${fileId}')" 
                        class="btn-primary bg-yellow-600 hover:bg-yellow-700">
                    <i class="fas fa-save mr-1"></i>
                    Guardar Etiqueta
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ===== FUNCIÓN PARA GUARDAR LA ETIQUETA DE FIRMA =====
async function saveSignatureTag(fileId) {
    const selectedTag = document.querySelector('input[name="signatureTag"]:checked')?.value;
    
    if (!selectedTag) {
        showNotification('Por favor selecciona una opción', 'error');
        return;
    }
    
    try {
        showLoading('Guardando etiqueta...');
        
        const response = await fetch(`/api/contracts/save-signature-tag/${fileId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                signature_tag: selectedTag
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('✅ Etiqueta guardada exitosamente', 'success');
            closeModal();
            
            // Recargar detalles del contrato actual
            if (currentContractId) {
                await loadContractDetails(currentContractId);
            }
            
            // Recargar lista de contratos para actualizar badges en carpetas
            await loadContracts();
        } else {
            throw new Error(data.error || 'Error al guardar etiqueta');
        }
        
    } catch (error) {
        showNotification(`❌ Error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// ===== FUNCIÓN PARA OBTENER EL BADGE DE ETIQUETA DE FIRMA =====
function getSignatureTagBadge(tag) {
    if (tag === 'con_firma') {
        return '<span class="signature-badge signed"><i class="fas fa-check-circle mr-1"></i>Con firma</span>';
    } else if (tag === 'sin_firma') {
        return '<span class="signature-badge unsigned"><i class="fas fa-clock mr-1"></i>Sin firma</span>';
    }
    return ''; // No mostrar nada si no hay etiqueta
}

// Función de diagnóstico - Agrega esto al final de contracts.js
async function debugSignatureTags() {
    console.log('🔍 DIAGNÓSTICO DE ETIQUETAS DE FIRMA');
    console.log('='.repeat(50));
    
    try {
        // 1. Verificar datos en contracts_data.json
        const response = await fetch('/api/contracts/all-data');
        const data = await response.json();
        
        if (data.success && data.data) {
            console.log('📊 Datos de contracts_data.json:');
            
            // Contar etiquetas
            let con_firma = 0;
            let sin_firma = 0;
            let sin_etiqueta = 0;
            
            data.data.forEach(item => {
                if (item.data && item.data.signature_tag) {
                    if (item.data.signature_tag === 'con_firma') {
                        con_firma++;
                        console.log(`✅ ${item.file_id}: con_firma`);
                    } else if (item.data.signature_tag === 'sin_firma') {
                        sin_firma++;
                        console.log(`⚠️ ${item.file_id}: sin_firma`);
                    }
                } else {
                    sin_etiqueta++;
                    console.log(`❌ ${item.file_id}: sin etiqueta`);
                }
            });
            
            console.log('\n📈 Resumen:');
            console.log(`   Con firma: ${con_firma}`);
            console.log(`   Sin firma: ${sin_firma}`);
            console.log(`   Sin etiqueta: ${sin_etiqueta}`);
            console.log(`   Total: ${data.data.length}`);
        }
        
    } catch (error) {
        console.error('Error en diagnóstico:', error);
    }
}

// Ejecutar diagnóstico cuando se carga la página
setTimeout(debugSignatureTags, 2000);

// ===== DIAGNÓSTICO URGENTE - EJECUTAR INMEDIATAMENTE =====
async function diagnosticarEtiquetas() {
    console.log('🔴🔴🔴 DIAGNÓSTICO DE ETIQUETAS 🔴🔴🔴');
    
    try {
        // 1. Verificar qué datos tenemos en el servidor
        const response = await fetch('/api/contracts/all-data');
        const data = await response.json();
        
        console.log('📊 Datos completos del servidor:', data);
        
        if (data.success && data.data) {
            // Buscar específicamente tu archivo
            const miArchivo = data.data.find(item => item.file_id === '1SCx3mYusUdgA6Srav0xkXx5uuqBwDz2c');
            
            if (miArchivo) {
                console.log('🎯 ARCHIVO ENCONTRADO:', miArchivo);
                console.log('   - file_id:', miArchivo.file_id);
                console.log('   - data:', miArchivo.data);
                console.log('   - signature_tag en data:', miArchivo.data?.signature_tag);
                console.log('   - metadata:', miArchivo.metadata);
                console.log('   - history:', miArchivo.history);
                
                if (miArchivo.data && miArchivo.data.signature_tag === 'con_firma') {
                    console.log('✅ LA ETIQUETA ESTÁ CORRECTAMENTE GUARDADA EN EL SERVIDOR');
                    console.log('❓ EL PROBLEMA ES QUE NO SE ESTÁ MOSTRANDO EN LA INTERFAZ');
                }
            } else {
                console.log('❌ NO SE ENCONTRÓ EL ARCHIVO ESPECÍFICO');
            }
        }
        
        // 2. Verificar qué estamos recibiendo en loadContractDetails
        console.log('🔄 Probando loadContractDetails directamente...');
        
        // Si hay un contrato seleccionado
        if (currentContractId) {
            const contractResponse = await fetch(`/api/contracts/${currentContractId}`);
            const contractData = await contractResponse.json();
            
            console.log('📁 Datos del contrato actual:', contractData);
            
            // Buscar archivos PDF
            if (contractData.files && contractData.files.pdf) {
                contractData.files.pdf.forEach(file => {
                    if (file.id === '1SCx3mYusUdgA6Srav0xkXx5uuqBwDz2c' || 
                        file.name.toLowerCase().includes('contrato')) {
                        console.log('📄 ARCHIVO EN CONTRATO ACTUAL:', file);
                    }
                });
            }
        }
        
    } catch (error) {
        console.error('❌ Error en diagnóstico:', error);
    }
}

// Ejecutar diagnóstico después de 3 segundos
setTimeout(diagnosticarEtiquetas, 3000);

// ===== SISTEMA DE MONTOS COMPROMETIDOS =====

// Variable para almacenar el contrato seleccionado
let currentFinancialContractId = null;

// Función para mostrar el panel de compromisos
function showCommitmentPanel() {
    console.log('💰 Mostrando panel de compromisos');
    
    if (!currentContractId) {
        showNotification('❌ Debes seleccionar un contrato primero', 'error');
        return;
    }
    
    // Guardar el ID del contrato actual para este panel
    currentFinancialContractId = currentContractId;
    
    // Crear modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'commitmentPanelModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header bg-blue-900/20 border-b border-blue-700/30">
                <h3 class="modal-title text-2xl">
                    <i class="fas fa-hand-holding-usd text-blue-500 mr-2"></i>
                    Gestión de Montos Comprometidos
                </h3>
                <p class="text-sm text-gray-400 mt-2" id="commitmentContractInfo">
                    Cargando información del contrato...
                </p>
            </div>
            <div class="modal-body">
                <div id="commitmentLoading" class="text-center py-8">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p class="text-gray-400">Cargando datos financieros...</p>
                </div>
                
                <div id="commitmentContent" class="hidden">
                    <!-- CONTENIDO PRINCIPAL - SE LLENARÁ CON JS -->
                </div>
            </div>
            <div class="modal-footer">
                <button onclick="closeModal()" class="btn-secondary">
                    <i class="fas fa-times mr-2"></i>
                    Cerrar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Cargar datos financieros
    loadContractFinancialData(currentContractId);
}

// Función para cargar datos financieros del contrato
async function loadContractFinancialData(contractId) {
    try {
        console.log(`💰 Cargando datos financieros: ${contractId}`);
        
        const response = await fetch(`/api/contracts/get-contract-financial/${contractId}`);
        const data = await response.json();
        
        console.log('📊 Datos financieros:', data);
        
        // Ocultar loading, mostrar contenido
        document.getElementById('commitmentLoading')?.classList.add('hidden');
        const contentDiv = document.getElementById('commitmentContent');
        if (contentDiv) {
            contentDiv.classList.remove('hidden');
            displayFinancialDashboard(data);
        }
        
    } catch (error) {
        console.error('❌ Error cargando datos financieros:', error);
        showNotification('Error cargando datos: ' + error.message, 'error');
        
        document.getElementById('commitmentLoading')?.classList.add('hidden');
        const contentDiv = document.getElementById('commitmentContent');
        if (contentDiv) {
            contentDiv.classList.remove('hidden');
            contentDiv.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
                    <p class="text-gray-400">Error al cargar datos financieros</p>
                    <p class="text-sm text-red-400 mt-2">${error.message}</p>
                    <button onclick="loadContractFinancialData('${contractId}')" class="btn-secondary mt-4">
                        <i class="fas fa-sync-alt mr-2"></i>
                        Reintentar
                    </button>
                </div>
            `;
        }
    }
}

// Función para mostrar el dashboard financiero
function displayFinancialDashboard(data) {
    if (!data.success) {
        showNotification('Error: ' + data.error, 'error');
        return;
    }
    
    const contentDiv = document.getElementById('commitmentContent');
    if (!contentDiv) return;
    
    const contract = data.contract;
    const invoiced = data.invoiced;
    const committed = data.committed;
    const available = data.available;
    const percentages = data.percentages;
    
    // Actualizar info del contrato
    const contractInfo = document.getElementById('commitmentContractInfo');
    if (contractInfo) {
        contractInfo.innerHTML = `
            <span class="font-semibold text-blue-400">${contract.name || 'Contrato'}</span>
            ${contract.number ? ` • N°: ${contract.number}` : ''}
            ${contract.client ? ` • Cliente: ${contract.client}` : ''}
        `;
    }
    
    // Si no hay monto del contrato, mostrar mensaje
    if (!contract.max_amount) {
        contentDiv.innerHTML = `
            <div class="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-8 text-center">
                <i class="fas fa-exclamation-triangle text-4xl text-yellow-500 mb-4"></i>
                <h4 class="text-xl font-semibold text-yellow-400 mb-2">Monto del contrato no encontrado</h4>
                <p class="text-gray-300 mb-4">
                    Para gestionar compromisos, primero debes extraer los datos del contrato 
                    (especialmente el monto máximo o total).
                </p>
                <button onclick="closeModal(); activateTab('contracts');" class="btn-primary">
                    <i class="fas fa-file-contract mr-2"></i>
                    Ir a Documento
                </button>
            </div>
        `;
        return;
    }
    
    // Construir HTML del dashboard
    let html = `
        <!-- RESUMEN GENERAL - 4 TARJETAS -->
        <div class="financial-grid mb-8">
            <div class="financial-card financial-card-blue">
                <div class="financial-card-title">
                    <i class="fas fa-file-contract mr-1"></i>
                    Monto Contrato
                </div>
                <div class="financial-card-value">
                    $${formatNumber(contract.max_amount)}
                </div>
            </div>
            
            <div class="financial-card financial-card-green">
                <div class="financial-card-title">
                    <i class="fas fa-file-invoice mr-1"></i>
                    Facturado
                </div>
                <div class="financial-card-value">
                    $${formatNumber(invoiced.total)}
                </div>
                <div class="financial-card-subtitle">
                    ${invoiced.count} factura(s)
                </div>
            </div>
            
            <div class="financial-card financial-card-yellow">
                <div class="financial-card-title">
                    <i class="fas fa-hand-holding-usd mr-1"></i>
                    Comprometido
                </div>
                <div class="financial-card-value">
                    $${formatNumber(committed.total)}
                </div>
                <div class="financial-card-subtitle">
                    ${committed.count} compromiso(s)
                </div>
            </div>
            
            <div class="financial-card ${available.balance >= 0 ? 'financial-card-purple' : 'financial-card-red'}">
                <div class="financial-card-title">
                    <i class="fas fa-coins mr-1"></i>
                    Disponible
                </div>
                <div class="financial-card-value">
                    $${formatNumber(available.balance)}
                </div>
                <div class="financial-card-subtitle">
                    ${available.percentage.toFixed(1)}% disponible
                </div>
            </div>
        </div>        
        
        <!-- BARRA DE PROGRESO CON TRES SEGMENTOS -->
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-5 mb-8">
            <h4 class="font-semibold mb-4 flex items-center gap-2">
                <i class="fas fa-chart-pie text-blue-400"></i>
                Distribución del Monto del Contrato
            </h4>
            
            <!-- Barra de progreso segmentada -->
            <div class="h-8 bg-gray-700 rounded-full overflow-hidden flex mb-3">
                <div class="bg-green-500 h-full flex items-center justify-center text-xs font-medium text-white px-2"
                     style="width: ${Math.min(percentages.invoiced, 100)}%">
                    ${percentages.invoiced > 5 ? `$${formatNumber(invoiced.total)}` : ''}
                </div>
                <div class="bg-yellow-500 h-full flex items-center justify-center text-xs font-medium text-white px-2"
                     style="width: ${Math.min(percentages.committed, 100)}%">
                    ${percentages.committed > 5 ? `$${formatNumber(committed.total)}` : ''}
                </div>
                <div class="bg-purple-500 h-full flex items-center justify-center text-xs font-medium text-white px-2"
                     style="width: ${Math.max(Math.min(percentages.available, 100), 0)}%">
                    ${percentages.available > 5 ? `$${formatNumber(available.balance)}` : ''}
                </div>
            </div>
            
            <!-- Leyenda -->
            <div class="flex flex-wrap gap-4 text-sm mt-2">
                <div class="flex items-center gap-2">
                    <span class="w-3 h-3 bg-green-500 rounded-full"></span>
                    <span>Facturado (${percentages.invoiced.toFixed(1)}%)</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="w-3 h-3 bg-yellow-500 rounded-full"></span>
                    <span>Comprometido (${percentages.committed.toFixed(1)}%)</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="w-3 h-3 bg-purple-500 rounded-full"></span>
                    <span>Disponible (${percentages.available.toFixed(1)}%)</span>
                </div>
            </div>
            
            <!-- Ecuación -->
            <div class="mt-4 p-3 bg-gray-900/50 rounded-lg text-center">
                <span class="text-blue-400 font-mono">$${formatNumber(contract.max_amount)}</span>
                <span class="mx-2 text-gray-400">=</span>
                <span class="text-green-400 font-mono">$${formatNumber(invoiced.total)}</span>
                <span class="mx-2 text-gray-400">+</span>
                <span class="text-yellow-400 font-mono">$${formatNumber(committed.total)}</span>
                <span class="mx-2 text-gray-400">+</span>
                <span class="text-purple-400 font-mono">$${formatNumber(available.balance)}</span>
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- COLUMNA IZQUIERDA: AGREGAR COMPROMISO -->
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-5">
                <h4 class="font-semibold mb-4 flex items-center gap-2 text-yellow-400">
                    <i class="fas fa-plus-circle"></i>
                    Agregar Nuevo Compromiso
                </h4>
                
                <form id="addCommitmentForm" onsubmit="event.preventDefault(); addNewCommitment();">
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2">
                            Monto a Comprometer <span class="text-red-400">*</span>
                        </label>
                        <div class="relative">
                            <span class="absolute left-3 top-2 text-gray-400">$</span>
                            <input type="number" 
                                id="commitmentAmount"
                                class="w-full bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-4 py-2 text-white"
                                placeholder="0.00"
                                step="0.01"
                                min="0.01"
                                max="${contract.max_amount}"
                                required>
                        </div>
                        <div class="flex justify-between text-xs mt-1">
                            <span class="text-gray-500">Máximo del contrato: <span class="text-blue-400 font-medium">$${formatNumber(contract.max_amount)}</span></span>
                            <span class="text-gray-500">Disponible actual: <span class="${available.balance >= 0 ? 'text-purple-400' : 'text-red-400'} font-medium">$${formatNumber(available.balance)}</span></span>
                        </div>
                        <!-- Barra de progreso del contrato -->
                        <div class="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div class="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-purple-500" 
                                style="width: ${Math.min(((invoiced.total + committed.total) / contract.max_amount * 100), 100)}%"></div>
                        </div>
                    </div>
                    
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2">
                            Descripción / Concepto
                        </label>
                        <input type="text" 
                               id="commitmentDescription"
                               class="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
                               placeholder="Ej: Anticipo, Pago parcial, Servicio X..."
                               value="Compromiso presupuestal">
                    </div>
                    
                    <div class="mb-4">
                        <label class="block text-sm font-medium mb-2">
                            Notas adicionales
                        </label>
                        <textarea id="commitmentNotes"
                                  class="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
                                  rows="2"
                                  placeholder="Detalles del compromiso..."></textarea>
                    </div>
                    
                    <button type="submit" 
                            class="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 font-medium">
                        <i class="fas fa-save"></i>
                        Registrar Compromiso
                    </button>
                </form>
            </div>
            
            <!-- COLUMNA DERECHA: LISTA DE COMPROMISOS -->
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-5">
                <h4 class="font-semibold mb-4 flex items-center gap-2">
                    <i class="fas fa-list text-yellow-400"></i>
                    Compromisos Activos (${committed.count})
                </h4>
                
                <div id="commitmentsList" class="space-y-3 max-h-96 overflow-y-auto pr-2">
    `;
    
    // Lista de compromisos
    if (committed.commitments && committed.commitments.length > 0) {
        // Filtrar solo activos
        const activeCommitments = committed.commitments.filter(c => c.active !== false);
        
        if (activeCommitments.length === 0) {
            html += `
                <div class="text-center py-8">
                    <i class="fas fa-inbox text-3xl text-gray-600 mb-3"></i>
                    <p class="text-gray-400">No hay compromisos activos</p>
                </div>
            `;
        } else {
            activeCommitments.forEach((commitment, index) => {
                const date = commitment.created_at ? new Date(commitment.created_at).toLocaleDateString() : 'Fecha desconocida';
                
                html += `
                    <div class="bg-gray-900 border border-gray-700 rounded-lg p-3 commitment-item" id="commitment-${commitment.id}">
                        <div class="flex justify-between items-start">
                            <div class="flex-1">
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">#${index + 1}</span>
                                    <span class="font-medium text-yellow-400">$${formatNumber(commitment.amount)}</span>
                                </div>
                                <div class="text-sm text-gray-300 mb-1">
                                    ${commitment.description || 'Compromiso presupuestal'}
                                </div>
                                <div class="text-xs text-gray-500">
                                    <i class="fas fa-user mr-1"></i> ${commitment.created_by || 'Usuario'}
                                    <i class="fas fa-calendar ml-2 mr-1"></i> ${date}
                                </div>
                                ${commitment.notes ? `
                                    <div class="text-xs text-gray-400 mt-1 p-2 bg-gray-800 rounded">
                                        <i class="fas fa-comment mr-1"></i> ${commitment.notes}
                                    </div>
                                ` : ''}
                            </div>
                            <div class="flex gap-1">
                                <!-- BOTÓN DE ELIMINAR CON MODAL -->
                                <button onclick="showDeleteCommitmentModal('${contract.id}', '${commitment.id}', ${commitment.amount}, '${commitment.description || 'Compromiso presupuestal'}')" 
                                        class="text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 p-1.5 rounded transition-colors"
                                        title="Eliminar compromiso">
                                    <i class="fas fa-trash-alt text-sm"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
    } else {
        html += `
            <div class="text-center py-8">
                <i class="fas fa-hand-holding-usd text-3xl text-gray-600 mb-3"></i>
                <p class="text-gray-400">No hay compromisos registrados</p>
                <p class="text-xs text-gray-500 mt-2">Agrega tu primer compromiso en el formulario</p>
            </div>
        `;
    }
    
    html += `
                </div>
            </div>
        </div>
        
        <!-- HISTORIAL DE FACTURAS (resumen) -->
        <div class="mt-6 bg-gray-800 border border-gray-700 rounded-lg p-5">
            <h4 class="font-semibold mb-3 flex items-center gap-2">
                <i class="fas fa-file-invoice text-green-400"></i>
                Facturas del Contrato (${invoiced.count})
            </h4>
            
            <div class="max-h-60 overflow-y-auto">
    `;
    
    if (invoiced.invoices && invoiced.invoices.length > 0) {
        html += `<div class="space-y-2">`;
        invoiced.invoices.forEach((invoice, idx) => {
            html += `
                <div class="flex justify-between items-center p-2 hover:bg-gray-700/50 rounded">
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-500">${idx + 1}.</span>
                        <span class="text-sm truncate max-w-xs">${invoice.name || 'Factura'}</span>
                        ${invoice.has_credit_notes ? '<span class="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded">NC</span>' : ''}
                    </div>
                    <span class="text-sm font-medium text-green-400">$${formatNumber(invoice.amount || 0)}</span>
                </div>
            `;
        });
        html += `</div>`;
    } else {
        html += `<p class="text-gray-500 text-center py-4">No hay facturas registradas</p>`;
    }
    
    html += `
            </div>
        </div>
    `;
    
    contentDiv.innerHTML = html;
}

// Función para agregar nuevo compromiso
async function addNewCommitment() {
    if (!currentFinancialContractId) {
        showNotification('❌ Error: No hay contrato seleccionado', 'error');
        return;
    }
    
    const amountInput = document.getElementById('commitmentAmount');
    const descriptionInput = document.getElementById('commitmentDescription');
    const notesInput = document.getElementById('commitmentNotes');
    
    const amount = amountInput.value;
    const description = descriptionInput.value;
    const notes = notesInput.value;
    
    if (!amount || parseFloat(amount) <= 0) {
        showNotification('❌ Ingresa un monto válido', 'error');
        return;
    }
    
    showLoading('Registrando compromiso...');
    
    try {
        const response = await fetch(`/api/contracts/add-commitment/${currentFinancialContractId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: parseFloat(amount),
                description: description,
                notes: notes
            })
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            // Mostrar mensaje de éxito (con advertencia si aplica)
            if (data.warning) {
                showNotification(`⚠️ ${data.message}`, 'warning');
                
                // Mostrar detalles de la advertencia en un modal pequeño
                showWarningDetails(data.warning);
            } else {
                showNotification('✅ Compromiso registrado exitosamente', 'success');
            }
            
            // ===== PASO 1: CERRAR EL MODAL =====
            closeModal(); // Cierra el modal del panel de compromisos
            
            // ===== PASO 2: ACTUALIZAR LA VISTA DE FACTURAS =====
            if (currentContractId) {
                // Pequeña pausa para que se cierre el modal primero
                setTimeout(() => {
                    // Recargar las facturas del contrato actual para ver el compromiso reflejado
                    loadContractInvoices(currentContractId);
                    
                    // Mostrar notificación de actualización
                    showNotification('📊 Panel de facturas actualizado con el nuevo compromiso', 'info');
                }, 300);
            }
            
            // ===== PASO 3: OPCIONAL - Mostrar resumen del compromiso =====
            if (data.financial_summary) {
                showCommitmentSummary(data.financial_summary);
            }
            
        } else {
            // Si hay error de límite, mostrar información
            if (data.available !== undefined) {
                showNotification(`❌ ${data.error}`, 'error');
                
                // Actualizar el máximo del input
                amountInput.max = data.available;
                amountInput.placeholder = `Máx: $${formatNumber(data.available)}`;
            } else {
                showNotification(`❌ ${data.error}`, 'error');
            }
        }
        
    } catch (error) {
        hideLoading();
        showNotification('❌ Error: ' + error.message, 'error');
    }
}

// Función para mostrar detalles de advertencia (opcional)
function showWarningDetails(warning) {
    if (!warning || !warning.details) return;
    
    const details = warning.details;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header bg-yellow-900/20 border-b border-yellow-700/30">
                <h3 class="modal-title text-yellow-400">
                    <i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>
                    Advertencia de Sobregiro
                </h3>
            </div>
            <div class="modal-body">
                <div class="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4 mb-4">
                    <p class="text-yellow-400 font-medium mb-2">${warning.message}</p>
                    <p class="text-sm text-gray-300">El contrato quedará con saldo negativo:</p>
                </div>
                
                <div class="space-y-3">
                    <div class="flex justify-between py-2 border-b border-gray-700">
                        <span class="text-gray-400">Monto del contrato:</span>
                        <span class="font-mono text-blue-400">$${formatNumber(details.contract_amount)}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-gray-700">
                        <span class="text-gray-400">Facturado:</span>
                        <span class="font-mono text-green-400">$${formatNumber(details.invoiced)}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-gray-700">
                        <span class="text-gray-400">Comprometido actual:</span>
                        <span class="font-mono text-yellow-400">$${formatNumber(details.current_committed)}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-gray-700">
                        <span class="text-gray-400">Nuevo compromiso:</span>
                        <span class="font-mono text-yellow-400 font-bold">+$${formatNumber(details.new_commitment)}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-gray-700">
                        <span class="text-gray-400">Total usado:</span>
                        <span class="font-mono text-red-400">$${formatNumber(details.new_total)}</span>
                    </div>
                    <div class="flex justify-between py-2">
                        <span class="text-gray-400 font-medium">Nuevo saldo:</span>
                        <span class="font-mono text-red-400 font-bold text-xl">$${formatNumber(details.new_balance)}</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button onclick="closeModal()" class="btn-primary">
                    <i class="fas fa-check mr-2"></i>
                    Entendido
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Función para mostrar resumen del compromiso (opcional)
function showCommitmentSummary(summary) {
    // Pequeña notificación tipo toast con resumen
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-xl z-50 animate-slide-up';
    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="bg-green-600 rounded-full p-2">
                <i class="fas fa-check text-white text-sm"></i>
            </div>
            <div>
                <h4 class="font-semibold text-green-400 mb-1">Compromiso Registrado</h4>
                <div class="text-sm space-y-1">
                    <div class="flex gap-3">
                        <span class="text-gray-400">Contrato:</span>
                        <span class="text-blue-400 font-mono">$${formatNumber(summary.contract_amount)}</span>
                    </div>
                    <div class="flex gap-3">
                        <span class="text-gray-400">Disponible antes:</span>
                        <span class="text-purple-400 font-mono">$${formatNumber(summary.available_before)}</span>
                    </div>
                    <div class="flex gap-3">
                        <span class="text-gray-400">Disponible después:</span>
                        <span class="${summary.available_after >= 0 ? 'text-purple-400' : 'text-red-400'} font-mono font-bold">
                            $${formatNumber(summary.available_after)}
                        </span>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">
                        ${summary.total_used_percentage.toFixed(1)}% del contrato utilizado
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Eliminar después de 5 segundos
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Función para mostrar modal de confirmación de eliminación de compromiso
function showDeleteCommitmentModal(contractId, commitmentId, amount, description) {
    console.log(`🗑️ Mostrando modal de confirmación para eliminar compromiso: ${commitmentId}`);
    
    // Cerrar cualquier modal existente primero
    const existingModal = document.getElementById('deleteCommitmentConfirmModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'deleteCommitmentConfirmModal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header bg-red-900/20 border-b border-red-700/30">
                <h3 class="modal-title text-red-400">
                    <i class="fas fa-exclamation-triangle text-red-500 mr-2"></i>
                    Confirmar Eliminación de Compromiso
                </h3>
            </div>
            <div class="modal-body py-6">
                <div class="text-center mb-4">
                    <div class="inline-flex items-center justify-center w-20 h-20 bg-red-900/30 rounded-full mb-4">
                        <i class="fas fa-hand-holding-usd text-4xl text-red-500"></i>
                    </div>
                    <h4 class="text-xl font-semibold text-white mb-2">¿Eliminar compromiso?</h4>
                    <p class="text-gray-300 mb-1">Estás a punto de eliminar:</p>
                    <div class="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3 mt-2 mb-3">
                        <p class="font-medium text-yellow-400">${description || 'Compromiso presupuestal'}</p>
                        <p class="text-2xl font-bold text-yellow-400 mt-1">$${formatNumber(amount)}</p>
                    </div>
                </div>
                
                <div class="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4 mt-2">
                    <div class="flex items-start gap-3">
                        <i class="fas fa-info-circle text-yellow-500 mt-0.5"></i>
                        <div class="text-sm text-gray-300">
                            <span class="font-semibold text-yellow-400">⚠️ Esta acción no se puede deshacer</span>
                            <p class="mt-1 text-gray-400">
                                El compromiso será eliminado permanentemente y el monto volverá a estar disponible.
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="flex items-center gap-2 mt-6 p-3 bg-gray-800/50 rounded-lg">
                    <input type="checkbox" id="confirmDeleteCommitmentCheckbox" class="form-checkbox h-5 w-5 text-red-500 bg-gray-700 border-gray-600 rounded">
                    <label for="confirmDeleteCommitmentCheckbox" class="text-sm text-gray-300">
                        Confirmo que quiero eliminar este compromiso permanentemente
                    </label>
                </div>
            </div>
            <div class="modal-footer flex justify-between">
                <button onclick="closeModal()" class="btn-secondary px-6 py-2.5">
                    <i class="fas fa-times mr-2"></i>
                    Cancelar
                </button>
                <button onclick="deleteCommitment('${contractId}', '${commitmentId}')" 
                        id="confirmDeleteCommitmentBtn"
                        class="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled>
                    <i class="fas fa-trash-alt"></i>
                    Sí, eliminar compromiso
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Habilitar el botón solo cuando el checkbox esté marcado
    const checkbox = document.getElementById('confirmDeleteCommitmentCheckbox');
    const confirmBtn = document.getElementById('confirmDeleteCommitmentBtn');
    
    checkbox.addEventListener('change', function() {
        confirmBtn.disabled = !this.checked;
    });
}

// Función para eliminar compromiso (CORREGIDA - cierra el modal correctamente)
async function deleteCommitment(contractId, commitmentId) {
    try {
        console.log(`🗑️ Eliminando compromiso: ${commitmentId}`);
        
        // CERRAR EL MODAL DE CONFIRMACIÓN PRIMERO
        const confirmModal = document.getElementById('deleteCommitmentConfirmModal');
        if (confirmModal) {
            confirmModal.remove(); // Eliminar el modal de confirmación
        }
        
        showLoading('Eliminando compromiso...');
        
        const response = await fetch(`/api/contracts/delete-commitment/${contractId}/${commitmentId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            showNotification('✅ Compromiso eliminado exitosamente', 'success');
            
            // Actualizar la vista
            setTimeout(() => {
                // Si estamos en el panel de compromisos, recargarlo
                if (currentFinancialContractId) {
                    loadContractFinancialData(currentFinancialContractId);
                }
                
                // Si estamos en la vista de facturas, recargarla también
                if (currentContractId) {
                    loadContractInvoices(currentContractId);
                }
            }, 300);
            
        } else {
            showNotification('❌ Error: ' + data.error, 'error');
        }
        
    } catch (error) {
        hideLoading();
        showNotification('❌ Error: ' + error.message, 'error');
    }
}


// Función auxiliar para formatear números (si no existe en main.js)
if (typeof window.formatNumber !== 'function') {
    window.formatNumber = function(num) {
        if (num === null || num === undefined) return '0.00';
        try {
            return parseFloat(num).toLocaleString('es-MX', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } catch {
            return '0.00';
        }
    };
}