// Tipos compartidos por los sub-componentes de FilesPanel.

export type TreeEntry = {
  path: string;        // relativo al workdir, separador '/' siempre
  name: string;
  type: 'file' | 'dir';
};

export type OpenFile = {
  path: string;
  content: string;
  originalContent: string;
  mtime: number;
  truncated: boolean;
  binary: boolean;
  size: number;
};
