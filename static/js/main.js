// ===== SISTEMA DE NAVEGACIÓN POR PESTAÑAS =====
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar currentContractId desde localStorage si existe
    const savedContractId = localStorage.getItem('currentContractId');
    if (savedContractId) {
        currentContractId = savedContractId;
        console.log(`📂 currentContractId inicializado desde localStorage: ${currentContractId}`);
    }
    
    // Inicializar primera pestaña
    activateTab('contracts');
    
    // Agregar event listeners a las pestañas
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            activateTab(tabId);
        });
    });
    
    // Configurar búsqueda global
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                performSearch(this.value.trim());
            }
        });
    }
    
    // Marcar servidor como conectado
    document.getElementById('serverStatus').innerHTML = 
        '<span class="text-green-500">✓ Conectado</span>';
    
    // Probar conexión con Drive después de 2 segundos
    setTimeout(() => {
        if (document.querySelector('.tab-contracts.active')) {
            testDriveConnection();
        }
    }, 2000);
});

// Agrega esto en tu DOMContentLoaded
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeAllModals();
    }
});

function getTabName(tabId) {
    const names = {
        'contracts': 'Contratos',
        'invoices': 'Facturas',
        'payments': 'Pacientes y Recetas',
        'monitoring': 'Gestión de Citas',
        'documents': 'Documentos',
        'reports': 'Predecir Diagnóstico'
    };
    return names[tabId] || tabId;
}

function activateTab(tabId) {
    console.log(`=== ACTIVANDO PESTAÑA: ${tabId} ===`);
    
    // Verificar que existan los elementos
    const tabElement = document.querySelector(`.tab-item[data-tab="${tabId}"]`);
    const paneElement = document.getElementById(`${tabId}-tab`);
    
    if (!tabElement || !paneElement) {
        console.error('❌ Elementos de pestaña no encontrados');
        return;
    }
    
    // Desactivar todos los tabs
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none';
    });
    
    // Activar el tab seleccionado
    tabElement.classList.add('active');
    paneElement.classList.add('active');
    paneElement.style.display = 'block';
    
    console.log(`✅ Pestaña ${tabId} activada`);
    
    // Cargar contenido según la pestaña
    if (tabId === 'contracts') {
        console.log('📂 Iniciando carga de contratos');
        loadContracts();
    } else if (tabId === 'invoices') {
        console.log('🧾 Iniciando carga de facturas');
        
        // Intentar recuperar currentContractId de localStorage si no está definido
        if (!currentContractId) {
            currentContractId = localStorage.getItem('currentContractId');
            console.log(`🔄 currentContractId recuperado de localStorage: ${currentContractId}`);
        }
        
        if (currentContractId) {
            console.log(`📁 Contrato seleccionado: ${currentContractId}`);
            loadContractInvoices(currentContractId);
        } else {
            console.log('ℹ️ No hay contrato seleccionado');
            const invoiceList = document.getElementById('invoicesList');
            if (invoiceList) {
                invoiceList.innerHTML = `
                    <div class="text-center py-12">
                        <i class="fas fa-hand-point-left text-4xl text-gray-600 mb-4"></i>
                        <p class="text-gray-400">Selecciona un contrato primero</p>
                        <p class="text-sm text-gray-500 mt-2">Ve a la pestaña Contratos y selecciona una carpeta</p>
                    </div>
                `;
            }
        }
        } else if (tabId === 'monitoring') {
            console.log('📅 Cargando gestión de citas');
            loadAppointmentsDashboard(); // Cambiado de loadMonitoringDashboard()
        } else if (tabId === 'diag') {
            console.log('🔮 Cargando sistema de predicción de diagnósticos');
            loadDiagnosisDashboard();
        } else if (tabId === 'payments') {
            console.log('💰 Cargando módulo de pagos');
            
            // Verificar si loadPaymentsDashboard existe
            if (typeof loadPaymentsDashboard === 'function') {
                loadPaymentsDashboard();
            } 
            // Si no existe, intentar con loadPatientsDashboard
            else if (typeof loadPatientsDashboard === 'function') {
                console.log('⚡ Usando loadPatientsDashboard como fallback');
                window.loadPaymentsDashboard = loadPatientsDashboard;
                loadPatientsDashboard();
            }
            else {
                console.error('❌ No se encontró función para cargar pacientes');
                
                // Mostrar mensaje de error en la interfaz
                const content = document.getElementById('payments-content');
                if (content) {
                    content.innerHTML = `
                        <div class="bg-red-900/30 border border-red-700 rounded-lg p-6 text-center">
                            <i class="fas fa-exclamation-triangle text-red-500 text-4xl mb-3"></i>
                            <h3 class="text-lg font-medium text-red-400 mb-2">Error de carga</h3>
                            <p class="text-gray-300 mb-4">No se pudo cargar el módulo de pacientes. Intentando recargar scripts...</p>
                            <button onclick="reloadPatientsScript()" class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded">
                                Reintentar
                            </button>
                        </div>
                    `;
                }
                
                // Intentar recargar el script de pacientes
                reloadPatientsScript();
            }
        }
    
    // Notificación
    showNotification(`Cambiado a: ${getTabName(tabId)}`);
}

