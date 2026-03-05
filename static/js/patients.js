// ===== FUNCIONES PARA GESTIÓN DE PACIENTES Y RECETAS =====

// Variable para almacenar el paciente seleccionado actualmente
let currentPatientId = null;
let patientsList = [];

// ===== FUNCIÓN PRINCIPAL =====
async function loadPaymentsDashboard() {
    console.log('💰 Cargando dashboard de pacientes');
    
    const patientsContent = document.getElementById('payments-content');
    if (!patientsContent) {
        console.error('❌ No se encontró el elemento payments-content');
        return;
    }
    
    try {
        // Inyectar HTML
        patientsContent.innerHTML = getPatientsHTML();
        
        // Pequeña pausa
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Cargar estadísticas
        await loadPatientsStats();
        
        // Cargar y renderizar pacientes (RENDERIZADO DIRECTO)
        await loadAndRenderPatients();
        
        // Configurar búsquedas
        setupPatientSearch();
        setupQuickPatientSearch();
        setupRecipePatientSearch();
        
        console.log('✅ Dashboard de pacientes cargado');
        
    } catch (error) {
        console.error('❌ Error cargando dashboard:', error);
    }
}

// ===== FUNCIÓN QUE CARGA Y RENDERIZA (CORREGIDA) =====
async function loadAndRenderPatients() {
    try {
        console.log('🔍 Cargando pacientes...');
        
        const response = await fetch('/api/patients');
        const data = await response.json();
        
        if (data.success && data.patients) {
            patientsList = data.patients;
            window.patientsList = patientsList;
            
            console.log(`✅ ${patientsList.length} pacientes cargados`);
            
            // RENDERIZAR DIRECTAMENTE AQUÍ
            const container = document.getElementById('patients-list');
            if (!container) {
                console.error('❌ No hay container');
                return;
            }
            
            if (patientsList.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-8 text-gray-500">
                        <i class="fas fa-user-plus text-4xl mb-2 opacity-30"></i>
                        <p>No hay pacientes registrados</p>
                        <button onclick="openCreatePatientModal()" 
                                class="mt-3 text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded">
                            Crear nuevo paciente
                        </button>
                    </div>
                `;
                return;
            }
            
            let html = '';
            patientsList.forEach(patient => {
                const isSelected = currentPatientId === patient.folder_id;
                const patientName = patient.username || patient.folder_name || 'Sin nombre';
                const patientEmail = patient.email || '';
                const patientPhone = patient.phone || '';
                const recipesCount = patient.recipes_count || 0;
                
                html += `
                    <div class="patient-item p-3 rounded-lg cursor-pointer transition-all duration-200
                                ${isSelected ? 'bg-green-900/30 border border-green-700' : 'bg-gray-700/50 hover:bg-gray-700'}"
                         onclick="selectPatient('${patient.folder_id}')">
                        <div class="flex justify-between items-start">
                            <div class="flex-1 min-w-0">
                                <div class="font-medium truncate">${patientName}</div>
                                <div class="text-xs text-gray-400 mt-1">
                                    ${patientEmail || 'Sin email'} ${patientPhone ? '• ' + patientPhone : ''}
                                </div>
                            </div>
                            <div class="flex items-center gap-1 ml-2">
                                <span class="text-xs px-2 py-1 bg-gray-600 rounded-full">${recipesCount}</span>
                                <button onclick="event.stopPropagation(); openEditPatientModal('${patient.folder_id}')" 
                                        class="text-blue-400 hover:text-blue-300">
                                    <i class="fas fa-edit text-sm"></i>
                                </button>
                            </div>
                        </div>
                        ${patient.fecha_nacimiento ? `
                            <div class="text-xs text-gray-400 mt-1">
                                <i class="far fa-calendar-alt mr-1"></i> ${formatDateForDisplay(patient.fecha_nacimiento)}
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            
            container.innerHTML = html;
            console.log(`✅ Renderizados ${patientsList.length} pacientes`);
            
            updatePatientsBadge(patientsList.length);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// Mantenemos loadPatientsList para compatibilidad pero ya no se usa
async function loadPatientsList() {
    return loadAndRenderPatients();
}

// ===== ESTADÍSTICAS =====
async function loadPatientsStats() {
    try {
        const response = await fetch('/api/patients/stats');
        const data = await response.json();
        
        if (data.success) {
            const total = document.getElementById('total-pacientes');
            const recetas = document.getElementById('recetas-mes');
            const activos = document.getElementById('pacientes-activos');
            const ultima = document.getElementById('ultima-receta');
            
            if (total) total.textContent = data.stats.total_patients;
            if (recetas) recetas.textContent = data.stats.recipes_this_month;
            if (activos) activos.textContent = data.stats.active_patients;
            if (ultima) ultima.textContent = data.stats.last_recipe_date;
        }
    } catch (error) {
        console.error('Error estadísticas:', error);
    }
}

// ===== HTML (COMPLETO CON TODOS LOS ELEMENTOS) =====
function getPatientsHTML() {
    return `
        
        <!-- Panel de acciones principales -->
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
            <div class="flex flex-wrap gap-4 items-center justify-between">
                <h3 class="font-semibold text-lg flex items-center">
                    <i class="fas fa-notes-medical text-green-500 mr-2"></i>
                    Crear Nueva Receta
                </h3>
                
                <button onclick="openCreateRecipeModal()" 
                        class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                    <i class="fas fa-plus-circle"></i>
                    Nueva Receta
                </button>
            </div>
            
            <!-- Búsqueda rápida de pacientes -->
            <div class="mt-4">
                <label class="block text-sm font-medium text-gray-300 mb-2">
                    <i class="fas fa-search mr-1"></i> Buscar paciente para receta rápida:
                </label>
                <div class="relative">
                    <input type="text" 
                           id="quick-patient-search"
                           placeholder="Escribe el nombre del paciente..." 
                           class="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-green-500">
                    <i class="fas fa-search absolute left-3 top-3 text-gray-400"></i>
                    <div id="quick-search-results" class="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg hidden max-h-60 overflow-y-auto"></div>
                </div>
            </div>
        </div>
        
        <!-- Panel principal con dos columnas -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Columna izquierda: Lista de pacientes -->
            <div class="lg:col-span-1">
                <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-semibold text-lg flex items-center">
                            <i class="fas fa-users mr-2 text-blue-400"></i>
                            Pacientes
                        </h3>
                        
                        <button onclick="openCreatePatientModal()" 
                                class="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded flex items-center gap-1">
                            <i class="fas fa-user-plus"></i>
                            Nuevo
                        </button>
                    </div>
                    
                    <!-- Buscador de pacientes -->
                    <div class="relative mb-4">
                        <input type="text" 
                               id="patient-search"
                               placeholder="Buscar paciente..." 
                               class="w-full bg-gray-700 border border-gray-600 rounded-lg pl-8 pr-4 py-2 text-sm">
                        <i class="fas fa-search absolute left-2 top-2.5 text-gray-400 text-sm"></i>
                    </div>
                    
                    <!-- Lista de pacientes -->
                    <div id="patients-list" class="space-y-2 max-h-96 overflow-y-auto">
                        <div class="text-center py-4 text-gray-500">
                            <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                            <p>Cargando pacientes...</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Columna derecha: Detalle del paciente seleccionado y recetas -->
            <div class="lg:col-span-2">
                <div class="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <!-- Detalle del paciente (visible cuando hay selección) -->
                    <div id="patient-detail-section" class="hidden">
                        <div class="flex justify-between items-start mb-6">
                            <div>
                                <h3 class="font-semibold text-lg flex items-center">
                                    <i class="fas fa-user-circle text-green-400 mr-2 text-2xl"></i>
                                    <span id="selected-patient-name">Nombre del Paciente</span>
                                </h3>
                                <p class="text-sm text-gray-400 mt-1" id="selected-patient-info"></p>
                            </div>
                            
                            <button onclick="openCreateRecipeModalForCurrentPatient()" 
                                    class="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded flex items-center gap-2 text-sm">
                                <i class="fas fa-prescription"></i>
                                Recetar
                            </button>
                        </div>
                        
                        <!-- Historial de recetas -->
                        <h4 class="font-medium mb-3 flex items-center">
                            <i class="fas fa-history mr-2 text-gray-400"></i>
                            Historial de Recetas
                        </h4>
                        
                        <div id="recipes-history" class="space-y-3 max-h-96 overflow-y-auto">
                            <div class="text-center py-8 text-gray-500">
                                <i class="fas fa-file-prescription text-3xl mb-2 opacity-30"></i>
                                <p>Selecciona un paciente para ver sus recetas</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Mensaje cuando no hay paciente seleccionado -->
                    <div id="no-patient-selected" class="text-center py-16">
                        <i class="fas fa-user-plus text-5xl text-gray-600 mb-4"></i>
                        <h3 class="text-xl font-medium text-gray-400 mb-2">Ningún paciente seleccionado</h3>
                        <p class="text-gray-500">Selecciona un paciente de la lista o crea uno nuevo para comenzar</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ===== SELECCIÓN DE PACIENTE =====
async function selectPatient(patientId) {
    currentPatientId = patientId;
    localStorage.setItem('currentPatientId', patientId);
    
    // Actualizar UI de la lista
    await loadAndRenderPatients(); // Recargar para mostrar selección
    
    // Cargar detalles del paciente
    await loadPatientDetails(patientId);
    
    // Cargar historial de recetas
    await loadPatientRecipes(patientId);
}

async function loadPatientDetails(patientId) {
    try {
        const response = await fetch(`/api/patients/${patientId}`);
        const data = await response.json();
        
        if (data.success) {
            const patient = data.patient;
            
            const nameElement = document.getElementById('selected-patient-name');
            const infoElement = document.getElementById('selected-patient-info');
            const detailSection = document.getElementById('patient-detail-section');
            const noPatient = document.getElementById('no-patient-selected');
            
            if (nameElement) nameElement.textContent = patient.username;
            
            if (infoElement) {
                let infoHtml = '';
                if (patient.fecha_nacimiento) {
                    infoHtml += `<span class="mr-3"><i class="far fa-calendar-alt mr-1"></i> ${formatDateForDisplay(patient.fecha_nacimiento)}</span>`;
                }
                if (patient.email) {
                    infoHtml += `<span class="mr-3"><i class="far fa-envelope mr-1"></i> ${patient.email}</span>`;
                }
                if (patient.phone) {
                    infoHtml += `<span><i class="fas fa-phone mr-1"></i> ${patient.phone}</span>`;
                }
                
                infoElement.innerHTML = infoHtml || 'Sin información adicional';
            }
            
            if (detailSection) detailSection.classList.remove('hidden');
            if (noPatient) noPatient.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error cargando detalles del paciente:', error);
    }
}

async function loadPatientRecipes(patientId) {
    try {
        const response = await fetch(`/api/patients/${patientId}/recipes`);
        const data = await response.json();
        
        if (data.success) {
            renderRecipesHistory(data.recipes);
        }
    } catch (error) {
        console.error('Error cargando recetas:', error);
    }
}

function renderRecipesHistory(recipes) {
    const container = document.getElementById('recipes-history');
    if (!container) return;
    
    if (recipes.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-file-prescription text-3xl mb-2 opacity-30"></i>
                <p>No hay recetas para este paciente</p>
                <button onclick="openCreateRecipeModalForCurrentPatient()" 
                        class="mt-3 text-sm bg-green-600 hover:bg-green-700 px-3 py-1 rounded">
                    Crear primera receta
                </button>
            </div>
        `;
        return;
    }
    
    let html = '';
    recipes.forEach(recipe => {
        const date = new Date(recipe.date);
        const formattedDate = date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        html += `
            <div class="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700 transition-colors">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <div class="font-medium">${formattedDate}</div>
                        <div class="text-sm text-gray-300">Dr. ${recipe.doctor}</div>
                    </div>
                    <a href="${recipe.doc_link}" target="_blank" 
                       class="text-blue-400 hover:text-blue-300">
                        <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>
                
                <div class="text-sm mb-2">
                    <span class="text-gray-400">Diagnóstico:</span> ${recipe.diagnosis}
                </div>
                
                <div class="text-sm">
                    <span class="text-gray-400">Medicamentos:</span>
                    <ul class="list-disc list-inside mt-1">
                        ${recipe.medicines.map(med => `
                            <li class="text-xs">${med.name} - ${med.dosage} (${med.frequency})</li>
                        `).join('')}
                    </ul>
                </div>
                
                ${recipe.next_appointment ? `
                    <div class="mt-2 text-xs text-yellow-400">
                        <i class="far fa-calendar-check mr-1"></i>
                        Próxima cita: ${formatDateForDisplay(recipe.next_appointment)}
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ===== BÚSQUEDAS =====
function setupPatientSearch() {
    const searchInput = document.getElementById('patient-search');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase();
        
        if (query.length < 2) {
            loadAndRenderPatients();
            return;
        }
        
        const filtered = patientsList.filter(patient => 
            patient.username.toLowerCase().includes(query) ||
            (patient.email && patient.email.toLowerCase().includes(query)) ||
            (patient.phone && patient.phone.includes(query))
        );
        
        // Renderizado directo de resultados filtrados
        const container = document.getElementById('patients-list');
        if (!container) return;
        
        if (filtered.length === 0) {
            container.innerHTML = '<div class="text-center p-4 text-gray-500">No hay resultados</div>';
            return;
        }
        
        let html = '';
        filtered.forEach(patient => {
            html += `
                <div class="patient-item p-3 rounded-lg cursor-pointer bg-gray-700/50 hover:bg-gray-700 mb-2"
                     onclick="selectPatient('${patient.folder_id}')">
                    <div class="font-medium">${patient.username}</div>
                </div>
            `;
        });
        container.innerHTML = html;
    });
}

function setupQuickPatientSearch() {
    const searchInput = document.getElementById('quick-patient-search');
    const resultsContainer = document.getElementById('quick-search-results');
    
    if (!searchInput || !resultsContainer) return;
    
    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase();
        
        if (query.length < 2) {
            resultsContainer.classList.add('hidden');
            return;
        }
        
        const filtered = patientsList.filter(patient => 
            patient.username.toLowerCase().includes(query)
        );
        
        if (filtered.length === 0) {
            resultsContainer.innerHTML = `
                <div class="p-3 text-gray-400 text-center">
                    No se encontraron pacientes
                    <button onclick="openCreatePatientModal()" class="block mx-auto mt-2 text-blue-400 text-sm">
                        <i class="fas fa-plus-circle mr-1"></i> Crear nuevo paciente
                    </button>
                </div>
            `;
            resultsContainer.classList.remove('hidden');
            return;
        }
        
        let html = '';
        filtered.slice(0, 5).forEach(patient => {
            html += `
                <div class="p-2 hover:bg-gray-700 cursor-pointer flex items-center gap-2 border-b border-gray-700 last:border-0"
                     onclick="quickSelectPatient('${patient.folder_id}', '${patient.username.replace(/'/g, "\\'")}')">
                    <i class="fas fa-user-injured text-blue-400"></i>
                    <div>
                        <div class="font-medium">${patient.username}</div>
                        <div class="text-xs text-gray-400">${patient.recipes_count || 0} recetas</div>
                    </div>
                </div>
            `;
        });
        
        resultsContainer.innerHTML = html;
        resultsContainer.classList.remove('hidden');
    });
    
    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
            resultsContainer.classList.add('hidden');
        }
    });
}

function quickSelectPatient(patientId, patientName) {
    document.getElementById('quick-patient-search').value = patientName;
    document.getElementById('quick-search-results').classList.add('hidden');
    openCreateRecipeModalForPatient(patientId, patientName);
}

// ===== MODAL DE PACIENTE =====
function openCreatePatientModal() {
    const modal = document.getElementById('patient-modal');
    if (!modal) return;
    
    document.getElementById('patient-modal-title').textContent = 'Nuevo Paciente';
    document.getElementById('patient-folder-id').value = '';
    document.getElementById('patient-name').value = '';
    document.getElementById('patient-birthdate').value = '';
    document.getElementById('patient-email').value = '';
    document.getElementById('patient-phone').value = '';
    document.getElementById('patient-notes').value = '';
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function openEditPatientModal(patientId) {
    const patient = patientsList.find(p => p.folder_id === patientId);
    if (!patient) return;
    
    const modal = document.getElementById('patient-modal');
    if (!modal) return;
    
    document.getElementById('patient-modal-title').textContent = 'Editar Paciente';
    document.getElementById('patient-folder-id').value = patientId;
    document.getElementById('patient-name').value = patient.username;
    document.getElementById('patient-birthdate').value = patient.fecha_nacimiento || '';
    document.getElementById('patient-email').value = patient.email || '';
    document.getElementById('patient-phone').value = patient.phone || '';
    document.getElementById('patient-notes').value = patient.notes || '';
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closePatientModal() {
    const modal = document.getElementById('patient-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function savePatient(event) {
    event.preventDefault();
    
    const folderId = document.getElementById('patient-folder-id').value;
    const patientData = {
        username: document.getElementById('patient-name').value,
        fecha_nacimiento: document.getElementById('patient-birthdate').value,
        email: document.getElementById('patient-email').value,
        phone: document.getElementById('patient-phone').value,
        notes: document.getElementById('patient-notes').value
    };
    
    try {
        const url = folderId ? `/api/patients/${folderId}` : '/api/patients';
        const method = folderId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patientData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(folderId ? 'Paciente actualizado' : 'Paciente creado', 'success');
            closePatientModal();
            await loadAndRenderPatients();
            await loadPatientsStats();
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error al guardar paciente', 'error');
    }
}

// ===== MODAL DE RECETA =====
function openCreateRecipeModal() {
    const modal = document.getElementById('recipe-modal');
    if (!modal) return;
    
    // Limpiar formulario
    document.getElementById('recipe-patient-id').value = '';
    document.getElementById('selected-patient-display').classList.add('hidden');
    document.getElementById('recipe-patient-selector').classList.remove('hidden');
    document.getElementById('recipe-patient-search').value = '';
    document.getElementById('recipe-diagnosis').value = '';
    document.getElementById('recipe-instructions').value = '';
    document.getElementById('recipe-next-appointment').value = '';
    
    // Fecha actual
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('recipe-date').value = today;
    
    // Limpiar medicamentos
    const container = document.getElementById('medicines-container');
    if (container) {
        container.innerHTML = `
            <div class="medicine-item grid grid-cols-12 gap-2 items-center">
                <div class="col-span-5">
                    <input type="text" placeholder="Medicamento"
                           class="medicine-name w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                </div>
                <div class="col-span-3">
                    <input type="text" placeholder="Dosis"
                           class="medicine-dosage w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                </div>
                <div class="col-span-3">
                    <input type="text" placeholder="Frecuencia"
                           class="medicine-frequency w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                </div>
                <div class="col-span-1 text-center">
                    <button type="button" onclick="removeMedicine(this)" class="text-red-400 hover:text-red-300">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function openCreateRecipeModalForCurrentPatient() {
    if (!currentPatientId) {
        showNotification('Selecciona un paciente primero', 'warning');
        return;
    }
    
    const patient = patientsList.find(p => p.folder_id === currentPatientId);
    if (!patient) return;
    
    openCreateRecipeModal();
    
    document.getElementById('recipe-patient-id').value = currentPatientId;
    document.getElementById('recipe-patient-selector').classList.add('hidden');
    document.getElementById('selected-patient-display').classList.remove('hidden');
    document.getElementById('selected-patient-name-display').textContent = patient.username;
}

function openCreateRecipeModalForPatient(patientId, patientName) {
    openCreateRecipeModal();
    
    document.getElementById('recipe-patient-id').value = patientId;
    document.getElementById('recipe-patient-selector').classList.add('hidden');
    document.getElementById('selected-patient-display').classList.remove('hidden');
    document.getElementById('selected-patient-name-display').textContent = patientName;
}

function closeRecipeModal() {
    const modal = document.getElementById('recipe-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function clearRecipePatient() {
    document.getElementById('recipe-patient-id').value = '';
    document.getElementById('selected-patient-display').classList.add('hidden');
    document.getElementById('recipe-patient-selector').classList.remove('hidden');
    document.getElementById('recipe-patient-search').value = '';
}

function setupRecipePatientSearch() {
    const searchInput = document.getElementById('recipe-patient-search');
    const resultsContainer = document.getElementById('recipe-patient-results');
    
    if (!searchInput || !resultsContainer) return;
    
    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase();
        
        if (query.length < 2) {
            resultsContainer.classList.add('hidden');
            return;
        }
        
        const filtered = patientsList.filter(patient => 
            patient.username.toLowerCase().includes(query)
        );
        
        if (filtered.length === 0) {
            resultsContainer.innerHTML = '<div class="p-2 text-gray-400 text-center text-sm">No se encontraron pacientes</div>';
            resultsContainer.classList.remove('hidden');
            return;
        }
        
        let html = '';
        filtered.slice(0, 5).forEach(patient => {
            html += `
                <div class="p-2 hover:bg-gray-700 cursor-pointer text-sm"
                     onclick="selectRecipePatient('${patient.folder_id}', '${patient.username.replace(/'/g, "\\'")}')">
                    <i class="fas fa-user-injured text-blue-400 mr-2"></i>
                    ${patient.username}
                </div>
            `;
        });
        
        resultsContainer.innerHTML = html;
        resultsContainer.classList.remove('hidden');
    });
}

function selectRecipePatient(patientId, patientName) {
    document.getElementById('recipe-patient-id').value = patientId;
    document.getElementById('recipe-patient-search').value = patientName;
    document.getElementById('recipe-patient-results').classList.add('hidden');
    document.getElementById('selected-patient-display').classList.remove('hidden');
    document.getElementById('selected-patient-name-display').textContent = patientName;
    document.getElementById('recipe-patient-selector').classList.add('hidden');
}

// ===== MEDICAMENTOS =====
function addMedicine() {
    const container = document.getElementById('medicines-container');
    if (!container) return;
    
    const medicineHtml = `
        <div class="medicine-item grid grid-cols-12 gap-2 items-center mt-2">
            <div class="col-span-5">
                <input type="text" placeholder="Medicamento"
                       class="medicine-name w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
            </div>
            <div class="col-span-3">
                <input type="text" placeholder="Dosis"
                       class="medicine-dosage w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
            </div>
            <div class="col-span-3">
                <input type="text" placeholder="Frecuencia"
                       class="medicine-frequency w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
            </div>
            <div class="col-span-1 text-center">
                <button type="button" onclick="removeMedicine(this)" class="text-red-400 hover:text-red-300">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', medicineHtml);
}

function removeMedicine(button) {
    const container = document.getElementById('medicines-container');
    if (!container) return;
    
    if (container.children.length > 1) {
        button.closest('.medicine-item').remove();
    } else {
        showNotification('Debe haber al menos un medicamento', 'warning');
    }
}

// ===== CREAR RECETA =====
async function createRecipe(event) {
    event.preventDefault();
    
    const patientId = document.getElementById('recipe-patient-id').value;
    if (!patientId) {
        showNotification('Debes seleccionar un paciente', 'error');
        return;
    }
    
    const medicines = [];
    document.querySelectorAll('.medicine-item').forEach(item => {
        const name = item.querySelector('.medicine-name')?.value.trim();
        const dosage = item.querySelector('.medicine-dosage')?.value.trim();
        const frequency = item.querySelector('.medicine-frequency')?.value.trim();
        
        if (name) {
            medicines.push({ name, dosage, frequency });
        }
    });
    
    if (medicines.length === 0) {
        showNotification('Debes agregar al menos un medicamento', 'error');
        return;
    }
    
    const recipeData = {
        patient_id: patientId,
        date: document.getElementById('recipe-date')?.value,
        doctor: document.getElementById('recipe-doctor')?.value || window.currentUser?.name || 'Médico',
        diagnosis: document.getElementById('recipe-diagnosis')?.value,
        medicines: medicines,
        instructions: document.getElementById('recipe-instructions')?.value,
        next_appointment: document.getElementById('recipe-next-appointment')?.value
    };
    
    try {
        showLoading('Generando receta...');
        
        const response = await fetch('/api/recipes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(recipeData)
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            closeRecipeModal();
            showRecipeSuccess(data);
            
            if (currentPatientId === patientId) {
                await loadPatientRecipes(patientId);
            }
        } else {
            showNotification('Error: ' + data.error, 'error');
        }
        
    } catch (error) {
        hideLoading();
        console.error('Error:', error);
        showNotification('Error al crear receta', 'error');
    }
}

function showRecipeSuccess(data) {
    const successMessage = document.getElementById('success-message');
    const docNameElement = document.getElementById('recipe-doc-name');
    const docPathElement = document.getElementById('recipe-doc-path');
    const docLinkElement = document.getElementById('recipe-doc-link');
    const modalElement = document.getElementById('recipe-success-modal');
    
    if (successMessage) successMessage.textContent = `Receta para ${data.folder_name} generada exitosamente`;
    if (docNameElement) docNameElement.textContent = data.doc_name;
    if (docPathElement) docPathElement.textContent = `Carpeta: ${data.folder_name}`;
    if (docLinkElement) docLinkElement.href = data.doc_link;
    
    if (modalElement) {
        modalElement.classList.remove('hidden');
        modalElement.classList.add('flex');
    }
}

function closeSuccessModal() {
    const modal = document.getElementById('recipe-success-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// ===== FUNCIONES AUXILIARES =====
function updatePatientsBadge(count) {
    const badge = document.getElementById('patients-tab-badge');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
}

function formatDateForDisplay(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch {
        return dateString;
    }
}

function showNotification(message, type = 'info') {
    console.log(`🔔 ${type}: ${message}`);
}

function showLoading(message) {
    console.log(`⏳ ${message}`);
}

function hideLoading() {
    console.log('✅ Listo');
}

// ===== EXPORTAR =====
window.loadPaymentsDashboard = loadPaymentsDashboard;
window.loadPatientsList = loadPatientsList;
window.selectPatient = selectPatient;
window.openCreatePatientModal = openCreatePatientModal;
window.openEditPatientModal = openEditPatientModal;
window.closePatientModal = closePatientModal;
window.savePatient = savePatient;
window.openCreateRecipeModal = openCreateRecipeModal;
window.openCreateRecipeModalForCurrentPatient = openCreateRecipeModalForCurrentPatient;
window.openCreateRecipeModalForPatient = openCreateRecipeModalForPatient;
window.closeRecipeModal = closeRecipeModal;
window.clearRecipePatient = clearRecipePatient;
window.addMedicine = addMedicine;
window.removeMedicine = removeMedicine;
window.createRecipe = createRecipe;
window.closeSuccessModal = closeSuccessModal;
window.formatDateForDisplay = formatDateForDisplay;
window.diagnosePatients = diagnosePatients;

console.log('✅ patients.js cargado - Versión completa con renderizado directo');