// static/js/diag.js
console.log('✅ diag.js cargado correctamente - Sistema de Predicción de Diagnósticos');

// ==============================================
// FUNCIÓN PRINCIPAL PARA CARGAR EL DASHBOARD
// ==============================================
async function loadDiagnosisDashboard() {
    console.log('🔮 Iniciando carga del sistema de predicción de diagnósticos...');

    const diagContent = document.getElementById('diag-content');
    if (!diagContent) {
        console.error('❌ No se encontró el contenedor de diagnóstico');
        return;
    }

    try {
        diagContent.innerHTML = createLoadingTemplate();
        
        // Cargar lista de pacientes
        const patients = await loadPatientsList();
        
        await new Promise(resolve => setTimeout(resolve, 100));
        diagContent.innerHTML = createDiagnosisDashboardTemplate(patients);
        
        console.log('✅ Sistema de predicción cargado exitosamente');
    } catch (error) {
        console.error('❌ Error cargando sistema de predicción:', error);
        diagContent.innerHTML = createErrorTemplate(error);
    }
}

// ==============================================
// FUNCIONES PARA CARGAR DATOS
// ==============================================

async function loadPatientsList() {
    try {
        const response = await fetch('/api/patients');
        const data = await response.json();
        return data.patients || [];
    } catch (error) {
        console.error('Error cargando pacientes:', error);
        return [];
    }
}

