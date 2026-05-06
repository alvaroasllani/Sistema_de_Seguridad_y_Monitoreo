# CLAUDE.md — Sistema Electrónico de Seguridad para Radiobases de Telecomunicaciones

## Descripción general del proyecto

Sistema de monitoreo y prevención de robos para radiobases de telecomunicaciones. El prototipo simula una radiobase con sensores, actuadores y cámara IP, controlados remotamente desde una interfaz web tipo NOC (Network Operations Center).

La comunicación entre la página web y los ESP32 se realiza mediante **MQTT (broker Mosquitto)**. La cámara transmite vídeo vía HTTP stream propio del ESP32-CAM.

---

## Arquitectura del sistema

```
[Sensores/Actuadores]
        |
   [ESP32 principal]  ←→  MQTT (Mosquitto)  ←→  [Página Web NOC]
        |
   [ESP32-CAM]  ←→  HTTP Stream  ←→  [Página Web NOC]
```

### Componentes físicos

| N° | Tipo | Componente | Descripción |
|----|------|-----------|-------------|
| 1 | Control | ESP-WROOM-32 | Unidad de control principal (sensores + actuadores) |
| 2 | Sensor | MC-38 | Sensor magnético de puertas |
| 3 | Sensor | HC-SR501 | Sensor PIR de presencia |
| 4 | Sensor | SW-420 | Sensor de vibración |
| 5 | Sensor | KY-024 | Sensor de efecto Hall |
| 6 | Actuador | Buzzer SFM-20B DC3-24V | Actuador sonoro (AS) |
| 7 | Actuador | Foco 12V DC | Actuador lumínico / reflector (AL) |
| 8 | Actuador | Mini chapa solenoide 12V | Actuador mecánico de bloqueo (AM) |
| 9 | Cámara | ESP32-CAM OV2640 | Videovigilancia vía HTTP stream |
| 10 | Receptor | ESP-WROOM-32 | (puede combinarse con el ESP32 principal) |

---

## Variables / Zonas del sistema

| Variable | Descripción |
|----------|-------------|
| `SM1` | Sensor magnético — puerta principal de la radiobase |
| `SP` | Sensor PIR — sobre la torre |
| `SM3` | Sensor magnético — puerta sala de máquinas |
| `SM2` | Sensor magnético — puerta gabinete rectificador |
| `SV` | Sensor de vibración — gabinete rectificador |
| `SH1` | Sensor Hall — banco de baterías 1 |
| `SH2` | Sensor Hall — banco de baterías 2 |
| `AM` | Actuador mecánico — chapa electromecánica |
| `AL` | Actuador lumínico — reflector/foco |
| `AS` | Actuador sonoro — buzzer |
| `CAM` | Cámara ESP32-CAM |
| `NOC` | Centro de monitoreo (interfaz web) |

---

## Alarmas definidas

| Alarma | Nombre | Sensor(es) involucrado(s) |
|--------|--------|--------------------------|
| ALARMA 1 | Intrusión de ingreso a radiobase | SM1 + SP |
| ALARMA 2 | Apertura no autorizada de sala de máquinas | SM3 |
| ALARMA 3 | Forcejeo de manipulación en gabinete rectificador | SV → activa AM |
| ALARMA 4 | Apertura de gabinete rectificador | SM2 → activa AL |
| ALARMA 5 | Desconexión o extracción del banco de baterías 1 | SH1 → activa AS |
| ALARMA 6 | Desconexión o extracción del banco de baterías 2 | SH2 |

Todas las alarmas deben: enviar notificación al NOC, abrir vista de cámara y registrar el evento.

---

## Lógica de seguridad por etapas

### Etapa 1 — Ingreso a la radiobase
- Si `SM1` permanece abierto ≥ 3 s → iniciar temporizador T2 = 10 s
- Si `SP` se activa dentro de los 10 s → **ALARMA 1** (intrusión)
- Si `SP` NO se activa → registrar evento simple (sin alarma)

### Etapa 2 — Ingreso a sala de máquinas
- Si `SM3` permanece abierto ≥ 3 s → **ALARMA 2**

### Etapa 3 — Forcejeo en gabinete rectificador
- Si `SV` detecta ≥ 3 impactos en 5 s, o golpes continuos ≥ 2 s → **ALARMA 3** + activar `AM`
- `AM` se enclava (queda activo)
- Reset de `AM`: manual desde NOC, o temporizador de 10 s para simular apertura de puerta
- Restricción: NOC no puede desactivar `AM` mientras ALARMA 3 esté activa, salvo modo mantenimiento autorizado

### Etapa 4 — Apertura del gabinete rectificador
- Si `SM2` permanece abierto ≥ 1 s → **ALARMA 4** + activar `AL`
- `AL`: patrón estroboscópico (7 s encendido / 5 s apagado) o encendido permanente
- Si el evento continúa, reinicia la temporización
- Se apaga por: temporización cumplida sin evento nuevo, o reset manual del NOC

### Etapa 5 — Extracción banco de baterías 1
- Si `SH1` pierde condición eléctrica → **ALARMA 5** + activar `AS` + mantener `AL`

