import { normalizeLanguage, type UserLanguage } from "@flaque/shared";

import { createLogger } from "../utils/logger";
import { getTransporter, resolveSenderAddress } from "../utils/email";
import { passwordResetEmailMessage } from "../utils/emailMessages";

const log = createLogger("auth");

type PasswordResetEmailInput = {
  to: string;
  username: string;
  resetUrl: string;
  expiresAt: number;
  language?: UserLanguage;
};

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<boolean> {
  const transporter = getTransporter();

  if (!transporter) {
    log.warn("SMTP not configured, cannot send password reset email", { to: input.to, resetUrl: input.resetUrl });
    return false;
  }

  const language = normalizeLanguage(input.language);
  const expiresDate = new Date(input.expiresAt);
  const expiresLabel = Number.isFinite(expiresDate.getTime())
    ? expiresDate.toLocaleString(language)
    : (language === "fr" ? "bientôt" : "soon");

  const message = passwordResetEmailMessage(language, {
    username: input.username,
    resetUrl: input.resetUrl,
    expiresLabel
  });

  try {
    await transporter.sendMail({
      from: resolveSenderAddress(),
      to: input.to,
      subject: message.subject,
      text: message.text
    });
    return true;
  } catch (error) {
    log.error("Failed to send password reset email", { error: String(error) });
    return false;
  }
}