async function loadPatientDiagnosisSummary(patientId) {
    try {
        const response = await fetch(`/api/diagnosis/patient-summary/${patientId}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error cargando resumen del paciente:', error);
        return null;
    }
}

async function predictPatientDiagnosis(patientId) {
    try {
        const response = await fetch(`/api/diagnosis/predict/${patientId}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error generando predicción:', error);
        return null;
    }
}

// ==============================================
// PLANTILLAS HTML
// ==============================================

function createLoadingTemplate() {
    return `
        <div class="text-center py-16">
            <div class="inline-block animate-spin rounded-full h-16 w-16 border-4 border-purple-500 border-t-transparent mb-6"></div>
            <h3 class="text-xl font-semibold text-white mb-2">Cargando Sistema de Predicción</h3>
            <p class="text-gray-400">Analizando datos de pacientes, recetas y citas...</p>
        </div>
    `;
}

function createErrorTemplate(error) {
    return `
        <div class="bg-gray-800 border border-red-500 rounded-xl p-8 max-w-2xl mx-auto mt-8">
            <div class="flex items-center gap-4 mb-6">
                <div class="bg-red-500/20 p-3 rounded-full">
                    <i class="fas fa-exclamation-triangle text-red-400 text-2xl"></i>
                </div>
                <div>
                    <h3 class="text-xl font-bold text-white">Error en el Sistema</h3>
                    <p class="text-gray-400">No se pudo cargar el módulo de predicción</p>
                </div>
            </div>
            <div class="bg-gray-900 rounded-lg p-4 mb-6">
                <p class="text-red-400 text-sm font-mono">${error.message || 'Error desconocido'}</p>
            </div>
            <button onclick="loadDiagnosisDashboard()"
                    class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white flex items-center gap-2">
                <i class="fas fa-redo"></i> Reintentar
            </button>
        </div>
    `;
}

function createDiagnosisDashboardTemplate(patients) {
    return `
        <div class="max-w-7xl mx-auto">
            <!-- HEADER -->
            <div class="mb-8">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h2 class="text-2xl font-bold text-white mb-2">
                            <i class="fas fa-brain text-purple-500 mr-3"></i>
                            Predicción de Diagnósticos con IA
                        </h2>
                        <p class="text-gray-400">Analiza patrones de recetas y citas para predecir diagnósticos futuros</p>
                    </div>
                </div>
            </div>

            <!-- Selector de paciente y área de predicción -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Lista de pacientes -->
                <div class="lg:col-span-1">
                    <div class="bg-gray-800 border border-gray-700 rounded-xl p-6">
                        <h3 class="text-lg font-semibold text-white mb-4 flex items-center justify-between">
                            <span><i class="fas fa-user-md text-purple-500 mr-2"></i>Pacientes</span>
                            <span class="text-sm bg-gray-700 px-2 py-1 rounded-full">${patients.length}</span>
                        </h3>
                        
                        <div class="mb-4">
                            <input type="text" 
                                   id="patientSearch"
                                   placeholder="Buscar paciente..." 
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm">
                        </div>

                        <div class="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                            ${patients.length > 0 ? patients.map(p => `
                                <div onclick="selectPatientForDiagnosis('${p.folder_id}')"
                                     class="patient-item p-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg cursor-pointer border border-gray-600 transition-colors"
                                     id="patient-${p.folder_id}">
                                    <div class="flex items-center justify-between">
                                        <div>
                                            <div class="font-medium text-white">${p.username}</div>
                                            <div class="text-xs text-gray-400 mt-1">
                                                <i class="fas fa-calendar-alt mr-1"></i> ${p.fecha_nacimiento || 'Fecha no registrada'}
                                            </div>
                                        </div>
                                        <div class="text-xs ${p.recipes_count >= 2 ? 'text-green-400 font-bold' : (p.recipes_count > 0 ? 'text-yellow-400' : 'text-gray-500')}">
                                            ${p.recipes_count || 0} recetas
                                            ${p.recipes_count >= 2 ? ' ✓' : ''}
                                        </div>
                                    </div>
                                </div>
                            `).join('') : `
                                <div class="text-center py-8 text-gray-500">
                                    <i class="fas fa-user-slash text-4xl mb-2"></i>
                                    <p>No hay pacientes registrados</p>
                                </div>
                            `}
                        </div>
                        
                        <div class="mt-4 text-xs text-gray-500 border-t border-gray-700 pt-3">
                            <div class="flex items-center gap-2">
                                <span class="w-3 h-3 bg-green-500 rounded-full"></span>
                                <span>Listo para predecir (2+ recetas)</span>
                            </div>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="w-3 h-3 bg-yellow-500 rounded-full"></span>
                                <span>Datos insuficientes (1 receta)</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Área de predicción y resultados -->
                <div class="lg:col-span-2">
                    <div id="predictionResults" class="bg-gray-800 border border-gray-700 rounded-xl p-6">
                        <div class="text-center py-16">
                            <i class="fas fa-hand-pointer text-5xl text-gray-600 mb-4"></i>
                            <h3 class="text-xl font-semibold text-white mb-2">Selecciona un paciente</h3>
                            <p class="text-gray-400 mb-4">Elige un paciente de la lista para ver sus predicciones de diagnóstico</p>
                            <div class="text-sm text-gray-500">
                                <i class="fas fa-info-circle text-blue-400 mr-1"></i>
                                Los pacientes con <span class="text-green-400 font-bold">2 o más recetas</span> pueden generar predicciones
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ==============================================
// FUNCIONES DE SELECCIÓN Y PREDICCIÓN
// ==============================================

let currentSelectedPatient = null;
let currentPatientRecipesCount = 0;

async function selectPatientForDiagnosis(patientId) {
    console.log(`🔍 Seleccionado paciente ID: ${patientId}`);
    
    const resultsArea = document.getElementById('predictionResults');
    if (!resultsArea) return;

    // Mostrar loading
    resultsArea.innerHTML = `
        <div class="text-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent mx-auto mb-4"></div>
            <p class="text-gray-400">Cargando información del paciente...</p>
        </div>
    `;

    try {
        // Cargar resumen del paciente para ver cuántas recetas tiene
        const summary = await loadPatientDiagnosisSummary(patientId);
        
        if (!summary || !summary.success) {
            throw new Error('No se pudo cargar la información del paciente');
        }

        const patient = summary.patient || {};
        const recipes = summary.recipes || [];
        const stats = summary.stats || {};
        
        currentPatientRecipesCount = recipes.length;
        currentSelectedPatient = {
            id: patientId,
            name: patient.name || 'Paciente',
            recipes: recipes,
            stats: stats,
            patient: patient
        };

        // Mostrar vista previa con botón de predicción
        displayPatientPreview(currentSelectedPatient);

    } catch (error) {
        console.error('Error cargando paciente:', error);
        resultsArea.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
                <h3 class="text-lg font-semibold text-white mb-2">Error al cargar</h3>
                <p class="text-red-400 mb-4">${error.message}</p>
                <button onclick="selectPatientForDiagnosis('${patientId}')"
                        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white text-sm">
                    <i class="fas fa-redo mr-2"></i>Reintentar
                </button>
            </div>
        `;
    }
}

