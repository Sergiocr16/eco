// Iconos compactos por tipo de archivo. Mantenemos un solo SVG (hoja) y
// variamos color + badge de 1-2 letras según extensión — replica el patrón
// de VS Code "Minimal File Icons" sin agregar una dep de 30+ SVGs.

import { IconFile } from '@/design/icons';

export type FileIconStyle = {
  color: string;       // color del trazo del IconFile
  badge?: string;      // letras pequeñas dentro del icono (ej. "TS", "JS")
  badgeColor?: string; // si se provee, color del badge (sino usa color)
};

// Paleta consistente con la mayoría de IDEs (VS Code material).
const TS_BLUE = '#3178c6';
const JS_YELLOW = '#f7df1e';
const JSON_AMBER = '#cbcb41';
const CSS_BLUE = '#2965f1';
const HTML_ORANGE = '#e44d26';
const MD_WHITE = '#9aa3ab';
const PY_BLUE = '#3776ab';
const RS_RUST = '#dea584';
const GO_CYAN = '#00add8';
const JAVA_RED = '#b07219';
const RB_RED = '#cc342d';
const SH_GREEN = '#89e051';
const SQL_PURPLE = '#a067cd';
const YAML_PINK = '#cb171e';
const XML_GREEN = '#0060ac';
const TOML_TAN = '#9c4221';
const IMG_GREEN = '#a074c4';
const LOCK_GREY = '#6e6e73';
const DOCKER_BLUE = '#2496ed';
const ENV_OLIVE = '#a3a300';

// Resuelve estilo del icono por path. Conoce las ~30 extensiones más comunes
// en el repo; el resto cae al genérico (gris).
export function fileIconStyle(path: string): FileIconStyle {
  const name = path.toLowerCase().split('/').pop() ?? '';
  const ext = name.includes('.') ? '.' + name.split('.').pop() : '';

  // Filenames especiales (sin extensión o con nombre fijo).
  if (name === 'dockerfile' || name === 'dockerfile.dev') return { color: DOCKER_BLUE };
  if (name === 'makefile') return { color: '#8b572a' };
  if (name.startsWith('.env')) return { color: ENV_OLIVE };
  if (name === '.gitignore' || name === '.gitattributes') return { color: '#f1502f' };
  if (name === '.eslintrc' || name.startsWith('.eslintrc')) return { color: '#4b32c3' };
  if (name === '.prettierrc' || name.startsWith('.prettierrc')) return { color: '#c596c7' };

  switch (ext) {
    case '.ts': return { color: TS_BLUE, badge: 'TS', badgeColor: TS_BLUE };
    case '.tsx': return { color: TS_BLUE, badge: 'TSX', badgeColor: TS_BLUE };
    case '.mts': case '.cts': return { color: TS_BLUE, badge: 'TS', badgeColor: TS_BLUE };
    case '.js': return { color: JS_YELLOW, badge: 'JS', badgeColor: '#8a7900' };
    case '.jsx': return { color: JS_YELLOW, badge: 'JSX', badgeColor: '#8a7900' };
    case '.mjs': case '.cjs': return { color: JS_YELLOW, badge: 'JS', badgeColor: '#8a7900' };
    case '.json': return { color: JSON_AMBER };
    case '.css': return { color: CSS_BLUE, badge: 'CSS', badgeColor: CSS_BLUE };
    case '.scss': case '.sass': case '.less': return { color: '#c6538c' };
    case '.html': case '.htm': return { color: HTML_ORANGE };
    case '.md': case '.markdown': case '.mdx': return { color: MD_WHITE, badge: 'MD', badgeColor: MD_WHITE };
    case '.py': case '.pyi': return { color: PY_BLUE, badge: 'PY', badgeColor: PY_BLUE };
    case '.rs': return { color: RS_RUST };
    case '.go': return { color: GO_CYAN };
    case '.java': case '.kt': case '.kts': return { color: JAVA_RED };
    case '.rb': return { color: RB_RED };
    case '.sh': case '.bash': case '.zsh': case '.fish': return { color: SH_GREEN };
    case '.sql': return { color: SQL_PURPLE };
    case '.yml': case '.yaml': return { color: YAML_PINK };
    case '.xml': case '.svg': return { color: XML_GREEN };
    case '.toml': return { color: TOML_TAN };
    case '.lock': return { color: LOCK_GREY };
    case '.png': case '.jpg': case '.jpeg': case '.gif': case '.webp':
    case '.ico': case '.bmp': return { color: IMG_GREEN };
    case '.swift': return { color: '#f05138' };
    case '.c': case '.h': return { color: '#555555' };
    case '.cpp': case '.cc': case '.hpp': return { color: '#f34b7d' };
    case '.cs': return { color: '#178600' };
    case '.php': return { color: '#4F5D95' };
    case '.vue': return { color: '#41b883' };
    case '.svelte': return { color: '#ff3e00' };
    case '.dart': return { color: '#00b4ab' };
    case '.zig': return { color: '#ec915c' };
    case '.lua': return { color: '#000080' };
    case '.r': return { color: '#198ce7' };
    case '.ex': case '.exs': return { color: '#6e4a7e' };
    default: return { color: '#6e6e73' };
  }
}

type Props = {
  path: string;
  size?: number;
};

export function FileTypeIcon({ path, size = 14 }: Props) {
  const style = fileIconStyle(path);
  // Badge solo cuando hay letras y caben — para evitar visualmente ruidoso,
  // solo mostramos badge para TS/JS/TSX/JSX/CSS/MD/PY. El resto va sin badge
  // y la identificación por color basta.
  const showBadge = !!style.badge && size >= 14;
  return (
    <span style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'inline-flex' }}>
      <IconFile size={size} style={{ color: style.color }}/>
      {showBadge && (
        <span style={{
          position: 'absolute',
          left: 0, right: 0, top: 0, bottom: 0,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          fontSize: size <= 14 ? 5 : 6,
          fontWeight: 700,
          color: style.badgeColor ?? style.color,
          paddingBottom: 1,
          letterSpacing: -0.2,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          pointerEvents: 'none',
        }}>
          {style.badge}
        </span>
      )}
    </span>
  );
}
