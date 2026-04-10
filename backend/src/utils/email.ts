import nodemailer from "nodemailer";
import { parseBooleanField } from "./validation";

let cachedTransporter: nodemailer.Transporter | null | undefined;

export function getTransporter(): nodemailer.Transporter | null {
  if (cachedTransporter !== undefined) {
    return cachedTransporter;
  }

  const host = (process.env.SMTP_HOST ?? "").trim();
  if (!host) {
    cachedTransporter = null;
    return cachedTransporter;
  }

  const parsedPort = Number(process.env.SMTP_PORT ?? 587);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? Math.floor(parsedPort) : 587;
  const secure = process.env.SMTP_SECURE !== undefined ? parseBooleanField(process.env.SMTP_SECURE) : port === 465;
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = process.env.SMTP_PASS ?? "";

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user
      ? {
          user,
          pass
        }
      : undefined
  });

  return cachedTransporter;
}

export function resolveSenderAddress(): string {
  const configured = (process.env.SMTP_FROM ?? "").trim();
  if (configured) {
    return configured;
  }

  return "Flaque <no-reply@flaque.local>";
}
