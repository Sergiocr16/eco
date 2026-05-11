# Eco

Asistente local para Mac con voz y wake word, potenciado por Claude.

## Qué es

Eco es una app de escritorio que escucha tu voz (con wake word "Eco"), interpreta lo que decís y ejecuta acciones sobre tus carpetas locales. Es Claude Code con interfaz visual moderna y entrada por voz, corriendo 100% local en tu Mac.

## Arquitectura

```
Eco.app  (Tauri, .dmg firmado)
 ├─ backend/     Node + Claude Agent SDK + WebSocket server
 ├─ frontend/    Vite + React + Tailwind v4 + shadcn/ui (estilo Liquid Glass)
 └─ listener/    Python + openWakeWord + whisper.cpp
```

Datos del usuario en SQLite local. Solo dos llamadas a internet: la API de Claude y (eventualmente) validación de licencia.

## Desarrollo

```bash
# Backend (Node)
cd backend && npm install && npm run dev

# Frontend (Vite)
cd frontend && npm install && npm run dev

# Listener (Python) — opcional, solo para voz
cd listener && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && python3 main.py
```

## Estado

🚧 En construcción. Ver `TaskList` para progreso.
