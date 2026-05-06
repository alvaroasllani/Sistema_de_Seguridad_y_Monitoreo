/**
 * SENTINEL_LOGIC_V1 - Main Logic
 * Full interactive dashboard controller
 */

// ─── Global State ──────────────────────────────────────────────
const state = {
    isArmed: true,
    foco: false,
    chapa: false,   // false = cerrada, true = abierta
    alarma: false,
    uptimeStart: Date.now()
};

// ─── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initUptime();
    initSystemToggle();
    initPrimaryButtons();
    initPeripherals();
    initMaintenance();
    initCamera();
    
    // Connect MQTT when page loads
    window.mqttClient.onConnect(() => {
        const dot = document.getElementById('mqtt-status-dot');
        const text = document.getElementById('mqtt-status-text');
        const container = document.getElementById('mqtt-status-container');
        dot.className = 'w-2 h-2 bg-green-500';
        text.textContent = 'MQTT CONN.';
        container.className = 'flex items-center gap-2 px-3 py-1 bg-surface-container-low border border-green-500/50 transition-colors';
        addActivityLog('Conectado al broker MQTT local', 'INFO');
    });

    window.mqttClient.onDisconnect(() => {
        const dot = document.getElementById('mqtt-status-dot');
        const text = document.getElementById('mqtt-status-text');
        const container = document.getElementById('mqtt-status-container');
        dot.className = 'w-2 h-2 bg-red-500';
        text.textContent = 'MQTT DESC.';
        container.className = 'flex items-center gap-2 px-3 py-1 bg-surface-container-low border border-red-500/50 transition-colors';
        addActivityLog('Desconectado del broker MQTT', 'MEDIA');
    });

    window.mqttClient.onSensor((sensor, payload) => {
        updateSensorUI(sensor, payload);
    });

    window.mqttClient.onAlarma((data) => {
        addActiveAlarm(data);
    });

    window.mqttClient.onActuador((actuador, payload) => {
        // payload = "ON" or "OFF"
        const isOn = payload === 'ON';
        if (actuador === 'AL') state.foco = isOn;
        if (actuador === 'AM') state.chapa = isOn;
        if (actuador === 'AS') state.alarma = isOn;
        refreshPeripheralUI();
    });

    window.mqttClient.connect();

    // Set initial peripheral UI
    refreshPeripheralUI();
    refreshPrimaryButtonsUI();
});

// ─── Camera Setup ──────────────────────────────────────────────
function initCamera() {
    const btnUpdateCam = document.getElementById('btn-update-cam');
    const inputCamIp = document.getElementById('cam-ip');
    const camFeed = document.getElementById('cam-feed');

    btnUpdateCam.addEventListener('click', () => {
        const ip = inputCamIp.value.trim();
        if (ip) {
            camFeed.src = `http://${ip}:81/stream`;
            addActivityLog(`Stream de cámara actualizado a: ${ip}`, 'INFO');
        }
    });
}

// ─── Sensors UI ────────────────────────────────────────────────
function updateSensorUI(sensor, status) {
    const dot = document.getElementById(`sensor-dot-${sensor}`);
    const text = document.getElementById(`sensor-text-${sensor}`);
    if (!dot || !text) return;

    status = status.toUpperCase();
    
    // Asumiendo que 'ABIERTO', 'ACTIVO', 'GOLPE' son estados de alerta
    const isAlert = status === 'ABIERTO' || status === 'ACTIVO' || status === 'GOLPE' || status === 'ERROR';
    const isNormal = status === 'CERRADO' || status === 'INACTIVO' || status === 'OK';

    text.textContent = status;

    if (isAlert) {
        dot.className = 'w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]';
        text.className = 'font-mono text-[9px] text-red-400 uppercase font-bold';
    } else if (isNormal) {
        dot.className = 'w-2 h-2 bg-green-500 rounded-full';
        text.className = 'font-mono text-[9px] text-green-400 uppercase';
    } else {
        dot.className = 'w-2 h-2 bg-surface-container-highest rounded-full';
        text.className = 'font-mono text-[9px] text-on-surface/40 uppercase';
    }
}

