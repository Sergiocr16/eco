import type { CSSProperties, ReactNode } from 'react';

export type IconProps = {
  size?: number;
  strokeWidth?: number;
  fill?: string;
  className?: string;
  style?: CSSProperties;
};

function Base({
  size = 16,
  strokeWidth = 1.6,
  children,
  fill = 'none',
  className,
  style,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {children}
    </svg>
  );
}

export const IconMic = (p: IconProps) => (
  <Base {...p}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M8 21h8"/></Base>
);
export const IconMicOff = (p: IconProps) => (
  <Base {...p}><path d="M3 3l18 18M9 9v2a3 3 0 005 2.2M15 9.34V5a3 3 0 00-5.94-.6M5 11a7 7 0 001.42 4.24M12 18v3M8 21h8"/></Base>
);
export const IconSend = (p: IconProps) => (
  <Base {...p}><path d="M5 12l15-7-5 17-3-7-7-3z"/></Base>
);
export const IconPlus = (p: IconProps) => (
  <Base {...p}><path d="M12 5v14M5 12h14"/></Base>
);
export const IconSearch = (p: IconProps) => (
  <Base {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></Base>
);
export const IconSettings = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.82-.33 1.7 1.7 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.7 1.7 0 00-1.11-1.55 1.7 1.7 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.7 1.7 0 00.33-1.82 1.7 1.7 0 00-1.51-1H3a2 2 0 010-4h.09a1.7 1.7 0 001.55-1.11 1.7 1.7 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.7 1.7 0 001.82.33H9a1.7 1.7 0 001-1.51V3a2 2 0 014 0v.09a1.7 1.7 0 001 1.51 1.7 1.7 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.7 1.7 0 00-.33 1.82V9a1.7 1.7 0 001.51 1H21a2 2 0 010 4h-.09a1.7 1.7 0 00-1.51 1z"/></Base>
);
export const IconFolder = (p: IconProps) => (
  <Base {...p}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></Base>
);
export const IconFolderOpen = (p: IconProps) => (
  <Base {...p}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v1H3V7zM3 9h18l-2 9a2 2 0 01-2 1.5H5a2 2 0 01-2-1.5L3 9z"/></Base>
);
export const IconFile = (p: IconProps) => (
  <Base {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"/><path d="M14 3v5h5"/></Base>
);
export const IconTerminal = (p: IconProps) => (
  <Base {...p}><path d="M4 17l5-5-5-5M12 19h8"/></Base>
);
export const IconPlay = (p: IconProps) => (
  <Base {...p} fill="currentColor"><path d="M6 4l14 8-14 8z"/></Base>
);
export const IconPause = (p: IconProps) => (
  <Base {...p} fill="currentColor" strokeWidth={0}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></Base>
);
export const IconStop = (p: IconProps) => (
  <Base {...p} fill="currentColor" strokeWidth={0}><rect x="6" y="6" width="12" height="12" rx="2"/></Base>
);
export const IconResume = (p: IconProps) => (
  <Base {...p}><path d="M3 12a9 9 0 109-9M3 4v5h5"/></Base>
);
export const IconX = (p: IconProps) => (
  <Base {...p}><path d="M18 6L6 18M6 6l12 12"/></Base>
);
export const IconCheck = (p: IconProps) => (
  <Base {...p}><path d="M4 12l5 5L20 6"/></Base>
);
export const IconChevR = (p: IconProps) => (
  <Base {...p}><path d="M9 6l6 6-6 6"/></Base>
);
export const IconChevD = (p: IconProps) => (
  <Base {...p}><path d="M6 9l6 6 6-6"/></Base>
);
export const IconArrowL = (p: IconProps) => (
  <Base {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></Base>
);
export const IconShield = (p: IconProps) => (
  <Base {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Base>
);
export const IconKey = (p: IconProps) => (
  <Base {...p}><circle cx="8" cy="15" r="4"/><path d="M10.85 12.15L21 2M18 5l3 3M15 8l3 3"/></Base>
);
export const IconUser = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></Base>
);
export const IconLock = (p: IconProps) => (
  <Base {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></Base>
);
export const IconWave = (p: IconProps) => (
  <Base {...p}><path d="M2 12h2M22 12h-2M6 8v8M10 4v16M14 6v12M18 9v6"/></Base>
);
export const IconBolt = (p: IconProps) => (
  <Base {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></Base>
);
export const IconZap = (p: IconProps) => (
  <Base {...p} fill="currentColor"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></Base>
);
export const IconCpu = (p: IconProps) => (
  <Base {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></Base>
);
export const IconBranch = (p: IconProps) => (
  <Base {...p}><circle cx="6" cy="3" r="2"/><circle cx="6" cy="21" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 5v14M18 10a6 6 0 01-12 0"/></Base>
);
export const IconGlobe = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z"/></Base>
);
export const IconMore = (p: IconProps) => (
  <Base {...p} fill="currentColor" strokeWidth={0}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></Base>
);
export const IconExt = (p: IconProps) => (
  <Base {...p}><path d="M7 17L17 7M9 7h8v8"/></Base>
);
export const IconClock = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></Base>
);
export const IconHistory = (p: IconProps) => (
  <Base {...p}><path d="M3 12a9 9 0 109-9 9 9 0 00-7.2 3.6L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></Base>
);
export const IconLayers = (p: IconProps) => (
  <Base {...p}><path d="M12 2l10 6-10 6L2 8z"/><path d="M2 14l10 6 10-6M2 11l10 6 10-6"/></Base>
);
export const IconList = (p: IconProps) => (
  <Base {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></Base>
);
export const IconGrid = (p: IconProps) => (
  <Base {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></Base>
);
export const IconColumns = (p: IconProps) => (
  <Base {...p}><rect x="3" y="3" width="5" height="18"/><rect x="10" y="3" width="5" height="12"/><rect x="17" y="3" width="4" height="15"/></Base>
);
export const IconGraph = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="2.5"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M10 11l-4-4M14 11l4-4M10 13l-4 4M14 13l4 4"/></Base>
);
export const IconEdit = (p: IconProps) => (
  <Base {...p}><path d="M12 20h9M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4z"/></Base>
);
export const IconTrash = (p: IconProps) => (
  <Base {...p}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></Base>
);
export const IconAlert = (p: IconProps) => (
  <Base {...p}><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86l-8.5 14a2 2 0 001.7 3h17a2 2 0 001.7-3l-8.5-14a2 2 0 00-3.4 0z"/></Base>
);
export const IconInfo = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></Base>
);
export const IconDiff = (p: IconProps) => (
  <Base {...p}><path d="M12 3v18M5 8l-2-2 2-2M3 6h4M19 16l2 2-2 2M21 18h-4"/></Base>
);
export const IconCommand = (p: IconProps) => (
  <Base {...p}><path d="M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z"/></Base>
);
export const IconSun = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4"/></Base>
);
export const IconMoon = (p: IconProps) => (
  <Base {...p}><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></Base>
);
export const IconCopy = (p: IconProps) => (
  <Base {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></Base>
);
