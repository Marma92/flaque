import { createLogger } from "../utils/logger";
import { getTransporter, resolveSenderAddress } from "../utils/email";

const log = createLogger("auth");

type PasswordResetEmailInput = {
  to: string;
  username: string;
  resetUrl: string;
  expiresAt: number;
};

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<boolean> {
  const transporter = getTransporter();

  if (!transporter) {
    log.warn("SMTP not configured, cannot send password reset email", { to: input.to, resetUrl: input.resetUrl });
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
    log.error("Failed to send password reset email", { error: String(error) });
    return false;
  }
}