### Etapa 6 — Extracción banco de baterías 2
- Si `SH2` pierde condición eléctrica → **ALARMA 6** + mantener `AS` + mantener `AL`
- `AS`: patrón (7 s sonando / 5 s apagado), reinicia si el evento continúa
- Se apaga por: temporización cumplida sin evento nuevo, o reset manual del NOC

---

## Modo mantenimiento

El NOC puede activar **MODO MANTENIMIENTO = ON** con duración de 10 minutos (prototipo).

### Niveles de acceso en mantenimiento

| Nivel | Descripción | Sensores anulados |
|-------|-------------|-------------------|
| M1 | Acceso general | SM1, SP, SM3 |
| M2 | Trabajo en gabinete | SM2, SV — AM no debe activarse |
| M3 | Trabajo en baterías | SH1, SH2 |

**Regla general:**
- Sin modo mantenimiento activo → cualquier activación de sensores = intrusión
- Con modo mantenimiento activo → los sensores solo registran evento (excepto zonas no autorizadas o tiempo expirado)

---

## Acciones manuales desde la interfaz NOC

La página web debe permitir:

- Activar / desactivar `AL` manualmente
- Activar / desactivar `AS` manualmente
- Activar / desactivar `AM` manualmente (con restricción de ALARMA 3 activa)
- Activar / desactivar modo mantenimiento
- Resetear alarmas
- Ver cámara en tiempo real (stream HTTP del ESP32-CAM)

---

## Comunicación MQTT

El ESP32 principal se conecta a un broker **Mosquitto** vía WiFi.
La página web se conecta al mismo broker vía **WebSockets (puerto 9001)**.

### Convención de topics sugerida

```
radiobase/sensores/SM1        ← estado sensor (payload: "abierto" / "cerrado")
radiobase/sensores/SP
radiobase/sensores/SM2
radiobase/sensores/SM3
radiobase/sensores/SV
radiobase/sensores/SH1
radiobase/sensores/SH2

radiobase/alarmas             ← payload: JSON con { alarma, timestamp, estado }

radiobase/actuadores/AM       ← control (payload: "ON" / "OFF")
radiobase/actuadores/AL
radiobase/actuadores/AS

radiobase/mantenimiento       ← payload: JSON con { estado, nivel, duracion }
radiobase/reset               ← payload: "ALL" o nombre de alarma específica
```

---

## Cámara ESP32-CAM (OV2640)

- Modelo de hardware: **AI_THINKER** (`CAMERA_MODEL_AI_THINKER`)
- Streaming MJPEG vía HTTP en puerto 81: `http://<IP_ESP32CAM>/stream`
- Captura de foto: `http://<IP_ESP32CAM>/capture`
- La cámara se activa automáticamente ante cualquiera de las 6 alarmas
- En la interfaz web, mostrar el stream embebido en un `<img src="...">` o `<iframe>`

### Pines del modelo AI_THINKER
```
PWDN=32, RESET=-1, XCLK=0
SIOD=26, SIOC=27
Y9=35, Y8=34, Y7=39, Y6=36, Y5=21, Y4=19, Y3=18, Y2=5
VSYNC=25, HREF=23, PCLK=22
LED_FLASH=4
```

---

## Estructura del proyecto web (HTML/CSS/JS)

La página web es el panel de control NOC. Debe contener:

1. **Panel de estado de sensores** — indicadores visuales por zona (SM1, SP, SM2, SM3, SV, SH1, SH2)
2. **Panel de alarmas activas** — lista de alarmas con timestamp y botón de reset
3. **Panel de actuadores** — botones toggle para AM, AL, AS con estado actual
4. **Visor de cámara** — stream en tiempo real del ESP32-CAM
5. **Modo mantenimiento** — selector de nivel (M1/M2/M3), temporizador visible, botón ON/OFF
6. **Log de eventos** — historial de eventos registrados con fecha y hora

### Dependencias JS recomendadas
- `mqtt.js` (paho-mqtt o mqtt.js vía CDN) para conexión WebSocket al broker Mosquitto
- No se requiere framework pesado; vanilla JS es suficiente

---

## Notas de implementación

- El ESP32-CAM corre su propio firmware de cámara independiente (código Arduino provisto)
- El ESP32 principal maneja todos los sensores y actuadores, y publica/suscribe vía MQTT
- El broker Mosquitto debe tener habilitado el listener WebSocket (puerto 9001) para que la página web pueda conectarse directamente desde el navegador
- Para pruebas locales, Mosquitto puede correr en la misma PC que sirve la página web
- Los temporizadores de las etapas lógicas se manejan en el firmware del ESP32

---

## Archivos del proyecto

| Archivo | Descripción |
|---------|-------------|
| `index.html` | Interfaz web NOC |
| `style.css` | Estilos del panel |
| `app.js` | Lógica MQTT y control de interfaz |
| `ESP32_Main/` | Firmware ESP32 principal (sensores + actuadores + MQTT) |
| `ESP32_CAM/` | Firmware ESP32-CAM (streaming HTTP) |
| `ESP32_CAM/board_config.h` | Selección de modelo de cámara |
| `ESP32_CAM/camera_pins.h` | Definición de pines por modelo |
| `ESP32_CAM/app_httpd.cpp` | Servidor HTTP de la cámara |