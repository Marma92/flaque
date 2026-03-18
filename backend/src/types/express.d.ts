import type { AuthUser } from "./library";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      sessionId?: string;
    }
  }
}

export {};