// ─── Maintenance Mode ──────────────────────────────────────────
let mantInterval = null;
function initMaintenance() {
    const btnOn = document.getElementById('btn-mant-on');
    const btnOff = document.getElementById('btn-mant-off');
    const selectLevel = document.getElementById('mant-level');
    const timerDisplay = document.getElementById('mant-timer');

    let mantTimeLeft = 0;

    btnOn.addEventListener('click', () => {
        const level = selectLevel.value;
        const duration = 600; // 10 mins
        window.mqttClient.publishMaintenance(level, duration);
        
        btnOn.className = 'px-3 py-1 font-mono text-[10px] border border-yellow-500 text-yellow-500 bg-yellow-500/20 font-bold uppercase transition-all shadow-[0_0_10px_rgba(234,179,8,0.3)]';
        btnOff.className = 'px-3 py-1 font-mono text-[10px] border border-outline/30 bg-surface-container-lowest text-on-surface/40 uppercase transition-all hover:text-on-surface/80';
        selectLevel.disabled = true;

        mantTimeLeft = duration;
        clearInterval(mantInterval);
        mantInterval = setInterval(() => {
            mantTimeLeft--;
            if (mantTimeLeft <= 0) {
                clearInterval(mantInterval);
                btnOff.click();
            } else {
                const m = Math.floor(mantTimeLeft / 60);
                const s = mantTimeLeft % 60;
                timerDisplay.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            }
        }, 1000);
        
        addActivityLog(`Modo Mantenimiento ${level} Activado`, 'MEDIA');
    });

    btnOff.addEventListener('click', () => {
        window.mqttClient.publishMaintenanceOff();
        
        btnOn.className = 'px-3 py-1 font-mono text-[10px] border border-outline/30 bg-surface-container-high text-on-surface/40 uppercase transition-all hover:text-on-surface/80';
        btnOff.className = 'px-3 py-1 font-mono text-[10px] border border-primary/50 bg-primary/20 text-primary font-bold uppercase transition-all';
        selectLevel.disabled = false;
        
        clearInterval(mantInterval);
        timerDisplay.textContent = '00:00';
        addActivityLog(`Modo Mantenimiento Desactivado`, 'INFO');
    });
}

// ─── Active Alarms ─────────────────────────────────────────────
const activeAlarmsMap = new Map();

function addActiveAlarm(data) {
    // data = { alarma: 3, nombre: "...", estado: "activa", timestamp: "..." }
    const list = document.getElementById('active-alarms-list');
    
    if (data.estado === "inactiva" || data.estado === "reset") {
        activeAlarmsMap.delete(data.alarma);
        renderActiveAlarms();
        return;
    }

    activeAlarmsMap.set(data.alarma, data);
    renderActiveAlarms();
    
    addActivityLog(`Alarma ${data.alarma}: ${data.nombre}`, 'CRÍTICA');
}

function renderActiveAlarms() {
    const list = document.getElementById('active-alarms-list');
    list.innerHTML = '';
    
    if (activeAlarmsMap.size === 0) {
        list.innerHTML = '<div class="font-mono text-[10px] text-on-surface/50 text-center py-2">SIN ALARMAS ACTIVAS</div>';
        return;
    }

    activeAlarmsMap.forEach((alarm, id) => {
        const div = document.createElement('div');
        div.className = 'bg-error-container/20 border border-error/40 p-2 flex justify-between items-center';
        div.innerHTML = `
            <div class="flex flex-col">
                <span class="font-mono text-[10px] font-bold text-error uppercase">ALARMA ${alarm.alarma}</span>
                <span class="font-body text-[11px] text-on-surface/90">${alarm.nombre}</span>
                <span class="font-mono text-[8px] text-on-surface/50 mt-1">${alarm.timestamp || new Date().toLocaleTimeString()}</span>
            </div>
            <button onclick="window.mqttClient.publishReset('ALARMA_${alarm.alarma}')" class="px-2 py-1 bg-surface-container border border-outline/30 text-on-surface/80 text-[9px] font-mono hover:bg-error hover:text-white transition-colors">RESET</button>
        `;
        list.appendChild(div);
    });
}

// Reset ALL event listener
document.addEventListener('DOMContentLoaded', () => {
    const btnResetAll = document.getElementById('btn-reset-all');
    if (btnResetAll) {
        btnResetAll.addEventListener('click', () => {
            window.mqttClient.publishReset('ALL');
            // Optimistically clear the UI
            activeAlarmsMap.clear();
            renderActiveAlarms();
            addActivityLog('Comando RESET ALL enviado', 'MEDIA');
        });
    }
});

// ─── Clock ─────────────────────────────────────────────────────
function initClock() {
    const el = document.getElementById('system-clock');
    if (!el) return;

    const tick = () => {
        const now = new Date();
        el.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
            .map(n => String(n).padStart(2, '0')).join(':');
    };
    tick();
    setInterval(tick, 1000);
}

