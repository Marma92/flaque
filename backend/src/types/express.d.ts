import type { AuthSession, AuthUser } from "./auth";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      sessionId?: string;
      authSession?: AuthSession;
    }
  }
}

export {};
