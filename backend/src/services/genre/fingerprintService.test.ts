import { EventEmitter } from "node:events";
import fsSync from "node:fs";
import fs from "node:fs/promises";import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { tmpDir } = vi.hoisted(() => {
  const fsS = require("node:fs") as typeof import("node:fs");
  const osM = require("node:os") as typeof import("node:os");
  const pathM = require("node:path") as typeof import("node:path");
  return {
    tmpDir: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "fingerprint-test-"))
  };
});

vi.mock("../../utils/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths")>()),
  cacheRoot: tmpDir
}));

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

type SpawnBehavior = {
  errorCode?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
};

let spawnBehavior: SpawnBehavior = { exitCode: 0, stdout: '{"fingerprint":"FAKE","duration":234}' };

vi.mock("node:child_process", () => {
  return {
    spawn: vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: (sig: string) => void };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      // Schedule events for the next tick so listeners attach first.
      setImmediate(() => {
        if (spawnBehavior.errorCode) {
          const err = new Error("spawn failed") as NodeJS.ErrnoException;
          err.code = spawnBehavior.errorCode;
          child.emit("error", err);
          return;
        }
        if (spawnBehavior.stdout) child.stdout.emit("data", Buffer.from(spawnBehavior.stdout, "utf8"));
        if (spawnBehavior.stderr) child.stderr.emit("data", Buffer.from(spawnBehavior.stderr, "utf8"));
        child.emit("close", spawnBehavior.exitCode ?? 0);
      });
      return child;
    })
  };
});

const CACHE_FILE = path.join(tmpDir, "track-fingerprints.json");

beforeEach(async () => {
  vi.resetModules();
  for (const entry of await fs.readdir(tmpDir).catch(() => [])) {
    await fs.rm(path.join(tmpDir, entry), { recursive: true, force: true });
  }
  spawnBehavior = { exitCode: 0, stdout: '{"fingerprint":"FAKE","duration":234}' };
});

afterAll(() => {
  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

async function loadModule(): Promise<typeof import("./fingerprintService")> {
  return await import("./fingerprintService");
}

async function makeAudioFile(name: string, body = "fake-audio"): Promise<string> {
  const filePath = path.join(tmpDir, name);
  fsSync.writeFileSync(filePath, body, "utf8");
  return filePath;
}

describe("fingerprintService", () => {
  it("computes a fingerprint via fpcalc and caches it", async () => {
    const filePath = await makeAudioFile("a.mp3");
    const { computeTrackFingerprint, flushFingerprintCache } = await loadModule();
    const result = await computeTrackFingerprint("track-1", filePath);
    expect(result?.fingerprint).toBe("FAKE");
    expect(result?.duration).toBe(234);
    flushFingerprintCache();
    expect(fsSync.existsSync(CACHE_FILE)).toBe(true);
  });

  it("returns the cached fingerprint when file mtime/size are unchanged", async () => {
    const filePath = await makeAudioFile("a.mp3");
    const { computeTrackFingerprint } = await loadModule();
    await computeTrackFingerprint("track-1", filePath);

    // Change the spawn behavior so a re-call would yield a different fingerprint
    spawnBehavior = { exitCode: 0, stdout: '{"fingerprint":"NEW","duration":99}' };
    const second = await computeTrackFingerprint("track-1", filePath);
    expect(second?.fingerprint).toBe("FAKE");
    expect(second?.duration).toBe(234);
  });

  it("re-computes when the file has been modified", async () => {
    const filePath = await makeAudioFile("a.mp3");
    const { computeTrackFingerprint } = await loadModule();
    await computeTrackFingerprint("track-1", filePath);

    // Modify the file to change mtime + size
    await new Promise((r) => setTimeout(r, 10));
    fsSync.writeFileSync(filePath, "fake-audio-with-more-bytes", "utf8");
    spawnBehavior = { exitCode: 0, stdout: '{"fingerprint":"NEW","duration":99}' };

    const second = await computeTrackFingerprint("track-1", filePath);
    expect(second?.fingerprint).toBe("NEW");
  });

  it("returns null when fpcalc is not installed", async () => {
    spawnBehavior = { errorCode: "ENOENT" };
    const filePath = await makeAudioFile("a.mp3");
    const { computeTrackFingerprint, isFingerprintingDisabled } = await loadModule();
    expect(await computeTrackFingerprint("track-1", filePath)).toBeNull();
    expect(isFingerprintingDisabled()).toBe(true);
  });

  it("short-circuits subsequent calls once fpcalc is known to be missing", async () => {
    spawnBehavior = { errorCode: "ENOENT" };
    const filePath = await makeAudioFile("a.mp3");
    const { computeTrackFingerprint } = await loadModule();
    await computeTrackFingerprint("track-1", filePath);

    // Even if spawn would now succeed, the module remembers fpcalc isn't available
    spawnBehavior = { exitCode: 0, stdout: '{"fingerprint":"FAKE","duration":234}' };
    expect(await computeTrackFingerprint("track-2", filePath)).toBeNull();
  });

  it("returns null when fpcalc exits with non-zero code", async () => {
    spawnBehavior = { exitCode: 1, stderr: "could not decode" };
    const filePath = await makeAudioFile("a.mp3");
    const { computeTrackFingerprint } = await loadModule();
    expect(await computeTrackFingerprint("track-1", filePath)).toBeNull();
  });

  it("returns null when fpcalc output is malformed JSON", async () => {
    spawnBehavior = { exitCode: 0, stdout: "not-json" };
    const filePath = await makeAudioFile("a.mp3");
    const { computeTrackFingerprint } = await loadModule();
    expect(await computeTrackFingerprint("track-1", filePath)).toBeNull();
  });

  it("returns null when the file does not exist", async () => {
    const { computeTrackFingerprint } = await loadModule();
    expect(await computeTrackFingerprint("track-1", path.join(tmpDir, "missing.mp3"))).toBeNull();
  });
});