// ─── Uptime Counter ────────────────────────────────────────────
function initUptime() {
    const el = document.getElementById('uptime-counter');
    if (!el) return;

    const tick = () => {
        const diff = Math.floor((Date.now() - state.uptimeStart) / 1000);
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        el.textContent = `${String(h).padStart(3, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    tick();
    setInterval(tick, 1000);
}

// ─── System Arm / Disarm Toggle ────────────────────────────────
function initSystemToggle() {
    const card = document.getElementById('system-status-card');
    if (!card) return;

    card.addEventListener('click', () => {
        state.isArmed = !state.isArmed;
        updateSystemUI();
        refreshPrimaryButtonsUI();
        addActivityLog(
            state.isArmed ? 'Sistema Armado por operador' : 'Sistema Desactivado por operador',
            state.isArmed ? 'ALTA' : 'BAJA'
        );
        updateLastModified();
    });
}

function updateSystemUI() {
    const card = document.getElementById('system-status-card');
    const text = document.getElementById('status-text');
    const icon = document.getElementById('status-icon');
    const hint = document.getElementById('status-instruction');

    if (state.isArmed) {
        setClasses(card, 'bg-error-container border-on-error', 'bg-surface-container-high border-outline');
        text.textContent = 'Sistema Armado';
        icon.textContent = 'lock';
        icon.className = 'material-symbols-outlined text-error-container text-2xl';
        hint.textContent = 'PRESIONE PARA DESACTIVAR';
    } else {
        setClasses(card, 'bg-surface-container-high border-outline', 'bg-error-container border-on-error');
        text.textContent = 'Sistema Desarmado';
        icon.textContent = 'lock_open';
        icon.className = 'material-symbols-outlined text-green-500 text-2xl';
        hint.textContent = 'PRESIONE PARA ARMAR';
    }
}

// ─── Primary Buttons (Encender / Apagar) ───────────────────────
function initPrimaryButtons() {
    const btnOn = document.getElementById('btn-encender');
    const btnOff = document.getElementById('btn-apagar');

    btnOn.addEventListener('click', () => {
        if (state.isArmed) return; // ya está armado
        state.isArmed = true;
        updateSystemUI();
        refreshPrimaryButtonsUI();
        addActivityLog('Sistema Armado vía botón ENCENDER', 'ALTA');
        updateLastModified();
    });

    btnOff.addEventListener('click', () => {
        if (!state.isArmed) return; // ya está apagado
        state.isArmed = false;
        updateSystemUI();
        refreshPrimaryButtonsUI();
        addActivityLog('Sistema Desactivado vía botón APAGAR', 'MEDIA');
        updateLastModified();
    });
}

function refreshPrimaryButtonsUI() {
    const btnOn = document.getElementById('btn-encender');
    const btnOff = document.getElementById('btn-apagar');

    if (state.isArmed) {
        // Encender = ACTIVO → bright green glow
        btnOn.className = 'bg-green-500 border-2 border-green-300 py-3 font-mono text-xs text-white font-bold uppercase tracking-widest transition-all duration-200 cursor-default';
        btnOn.style.boxShadow = '0 0 12px rgba(34,197,94,0.6), inset 0 0 8px rgba(34,197,94,0.2)';
        // Apagar = inactivo → very dim
        btnOff.className = 'bg-surface-container-lowest border border-outline/10 py-3 font-mono text-xs text-on-surface/20 uppercase tracking-widest hover:bg-error-container hover:text-white hover:border-error transition-all duration-200 cursor-pointer';
        btnOff.style.boxShadow = 'none';
    } else {
        // Encender = inactivo → very dim
        btnOn.className = 'bg-surface-container-lowest border border-outline/10 py-3 font-mono text-xs text-on-surface/20 uppercase tracking-widest hover:bg-green-500 hover:text-white hover:border-green-400 transition-all duration-200 cursor-pointer';
        btnOn.style.boxShadow = 'none';
        // Apagar = ACTIVO → bright red glow
        btnOff.className = 'bg-red-700 border-2 border-red-400 py-3 font-mono text-xs text-white font-bold uppercase tracking-widest transition-all duration-200 cursor-default';
        btnOff.style.boxShadow = '0 0 12px rgba(239,68,68,0.6), inset 0 0 8px rgba(239,68,68,0.2)';
    }
}

// ─── Peripheral Controls ───────────────────────────────────────
function initPeripherals() {
    // Foco Exterior
    document.getElementById('foco-on').addEventListener('click', () => {
        window.mqttClient.publishActuator('AL', 'ON');
        // El estado se actualizará cuando llegue el mensaje de MQTT, pero para feedback inmediato:
        state.foco = true;
        refreshPeripheralUI();
        addActivityLog('Comando: Foco Exterior ENCENDIDO', 'BAJA');
        updateLastModified();
    });
    document.getElementById('foco-off').addEventListener('click', () => {
        window.mqttClient.publishActuator('AL', 'OFF');
        state.foco = false;
        refreshPeripheralUI();
        addActivityLog('Comando: Foco Exterior APAGADO', 'BAJA');
        updateLastModified();
    });

    // Chapa Eléctrica
    document.getElementById('chapa-abrir').addEventListener('click', () => {
        window.mqttClient.publishActuator('AM', 'ON');
        state.chapa = true;
        refreshPeripheralUI();
        addActivityLog('Comando: Chapa Eléctrica ABIERTA', 'MEDIA');
        updateLastModified();
    });
    document.getElementById('chapa-cerrar').addEventListener('click', () => {
        window.mqttClient.publishActuator('AM', 'OFF');
        state.chapa = false;
        refreshPeripheralUI();
        addActivityLog('Comando: Chapa Eléctrica CERRADA', 'BAJA');
        updateLastModified();
    });

    // Alarma Sonora
    document.getElementById('alarma-activar').addEventListener('click', () => {
        window.mqttClient.publishActuator('AS', 'ON');
        state.alarma = true;
        refreshPeripheralUI();
        addActivityLog('Comando: Alarma Sonora ACTIVADA', 'CRÍTICA');
        updateLastModified();
    });
    document.getElementById('alarma-desactivar').addEventListener('click', () => {
        window.mqttClient.publishActuator('AS', 'OFF');
        state.alarma = false;
        refreshPeripheralUI();
        addActivityLog('Comando: Alarma Sonora DESACTIVADA', 'MEDIA');
        updateLastModified();
    });
}

function refreshPeripheralUI() {
    // ── Foco ──
    setTogglePairAdvanced(
        'foco-on', 'foco-off', state.foco,
        // ON activo: verde brillante con glow
        { cls: 'px-4 py-2 font-mono text-[10px] border-2 border-green-300 bg-green-500 text-white font-bold uppercase transition-all duration-200 cursor-default', shadow: '0 0 10px rgba(34,197,94,0.5)' },
        // ON inactivo: muy dim
        { cls: 'px-4 py-2 font-mono text-[10px] border border-outline/15 bg-surface-container-lowest text-on-surface/20 hover:text-green-400 hover:border-green-500/40 uppercase transition-all duration-200 cursor-pointer', shadow: 'none' },
        // OFF activo: gris claro notable
        { cls: 'px-4 py-2 font-mono text-[10px] border-2 border-on-surface/40 bg-surface-container-high text-on-surface font-bold uppercase transition-all duration-200 cursor-default', shadow: '0 0 8px rgba(226,226,226,0.15)' },
        // OFF inactivo: casi invisible
        { cls: 'px-4 py-2 font-mono text-[10px] border border-outline/15 bg-surface-container-lowest text-on-surface/20 hover:text-on-surface/60 hover:border-outline/40 uppercase transition-all duration-200 cursor-pointer', shadow: 'none' }
    );

    // ── Chapa ──
    setTogglePairAdvanced(
        'chapa-abrir', 'chapa-cerrar', state.chapa,
        // Abrir activo: azul brillante con glow
        { cls: 'px-3 py-2 font-mono text-[10px] border-2 border-blue-300 bg-blue-600 text-white font-bold uppercase transition-all duration-200 cursor-default', shadow: '0 0 10px rgba(37,99,235,0.5)' },
        // Abrir inactivo
        { cls: 'px-3 py-2 font-mono text-[10px] border border-outline/15 bg-surface-container-lowest text-on-surface/20 hover:text-primary hover:border-primary/40 uppercase transition-all duration-200 cursor-pointer', shadow: 'none' },
        // Cerrar activo
        { cls: 'px-3 py-2 font-mono text-[10px] border-2 border-on-surface/40 bg-surface-container-high text-on-surface font-bold uppercase transition-all duration-200 cursor-default', shadow: '0 0 8px rgba(226,226,226,0.15)' },
        // Cerrar inactivo
        { cls: 'px-3 py-2 font-mono text-[10px] border border-outline/15 bg-surface-container-lowest text-on-surface/20 hover:text-on-surface/60 hover:border-outline/40 uppercase transition-all duration-200 cursor-pointer', shadow: 'none' }
    );

    // ── Alarma ──
    setTogglePairAdvanced(
        'alarma-activar', 'alarma-desactivar', state.alarma,
        // Activar activo: rojo brillante con glow
        { cls: 'px-2 py-2 font-mono text-[10px] border-2 border-red-400 bg-red-700 text-white font-bold uppercase transition-all duration-200 cursor-default', shadow: '0 0 10px rgba(239,68,68,0.5)' },
        // Activar inactivo
        { cls: 'px-2 py-2 font-mono text-[10px] border border-outline/15 bg-surface-container-lowest text-on-surface/20 hover:text-red-400 hover:border-red-500/40 uppercase transition-all duration-200 cursor-pointer', shadow: 'none' },
        // Desactivar activo
        { cls: 'px-2 py-2 font-mono text-[10px] border-2 border-on-surface/40 bg-surface-container-high text-on-surface font-bold uppercase transition-all duration-200 cursor-default', shadow: '0 0 8px rgba(226,226,226,0.15)' },
        // Desactivar inactivo
        { cls: 'px-2 py-2 font-mono text-[10px] border border-outline/15 bg-surface-container-lowest text-on-surface/20 hover:text-on-surface/60 hover:border-outline/40 uppercase transition-all duration-200 cursor-pointer', shadow: 'none' }
    );
}

/**
 * Helper: sets classes + boxShadow for a toggle button pair.
 * Each style is { cls: string, shadow: string }
 */
function setTogglePairAdvanced(onId, offId, isOn, onActive, onInactive, offActive, offInactive) {
    const onBtn = document.getElementById(onId);
    const offBtn = document.getElementById(offId);

    if (isOn) {
        onBtn.className = onActive.cls;
        onBtn.style.boxShadow = onActive.shadow;
        offBtn.className = offInactive.cls;
        offBtn.style.boxShadow = offInactive.shadow;
    } else {
        onBtn.className = onInactive.cls;
        onBtn.style.boxShadow = onInactive.shadow;
        offBtn.className = offActive.cls;
        offBtn.style.boxShadow = offActive.shadow;
    }
}

// ─── Activity Log ──────────────────────────────────────────────
function addActivityLog(event, severity) {
    const tbody = document.querySelector('tbody');
    if (!tbody) return;

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0];

    const severityMap = {
        'CRÍTICA': 'bg-error-container text-white border-error',
        'ALTA':    'bg-yellow-900/40 text-yellow-400 border-yellow-500/30',
        'MEDIA':   'bg-yellow-900/40 text-yellow-400 border-yellow-500/30',
        'BAJA':    'bg-green-900/40 text-green-400 border-green-500/30',
        'INFO':    'bg-blue-900/40 text-blue-400 border-blue-500/30'
    };
    const cls = severityMap[severity] || severityMap['INFO'];

    const isError = severity === 'CRÍTICA';

    const row = document.createElement('tr');
    row.className = 'hover:bg-primary/10 transition-none group';
    row.innerHTML = `
        <td class="p-4 font-mono text-sm">${date}</td>
        <td class="p-4 font-mono text-sm text-primary">${time}</td>
        <td class="p-4 font-body text-sm ${isError ? 'text-error' : ''}">${event}</td>
        <td class="p-4"><span class="px-2 py-0.5 ${cls} text-[10px] font-mono border">${severity}</span></td>
        <td class="p-4 text-primary text-xs font-mono uppercase underline cursor-pointer opacity-0 group-hover:opacity-100">Ver Detalles</td>
    `;

    // Brief flash animation
    row.style.backgroundColor = 'rgba(37, 99, 235, 0.15)';
    tbody.prepend(row);
    setTimeout(() => { row.style.backgroundColor = ''; }, 600);

    // Auto-scroll table to top
    const scrollContainer = tbody.closest('.overflow-y-auto');
    if (scrollContainer) scrollContainer.scrollTop = 0;
}

// ─── Helpers ───────────────────────────────────────────────────
function setClasses(el, add, remove) {
    remove.split(' ').forEach(c => el.classList.remove(c));
    add.split(' ').forEach(c => el.classList.add(c));
}

function updateLastModified() {
    const el = document.getElementById('last-modified');
    if (!el) return;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].slice(0, 5);
    el.textContent = `ÚLTIMA MODIFICACIÓN: OPERADOR EN ${dateStr} ${timeStr}`;
}
