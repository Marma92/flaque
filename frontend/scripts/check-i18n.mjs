#!/usr/bin/env node
/**
 * Standalone i18n catalog check (CI-friendly, fast, no source scanning).
 *
 * Verifies that every locale defines exactly the same key set as the
 * reference locale (English), per namespace. This catches a missing or
 * extra translation the moment it lands, independent of the test runner.
 *
 * It deliberately does NOT flag "unused" keys: many keys are referenced
 * through dynamic lookups (e.g. t(`server.levelOptions.${k}`)) and the whole
 * `errors` namespace is keyed by backend codes, so a source-scan unused-key
 * report would be all false positives. Run `npm run i18n:check`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REFERENCE = "en";
const localesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n", "locales");

function flatten(value, prefix = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

function loadLocale(lang) {
  const dir = join(localesDir, lang);
  const namespaces = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const ns = file.replace(/\.json$/, "");
    namespaces[ns] = new Set(flatten(JSON.parse(readFileSync(join(dir, file), "utf8"))));
  }
  return namespaces;
}

const languages = readdirSync(localesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const reference = loadLocale(REFERENCE);
let problems = 0;

for (const lang of languages) {
  if (lang === REFERENCE) continue;
  const locale = loadLocale(lang);
  const allNs = new Set([...Object.keys(reference), ...Object.keys(locale)]);

  for (const ns of allNs) {
    const refKeys = reference[ns] ?? new Set();
    const langKeys = locale[ns] ?? new Set();
    const missing = [...refKeys].filter((k) => !langKeys.has(k));
    const extra = [...langKeys].filter((k) => !refKeys.has(k));

    if (!reference[ns]) {
      console.error(`✗ [${lang}] namespace "${ns}" has no English reference.`);
      problems++;
    }
    if (!locale[ns]) {
      console.error(`✗ [${lang}] missing namespace "${ns}".`);
      problems++;
    }
    if (missing.length) {
      console.error(`✗ [${lang}] "${ns}" missing ${missing.length} key(s): ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? " …" : ""}`);
      problems++;
    }
    if (extra.length) {
      console.error(`✗ [${lang}] "${ns}" has ${extra.length} extra key(s): ${extra.slice(0, 10).join(", ")}${extra.length > 10 ? " …" : ""}`);
      problems++;
    }
  }
}

if (problems > 0) {
  console.error(`\ni18n check failed with ${problems} problem(s).`);
  process.exit(1);
}

const total = Object.values(reference).reduce((n, set) => n + set.size, 0);
console.log(`i18n check passed: ${languages.length} languages, ${Object.keys(reference).length} namespaces, ${total} keys each.`);
