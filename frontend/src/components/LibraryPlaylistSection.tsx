import { FormEvent, useState } from "react";

import type { Playlist, PlaylistVisibility } from "../types";

type LibraryPlaylistSectionProps = {
  availablePlaylists: Playlist[];
  ownerNameById: Record<string, string>;
  onCreatePlaylist: (input: { name: string; visibility: PlaylistVisibility }) => Promise<void>;
  onPlayPlaylist: (playlist: Playlist) => void;
};

/**
 * Playlist-focused section for creating and launching playlists.
 */
export function LibraryPlaylistSection({
  availablePlaylists,
  ownerNameById,
  onCreatePlaylist,
  onPlayPlaylist
}: LibraryPlaylistSectionProps): JSX.Element {
  const [playlistName, setPlaylistName] = useState("");
  const [playlistVisibility, setPlaylistVisibility] = useState<PlaylistVisibility>("private");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    try {
      await onCreatePlaylist({
        name: playlistName,
        visibility: playlistVisibility
      });
      setPlaylistName("");
      setStatusMessage("Playlist created.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to create playlist");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h2 className="font-display text-xl text-flaque-ink">Create Playlist</h2>
      <p className="mt-1 text-sm text-flaque-steel">
        Create a file-based playlist folder next to uploads with a `playlist.json` and symlinks.
      </p>

      <form
        className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <input
          className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
          type="text"
          placeholder="Playlist name"
          value={playlistName}
          onChange={(event) => setPlaylistName(event.target.value)}
        />
        <select
          className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
          value={playlistVisibility}
          onChange={(event) => setPlaylistVisibility(event.target.value as PlaylistVisibility)}
        >
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>
        <button
          className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Creating..." : "Create"}
        </button>
      </form>

      {statusMessage ? <p className="mt-2 text-sm text-flaque-steel">{statusMessage}</p> : null}

      <div className="mt-4">
        <h3 className="font-display text-lg text-flaque-ink">Playlists</h3>
        {availablePlaylists.length === 0 ? (
          <p className="mt-2 text-sm text-flaque-steel">No playlists yet.</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availablePlaylists.map((playlist) => {
              const playlistOwner = ownerNameById[playlist.authorId] ?? playlist.authorId;
              return (
                <button
                  key={playlist.id}
                  className="rounded-xl border border-flaque-clay/60 bg-flaque-cream/40 px-3 py-2 text-left transition hover:bg-flaque-cream"
                  type="button"
                  onClick={() => onPlayPlaylist(playlist)}
                  title={`Play playlist ${playlist.name}`}
                >
                  <p className="truncate text-sm font-medium text-flaque-ink">{playlist.name}</p>
                  <p className="truncate text-xs text-flaque-steel">
                    {playlist.trackIds.length} track{playlist.trackIds.length > 1 ? "s" : ""} - {playlist.visibility} - {playlistOwner}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
