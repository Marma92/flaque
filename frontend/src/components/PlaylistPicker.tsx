import { useState } from "react";

import type { Playlist } from "../types";

type PlaylistPickerProps = {
  trackId: string;
  playlists: Playlist[];
  onAddTrackToPlaylist: (input: { trackId: string; playlistId: string }) => Promise<void> | void;
  onDismiss: () => void;
};

export function PlaylistPicker({
  trackId,
  playlists,
  onAddTrackToPlaylist,
  onDismiss
}: PlaylistPickerProps): JSX.Element {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const activePlaylistId = selectedPlaylistId || playlists[0]?.id || "";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-flaque-clay/60 bg-flaque-cream/40 px-3 py-2">
        <select
          className="rounded-lg border border-flaque-clay bg-white px-2 py-1 text-xs text-flaque-ink"
          value={activePlaylistId}
          onChange={(event) => setSelectedPlaylistId(event.target.value)}
        >
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name}
            </option>
          ))}
        </select>
        <button
          className="rounded-lg border border-flaque-clay bg-white px-3 py-1 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={!activePlaylistId || submitLoading}
          onClick={() => {
            if (!activePlaylistId) {
              return;
            }

            setSubmitLoading(true);
            setSubmitStatus(null);
            Promise.resolve(
              onAddTrackToPlaylist({
                trackId,
                playlistId: activePlaylistId
              })
            )
              .then(() => {
                setSubmitStatus("Track added to playlist.");
                onDismiss();
              })
              .catch((error) => {
                setSubmitStatus(error instanceof Error ? error.message : "Unable to add track");
              })
              .finally(() => {
                setSubmitLoading(false);
              });
          }}
        >
          {submitLoading ? "Adding..." : "Add"}
        </button>
      </div>
      {submitStatus ? <p className="text-xs text-flaque-steel">{submitStatus}</p> : null}
    </>
  );
}
