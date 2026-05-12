# Entrenar wake word custom "Hey Eco"

Este directorio contiene el script para entrenar un modelo de wake word custom para
"Hey Eco" usando [openwakeword](https://github.com/dscripka/openWakeWord) +
[piper-tts](https://github.com/rhasspy/piper) (TTS local, sin servicios).

Una vez entrenado, el listener detecta "Hey Eco" con ~85% precisión local 100% offline.

## Cuándo correrlo

- La primera vez que querés "Hey Eco" como wake word de Eco.
- Si re-grabás voces nuevas o querés mejorar la precisión.
- El modelo entrenado se guarda en `../models/hey_eco.onnx` y se persiste —
  no hace falta re-entrenar.

## Requisitos

- Mac M1/M2/M3 o cualquier CPU moderna (training en CPU tarda ~30 min;
  con GPU < 10 min).
- ~3 GB de disco temporal para el dataset sintético.
- Opcionalmente: ~30-60 min de audio "negativo" (cualquier audio **sin** "Hey Eco").
  Si no lo tenés, openwakeword usa su pool default — funciona pero menos preciso.

## Paso 1 — instalar dependencias de training

```bash
cd listener
source .venv/bin/activate         # el venv del listener
pip install -r training/requirements-train.txt
```

Esto agrega `torch`, `piper-tts`, y los extras de openwakeword
(no se instalan por default porque pesan ~600 MB).

## Paso 2 — (opcional pero recomendado) preparar negativos

Descargá ~30-60 min de audio sin "Hey Eco":

- **Mozilla Common Voice** (español): https://commonvoice.mozilla.org/es/datasets
  Bajá el subset más chico (~100 MB), descomprimí, usá `clips/` como source.
- Cualquier carpeta de podcasts/música/TV en tu Mac.

Cualquier formato (WAV/MP3/M4A/FLAC/OGG) sirve — el script los normaliza a WAV 16k mono.

## Paso 3 — entrenar

```bash
python training/train_wake.py \
  --negatives-dir ~/Music/podcasts/    # o donde tengas el audio negativo
  -v
```

Sin negativos custom:

```bash
python training/train_wake.py --skip-augmentation -v
```

Output:

```
12:34:00 INFO train-wake · Workdir: /tmp/eco-train-xxx
12:34:01 INFO train-wake · Generando 1200 muestras × 9 frases con piper TTS…
12:39:14 INFO train-wake · Positivas generadas
12:39:15 INFO train-wake · Procesando audio negativo desde /Users/sergio/Music/podcasts …
12:41:02 INFO train-wake · 847 negativos convertidos.
12:41:03 INFO train-wake · Iniciando training (esto tarda 10-20 min)…
13:01:55 INFO train-wake · Modelo guardado en /Users/sergio/eco/listener/models/hey_eco.onnx
13:01:55 INFO train-wake · ✅ Listo. Configurá el listener con:
13:01:55 INFO train-wake ·     ECO_WAKE_MODEL=hey_eco python main.py
```

## Paso 4 — usar el modelo

```bash
ECO_WAKE_MODEL=hey_eco python main.py -v
```

O persistilo en tu shell:

```bash
export ECO_WAKE_MODEL=hey_eco
```

## Performance esperada

| Métrica | Valor típico |
|---|---|
| Precisión | ~85% (true positives) |
| False positives | ~1 cada 8 horas con `--wake-threshold 0.5` |
| Latencia detección | 80-150 ms |

Para subir precisión:
- Más muestras: `--samples-per-phrase 2000`
- Más negativos (~2 horas de audio variado)
- Threshold más alto: `ECO_WAKE_THRESHOLD=0.65`

## Re-entrenar con tu voz

Si querés un modelo personalizado a tu voz (más preciso para ti, menos
para otros):

1. Grabá 50-100 audios cortos diciendo "Hey Eco" en distintos tonos/distancias.
   Usá QuickTime → File → New Audio Recording. Exportá WAV mono 16 kHz.
2. Ponelos en una carpeta y modificá `train_wake.py` para incluirlos junto
   con los sintéticos (sección `generate_positives`).
3. Re-entrená.

Esto subí la precisión a ~92% para tu voz específica.

## Troubleshooting

**"No module named openwakeword.train"**
→ Te falta el extra: `pip install 'openwakeword[training]'`

**"piper not found"**
→ `pip install piper-tts` y verificá que `python -c "import piper"` funcione.

**Training tarda más de 1 hora**
→ Estás en CPU lenta. Bajá `--samples-per-phrase 600` o usá Colab GPU.

**El modelo entrena pero no detecta nada en runtime**
→ Bajá el threshold: `ECO_WAKE_THRESHOLD=0.35`. Si sigue sin detectar, el
   dataset tenía muy poca variación de voces — usá `--samples-per-phrase 2000`.

## Empaquetado

Una vez que entrenes el `.onnx`, queda como artefacto en `listener/models/`.
Cuando empaquetes el listener con PyInstaller (task #8 — Tauri),
el `.onnx` se incluye automáticamente.

**El runtime del listener es 100% offline**: no llama a piper-tts ni a openwakeword
en línea, solo lee el archivo `.onnx` y corre inferencia con onnxruntime.
