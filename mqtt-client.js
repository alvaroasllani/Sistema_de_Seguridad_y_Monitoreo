const MQTT_CONFIG = {
    host: window.location.hostname || 'localhost',
    port: 9001,
    clientId: 'NOC_WEB_' + Math.random().toString(16).substring(2, 8),
    topics: {
        sensores: 'radiobase/sensores/+',
        alarmas: 'radiobase/alarmas',
        actuadores: {
            AM: 'radiobase/actuadores/AM',
            AL: 'radiobase/actuadores/AL',
            AS: 'radiobase/actuadores/AS'
        },
        mantenimiento: 'radiobase/mantenimiento',
        reset: 'radiobase/reset'
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
            this.client.subscribe(MQTT_CONFIG.topics.sensores);
            this.client.subscribe(MQTT_CONFIG.topics.alarmas);
            this.client.subscribe(MQTT_CONFIG.topics.actuadores.AM);
            this.client.subscribe(MQTT_CONFIG.topics.actuadores.AL);
            this.client.subscribe(MQTT_CONFIG.topics.actuadores.AS);
            
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
            // console.log(`[MQTT] Mensaje recibido en ${topic}:`, payload);
            
            if (topic.startsWith('radiobase/sensores/')) {
                const sensor = topic.split('/').pop();
                this.callbacks.onSensor.forEach(cb => cb(sensor, payload));
            } else if (topic === MQTT_CONFIG.topics.alarmas) {
                try {
                    const data = JSON.parse(payload);
                    this.callbacks.onAlarma.forEach(cb => cb(data));
                } catch (e) {
                    console.error('Error parseando JSON de alarma:', e);
                }
            } else if (topic.startsWith('radiobase/actuadores/')) {
                const actuador = topic.split('/').pop();
                this.callbacks.onActuador.forEach(cb => cb(actuador, payload));
            }
        });
    }

    publishActuator(actuador, state) {
        if (!this.client || !this.client.connected) return;
        const topic = MQTT_CONFIG.topics.actuadores[actuador];
        if (topic) {
            this.client.publish(topic, state);
            console.log(`[MQTT] Published to ${topic}: ${state}`);
        }
    }

    publishMaintenance(level, duration) {
        if (!this.client || !this.client.connected) return;
        const payload = JSON.stringify({ estado: 'ON', nivel: level, duracion: duration });
        this.client.publish(MQTT_CONFIG.topics.mantenimiento, payload);
    }

    publishMaintenanceOff() {
        if (!this.client || !this.client.connected) return;
        const payload = JSON.stringify({ estado: 'OFF' });
        this.client.publish(MQTT_CONFIG.topics.mantenimiento, payload);
    }

    publishReset(target) {
        if (!this.client || !this.client.connected) return;
        this.client.publish(MQTT_CONFIG.topics.reset, target);
    }

    // Registro de callbacks
    onConnect(cb) { this.callbacks.onConnect.push(cb); }
    onDisconnect(cb) { this.callbacks.onDisconnect.push(cb); }
    onSensor(cb) { this.callbacks.onSensor.push(cb); }
    onAlarma(cb) { this.callbacks.onAlarma.push(cb); }
    onActuador(cb) { this.callbacks.onActuador.push(cb); }
}

window.mqttClient = new MqttClientHandler();
