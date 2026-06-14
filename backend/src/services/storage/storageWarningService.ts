import fs from "node:fs/promises";

import { storageRoot } from "../../utils/paths";
import { getTransporter, resolveSenderAddress } from "../../utils/email";
import { storageWarningEmailMessage } from "../../utils/emailMessages";
import { listAdminUsersWithEmail } from "../../auth/db";
import { createLogger } from "../../utils/logger";

const log = createLogger("storage-warning");

const DEFAULT_THRESHOLD_PERCENT = 80;
const DEFAULT_COOLDOWN_MINUTES = 360;

let lastWarningSentAt = 0;

function getThresholdPercent(): number {
  const raw = Number(process.env.STORAGE_WARNING_THRESHOLD_PERCENT ?? DEFAULT_THRESHOLD_PERCENT);
  if (!Number.isFinite(raw) || raw < 1 || raw > 99) {
    return DEFAULT_THRESHOLD_PERCENT;
  }
  return Math.floor(raw);
}

function getCooldownMs(): number {
  const raw = Number(process.env.STORAGE_WARNING_COOLDOWN_MINUTES ?? DEFAULT_COOLDOWN_MINUTES);
  if (!Number.isFinite(raw) || raw < 0) {
    return DEFAULT_COOLDOWN_MINUTES * 60_000;
  }
  return Math.floor(raw) * 60_000;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  }
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export async function checkStorageAndWarnAdmins(): Promise<void> {
  try {
    const cooldownMs = getCooldownMs();
    if (Date.now() - lastWarningSentAt < cooldownMs) {
      return;
    }

    const fsStats = await fs.statfs(storageRoot);
    const blockSize = fsStats.bsize;
    const diskTotal = fsStats.blocks * blockSize;
    const diskFree = fsStats.bavail * blockSize;
    const diskUsed = diskTotal - diskFree;

    if (diskTotal <= 0) {
      return;
    }

    const usedPercent = (diskUsed / diskTotal) * 100;
    const threshold = getThresholdPercent();

    if (usedPercent < threshold) {
      return;
    }

    const transporter = getTransporter();
    if (!transporter) {
      log.warn("SMTP not configured, cannot send storage warning email");
      return;
    }

    const admins = listAdminUsersWithEmail();
    if (admins.length === 0) {
      log.warn("No admin users with email addresses found, cannot send storage warning");
      return;
    }

    // Send one email per admin in their own language (replaces the previous
    // single bcc email) so each recipient reads the warning localized.
    const sender = resolveSenderAddress();
    const warningVars = {
      usedPercent: usedPercent.toFixed(1),
      used: formatBytes(diskUsed),
      total: formatBytes(diskTotal),
      free: formatBytes(diskFree),
      threshold
    };

    for (const admin of admins) {
      const message = storageWarningEmailMessage(admin.language, warningVars);
      await transporter.sendMail({
        from: sender,
        to: admin.email,
        subject: message.subject,
        text: message.text
      });
    }

    lastWarningSentAt = Date.now();
    log.info("Storage warning email sent to admins", {
      usedPercent: usedPercent.toFixed(1),
      diskFree: formatBytes(diskFree),
      recipients: admins.length
    });
  } catch (error) {
    log.error("Failed to check storage or send warning email", { error: String(error) });
  }
}
