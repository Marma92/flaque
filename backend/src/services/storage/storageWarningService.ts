import fs from "node:fs/promises";

import { storageRoot } from "../../utils/paths";
import { getTransporter, resolveSenderAddress } from "../../utils/email";
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

    const adminEmails = admins.map((a) => a.email);

    await transporter.sendMail({
      from: resolveSenderAddress(),
      to: adminEmails[0],
      bcc: adminEmails.slice(1),
      subject: `Flaque: Low disk storage warning (${usedPercent.toFixed(1)}% used)`,
      text: [
        "Disk storage on your Flaque server is running low.",
        "",
        `Current usage: ${usedPercent.toFixed(1)}% (${formatBytes(diskUsed)} used of ${formatBytes(diskTotal)} total)`,
        `Free space remaining: ${formatBytes(diskFree)}`,
        `Warning threshold: ${threshold}%`,
        "",
        "Consider freeing up disk space or expanding storage to avoid disruption."
      ].join("\n")
    });

    lastWarningSentAt = Date.now();
    log.info("Storage warning email sent to admins", {
      usedPercent: usedPercent.toFixed(1),
      diskFree: formatBytes(diskFree),
      recipients: adminEmails.length
    });
  } catch (error) {
    log.error("Failed to check storage or send warning email", { error: String(error) });
  }
}
