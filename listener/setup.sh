#!/bin/sh
# Eco listener · setup local (Mac/Linux)
set -e

cd "$(dirname "$0")"

echo "▶  Verificando Python 3…"
if ! command -v python3 >/dev/null 2>&1; then
  echo "✗  Falta python3. Instalá Python 3.10+ y reintentá." >&2
  exit 1
fi
PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "   Python ${PY_VER}"

if [ ! -d .venv ]; then
  echo "▶  Creando venv…"
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
. .venv/bin/activate

echo "▶  Instalando dependencias (puede tardar la primera vez)…"
pip install --upgrade pip > /dev/null
# openwakeword necesita tflite-runtime en Linux pero también funciona con onnx
pip install --no-deps openwakeword
pip install -r requirements.txt 2>&1 | grep -vE "(tflite-runtime|^\s*$)" || true

echo "▶  Bajando modelos pre-entrenados de wake word (~10 MB)…"
python -c "from openwakeword import utils; utils.download_models()" 2>&1 | tail -1

echo
echo "✓  Listo. Para correrlo:"
echo "    source listener/.venv/bin/activate"
echo "    python listener/main.py"
echo
echo "  El listener leerá el token de ~/.eco/token (creado por el backend)"
echo "  y comenzará a escuchar la palabra de activación 'hey jarvis'."
echo "  (Custom 'Eco' viene en una iteración futura — el modelo se entrena con audio sintético.)"