// ===== FUNCIONES UTILITARIAS GENERALES =====

// Variables globales
let currentContractId = null;

// Definición de campos GLOBALMENTE
const CONTRACT_FIELDS = [
    {
        'id': 'status',
        'name': 'Estado',
        'type': 'select',
        'required': true,
        'options': ['Activo', 'Pendiente', 'Terminado', 'Cancelado'],
        'default': 'Activo'
    },
];

const IA_CONTRACT_FIELDS = [
    {
        'id': 'tipo_adjudicacion',
        'name': 'Tipo de Adjudicación',
        'type': 'text',
        'placeholder': 'Ej: Licitación Pública, Adjudicación Directa'
    },
    {
        'id': 'concepto',
        'name': 'Concepto',
        'type': 'text',
        'placeholder': 'Descripción del contrato'
    },
    {
        'id': 'proveedor',
        'name': 'Proveedor',
        'type': 'text',
        'placeholder': 'Nombre del proveedor'
    },
    {
        'id': 'folio_adjudicacion',
        'name': 'Folio del Tipo de Adjudicación',
        'type': 'text',
        'placeholder': 'Número de folio'
    },
    {
        'id': 'partida_presupuestal',
        'name': 'Partida Presupuestal',
        'type': 'text',
        'placeholder': 'Código presupuestal'
    },
    {
        'id': 'nombre_partida',
        'name': 'Nombre de la Partida Presupuestal',
        'type': 'text',
        'placeholder': 'Nombre descriptivo'
    },
    {
        'id': 'numero_oficio',
        'name': 'Número de Oficio',
        'type': 'text',
        'placeholder': 'Número oficial'
    },
    {
        'id': 'fecha_oficio',
        'name': 'Fecha del Oficio',
        'type': 'date'
    },
    {
        'id': 'fecha_suscripcion',
        'name': 'Fecha de Suscripción',
        'type': 'date'
    },
    {
        'id': 'vigencia_inicial',
        'name': 'Vigencia Inicial',
        'type': 'date'
    },
    {
        'id': 'vigencia_final',
        'name': 'Vigencia Final',
        'type': 'date'
    },
    {
        'id': 'monto_minimo',
        'name': 'Monto Mínimo',
        'type': 'number',
        'placeholder': '0.00',
        'step': '0.01'
    },
    {
        'id': 'monto_maximo',
        'name': 'Monto Máximo',
        'type': 'number',
        'placeholder': '0.00',
        'step': '0.01'
    },
    {
        'id': 'clasificacion_contrato',
        'name': 'Clasificación del Contrato',
        'type': 'text',
        'placeholder': 'Ej: Obra, Servicios, Suministro'
    },
    {
        'id': 'observaciones',
        'name': 'Observaciones',
        'type': 'textarea',
        'placeholder': 'Observaciones adicionales del contrato'
    }
];

