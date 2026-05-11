# Eco — Brand Assets

Archivos oficiales del logo de Eco.

## Archivos

| Archivo | Uso |
|---|---|
| `eco-logo-bg.svg` | Logo completo con fondo oscuro `#0D1016`. Usar en placas, favicon dark, social media. |
| `eco-logo.svg` | Logo transparente. `currentColor` en el wordmark — toma el color del contenedor. Para usar en headers light/dark. |
| `eco-logo-preview.html` | Vista previa interactiva editable. Abrir en cualquier browser. |
| `colors.txt` | Tabla de colores oficiales. |

## Colores oficiales

| Token | Valor |
|---|---|
| Fondo | `#0D1016` |
| Gradiente — inicio | `#48E0D4` |
| Gradiente — fin | `#76F2A4` |
| Texto | `#F5F7FA` |

```css
background: linear-gradient(135deg, #48E0D4 0%, #76F2A4 100%);
```

## Cómo editarlo

- Abrir el SVG en Figma, Illustrator, Affinity Designer, Inkscape o cualquier editor vectorial
- Cambiar el texto editando el elemento `eco-text`
- Cambiar el color principal editando el gradiente `ecoGradient`
- El componente React `<EcoMark/>` (en `src/design/EcoMark.tsx`) usa los mismos valores en `oklch()` para el ícono — para mantener consistencia visual al cambiar gradientes, sincronizar ambos.

## Estructura del SVG

- `#background` — rect con fondo, eliminar para transparente
- `#eco-icon` — grupo del ícono (anillo + punto)
- `#echo-ring` — el arco "C" del eco
- `#echo-dot` — el punto en la apertura del arco
- `#eco-wordmark` — wordmark "eco" debajo del ícono
