import { normalizeLanguage, type UserLanguage } from "@flaque/shared";

/**
 * Localized transactional email bodies. Emails are the one place i18n can't be
 * deferred to the browser, so the copy lives here and is rendered in the
 * recipient's stored language (falling back to English).
 */

export type EmailMessage = { subject: string; text: string };

type PasswordResetVars = {
  username: string;
  resetUrl: string;
  expiresLabel: string;
};

type StorageWarningVars = {
  usedPercent: string;
  used: string;
  total: string;
  free: string;
  threshold: number;
};

type Catalog = {
  passwordReset: (vars: PasswordResetVars) => EmailMessage;
  storageWarning: (vars: StorageWarningVars) => EmailMessage;
};

const CATALOG: Record<UserLanguage, Catalog> = {
  en: {
    passwordReset: ({ username, resetUrl, expiresLabel }) => ({
      subject: "Flaque password reset",
      text: [
        `Hello ${username},`,
        "",
        "A password reset was requested for your Flaque account.",
        `Use this link to reset your password: ${resetUrl}`,
        `This link expires at ${expiresLabel}.`,
        "",
        "If you did not request this, you can ignore this email."
      ].join("\n")
    }),
    storageWarning: ({ usedPercent, used, total, free, threshold }) => ({
      subject: `Flaque: Low disk storage warning (${usedPercent}% used)`,
      text: [
        "Disk storage on your Flaque server is running low.",
        "",
        `Current usage: ${usedPercent}% (${used} used of ${total} total)`,
        `Free space remaining: ${free}`,
        `Warning threshold: ${threshold}%`,
        "",
        "Consider freeing up disk space or expanding storage to avoid disruption."
      ].join("\n")
    })
  },
  fr: {
    passwordReset: ({ username, resetUrl, expiresLabel }) => ({
      subject: "Réinitialisation du mot de passe Flaque",
      text: [
        `Bonjour ${username},`,
        "",
        "Une réinitialisation de mot de passe a été demandée pour votre compte Flaque.",
        `Utilisez ce lien pour réinitialiser votre mot de passe : ${resetUrl}`,
        `Ce lien expire le ${expiresLabel}.`,
        "",
        "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail."
      ].join("\n")
    }),
    storageWarning: ({ usedPercent, used, total, free, threshold }) => ({
      subject: `Flaque : alerte d'espace disque faible (${usedPercent} % utilisés)`,
      text: [
        "L'espace disque de votre serveur Flaque est presque saturé.",
        "",
        `Utilisation actuelle : ${usedPercent} % (${used} utilisés sur ${total} au total)`,
        `Espace libre restant : ${free}`,
        `Seuil d'alerte : ${threshold} %`,
        "",
        "Pensez à libérer de l'espace disque ou à étendre le stockage pour éviter toute interruption."
      ].join("\n")
    })
  }
};

export function passwordResetEmailMessage(language: unknown, vars: PasswordResetVars): EmailMessage {
  return CATALOG[normalizeLanguage(language)].passwordReset(vars);
}

export function storageWarningEmailMessage(language: unknown, vars: StorageWarningVars): EmailMessage {
  return CATALOG[normalizeLanguage(language)].storageWarning(vars);
}