const INVOICE_FIELDS = [
    {
        'id': 'invoice_number',
        'name': 'Número de Factura',
        'type': 'text',
        'required': true
    },
    {
        'id': 'invoice_date',
        'name': 'Fecha de Factura',
        'type': 'date',
        'required': true
    },
    {
        'id': 'internal_folio',
        'name': 'Folio Interno de Factura',
        'type': 'text',
        'required': true
    },
    {
        'id': 'fiscal_folio',
        'name': 'Folio Fiscal de la Factura',
        'type': 'text',
        'required': false
    },
    {
        'id': 'funding_source',
        'name': 'Fuente de Financiamiento',
        'type': 'select',
        'required': true,
        'options': ['Propios', 'Federal', 'Estatal', 'Municipal', 'Mixto']
    },
    {
        'id': 'amount_before_tax',
        'name': 'Monto Antes de IVA',
        'type': 'number',
        'required': true
    },
    {
        'id': 'amount_with_tax',
        'name': 'Monto con IVA',
        'type': 'number',
        'required': true
    },
    {
        'id': 'tax_percentage',
        'name': 'Porcentaje de IVA',
        'type': 'number',
        'required': false
    },
    {
        'id': 'payable_account',
        'name': 'Cuenta por Pagar',
        'type': 'text',
        'required': false
    }
];

// Función para formatear fechas
function formatDate(dateString) {
    if (!dateString) return 'No disponible';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}

// Función para formatear números
function formatNumber(num) {
    if (!num) return '0.00';
    
    try {
        const number = typeof num === 'string' ? parseFloat(num) : num;
        return number.toLocaleString('es-MX', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    } catch (e) {
        return num;
    }
}

// Función para formatear montos en pesos mexicanos
function formatMexicanPesos(amount) {
    if (!amount) return '$0.00 MXN';
    
    try {
        // Convertir a número
        const num = typeof amount === 'string' ? 
            parseFloat(amount.replace(/[^0-9.-]+/g, '')) : 
            parseFloat(amount);
        
        if (isNaN(num)) return '$0.00 MXN';
        
        // Formato mexicano
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
    } catch (e) {
        return `$${amount} MXN`;
    }
}

// Función para formatear fecha para visualización
function formatDateDisplay(dateString) {
    if (!dateString) return '';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

// Función para formatear hora
function formatTime(timestamp) {
    if (!timestamp) return '';
    try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '';
    }
}

// Función para formatear tiempo relativo
function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    
    try {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'ahora mismo';
        if (diffMins < 60) return `hace ${diffMins} min`;
        if (diffHours < 24) return `hace ${diffHours} horas`;
        if (diffDays < 7) return `hace ${diffDays} días`;
        
        return date.toLocaleDateString('es-ES', { 
            month: 'short', 
            day: 'numeric' 
        });
    } catch {
        return '';
    }
}

// Función para formatear moneda
function formatCurrency(amount, currency) {
    if (!amount) return '$0.00';
    
    const formatter = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: currency || 'MXN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    return formatter.format(parseFloat(amount));
}

