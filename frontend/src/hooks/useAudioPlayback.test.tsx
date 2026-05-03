/* @vitest-environment happy-dom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAudioPlayback } from "./useAudioPlayback";
import type { Track } from "../types";

function makeTrack(overrides: Partial<Track> & { id: string }): Track {
  return {
    id: overrides.id,
    owner: "u",
    path: `${overrides.id}.mp3`,
    duration: 180,
    mimeType: "audio/mpeg",
    codec: "mp3",
    tags: {},
    cover: null,
    ...overrides
  } as Track;
}

function mountHook(initialTrack: Track | null, onTrackSkipped: (t: Track) => void) {
  const result = renderHook(
    ({ track }: { track: Track | null }) =>
      useAudioPlayback({
        track,
        transcodeMode: "original",
        repeatMode: "off",
        shuffleEnabled: false,
        playRequestNonce: 0,
        onTrackSkipped
      }),
    { initialProps: { track: initialTrack } }
  );

  // Stand in for a real HTMLAudioElement. The hook calls .load()/.play()/etc.;
  // returning a resolved promise from play() avoids unhandled rejections.
  const fakeAudio = {
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    paused: true,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false
  };
  result.result.current.audioRef.current = fakeAudio as unknown as HTMLAudioElement;
  return result;
}

describe("useAudioPlayback skip detection", () => {
  it("does not fire onTrackSkipped when transitioning track → null → new track", async () => {
    const onTrackSkipped = vi.fn();
    const trackA = makeTrack({ id: "a", duration: 200 });
    const trackB = makeTrack({ id: "b", duration: 200 });

    const { rerender, result } = mountHook(null, onTrackSkipped);

    // First, set track to A so previousTrackRef is populated by the effect.
    await act(async () => {
      rerender({ track: trackA });
    });

    // Simulate a few seconds of playback so currentTimeRef is non-zero —
    // otherwise the `elapsed > 0` guard would mask the bug.
    await act(async () => {
      result.current.handleAudioTimeUpdate({
        currentTarget: { currentTime: 5 }
      } as unknown as React.SyntheticEvent<HTMLAudioElement>);
    });

    // Now clear the queue (track → null). The previous-track ref should be
    // dropped here so the next change doesn't fire a skip with stale data.
    await act(async () => {
      rerender({ track: null });
    });

    // Some time later, the user starts a different track. Without the fix
    // this call sees previousTrack=A, currentTimeRef=0, and emits a bogus
    // skip event for A.
    await act(async () => {
      rerender({ track: trackB });
    });

    expect(onTrackSkipped).not.toHaveBeenCalled();
  });
});
