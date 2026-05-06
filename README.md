# SENTINEL_LOGIC_V1 - Configuración e Instalación

Este repositorio contiene la interfaz de monitoreo y control web (NOC) para el Sistema Electrónico de Seguridad de Radiobases.

La interfaz está construida con **HTML, Tailwind CSS (vía CDN) y Vanilla JavaScript**, y se comunica con el hardware (ESP32) utilizando **MQTT sobre WebSockets**.

---

## 1. Requisitos Previos

Para que el sistema completo funcione en un entorno físico real, necesitas:
1. Una computadora o servidor que actuará como **Broker MQTT** y alojará esta página web.
2. La placa **ESP32 principal** conectada a los sensores y actuadores, con el firmware cargado.
3. La placa **ESP32-CAM** para la videovigilancia.
4. Todos los dispositivos deben estar en la misma red local (WiFi o LAN).

---

## 2. Configuración del Broker MQTT (Mosquitto)

El ESP32 se comunica vía MQTT estándar (puerto 1883), pero la página web requiere **WebSockets** (puerto 9001). Debemos configurar Mosquitto para habilitar ambos.

### Instalación:
- **Windows**: Descarga e instala Mosquitto desde [mosquitto.org/download](https://mosquitto.org/download/).
- **Linux/Raspberry Pi**: `sudo apt install mosquitto mosquitto-clients`

### Configuración de WebSockets:
Ubica el archivo `mosquitto.conf` (en Windows suele estar en `C:\Program Files\mosquitto\mosquitto.conf`, en Linux en `/etc/mosquitto/mosquitto.conf`).
Abre el archivo con un editor de texto (como Administrador) y añade estas líneas al final:

```conf
# Listener por defecto MQTT (ESP32)
listener 1883 0.0.0.0
allow_anonymous true

# Listener para WebSockets (Página Web)
listener 9001 0.0.0.0
protocol websockets
allow_anonymous true
```

*Nota: `allow_anonymous true` permite la conexión sin contraseña. Para producción, se recomienda configurar usuarios y contraseñas.*

Guarda el archivo y **reinicia el servicio** de Mosquitto.

---

## 3. Configuración de la Página Web (NOC)

Por defecto, la página intentará conectarse al broker MQTT en `localhost:9001`. 

Si vas a abrir la página web desde una computadora diferente a la que aloja el broker Mosquitto:
1. Abre el archivo `mqtt-client.js`.
2. Modifica la variable `host` en la configuración:
   ```javascript
   const MQTT_CONFIG = {
       host: '192.168.1.50', // Reemplaza por la IP local de la PC con Mosquitto
       port: 9001,
       // ...
   };
   ```

Simplemente abre el archivo `index.html` en tu navegador web. En la esquina superior derecha deberías ver el indicador **MQTT CONN.** en color verde.

---

## 4. Configuración del Hardware (ESP32)

### ESP32-CAM
1. Carga el firmware estándar de `CameraWebServer` (disponible en los ejemplos de Arduino IDE).
2. Asegúrate de seleccionar el modelo de cámara correcto (normalmente `CAMERA_MODEL_AI_THINKER`).
3. Ingresa las credenciales de tu red WiFi.
4. Una vez conectado, el Monitor Serie te mostrará una IP (ej. `192.168.1.100`).
5. En el dashboard web, ve a la sección de la cámara, ingresa esa IP y presiona **SET**.

### ESP32 Principal
El firmware del ESP32 debe estar programado para conectarse al broker MQTT (puerto 1883) y suscribirse/publicar en los siguientes topics.

**Topics que el ESP32 debe publicar (Enviar a la Web):**
- `radiobase/sensores/SM1` (Payloads recomendados: "CERRADO" o "ABIERTO")
- `radiobase/sensores/SP` ("INACTIVO" o "ACTIVO")
- `radiobase/sensores/SM3` ("CERRADO" o "ABIERTO")
- `radiobase/sensores/SM2` ("CERRADO" o "ABIERTO")
- `radiobase/sensores/SV` ("OK" o "GOLPE")
- `radiobase/sensores/SH1` ("OK" o "ERROR")
- `radiobase/sensores/SH2` ("OK" o "ERROR")
- `radiobase/alarmas` (Payload JSON: `{"alarma": 1, "nombre": "Intrusión de ingreso", "estado": "activa"}`)

**Topics a los que el ESP32 debe suscribirse (Recibir de la Web):**
- `radiobase/actuadores/AM` (Recibe: "ON" / "OFF")
- `radiobase/actuadores/AL` (Recibe: "ON" / "OFF")
- `radiobase/actuadores/AS` (Recibe: "ON" / "OFF")
- `radiobase/mantenimiento` (Recibe JSON con nivel y duración, o comando "OFF")
- `radiobase/reset` (Recibe: "ALL" o "ALARMA_X")

> **Importante:** Cuando el ESP32 recibe un comando para encender un actuador, debe ejecutar la acción física y **luego publicar** su estado actualizado en el mismo topic para que la interfaz web confirme el cambio.

---

## 5. Simulación y Pruebas sin Hardware

Si quieres probar la interfaz antes de tener el hardware físico, puedes usar herramientas como `mosquitto_pub` desde la línea de comandos para simular envíos del ESP32.

**Simular apertura de puerta principal:**
```bash
mosquitto_pub -h localhost -t "radiobase/sensores/SM1" -m "ABIERTO"
```

**Simular activación de alarma:**
```bash
mosquitto_pub -h localhost -t "radiobase/alarmas" -m '{"alarma":3,"nombre":"Forcejeo en gabinete rectificador","estado":"activa"}'
```

**Ver los comandos enviados desde la web a los actuadores:**
```bash
mosquitto_sub -h localhost -t "radiobase/actuadores/#" -v
```