// Función para obtener icono de alerta
function getAlertIcon(type) {
    const icons = {
        'critical': 'fire',
        'warning': 'exclamation-triangle', 
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// Función para obtener texto de acción
function getActionText(action) {
    const texts = {
        'created': 'Creado',
        'updated': 'Actualizado',
        'deleted': 'Eliminado',
        'extracted': 'Extraído',
        'processed': 'Procesado'
    };
    return texts[action] || action || 'Acción';
}

// Función para obtener texto de tipo
function getTypeText(type) {
    const texts = {
        'contract': 'Contrato',
        'invoice': 'Factura',
        'payment': 'Pago',
        'document': 'Documento'
    };
    return texts[type] || type || 'General';
}

// Función para obtener clase badge de tipo
function getTypeBadgeClass(type) {
    const classes = {
        'contract': 'badge-blue',
        'invoice': 'badge-green',
        'payment': 'badge-yellow',
        'document': 'badge-purple'
    };
    return classes[type] || 'badge-gray';
}

// Función para obtener clase badge de acción
function getActionBadgeClass(action) {
    const classes = {
        'created': 'badge-success',
        'updated': 'badge-info',
        'deleted': 'badge-danger',
        'extracted': 'badge-purple'
    };
    return classes[action] || 'badge-secondary';
}

// Función para obtener clase badge de estado
function getStatusBadgeClass(status) {
    const classes = {
        'Completado': 'badge-success',
        'Pendiente': 'badge-warning',
        'Error': 'badge-danger',
        'En proceso': 'badge-info'
    };
    return classes[status] || 'badge-secondary';
}

// Función para obtener color de estado
function getStatusColor(status) {
    const colors = {
        'Activo': '#10b981',
        'Pendiente': '#f59e0b',
        'Terminado': '#3b82f6',
        'Cancelado': '#ef4444',
        'Vencido': '#8b5cf6'
    };
    return colors[status] || '#6b7280';
}

// Función para obtener texto de nivel de riesgo
function getRiskLevelText(level) {
    const texts = {
        1: 'Bajo riesgo',
        2: 'Riesgo medio',
        3: 'Alto riesgo'
    };
    return texts[level] || 'Riesgo desconocido';
}

// Función para obtener clase de texto de riesgo
function getRiskTextClass(level) {
    const classes = {
        1: 'text-green-400',
        2: 'text-yellow-400',
        3: 'text-red-400'
    };
    return classes[level] || 'text-gray-400';
}

// Función para obtener clase badge de tipo de reporte
function getReportTypeBadge(format) {
    const badges = {
        'pdf': 'badge-danger',
        'excel': 'badge-success',
        'html': 'badge-info',
        'ppt': 'badge-warning'
    };
    return badges[format] || 'badge-secondary';
}

// ===== FUNCIONES PARA MANEJAR MODALES =====
function closeModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.remove();
    });
}

// ===== FUNCIONES DE LOADING =====
function showLoading(message = 'Cargando...') {
    let loading = document.getElementById('global-loading');
    
    if (!loading) {
        loading = document.createElement('div');
        loading.id = 'global-loading';
        loading.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50';
        loading.innerHTML = `
            <div class="bg-gray-800 border border-gray-700 rounded-lg p-6 flex items-center gap-3">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span>${message}</span>
            </div>
        `;
        document.body.appendChild(loading);
    }
}

function hideLoading() {
    const loading = document.getElementById('global-loading');
    if (loading) {
        loading.remove();
    }
}

function showLoadingInContracts(message) {
    const loadingDiv = document.getElementById('contractsLoading');
    if (loadingDiv) {
        loadingDiv.innerHTML = `
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p class="text-gray-400">${message}</p>
        `;
    }
}

function hideLoadingInContracts() {
    const loadingDiv = document.getElementById('contractsLoading');
    if (loadingDiv && loadingDiv.parentElement === document.getElementById('contractsList')) {
        loadingDiv.remove();
    }
}

function showLoadingInContractDetail(message) {
    const detailSection = document.getElementById('contractDetail');
    if (detailSection) {
        detailSection.innerHTML = `
            <div class="text-center py-12">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p class="text-gray-400">${message}</p>
            </div>
        `;
    }
}

function hideLoadingInContractDetail() {
    // Esta función se llama después de cargar los detalles
}

function showLoadingInInvoices(message) {
    const invoiceList = document.getElementById('invoicesList');
    if (invoiceList) {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'text-center py-12';
        loadingDiv.innerHTML = `
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
            <p class="text-gray-400">${message}</p>
        `;
        invoiceList.appendChild(loadingDiv);
    }
}