function displayPatientPreview(data) {
    const resultsArea = document.getElementById('predictionResults');
    if (!resultsArea) return;

    const patient = data.patient || {};
    const stats = data.stats || {};
    const recipesCount = data.recipes?.length || 0;
    const canPredict = recipesCount >= 2;

    resultsArea.innerHTML = `
        <div>
            <!-- Header del paciente -->
            <div class="flex items-center justify-between mb-6 pb-4 border-b border-gray-700">
                <div>
                    <h3 class="text-xl font-bold text-white flex items-center gap-2">
                        <i class="fas fa-user-circle text-purple-500"></i>
                        ${patient.name || 'Paciente'}
                    </h3>
                    <div class="flex gap-4 mt-2 text-sm">
                        <span class="text-gray-400">
                            <i class="fas fa-calendar mr-1"></i>
                            ${patient.fecha_nacimiento ? formatDateDisplay(patient.fecha_nacimiento) : 'Fecha no registrada'}
                        </span>
                        <span class="text-gray-400">
                            <i class="fas fa-prescription mr-1"></i>
                            <span class="${recipesCount >= 2 ? 'text-green-400 font-bold' : 'text-yellow-400'}">${recipesCount} recetas</span>
                        </span>
                    </div>
                </div>
            </div>

            <!-- Estadísticas rápidas -->
            <div class="grid grid-cols-3 gap-3 mb-6">
                <div class="bg-gray-700/30 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-purple-400">${stats.unique_diagnoses || 0}</div>
                    <div class="text-xs text-gray-400">Diagnósticos únicos</div>
                </div>
                <div class="bg-gray-700/30 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-green-400">${stats.most_common_count || 0}</div>
                    <div class="text-xs text-gray-400">${stats.most_common_diagnosis || 'Sin datos'}</div>
                </div>
                <div class="bg-gray-700/30 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-yellow-400">${data.stats?.avg_visit_frequency || '-'}</div>
                    <div class="text-xs text-gray-400">Días entre visitas</div>
                </div>
            </div>

            <!-- BOTÓN DE PREDICCIÓN -->
            <div class="text-center mb-6">
                ${canPredict ? `
                    <button onclick="generatePrediction('${data.id}')"
                            class="px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-xl text-white font-bold text-lg shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-3 mx-auto">
                        <i class="fas fa-magic text-2xl"></i>
                        <span>Generar Predicción de Diagnóstico</span>
                        <i class="fas fa-arrow-right text-2xl"></i>
                    </button>
                    <p class="text-xs text-gray-500 mt-2">
                        <i class="fas fa-check-circle text-green-400 mr-1"></i>
                        Listo para predecir con ${recipesCount} recetas
                    </p>
                ` : `
                    <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6">
                        <div class="flex items-center justify-center gap-3 mb-2">
                            <i class="fas fa-exclamation-triangle text-yellow-500 text-2xl"></i>
                            <span class="text-yellow-500 font-semibold">No se puede generar predicción</span>
                        </div>
                        <p class="text-gray-400 mb-3">
                            Se necesitan al menos <span class="text-yellow-400 font-bold">2 recetas</span> para generar predicciones.
                            Actualmente tiene <span class="text-white font-bold">${recipesCount}</span> receta(s).
                        </p>
                        <div class="text-sm text-gray-500">
                            <i class="fas fa-lightbulb text-yellow-500 mr-1"></i>
                            Sugerencia: Agrega más recetas al historial del paciente
                        </div>
                    </div>
                `}
            </div>

            <!-- Historial reciente -->
            <div class="mt-6">
                <details class="bg-gray-700/20 rounded-lg" open>
                    <summary class="p-3 cursor-pointer text-gray-300 hover:text-white">
                        <i class="fas fa-history mr-2"></i>
                        Ver historial médico (${data.recipes?.length || 0} recetas)
                    </summary>
                    <div class="p-3 border-t border-gray-600 max-h-60 overflow-y-auto custom-scrollbar">
                        ${data.recipes && data.recipes.length > 0 ? data.recipes.map(recipe => `
                            <div class="mb-3 p-2 bg-gray-700/30 rounded text-sm">
                                <div class="flex justify-between">
                                    <span class="font-medium text-white">${recipe.diagnosis || 'Sin diagnóstico'}</span>
                                    <span class="text-xs text-gray-400">${formatDateDisplay(recipe.date)}</span>
                                </div>
                                <div class="text-xs text-gray-400 mt-1">
                                    ${recipe.medicines ? recipe.medicines.map(m => m.name).join(', ') : 'Sin medicamentos'}
                                </div>
                            </div>
                        `).join('') : 'No hay recetas registradas'}
                    </div>
                </details>
            </div>
        </div>
    `;
}

