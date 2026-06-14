import { describe, expect, it } from "vitest";

import { passwordResetEmailMessage, storageWarningEmailMessage } from "./emailMessages";

describe("emailMessages", () => {
  const resetVars = { username: "alice", resetUrl: "https://x/reset?t=1", expiresLabel: "later" };

  it("renders the password reset email in English by default", () => {
    const msg = passwordResetEmailMessage("en", resetVars);
    expect(msg.subject).toBe("Flaque password reset");
    expect(msg.text).toContain("Hello alice,");
    expect(msg.text).toContain("https://x/reset?t=1");
  });

  it("renders the password reset email in French", () => {
    const msg = passwordResetEmailMessage("fr", resetVars);
    expect(msg.subject).toBe("Réinitialisation du mot de passe Flaque");
    expect(msg.text).toContain("Bonjour alice,");
  });

  it("falls back to English for an unknown language", () => {
    expect(passwordResetEmailMessage(undefined, resetVars).subject).toBe("Flaque password reset");
    expect(passwordResetEmailMessage("de", resetVars).subject).toBe("Flaque password reset");
  });

  it("renders the storage warning email per language", () => {
    const vars = { usedPercent: "92.0", used: "920 GB", total: "1 TB", free: "80 GB", threshold: 80 };
    expect(storageWarningEmailMessage("en", vars).subject).toContain("Low disk storage");
    expect(storageWarningEmailMessage("fr", vars).subject).toContain("espace disque faible");
    expect(storageWarningEmailMessage("fr", vars).text).toContain("Seuil d'alerte : 80 %");
  });
});