function hideLoadingInInvoices() {
    const invoiceList = document.getElementById('invoicesList');
    if (invoiceList) {
        const loadingDiv = invoiceList.querySelector('.text-center.py-12');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }
}

function showLoadingInInvoiceDetail(message) {
    const detailSection = document.getElementById('invoiceDetail');
    if (detailSection) {
        detailSection.innerHTML = `
            <div class="text-center py-12">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                <p class="text-gray-400">${message}</p>
            </div>
        `;
    }
}

function hideLoadingInInvoiceDetail() {
    console.log('✅ Detalles de factura cargados');
}

function showLoadingInInvoiceList(message) {
    const invoiceList = document.getElementById('invoicesList');
    if (invoiceList) {
        invoiceList.innerHTML = `
            <div class="text-center py-12">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                <p class="text-gray-400">${message}</p>
            </div>
        `;
    }
}

function hideLoadingInInvoiceList() {
    console.log('✅ Lista de facturas cargada');
}

// ===== SISTEMA DE NOTIFICACIONES =====
function showNotification(message, type = 'info') {
    // Crear notificación toast
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 bg-gray-800 border ${
        type === 'success' ? 'border-green-700' : 
        type === 'error' ? 'border-red-700' : 'border-blue-700'
    } text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-fadeIn`;
    toast.innerHTML = `
        <i class="fas ${
            type === 'success' ? 'fa-check-circle text-green-500' : 
            type === 'error' ? 'fa-exclamation-circle text-red-500' : 
            'fa-info-circle text-blue-500'
        }"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remover después de 3 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// ===== FUNCIONES AUXILIARES PARA CONTRATOS =====
function getContractStatus(files) {
    const allFiles = [...files.pdf, ...files.documents, ...files.excel, ...files.images, ...files.others];
    const filesWithData = allFiles.filter(file => file.has_data);
    
    if (filesWithData.length === 0) return 'Sin datos';
    if (filesWithData.length === allFiles.length) return 'Completo';
    return 'Parcial';
}

function getContractStatusClass(files) {
    const status = getContractStatus(files);
    switch(status) {
        case 'Sin datos': return 'text-red-500';
        case 'Completo': return 'text-green-500';
        case 'Parcial': return 'text-yellow-500';
        default: return 'text-gray-500';
    }
}

// ===== FUNCIONES AUXILIARES PARA BARRA DE PROGRESO =====
function getProgressBarColor(percentage) {
    if (percentage > 100) return 'bg-red-500';
    if (percentage > 90) return 'bg-red-400';
    if (percentage > 80) return 'bg-yellow-500';
    if (percentage > 60) return 'bg-blue-500';
    return 'bg-green-500';
}

function getPercentageColor(percentage) {
    if (percentage > 100) return 'text-red-400';
    if (percentage > 90) return 'text-red-400';
    if (percentage > 80) return 'text-yellow-400';
    if (percentage > 60) return 'text-blue-400';
    return 'text-green-400';
}

// ===== FUNCIONES PARA CONTAR CAMPOS COMPLETADOS =====
function countCompletedFields(data) {
    let count = 0;
    
    // Contar campos básicos
    CONTRACT_FIELDS.forEach(field => {
        if (data[field.id] && data[field.id].toString().trim() !== '') {
            count++;
        }
    });
    
    // Contar campos de IA
    IA_CONTRACT_FIELDS.forEach(field => {
        if (data[field.id] && data[field.id].toString().trim() !== '') {
            count++;
        }
    });
    
    return count;
}

function calculateCompletionPercentage(data) {
    const totalFields = CONTRACT_FIELDS.length + IA_CONTRACT_FIELDS.length;
    const completed = countCompletedFields(data);
    return totalFields > 0 ? Math.round((completed / totalFields) * 100) : 0;
}

