# CLAUDE.md — Eco

Notas operativas del repo. Cómo correr cada cosa sin pisarse con macOS ni con el bundle empaquetado.

---

## Puertos

| Modo | Backend | Frontend | Renderer carga desde |
|---|---|---|---|
| **Dev (web/Electron)** | `127.0.0.1:7050` | Vite `127.0.0.1:5173` | Vite (con proxy → 7050) |
| **Empaquetado (.app)** | `127.0.0.1:7100` | servido por backend | el backend mismo (same-origin) |

Decisión clave: **NO usar 7000**. macOS AirPlay Receiver (ControlCenter) lo ocupa por default. Por eso dev arrancó en 7050.

Override siempre vía env var: `ECO_PORT=<n>` para backend/electron, `ECO_BACKEND_PORT=<n>` para el proxy de Vite.

---

## Scripts del repo (root `package.json`)

```bash
# Dev modo web (backend + Vite, abrís http://localhost:5173 en navegador normal)
npm run web

# Dev modo app (backend + Vite + ventana Electron con DevTools)
npm run dev:app

# Empaquetar .dmg para macOS
npm run dmg
# (alias de `dist:mac` — corre build:all → electron-builder)
```

Los tres scripts ya tienen `ECO_PORT=7050` / `ECO_BACKEND_PORT=7050` hardcoded, no hace falta exportar nada.

---

## Requisito: Node 20

`vite` 6.4 no soporta Node 16. Antes de correr cualquier `npm run` hacé:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.2
```

Si te sale `EBADENGINE` o vite no arranca, es que estás en Node 16.

---

## .env.local del frontend

`frontend/.env.local` controla el fallback de backend URL para **web puro** (cuando `window.electronAPI` no existe, ej. abrir `localhost:5173` en Chrome/Safari).

**Tiene que estar vacío** para que las llamadas pasen por el proxy de Vite:

```
VITE_ECO_BACKEND=
```

Si ponés una URL absoluta acá (ej. `http://127.0.0.1:7050`), el browser hace cross-origin contra ese host y queda dependiente de CORS. Mejor vacío + proxy.

---

## Levantando el stack manualmente (cuando algo se cae)

Si la cascada de `npm run dev:app` se rompe (típico: matás Vite y se llevan los hermanos):

```bash
# Terminal 1 — backend
ECO_PORT=7050 npm --workspace backend run dev

# Terminal 2 — frontend (Vite)
ECO_BACKEND_PORT=7050 npm --workspace frontend run dev

# Terminal 3 — Electron (opcional, si querés la ventana en vez del navegador)
wait-on http://127.0.0.1:5173 && ECO_PORT=7050 npm --workspace electron run start
```

Verificación rápida:
```bash
curl -s http://127.0.0.1:7050/health           # → {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5173/auth/status  # → 200 (vía proxy)
```

---

## ServerPanel — dual mode con auto-puerto

En dual mode (frontend + backend en paralelo) Eco asigna un puerto libre random a cada slot al arrancar. El backend lo recibe vía env, el frontend además recibe el puerto del backend para poder proxyearlo.

Env vars que Eco inyecta automáticamente:

**Backend slot** — `PORT`, `SERVER_PORT`, `HTTP_PORT`, `JAVA_TOOL_OPTIONS=-Dserver.port=<port>`, `VITE_PORT`, `NEXT_PUBLIC_PORT`, `BROWSER_SYNC_PORT`, `GULP_PORT`, `WEBPACK_DEV_SERVER_PORT`.

**Frontend slot** — todas las del backend (para su propio puerto) **+** `API_PORT`, `BACKEND_PORT`, `BACKEND_URL`, `VITE_API_PORT`, `NEXT_PUBLIC_API_PORT` apuntando al puerto del backend.

Implicancia: los comandos NO deben hardcodear puertos. Ejemplo (aditum-jh):

```bash
# ✅ Correcto — Eco asigna SERVER_PORT vía env
./mvnw spring-boot:run

# ❌ Hardcodea — Eco no puede sobreescribir el -D
./mvnw spring-boot:run -Dserver.port=8081
```

```bash
# ✅ Correcto — gulp lee API_PORT del env
gulp serve

# ❌ Hardcodea — pisa el env que inyectó Eco
API_PORT=8080 gulp serve
```

ServerPanel arranca backend primero, espera `status: running` (max 90s), recién después largea frontend — eso evita ECONNREFUSED del proxy del frontend cuando el backend tarda en bindear.

---

## Errores comunes y diagnóstico

| Síntoma | Causa probable | Fix |
|---|---|---|
| `failed to fetch` en login (browser) | `.env.local` apunta a puerto viejo | Vaciar `VITE_ECO_BACKEND`, reiniciar Vite |
| `ECONNREFUSED :7050` en proxy logs | Backend caído | Relanzar `npm --workspace backend run dev` con `ECO_PORT=7050` |
| `Port 7000 in use` | AirPlay Receiver de macOS | Apagar en *Ajustes → General → AirDrop y Handoff → Receptor de AirPlay*, o usar :7050 |
| Empaquetada arranca pero no llega a backend | Otro Eco backend (dev) escuchando en 7100 | Matar todos los `tsx watch`/`Electron` antes de abrir el .app |
| `Cannot find module 'browser-sync-client/...'` | node_modules roto en el proyecto del usuario (aditum-jh), no Eco | `cd <proyecto>; npm install` |

---

## Tras un build empaquetado

```bash
# Reinstalar limpio (mata el viejo, ditto preserva permisos y xattrs)
pkill -9 -f "Eco.app" 2>/dev/null
rm -rf /Applications/Eco.app
ditto release/mac-arm64/Eco.app /Applications/Eco.app
xattr -dr com.apple.quarantine /Applications/Eco.app
open /Applications/Eco.app
```

Si hay que limpiar caché del renderer (raro, solo cuando localStorage queda inconsistente):

```bash
rm -rf "/Users/sergiocastro/Library/Application Support/Eco/Cache" \
       "/Users/sergiocastro/Library/Application Support/Eco/Code Cache" \
       "/Users/sergiocastro/Library/Application Support/Eco/GPUCache" \
       "/Users/sergiocastro/Library/Application Support/Eco/Local Storage" \
       "/Users/sergiocastro/Library/Application Support/Eco/Session Storage"
```

⚠️ Limpiar Local Storage borra la sesión de login (`eco.session`), tab activa por agente, browser bookmarks, etc. El `~/.eco/user.json` (auth) sobrevive.
