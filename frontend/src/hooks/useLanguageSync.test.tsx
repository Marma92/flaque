/* @vitest-environment happy-dom */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "../i18n";
import type { User } from "../types";
import { useLanguageSync } from "./useLanguageSync";

function makeUser(language: User["language"]): User {
  return { id: "u1", username: "alice", email: "a@b.c", role: "user", language };
}

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("useLanguageSync", () => {
  it("switches i18n to the signed-in user's account language", async () => {
    expect(i18n.resolvedLanguage).toBe("en");
    renderHook(() => useLanguageSync(makeUser("fr")));
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("fr"));
  });

  it("leaves the detected language untouched when no user is loaded", async () => {
    expect(i18n.resolvedLanguage).toBe("en");
    renderHook(() => useLanguageSync(null));
    expect(i18n.resolvedLanguage).toBe("en");
  });
});
