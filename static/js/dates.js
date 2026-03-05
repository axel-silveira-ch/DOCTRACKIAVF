// ===== GESTIÓN DE CITAS MÉDICAS =====

// Variable global para almacenar todas las citas
let allAppointments = [];
let allPatients = [];
let currentView = 'list'; // 'list' o 'calendar'

// Cargar la página principal de citas
async function loadAppointmentsDashboard() {
    console.log('📅 Cargando gestión de citas...');
    
    try {
        // Cargar citas y pacientes en paralelo
        await Promise.all([
            loadAppointments(),
            loadPatientsForAppointments()
        ]);
        
        // Cargar estadísticas
        await loadAppointmentStats();
        
    } catch (error) {
        console.error('❌ Error cargando dashboard de citas:', error);
        showNotification('Error al cargar el dashboard de citas', 'error');
    }
}

// Cargar lista de citas
async function loadAppointments() {
    const contentDiv = document.getElementById('appointments-content');
    if (!contentDiv) return;
    
    try {
        const response = await fetch('/api/appointments');
        const data = await response.json();
        
        if (data.success) {
            allAppointments = data.appointments || [];
            
            // Aplicar filtro actual si existe
            const filter = document.getElementById('appointmentFilter');
            if (filter) {
                filterAppointments();
            } else {
                renderAppointmentsList(allAppointments);
            }
            
            // Actualizar badge de la pestaña
            updateAppointmentsBadge();
            
        } else {
            throw new Error(data.error || 'Error al cargar citas');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        contentDiv.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
                <p class="text-gray-400">Error al cargar citas</p>
                <p class="text-sm text-red-400 mt-2">${error.message}</p>
                <button onclick="loadAppointments()" class="btn-secondary mt-4">
                    <i class="fas fa-sync-alt mr-2"></i>
                    Reintentar
                </button>
            </div>
        `;
    }
}

// Cargar pacientes para el selector de citas
async function loadPatientsForAppointments() {
    try {
        const response = await fetch('/api/patients');
        const data = await response.json();
        
        if (data.success) {
            allPatients = data.patients || [];
            
            // Actualizar KPI de pacientes
            const totalPatientsEl = document.getElementById('totalPatients');
            if (totalPatientsEl) {
                totalPatientsEl.textContent = allPatients.length;
            }
        }
        
    } catch (error) {
        console.error('❌ Error cargando pacientes:', error);
    }
}

// Cargar estadísticas de citas
async function loadAppointmentStats() {
    try {
        const response = await fetch('/api/appointments/stats');
        const data = await response.json();
        
        if (data.success && data.stats) {
            const stats = data.stats;
            
            // Actualizar KPIs
            document.getElementById('totalAppointments').textContent = stats.total || 0;
            document.getElementById('todayAppointments').textContent = stats.today || 0;
            document.getElementById('pendingAppointments').textContent = stats.pending || 0;
        }
        
    } catch (error) {
        console.error('❌ Error cargando estadísticas:', error);
    }
}

// Renderizar lista de citas
function renderAppointmentsList(appointments) {
    const contentDiv = document.getElementById('appointments-content');
    if (!contentDiv) return;
    
    if (!appointments || appointments.length === 0) {
        contentDiv.innerHTML = `
            <div class="text-center py-12 bg-gray-800/50 rounded-lg">
                <i class="fas fa-calendar-times text-4xl text-gray-600 mb-4"></i>
                <p class="text-gray-400">No hay citas programadas</p>
                <p class="text-sm text-gray-500 mt-2">Crea una nueva cita para comenzar</p>
                <button onclick="showNewAppointmentModal()" class="btn-primary mt-4">
                    <i class="fas fa-plus mr-2"></i>
                    Nueva Cita
                </button>
            </div>
        `;
        return;
    }
    
    // Agrupar citas por fecha
    const groupedByDate = {};
    appointments.forEach(apt => {
        const date = apt.date;
        if (!groupedByDate[date]) {
            groupedByDate[date] = [];
        }
        groupedByDate[date].push(apt);
    });
    
    // Ordenar fechas
    const sortedDates = Object.keys(groupedByDate).sort();
    
    let html = '<div class="space-y-6">';
    
    for (const date of sortedDates) {
        const dateAppointments = groupedByDate[date];
        const formattedDate = formatDateDisplay(date);
        const isToday = isDateToday(date);
        
        html += `
            <div class="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
                <div class="bg-gray-800 px-4 py-3 border-b border-gray-700 flex justify-between items-center">
                    <h3 class="font-semibold flex items-center gap-2">
                        <i class="fas fa-calendar-alt ${isToday ? 'text-purple-500' : 'text-gray-400'}"></i>
                        ${formattedDate}
                        ${isToday ? '<span class="badge badge-purple text-xs">HOY</span>' : ''}
                    </h3>
                    <span class="text-sm text-gray-400">${dateAppointments.length} cita(s)</span>
                </div>
                
                <div class="divide-y divide-gray-700">
        `;
        
        dateAppointments.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        
        for (const apt of dateAppointments) {
            html += renderAppointmentCard(apt);
        }
        
        html += `
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    contentDiv.innerHTML = html;
}

// Renderizar tarjeta de cita individual
function renderAppointmentCard(apt) {
    const statusColors = {
        'pending': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        'completed': 'bg-green-500/20 text-green-400 border-green-500/30',
        'cancelled': 'bg-red-500/20 text-red-400 border-red-500/30',
        'confirmed': 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    };
    
    const statusIcons = {
        'pending': 'fa-clock',
        'completed': 'fa-check-circle',
        'cancelled': 'fa-times-circle',
        'confirmed': 'fa-check-circle'
    };
    
    const statusText = {
        'pending': 'Pendiente',
        'completed': 'Completada',
        'cancelled': 'Cancelada',
        'confirmed': 'Confirmada'
    };
    
    const typeColors = {
        'general': 'bg-purple-500/20 text-purple-400',
        'followup': 'bg-blue-500/20 text-blue-400',
        'emergency': 'bg-red-500/20 text-red-400',
        'checkup': 'bg-green-500/20 text-green-400'
    };
    
    const typeText = {
        'general': 'Consulta General',
        'followup': 'Seguimiento',
        'emergency': 'Urgencia',
        'checkup': 'Revisión'
    };
    
    return `
        <div class="p-4 hover:bg-gray-700/30 transition-colors">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2">
                        <div class="text-lg font-bold">${apt.time || '--:--'}</div>
                        <div class="w-2 h-2 bg-gray-600 rounded-full"></div>
                        <div class="font-medium">${apt.patient_name || 'Paciente'}</div>
                        ${apt.type ? `
                            <span class="text-xs px-2 py-1 rounded-full ${typeColors[apt.type] || 'bg-gray-500/20'}">
                                ${typeText[apt.type] || apt.type}
                            </span>
                        ` : ''}
                    </div>
                    
                    <div class="text-sm text-gray-400 mb-3">
                        <i class="fas fa-clock mr-1"></i> Duración: ${apt.duration || 30} min
                        ${apt.title ? ` • ${apt.title}` : ''}
                    </div>
                    
                    ${apt.description ? `
                        <div class="text-sm bg-gray-800 p-2 rounded mb-3">
                            ${apt.description}
                        </div>
                    ` : ''}
                    
                    <div class="flex items-center gap-4 text-xs">
                        <span class="px-2 py-1 rounded-full border ${statusColors[apt.status] || 'bg-gray-500/20 text-gray-400'}">
                            <i class="fas ${statusIcons[apt.status] || 'fa-circle'} mr-1"></i>
                            ${statusText[apt.status] || apt.status}
                        </span>
                        
                        ${apt.patient_phone ? `
                            <span><i class="fas fa-phone mr-1"></i> ${apt.patient_phone}</span>
                        ` : ''}
                        
                        ${apt.patient_email ? `
                            <span><i class="fas fa-envelope mr-1"></i> ${apt.patient_email}</span>
                        ` : ''}
                    </div>
                </div>
                
                <div class="flex gap-2">
                    <button onclick="editAppointment('${apt.id}')" class="btn-secondary text-sm py-1 px-3">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteAppointment('${apt.id}')" class="btn-danger text-sm py-1 px-3">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Filtrar citas
function filterAppointments() {
    const filter = document.getElementById('appointmentFilter').value;
    const today = new Date().toISOString().split('T')[0];
    
    let filtered = [...allAppointments];
    
    switch(filter) {
        case 'today':
            filtered = allAppointments.filter(apt => apt.date === today);
            break;
        case 'tomorrow':
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];
            filtered = allAppointments.filter(apt => apt.date === tomorrowStr);
            break;
        case 'week':
            const weekLater = new Date();
            weekLater.setDate(weekLater.getDate() + 7);
            const weekLaterStr = weekLater.toISOString().split('T')[0];
            filtered = allAppointments.filter(apt => apt.date >= today && apt.date <= weekLaterStr);
            break;
        case 'pending':
            filtered = allAppointments.filter(apt => apt.status === 'pending');
            break;
        case 'completed':
            filtered = allAppointments.filter(apt => apt.status === 'completed');
            break;
        default:
            filtered = allAppointments;
    }
    
    renderAppointmentsList(filtered);
}

// Cambiar vista (lista/calendario)
function changeAppointmentView() {
    const view = document.getElementById('appointmentView').value;
    currentView = view;
    
    if (view === 'calendar') {
        renderCalendarView();
    } else {
        renderAppointmentsList(allAppointments);
    }
}

// Renderizar vista de calendario (simplificada)
function renderCalendarView() {
    const contentDiv = document.getElementById('appointments-content');
    if (!contentDiv) return;
    
    contentDiv.innerHTML = `
        <div class="text-center py-12 bg-gray-800/50 rounded-lg">
            <i class="fas fa-calendar-alt text-4xl text-purple-500 mb-4"></i>
            <p class="text-gray-400">Vista de calendario en desarrollo</p>
            <p class="text-sm text-gray-500 mt-2">Pronto podrás ver tus citas en formato calendario</p>
            <button onclick="changeAppointmentView()" class="btn-secondary mt-4">
                <i class="fas fa-list mr-2"></i>
                Volver a vista lista
            </button>
        </div>
    `;
}

// Mostrar modal para nueva cita
async function showNewAppointmentModal() {
    // Asegurar que tenemos la lista de pacientes
    if (allPatients.length === 0) {
        await loadPatientsForAppointments();
    }
    
    const modalContainer = document.getElementById('appointment-modal-container');
    
    // Fecha por defecto: hoy
    const today = new Date().toISOString().split('T')[0];
    
    modalContainer.innerHTML = `
        <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onclick="closeAppointmentModal(event)">
            <div class="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">
                <div class="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h3 class="text-lg font-semibold">
                        <i class="fas fa-calendar-plus text-purple-500 mr-2"></i>
                        Nueva Cita
                    </h3>
                    <button onclick="closeAppointmentModal()" class="text-gray-400 hover:text-white">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <form id="newAppointmentForm" class="p-4 space-y-4" onsubmit="createAppointment(event)">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Paciente <span class="text-red-400">*</span></label>
                            <select id="aptPatientId" required class="w-full bg-gray-900 border border-gray-700 rounded p-2">
                                <option value="">Seleccionar paciente...</option>
                                ${allPatients.map(p => `
                                    <option value="${p.folder_id}">${p.username || p.folder_name}</option>
                                `).join('')}
                            </select>
                            ${allPatients.length === 0 ? `
                                <p class="text-xs text-yellow-400 mt-1">No hay pacientes. Crea uno primero.</p>
                            ` : ''}
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-1">Tipo de Cita</label>
                            <select id="aptType" class="w-full bg-gray-900 border border-gray-700 rounded p-2">
                                <option value="general">Consulta General</option>
                                <option value="followup">Seguimiento</option>
                                <option value="checkup">Revisión</option>
                                <option value="emergency">Urgencia</option>
                            </select>
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Título (opcional)</label>
                        <input type="text" id="aptTitle" class="w-full bg-gray-900 border border-gray-700 rounded p-2" placeholder="Ej: Revisión de resultados">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Fecha <span class="text-red-400">*</span></label>
                            <input type="date" id="aptDate" value="${today}" required class="w-full bg-gray-900 border border-gray-700 rounded p-2">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-1">Hora <span class="text-red-400">*</span></label>
                            <input type="time" id="aptTime" value="09:00" required class="w-full bg-gray-900 border border-gray-700 rounded p-2">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Duración (minutos)</label>
                        <select id="aptDuration" class="w-full bg-gray-900 border border-gray-700 rounded p-2">
                            <option value="15">15 minutos</option>
                            <option value="30" selected>30 minutos</option>
                            <option value="45">45 minutos</option>
                            <option value="60">60 minutos</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Descripción / Motivo</label>
                        <textarea id="aptDescription" rows="3" class="w-full bg-gray-900 border border-gray-700 rounded p-2" placeholder="Motivo de la consulta..."></textarea>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Estado</label>
                        <select id="aptStatus" class="w-full bg-gray-900 border border-gray-700 rounded p-2">
                            <option value="pending">Pendiente</option>
                            <option value="confirmed">Confirmada</option>
                            <option value="completed">Completada</option>
                            <option value="cancelled">Cancelada</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Notas adicionales</label>
                        <textarea id="aptNotes" rows="2" class="w-full bg-gray-900 border border-gray-700 rounded p-2" placeholder="Notas internas..."></textarea>
                    </div>
                    
                    <div class="flex justify-end gap-2 pt-4 border-t border-gray-700">
                        <button type="button" onclick="closeAppointmentModal()" class="btn-secondary">
                            Cancelar
                        </button>
                        <button type="submit" class="btn-primary">
                            <i class="fas fa-save mr-2"></i>
                            Guardar Cita
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// Crear nueva cita
async function createAppointment(event) {
    event.preventDefault();
    
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Validar campos
    const patientId = document.getElementById('aptPatientId').value;
    if (!patientId) {
        showNotification('Debes seleccionar un paciente', 'error');
        return;
    }
    
    const date = document.getElementById('aptDate').value;
    const time = document.getElementById('aptTime').value;
    
    if (!date || !time) {
        showNotification('Fecha y hora son requeridas', 'error');
        return;
    }
    
    // Preparar datos
    const appointmentData = {
        patient_id: patientId,
        title: document.getElementById('aptTitle').value,
        type: document.getElementById('aptType').value,
        date: date,
        time: time,
        duration: parseInt(document.getElementById('aptDuration').value),
        description: document.getElementById('aptDescription').value,
        status: document.getElementById('aptStatus').value,
        notes: document.getElementById('aptNotes').value
    };
    
    // Deshabilitar botón
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';
    
    try {
        const response = await fetch('/api/appointments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(appointmentData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Cita creada exitosamente', 'success');
            closeAppointmentModal();
            await loadAppointments(); // Recargar lista
            await loadAppointmentStats(); // Actualizar KPIs
        } else {
            throw new Error(data.error || 'Error al crear cita');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        showNotification(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Guardar Cita';
    }
}

// Editar cita
async function editAppointment(appointmentId) {
    const appointment = allAppointments.find(apt => apt.id === appointmentId);
    if (!appointment) {
        showNotification('Cita no encontrada', 'error');
        return;
    }
    
    const modalContainer = document.getElementById('appointment-modal-container');
    
    modalContainer.innerHTML = `
        <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onclick="closeAppointmentModal(event)">
            <div class="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">
                <div class="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h3 class="text-lg font-semibold">
                        <i class="fas fa-edit text-purple-500 mr-2"></i>
                        Editar Cita
                    </h3>
                    <button onclick="closeAppointmentModal()" class="text-gray-400 hover:text-white">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <form id="editAppointmentForm" class="p-4 space-y-4" onsubmit="updateAppointment(event, '${appointmentId}')">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Paciente <span class="text-red-400">*</span></label>
                            <select id="aptPatientId" required class="w-full bg-gray-900 border border-gray-700 rounded p-2">
                                <option value="">Seleccionar paciente...</option>
                                ${allPatients.map(p => `
                                    <option value="${p.folder_id}" ${p.folder_id === appointment.patient_id ? 'selected' : ''}>
                                        ${p.username || p.folder_name}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-1">Tipo de Cita</label>
                            <select id="aptType" class="w-full bg-gray-900 border border-gray-700 rounded p-2">
                                <option value="general" ${appointment.type === 'general' ? 'selected' : ''}>Consulta General</option>
                                <option value="followup" ${appointment.type === 'followup' ? 'selected' : ''}>Seguimiento</option>
                                <option value="checkup" ${appointment.type === 'checkup' ? 'selected' : ''}>Revisión</option>
                                <option value="emergency" ${appointment.type === 'emergency' ? 'selected' : ''}>Urgencia</option>
                            </select>
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Título</label>
                        <input type="text" id="aptTitle" class="w-full bg-gray-900 border border-gray-700 rounded p-2" value="${appointment.title || ''}">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">Fecha <span class="text-red-400">*</span></label>
                            <input type="date" id="aptDate" value="${appointment.date || ''}" required class="w-full bg-gray-900 border border-gray-700 rounded p-2">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-1">Hora <span class="text-red-400">*</span></label>
                            <input type="time" id="aptTime" value="${appointment.time || '09:00'}" required class="w-full bg-gray-900 border border-gray-700 rounded p-2">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Duración</label>
                        <select id="aptDuration" class="w-full bg-gray-900 border border-gray-700 rounded p-2">
                            <option value="15" ${appointment.duration === 15 ? 'selected' : ''}>15 minutos</option>
                            <option value="30" ${appointment.duration === 30 ? 'selected' : ''}>30 minutos</option>
                            <option value="45" ${appointment.duration === 45 ? 'selected' : ''}>45 minutos</option>
                            <option value="60" ${appointment.duration === 60 ? 'selected' : ''}>60 minutos</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Descripción</label>
                        <textarea id="aptDescription" rows="3" class="w-full bg-gray-900 border border-gray-700 rounded p-2">${appointment.description || ''}</textarea>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Estado</label>
                        <select id="aptStatus" class="w-full bg-gray-900 border border-gray-700 rounded p-2">
                            <option value="pending" ${appointment.status === 'pending' ? 'selected' : ''}>Pendiente</option>
                            <option value="confirmed" ${appointment.status === 'confirmed' ? 'selected' : ''}>Confirmada</option>
                            <option value="completed" ${appointment.status === 'completed' ? 'selected' : ''}>Completada</option>
                            <option value="cancelled" ${appointment.status === 'cancelled' ? 'selected' : ''}>Cancelada</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-1">Notas</label>
                        <textarea id="aptNotes" rows="2" class="w-full bg-gray-900 border border-gray-700 rounded p-2">${appointment.notes || ''}</textarea>
                    </div>
                    
                    <div class="flex justify-end gap-2 pt-4 border-t border-gray-700">
                        <button type="button" onclick="closeAppointmentModal()" class="btn-secondary">
                            Cancelar
                        </button>
                        <button type="submit" class="btn-primary">
                            <i class="fas fa-save mr-2"></i>
                            Actualizar Cita
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// Actualizar cita
async function updateAppointment(event, appointmentId) {
    event.preventDefault();
    
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Validar
    const patientId = document.getElementById('aptPatientId').value;
    if (!patientId) {
        showNotification('Debes seleccionar un paciente', 'error');
        return;
    }
    
    const date = document.getElementById('aptDate').value;
    const time = document.getElementById('aptTime').value;
    
    if (!date || !time) {
        showNotification('Fecha y hora son requeridas', 'error');
        return;
    }
    
    // Preparar datos
    const appointmentData = {
        patient_id: patientId,
        title: document.getElementById('aptTitle').value,
        type: document.getElementById('aptType').value,
        date: date,
        time: time,
        duration: parseInt(document.getElementById('aptDuration').value),
        description: document.getElementById('aptDescription').value,
        status: document.getElementById('aptStatus').value,
        notes: document.getElementById('aptNotes').value
    };
    
    // Deshabilitar botón
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Actualizando...';
    
    try {
        const response = await fetch(`/api/appointments/${appointmentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(appointmentData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Cita actualizada exitosamente', 'success');
            closeAppointmentModal();
            await loadAppointments(); // Recargar lista
            await loadAppointmentStats(); // Actualizar KPIs
        } else {
            throw new Error(data.error || 'Error al actualizar cita');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        showNotification(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Actualizar Cita';
    }
}

// Eliminar cita
async function deleteAppointment(appointmentId) {
    if (!confirm('¿Estás seguro de eliminar esta cita?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/appointments/${appointmentId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Cita eliminada exitosamente', 'success');
            await loadAppointments(); // Recargar lista
            await loadAppointmentStats(); // Actualizar KPIs
        } else {
            throw new Error(data.error || 'Error al eliminar cita');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        showNotification(error.message, 'error');
    }
}

// Cerrar modal
function closeAppointmentModal(event) {
    if (event && event.target.classList.contains('fixed')) {
        document.getElementById('appointment-modal-container').innerHTML = '';
    } else {
        document.getElementById('appointment-modal-container').innerHTML = '';
    }
}

// Funciones auxiliares
function isDateToday(dateStr) {
    const today = new Date().toISOString().split('T')[0];
    return dateStr === today;
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return 'Fecha no disponible';
    
    try {
        const date = new Date(dateStr + 'T12:00:00');
        return date.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return dateStr;
    }
}

function updateAppointmentsBadge() {
    const badge = document.querySelector('.tab-monitoring .tab-badge');
    if (badge) {
        const today = new Date().toISOString().split('T')[0];
        const todayCount = allAppointments.filter(apt => apt.date === today).length;
        badge.textContent = todayCount;
        badge.style.display = todayCount > 0 ? 'inline-block' : 'none';
    }
}

// Inicializar al cargar la pestaña
document.addEventListener('DOMContentLoaded', function() {
    // Solo cargar si la pestaña de monitoreo está activa
    const monitoringTab = document.querySelector('.tab-monitoring.active');
    if (monitoringTab) {
        loadAppointmentsDashboard();
    }
});