// Reemplaza la función generatePrediction existente con esta:

async function generatePrediction(patientId) {
    console.log(`🔮 Generando predicción con IA para paciente: ${patientId}`);
    
    const resultsArea = document.getElementById('predictionResults');
    if (!resultsArea) return;

    // Mostrar loading con mensaje de IA
    resultsArea.innerHTML = `
        <div class="text-center py-12">
            <div class="relative">
                <div class="animate-spin rounded-full h-20 w-20 border-4 border-purple-500 border-t-transparent mx-auto mb-6"></div>
                <div class="absolute inset-0 flex items-center justify-center">
                    <i class="fas fa-robot text-3xl text-purple-400 animate-pulse"></i>
                </div>
            </div>
            <p class="text-gray-400 text-lg">Gemini AI está analizando el historial médico...</p>
            <p class="text-xs text-gray-500 mt-2">Procesando patrones de diagnóstico y frecuencia de visitas</p>
            <div class="max-w-xs mx-auto mt-4 bg-gray-700 rounded-full h-2">
                <div class="bg-purple-600 h-2 rounded-full animate-pulse" style="width: 100%"></div>
            </div>
        </div>
    `;

    try {
        // Usar la nueva ruta de IA
        const response = await fetch(`/api/diagnosis/predict-with-ai/${patientId}`);
        const data = await response.json();
        
        if (!data.success) {
            if (data.requires_more_data) {
                // Mostrar mensaje específico de recetas insuficientes
                resultsArea.innerHTML = `
                    <div class="text-center py-12">
                        <i class="fas fa-robot text-5xl text-gray-600 mb-4"></i>
                        <h3 class="text-xl font-semibold text-white mb-2">Datos insuficientes para IA</h3>
                        <p class="text-yellow-400 mb-4">${data.error}</p>
                        <p class="text-gray-400 text-sm">La IA necesita al menos 2 recetas para encontrar patrones significativos.</p>
                        <button onclick="selectPatientForDiagnosis('${patientId}')"
                                class="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white">
                            <i class="fas fa-arrow-left mr-2"></i>Volver
                        </button>
                    </div>
                `;
                return;
            }
            
            // Si hay fallback, mostrarlo
            if (data.fallback) {
                displayAIPredictions(data.fallback, patientId, currentSelectedPatient?.name || 'Paciente');
                showNotification('Usando predicción de respaldo (IA no disponible)', 'warning');
                return;
            }
            
            throw new Error(data.error || 'Error en la predicción');
        }

        // Mostrar predicciones de la IA
        displayAIPredictions(data.predictions, patientId, data.patient_name, data);

    } catch (error) {
        console.error('Error generando predicción con IA:', error);
        resultsArea.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
                <h3 class="text-lg font-semibold text-white mb-2">Error en la IA</h3>
                <p class="text-red-400 mb-4">${error.message}</p>
                <div class="flex gap-3 justify-center">
                    <button onclick="selectPatientForDiagnosis('${patientId}')"
                            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white">
                        <i class="fas fa-arrow-left mr-2"></i>Volver
                    </button>
                    <button onclick="generatePrediction('${patientId}')"
                            class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white">
                        <i class="fas fa-redo mr-2"></i>Reintentar con IA
                    </button>
                </div>
            </div>
        `;
    }
}

function displayAIPredictions(predictions, patientId, patientName, extraData = {}) {
    const resultsArea = document.getElementById('predictionResults');
    if (!resultsArea) return;

    const recipesCount = extraData.recipes_count || currentSelectedPatient?.recipes?.length || 0;

    let predictionsHTML = '';

    if (predictions && predictions.length > 0) {
        predictionsHTML = predictions.map((pred, index) => `
            <div class="bg-gradient-to-r from-gray-700/50 to-gray-800/50 border ${index === 0 ? 'border-purple-500' : 'border-gray-600'} rounded-lg p-5 mb-4 transform hover:scale-[1.02] transition-all duration-200">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center gap-3">
                        <div class="bg-${index === 0 ? 'purple' : 'indigo'}-500/20 p-3 rounded-full">
                            <i class="fas ${index === 0 ? 'fa-star' : 'fa-robot'} text-${index === 0 ? 'purple' : 'indigo'}-400 text-xl"></i>
                        </div>
                        <div>
                            <span class="text-sm text-gray-400">
                                ${index === 0 ? 'Predicción principal' : `Predicción alternativa #${index + 1}`}
                            </span>
                            <h4 class="font-semibold text-white text-lg">${pred.diagnosis}</h4>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-3xl font-bold text-${index === 0 ? 'purple' : 'indigo'}-400">${pred.confidence}%</div>
                        <div class="text-xs text-gray-500">confianza IA</div>
                    </div>
                </div>
                
                <div class="text-sm text-gray-300 mb-4 bg-gray-800/50 p-3 rounded-lg">
                    <i class="fas fa-info-circle text-purple-400 mr-2"></i>
                    ${pred.reason}
                </div>

                ${pred.suggested_medicines && pred.suggested_medicines.length > 0 ? `
                    <div class="border-t border-gray-600 pt-3">
                        <p class="text-sm font-semibold text-purple-400 mb-3">
                            <i class="fas fa-prescription mr-2"></i>
                            Medicamentos sugeridos por IA
                        </p>
                        <div class="space-y-3">
                            ${pred.suggested_medicines.map(med => `
                                <div class="bg-gray-800 rounded-lg p-3 border border-gray-600">
                                    <div class="flex items-center gap-2 mb-2">
                                        <i class="fas fa-capsules text-blue-400"></i>
                                        <span class="font-medium text-white">${med.name}</span>
                                    </div>
                                    <div class="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <span class="text-gray-400 text-xs">Dosis:</span>
                                            <span class="text-white ml-1">${med.dosage || 'No especificada'}</span>
                                        </div>
                                        <div>
                                            <span class="text-gray-400 text-xs">Frecuencia:</span>
                                            <span class="text-white ml-1">${med.frequency || 'No especificada'}</span>
                                        </div>
                                        ${med.duration ? `
                                        <div class="col-span-2">
                                            <span class="text-gray-400 text-xs">Duración:</span>
                                            <span class="text-green-400 ml-1 font-medium">${med.duration}</span>
                                        </div>
                                        ` : ''}
                                        ${med.contraindications ? `
                                        <div class="col-span-2 mt-1 bg-red-900/20 p-2 rounded">
                                            <span class="text-gray-400 text-xs flex items-center gap-1">
                                                <i class="fas fa-exclamation-triangle text-red-400"></i>
                                                Contraindicaciones:
                                            </span>
                                            <span class="text-red-300 text-xs ml-1">${med.contraindications}</span>
                                        </div>
                                        ` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${pred.recommendations ? `
                    <div class="mt-4 text-sm text-purple-300 bg-purple-900/20 p-3 rounded-lg">
                        <i class="fas fa-stethoscope mr-2"></i>
                        <span class="font-medium">Recomendación médica:</span>
                        <p class="text-gray-300 mt-1">${pred.recommendations}</p>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    resultsArea.innerHTML = `
        <div>
            <!-- Header con indicador de IA -->
            <div class="flex items-center justify-between mb-4 pb-3 border-b border-gray-700">
                <div>
                    <h3 class="text-xl font-bold text-white flex items-center gap-2">
                        <i class="fas fa-user-circle text-purple-500"></i>
                        ${patientName || 'Paciente'}
                    </h3>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="bg-purple-500/20 text-purple-400 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                            <i class="fas fa-robot"></i>
                            Predicción con Gemini AI
                        </span>
                        <span class="text-xs text-gray-500">
                            ${recipesCount} recetas analizadas
                        </span>
                    </div>
                </div>
                <button onclick="selectPatientForDiagnosis('${patientId}')"
                        class="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm">
                    <i class="fas fa-arrow-left mr-1"></i> Cambiar
                </button>
            </div>

            <!-- Predicciones -->
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2 text-lg">
                <i class="fas fa-magic text-purple-500"></i>
                Diagnósticos predichos por IA
                <span class="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full">
                    ${predictions.length}
                </span>
            </h4>

            ${predictionsHTML}

            <!-- Botones de acción -->
            <div class="flex gap-3 mt-6">
                <button onclick="generatePrediction('${patientId}')"
                        class="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm flex items-center justify-center gap-2">
                    <i class="fas fa-sync-alt"></i>
                    Regenerar con IA
                </button>
                <button onclick="toggleHistory()" 
                        class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm">
                    <i class="fas fa-history"></i>
                </button>
            </div>

            <!-- Historial (oculto por defecto) -->
            <div id="patientHistory" class="mt-4 hidden">
                <div class="bg-gray-700/20 rounded-lg p-4">
                    <h5 class="text-sm font-semibold text-gray-300 mb-2">Historial analizado por IA</h5>
                    <div class="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                        ${currentSelectedPatient?.recipes?.map(recipe => `
                            <div class="p-2 bg-gray-700/30 rounded text-sm">
                                <div class="flex justify-between">
                                    <span class="font-medium text-white">${recipe.diagnosis || 'Sin diagnóstico'}</span>
                                    <span class="text-xs text-gray-400">${formatDateDisplay(recipe.date)}</span>
                                </div>
                            </div>
                        `).join('') || 'No hay historial disponible'}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function displayPatientPredictions(data) {
    const resultsArea = document.getElementById('predictionResults');
    if (!resultsArea) return;

    const patient = data.patient || {};
    const stats = data.stats || {};
    const predictions = data.predictions || [];
    const recipesCount = data.recipes?.length || 0;

    let predictionsHTML = '';

    if (predictions.length > 0) {
        predictionsHTML = predictions.map((pred, index) => `
            <div class="bg-gradient-to-r from-gray-700/50 to-gray-800/50 border ${index === 0 ? 'border-purple-500' : 'border-gray-600'} rounded-lg p-4 mb-3 transform hover:scale-[1.02] transition-all duration-200">
                <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center gap-3">
                        <div class="bg-${index === 0 ? 'purple' : 'indigo'}-500/20 p-3 rounded-full">
                            <i class="fas ${index === 0 ? 'fa-star' : 'fa-chart-line'} text-${index === 0 ? 'purple' : 'indigo'}-400 text-xl"></i>
                        </div>
                        <div>
                            <span class="text-sm text-gray-400">Predicción #${index + 1}</span>
                            <h4 class="font-semibold text-white text-lg">${pred.diagnosis}</h4>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-3xl font-bold text-${index === 0 ? 'purple' : 'indigo'}-400">${pred.confidence}%</div>
                        <div class="text-xs text-gray-500">confianza</div>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4 text-sm mb-3 bg-gray-800/50 p-3 rounded-lg">
                    <div>
                        <span class="text-gray-400">Fecha estimada:</span>
                        <span class="text-white ml-1 font-medium">${formatDateDisplay(pred.predicted_date)}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Tipo:</span>
                        <span class="text-white ml-1 font-medium">${
                            pred.type === 'recurrence' ? '🔄 Recurrencia' : 
                            pred.type === 'upcoming_appointment' ? '📅 Próxima cita' : 
                            '📊 Patrón de visitas'
                        }</span>
                    </div>
                </div>
                
                <div class="text-sm text-gray-300 mb-3 bg-gray-800/50 p-3 rounded-lg">
                    <i class="fas fa-info-circle text-gray-500 mr-2"></i>
                    ${pred.reason}
                </div>

                ${pred.medicines && pred.medicines.length > 0 ? `
                    <div class="border-t border-gray-600 pt-3">
                        <p class="text-xs text-gray-400 mb-2">💊 Medicamentos sugeridos:</p>
                        <div class="flex flex-wrap gap-2">
                            ${pred.medicines.map(med => `
                                <span class="text-xs bg-gray-800 px-3 py-1.5 rounded-full text-gray-300 border border-gray-600">
                                    ${med.name} (${med.dosage} - ${med.frequency})
                                </span>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `).join('');
    } else {
        predictionsHTML = `
            <div class="text-center py-8 bg-gray-700/30 rounded-lg">
                <i class="fas fa-hourglass-half text-4xl text-gray-600 mb-2"></i>
                <p class="text-gray-400">No se pudieron generar predicciones</p>
                <p class="text-xs text-gray-500 mt-2">El algoritmo no encontró patrones claros con los datos disponibles</p>
            </div>
        `;
    }

    resultsArea.innerHTML = `
        <div>
            <!-- Header del paciente con botón para nueva predicción -->
            <div class="flex items-center justify-between mb-6 pb-4 border-b border-gray-700">
                <div>
                    <h3 class="text-xl font-bold text-white flex items-center gap-2">
                        <i class="fas fa-user-circle text-purple-500"></i>
                        ${patient.name || 'Paciente'}
                    </h3>
                    <div class="flex gap-4 mt-2 text-sm">
                        <span class="text-gray-400">
                            <i class="fas fa-calendar mr-1"></i>
                            ${patient.fecha_nacimiento ? formatDateDisplay(patient.fecha_nacimiento) : 'Fecha no registrada'}
                        </span>
                        <span class="text-gray-400">
                            <i class="fas fa-prescription mr-1"></i>
                            <span class="text-green-400 font-bold">${recipesCount} recetas</span>
                        </span>
                    </div>
                </div>
                <button onclick="selectPatientForDiagnosis('${data.id}')"
                        class="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm flex items-center gap-2">
                    <i class="fas fa-arrow-left"></i>
                    Cambiar paciente
                </button>
            </div>

            <!-- Estadísticas rápidas -->
            <div class="grid grid-cols-3 gap-3 mb-6">
                <div class="bg-gray-700/30 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-purple-400">${stats.unique_diagnoses || 0}</div>
                    <div class="text-xs text-gray-400">Diagnósticos únicos</div>
                </div>
                <div class="bg-gray-700/30 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-green-400">${stats.most_common_count || 0}</div>
                    <div class="text-xs text-gray-400">${stats.most_common_diagnosis || 'Sin datos'}</div>
                </div>
                <div class="bg-gray-700/30 rounded-lg p-3 text-center">
                    <div class="text-2xl font-bold text-yellow-400">${data.predictionStats?.avg_visit_frequency || data.stats?.avg_visit_frequency || '-'}</div>
                    <div class="text-xs text-gray-400">Días entre visitas</div>
                </div>
            </div>

            <!-- Botón para regenerar predicción -->
            <div class="text-center mb-4">
                <button onclick="generatePrediction('${data.id}')"
                        class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm flex items-center gap-2 mx-auto">
                    <i class="fas fa-sync-alt"></i>
                    Regenerar predicción
                </button>
            </div>

            <!-- Predicciones -->
            <h4 class="font-semibold text-white mb-3 flex items-center gap-2 text-lg">
                <i class="fas fa-magic text-purple-500"></i>
                Resultados de la predicción
                <span class="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full">${predictions.length}</span>
            </h4>

            ${predictionsHTML}

            <!-- Botón para ver historial -->
            <div class="mt-4 text-center">
                <button onclick="toggleHistory()" 
                        class="text-sm text-gray-400 hover:text-white flex items-center gap-2 mx-auto">
                    <i class="fas fa-chevron-down" id="historyChevron"></i>
                    Ver historial completo
                </button>
            </div>

            <!-- Historial (oculto por defecto) -->
            <div id="patientHistory" class="mt-4 hidden">
                <div class="bg-gray-700/20 rounded-lg p-4">
                    <h5 class="text-sm font-semibold text-gray-300 mb-2">Historial de recetas</h5>
                    <div class="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                        ${data.recipes && data.recipes.length > 0 ? data.recipes.map(recipe => `
                            <div class="p-2 bg-gray-700/30 rounded text-sm">
                                <div class="flex justify-between">
                                    <span class="font-medium text-white">${recipe.diagnosis || 'Sin diagnóstico'}</span>
                                    <span class="text-xs text-gray-400">${formatDateDisplay(recipe.date)}</span>
                                </div>
                                <div class="text-xs text-gray-400 mt-1">
                                    ${recipe.medicines ? recipe.medicines.map(m => m.name).join(', ') : 'Sin medicamentos'}
                                </div>
                            </div>
                        `).join('') : 'No hay recetas registradas'}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function toggleHistory() {
    const history = document.getElementById('patientHistory');
    const chevron = document.getElementById('historyChevron');
    
    if (history.classList.contains('hidden')) {
        history.classList.remove('hidden');
        chevron.classList.remove('fa-chevron-down');
        chevron.classList.add('fa-chevron-up');
    } else {
        history.classList.add('hidden');
        chevron.classList.remove('fa-chevron-up');
        chevron.classList.add('fa-chevron-down');
    }
}

async function refreshPatientPredictions(patientId) {
    if (!patientId || !currentSelectedPatient) return;
    await generatePrediction(patientId);
}

// ==============================================
// FUNCIONES AUXILIARES
// ==============================================

function formatDateDisplay(dateString) {
    if (!dateString) return 'Fecha no disponible';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch {
        return dateString;
    }
}

// ==============================================
// EXPORTAR FUNCIONES
// ==============================================
window.loadDiagnosisDashboard = loadDiagnosisDashboard;
window.selectPatientForDiagnosis = selectPatientForDiagnosis;
window.generatePrediction = generatePrediction;
window.refreshPatientPredictions = refreshPatientPredictions;
window.toggleHistory = toggleHistory;

// Búsqueda de pacientes
document.addEventListener('input', function(e) {
    if (e.target.id === 'patientSearch') {
        const searchTerm = e.target.value.toLowerCase();
        const patientItems = document.querySelectorAll('.patient-item');
        
        patientItems.forEach(item => {
            const patientName = item.querySelector('.font-medium').textContent.toLowerCase();
            if (patientName.includes(searchTerm)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }
});