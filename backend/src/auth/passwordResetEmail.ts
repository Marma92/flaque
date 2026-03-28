import nodemailer from "nodemailer";
import { parseBooleanField } from "../utils/validation";

type PasswordResetEmailInput = {
  to: string;
  username: string;
  resetUrl: string;
  expiresAt: number;
};

let cachedTransporter: nodemailer.Transporter | null | undefined;

function getTransporter(): nodemailer.Transporter | null {
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

function resolveSenderAddress(): string {
  const configured = (process.env.SMTP_FROM ?? "").trim();
  if (configured) {
    return configured;
  }

  return "Flaque <no-reply@flaque.local>";
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<boolean> {
  const transporter = getTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(`[auth] SMTP not configured. Password reset link for ${input.to}: ${input.resetUrl}`);
    }
    return false;
  }

  const expiresDate = new Date(input.expiresAt);
  const expiresLabel = Number.isFinite(expiresDate.getTime()) ? expiresDate.toISOString() : "soon";

  try {
    await transporter.sendMail({
      from: resolveSenderAddress(),
      to: input.to,
      subject: "Flaque password reset",
      text: [
        `Hello ${input.username},`,
        "",
        "A password reset was requested for your Flaque account.",
        `Use this link to reset your password: ${input.resetUrl}`,
        `This link expires at ${expiresLabel}.`,
        "",
        "If you did not request this, you can ignore this email."
      ].join("\n")
    });
    return true;
  } catch (error) {
    console.error("[auth] Failed to send password reset email", error);
    return false;
  }
}
