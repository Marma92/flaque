import type { UserLanguage } from "@flaque/shared";

export type UserRole = "admin" | "user";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  language: UserLanguage;
};

export type AuthSession = {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  userAgent: string | null;
  ipAddress: string | null;
  label: string | null;
};
