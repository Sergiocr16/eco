// Errores tipados con `code` para que el frontend pueda traducirlos.
// El `message` queda como fallback (en español) si el frontend no conoce el code.

export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'AppError';
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