// ===== FUNCIONES AUXILIARES PARA RENDERIZADO =====
function renderTableRow(label, value, type) {
    const displayValue = type === 'textarea' ? 
        `<div class="whitespace-pre-line bg-gray-800 p-2 rounded max-h-32 overflow-y-auto">${value}</div>` : 
        `<div class="truncate">${value}</div>`;
    
    return `
        <tr>
            <td class="font-medium">
                <div>${label}</div>
                <div class="text-xs text-gray-400">${type}</div>
            </td>
            <td>${displayValue}</td>
        </tr>
    `;
}

function renderFieldInput(field) {
    const fieldId = `edit-${field.id}`;
    let inputHtml = '';
    
    switch(field.type) {
        case 'select':
            inputHtml = `
                <select id="${fieldId}" name="${field.id}" 
                        class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                        ${field.required ? 'required' : ''}>
                    <option value="">Seleccionar...</option>
                    ${(field.options || []).map(opt => `
                        <option value="${opt}" ${field.value === opt ? 'selected' : ''}>${opt}</option>
                    `).join('')}
                </select>
            `;
            break;
            
        case 'textarea':
            inputHtml = `
                <textarea id="${fieldId}" name="${field.id}" 
                          class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm h-24"
                          ${field.required ? 'required' : ''}
                          placeholder="${field.placeholder || ''}">${field.value || ''}</textarea>
            `;
            break;
            
        case 'date':
            inputHtml = `
                <input type="date" id="${fieldId}" name="${field.id}" 
                       class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                       value="${field.value || ''}"
                       ${field.required ? 'required' : ''}>
            `;
            break;
            
        case 'number':
            inputHtml = `
                <input type="number" id="${fieldId}" name="${field.id}" 
                       class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                       value="${field.value || ''}"
                       step="0.01"
                       ${field.required ? 'required' : ''}
                       placeholder="${field.placeholder || ''}">
            `;
            break;
            
        default:
            inputHtml = `
                <input type="text" id="${fieldId}" name="${field.id}" 
                       class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white text-sm"
                       value="${field.value || ''}"
                       ${field.required ? 'required' : ''}
                       placeholder="${field.placeholder || ''}">
            `;
    }
    
    return `
        <div class="form-group">
            <label for="${fieldId}" class="block text-sm font-medium mb-1">
                ${field.name}
                ${field.required ? '<span class="text-red-400 ml-1">*</span>' : ''}
            </label>
            ${inputHtml}
        </div>
    `;
}

// ===== FUNCIONES DE ACCIÓN RÁPIDA =====
function showQuickActionMenu() {
    const menu = document.createElement('div');
    menu.className = 'fixed right-4 top-24 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50';
    menu.innerHTML = `
        <div class="p-2">
            <button onclick="showCreateFolderModal()" class="w-full text-left px-4 py-2 hover:bg-gray-700 rounded flex items-center gap-2">
                <i class="fas fa-folder-plus text-blue-500"></i>
                Nueva Carpeta de Contrato
            </button>
            <button class="w-full text-left px-4 py-2 hover:bg-gray-700 rounded flex items-center gap-2">
                <i class="fas fa-receipt text-green-500"></i>
                Nueva Factura
            </button>
            <button class="w-full text-left px-4 py-2 hover:bg-gray-700 rounded flex items-center gap-2">
                <i class="fas fa-file-upload text-yellow-500"></i>
                Subir Documento
            </button>
        </div>
    `;
    
    document.body.appendChild(menu);
    
    // Cerrar al hacer clic fuera
    setTimeout(() => {
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        document.addEventListener('click', closeMenu);
    }, 10);
}

function showFilterModal() {
    showNotification('Funcionalidad de filtros en desarrollo', 'info');
}

function performSearch(query) {
    if (!query) return;
    
    showNotification(`Buscando: "${query}"`, 'info');
    
    // Simular resultados
    setTimeout(() => {
        showNotification(`Encontrados 5 resultados para: "${query}"`, 'success');
    }, 1000);
}

