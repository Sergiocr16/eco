# Eco listener — wake word + STT 100% local

Sidecar Python que escucha el micrófono **sin enviar audio a ningún servicio externo**.

## Cómo funciona

```
   mic (16kHz mono)
      │
      ▼
   openwakeword (ONNX local)     ← detecta "hey jarvis"
      │  (score > 0.5)
      ▼
   captura siguiente fragmento    ← VAD por energía RMS, hasta 12s
      │
      ▼
   faster-whisper local (es)      ← transcribe a texto
      │
      ▼
   POST /voice/transcribed        ← solo el TEXTO final viaja
   al backend de Eco
```

**Privacidad**: el audio nunca sale de la máquina. Solo el texto transcrito
(igual que si lo hubieras tecleado) llega al backend.

## Setup

```bash
cd listener
./setup.sh
```

Instala:
- `openwakeword` con sus modelos (~10 MB de ONNX)
- `faster-whisper` (modelo se baja al primer uso, ~1.5 GB para `medium`, ~150 MB para `base`)
- `sounddevice` para acceso al mic
- Dependencias menores (numpy, scipy, etc.)

## Correrlo

```bash
source .venv/bin/activate
python main.py
```

Configurable via env vars o flags:

| Variable | Default | Descripción |
|---|---|---|
| `ECO_BACKEND` | `http://127.0.0.1:7000` | URL del backend Eco |
| `ECO_TOKEN_FILE` | `~/.eco/token` | Archivo con el Bearer token |
| `ECO_WAKE_MODEL` | `hey_jarvis_v0.1` | Modelo de wake word |
| `ECO_WAKE_THRESHOLD` | `0.5` | Score mínimo (0–1) |
| `ECO_WHISPER_MODEL` | `medium` | `tiny`, `base`, `small`, `medium`, `large-v3` |
| `ECO_LANG` | `es` | Idioma de transcripción |
| `ECO_MIC_DEVICE` | (sistema) | Índice o nombre del mic |
| `ECO_INITIAL_PROMPT` | (vocabulario Eco) | Texto que sesga la transcripción al dominio del producto |

```bash
# Verbose + modelo más liviano si el hardware está limitado
ECO_WHISPER_MODEL=small python main.py -v

# Deshabilitar el sesgo léxico (modo neutro)
ECO_INITIAL_PROMPT='' python main.py
```

**Sobre `initial_prompt`:** Whisper interpreta este texto como contexto previo
y se inclina a transcribir esas palabras correctamente en lugar de homófonos.
Por defecto incluye vocabulario de Eco (`burbuja`, `workspace`, `dashboard`,
`refactor`, `commit`) y del proyecto Aditum. Si la transcripción confunde
términos técnicos por palabras del idioma común, agregalos a esa lista.

## Performance esperado

| Plataforma | Wake detection | Transcripción 3s · `base` | Transcripción 3s · `medium` |
|---|---|---|---|
| Mac M1/M2/M3 | <50ms | ~0.4s | ~1.2s |
| Mac Intel | ~80ms | ~1s | ~3s |
| Raspberry Pi 5 | ~120ms | ~3-4s | ~10s (no recomendado) |

El default `medium` da +30–40% de precisión sobre `base` a cambio de 2-3×
latencia. En una Mac moderna sigue siendo casi imperceptible.
Si la latencia molesta, bajá a `small`.

## Custom wake word "Eco"

Hoy usa el modelo pre-entrenado `hey_jarvis_v0.1`. Para entrenar un modelo
custom para "Eco" / "Hey Eco":

```bash
# (próxima iteración, ~30 min con audio sintético)
python -m openwakeword.train --target-word "eco" ...
```

El modelo entrenado se guarda como `models/hey_eco.onnx` y se setea con
`ECO_WAKE_MODEL=hey_eco`.

## Empaquetado (futuro)

Cuando empaquetemos como `.app` de Mac (task 8), todo este sidecar se
convierte en un binario standalone con PyInstaller (~150 MB con
modelos incluidos). El usuario final no instala Python ni nada.
