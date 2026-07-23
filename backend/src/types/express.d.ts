import type { AuthSession, AuthUser } from "./auth";
import type { Playlist } from "./library";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      sessionId?: string;
      authSession?: AuthSession;
      playlist?: Playlist;
    }
  }
}

export {};
