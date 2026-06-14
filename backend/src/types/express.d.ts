// Augmentación de Express: el middleware de sesión adjunta `req.ecoUser` con la
// identidad derivada de la sesión (NUNCA de algo que mande el cliente). Todos
// los handlers leen userId/role de acá.
import 'express';

declare global {
  namespace Express {
    interface Request {
      ecoUser?: { id: string; role: 'admin' | 'member'; username: string };
    }
  }
}
