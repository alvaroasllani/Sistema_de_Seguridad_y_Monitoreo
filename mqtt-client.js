const MQTT_CONFIG = {
    host: window.location.hostname || 'localhost',
    port: 9001,
    clientId: 'NOC_WEB_' + Math.random().toString(16).substring(2, 8),
    topics: {
        eventos: 'radiobase/eventos',
        comandos: 'radiobase/comandos'
    }
};

class MqttClientHandler {
    constructor() {
        this.client = null;
        this.callbacks = {
            onConnect: [],
            onDisconnect: [],
            onSensor: [],
            onAlarma: [],
            onActuador: []
        };
    }

    connect() {
        const brokerUrl = `ws://${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`;
        console.log(`Connecting to MQTT broker at ${brokerUrl}...`);
        
        // Requiere que el script mqtt.js se haya cargado
        if (typeof mqtt === 'undefined') {
            console.error('MQTT.js no está cargado.');
            return;
        }

        this.client = mqtt.connect(brokerUrl, {
            clientId: MQTT_CONFIG.clientId,
            reconnectPeriod: 5000, // Reintentar cada 5 segundos
        });

        this.client.on('connect', () => {
            console.log('Connected to MQTT broker!');
            this.client.subscribe(MQTT_CONFIG.topics.eventos);
            
            this.callbacks.onConnect.forEach(cb => cb());
        });

        this.client.on('close', () => {
            this.callbacks.onDisconnect.forEach(cb => cb());
        });

        this.client.on('error', (err) => {
            console.error('MQTT Error:', err);
            this.client.end();
        });

        this.client.on('message', (topic, message) => {
            const payload = message.toString();
            console.log(`[MQTT] Evento recibido:`, payload);
            
            if (topic === MQTT_CONFIG.topics.eventos) {
                if (this.callbacks.onEvento) {
                    this.callbacks.onEvento.forEach(cb => cb(payload));
                }
            }
        });
    }

    publishCommand(comando) {
        if (!this.client || !this.client.connected) return;
        this.client.publish(MQTT_CONFIG.topics.comandos, comando);
        console.log(`[MQTT] Comando enviado: ${comando}`);
    }

    // Adaptadores para la interfaz actual:
    publishActuator(actuador, state) {
        // state "ON" o "OFF", actuador "AL", "AM", "AS"
        this.publishCommand(`${actuador}_${state}`);
    }

    publishMaintenance(level, duration) {
        // level "M1", "M2", "M3"
        if (level === 'M1') this.publishCommand('MANTENIMIENTO1');
        else if (level === 'M2') this.publishCommand('MANTENIMIENTO2');
        else if (level === 'M3') this.publishCommand('MANTENIMIENTO3');
    }

    publishMaintenanceOff() {
        this.publishCommand('FINMANTENIMIENTO');
    }

    publishReset(target) {
        // El firmware actual solo tiene RESET general
        this.publishCommand('RESET');
    }

    // Registro de callbacks
    onConnect(cb) { this.callbacks.onConnect.push(cb); }
    onDisconnect(cb) { this.callbacks.onDisconnect.push(cb); }
    onEvento(cb) { if (!this.callbacks.onEvento) this.callbacks.onEvento = []; this.callbacks.onEvento.push(cb); }
}

window.mqttClient = new MqttClientHandler();