// ===== FUNCIONES DE CONEXIÓN =====
async function testDriveConnection() {
    try {
        showLoading('Probando conexión...');
        
        const response = await fetch('/api/drive/test-connection');
        const data = await response.json();
        
        if (data.success) {
            showNotification('Conexión exitosa', 'success');
        } else {
            showNotification(`Error: ${data.error}`, 'error');
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('Error en test de conexión:', error);
        showNotification('Error al probar conexión: ' + error.message, 'error');
        hideLoading();
    }
}

// Asegurar que Chart.js esté disponible
function ensureChartJS() {
    if (typeof Chart === 'undefined') {
        // Cargar Chart.js dinámicamente si no está disponible
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = function() {
            console.log('✅ Chart.js cargado');
        };
        document.head.appendChild(script);
    }
}

// Llamar esta función al cargar la página
document.addEventListener('DOMContentLoaded', function() {
    ensureChartJS();
});

// ============================================
// VERIFICACIÓN DE ROLES
// ============================================

// Verificar si el usuario tiene acceso a un módulo específico
function userCanAccess(moduleName) {
    if (!window.currentUser) return false;
    
    const role = window.currentUser.role;
    
    // Usuarios con acceso completo pueden acceder a todo
    if (role === 'full') return true;
    
    // Usuarios con acceso limitado solo pueden acceder a contracts e invoices
    if (role === 'limited') {
        return moduleName === 'contracts' || moduleName === 'invoices';
    }
    
    return false;
}

// Redirigir si no tiene acceso
function redirectIfNoAccess(moduleName) {
    if (!userCanAccess(moduleName)) {
        console.warn(`⚠️ Acceso denegado a módulo: ${moduleName}`);
        activateTab('contracts');
        return false;
    }
    return true;
}

// Sobrescribir la función activateTab para verificar permisos
const originalActivateTab = window.activateTab;
window.activateTab = function(tabName) {
    if (!userCanAccess(tabName)) {
        console.warn(`⛔ No tienes permiso para acceder a: ${tabName}`);
        return false;
    }
    return originalActivateTab(tabName);
};

// Función para recargar el script de pacientes
function reloadPatientsScript() {
    console.log('🔄 Recargando script de pacientes...');
    
    // Eliminar script existente si hay
    const oldScript = document.querySelector('script[src*="patients.js"]');
    if (oldScript) {
        oldScript.remove();
    }
    
    // Crear nuevo script con timestamp para evitar caché
    const newScript = document.createElement('script');
    newScript.src = '/static/js/patients.js?' + new Date().getTime();
    newScript.onload = function() {
        console.log('✅ Script de pacientes recargado');
        
        // Verificar qué funciones están disponibles
        console.log('   - loadPaymentsDashboard:', typeof loadPaymentsDashboard);
        console.log('   - loadPatientsDashboard:', typeof loadPatientsDashboard);
        
        // Intentar cargar de nuevo
        setTimeout(() => {
            if (typeof loadPaymentsDashboard === 'function') {
                loadPaymentsDashboard();
            } else if (typeof loadPatientsDashboard === 'function') {
                window.loadPaymentsDashboard = loadPatientsDashboard;
                loadPatientsDashboard();
            } else {
                console.error('❌ Las funciones no están disponibles después de recargar');
            }
        }, 500);
    };
    newScript.onerror = function() {
        console.error('❌ Error al cargar patients.js');
        const content = document.getElementById('payments-content');
        if (content) {
            content.innerHTML = `
                <div class="bg-red-900/30 border border-red-700 rounded-lg p-6 text-center">
                    <i class="fas fa-times-circle text-red-500 text-4xl mb-3"></i>
                    <h3 class="text-lg font-medium text-red-400 mb-2">Error crítico</h3>
                    <p class="text-gray-300">No se pudo cargar el archivo patients.js</p>
                    <p class="text-sm text-gray-500 mt-2">Verifica que el archivo existe en /static/js/patients.js</p>
                </div>
            `;
        }
    };
    document.head.appendChild(newScript);
}