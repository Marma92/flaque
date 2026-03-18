import { useMemo, useState } from "react";

import type { Playlist, PlaylistVisibility, Track } from "../types";

type PlaylistsPanelProps = {
  tracks: Track[];
  playlists: Playlist[];
  loadingPlaylists: boolean;
  playlistsError: string | null;
  onRefreshPlaylists: () => Promise<void>;
  onCreatePlaylist: (input: {
    name: string;
    visibility: PlaylistVisibility;
    trackIds: string[];
  }) => Promise<void>;
  onUpdatePlaylist: (
    playlistId: string,
    patch: {
      name?: string;
      visibility?: PlaylistVisibility;
      trackIds?: string[];
    }
  ) => Promise<void>;
  onDeletePlaylist: (playlistId: string) => Promise<void>;
  onPlayPlaylist: (playlist: Playlist) => void;
};

function formatDateTime(value: string): string {
  if (!value) {
    return "unknown";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function PlaylistsPanel({
  tracks,
  playlists,
  loadingPlaylists,
  playlistsError,
  onRefreshPlaylists,
  onCreatePlaylist,
  onUpdatePlaylist,
  onDeletePlaylist,
  onPlayPlaylist
}: PlaylistsPanelProps): JSX.Element {
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newVisibility, setNewVisibility] = useState<PlaylistVisibility>("private");
  const [creating, setCreating] = useState(false);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const currentTrackIds = useMemo(() => {
    const deduplicated = new Set<string>();
    const ids: string[] = [];

    for (const track of tracks) {
      if (deduplicated.has(track.id)) {
        continue;
      }
      deduplicated.add(track.id);
      ids.push(track.id);
    }

    return ids;
  }, [tracks]);

  async function handleCreatePlaylist(): Promise<void> {
    const name = newPlaylistName.trim();
    if (!name) {
      setActionMessage("Playlist name is required.");
      return;
    }

    setCreating(true);
    setActionMessage(null);

    try {
      await onCreatePlaylist({
        name,
        visibility: newVisibility,
        trackIds: currentTrackIds
      });
      setActionMessage(`Playlist \"${name}\" saved.`);
      setNewPlaylistName("");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Unable to create playlist");
    } finally {
      setCreating(false);
    }
  }

  async function runPlaylistAction(
    playlist: Playlist,
    action: () => Promise<void>,
    successMessage: string
  ): Promise<void> {
    setActivePlaylistId(playlist.id);
    setActionMessage(null);

    try {
      await action();
      setActionMessage(successMessage);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Playlist action failed");
    } finally {
      setActivePlaylistId(null);
    }
  }

  return (
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-flaque-ink">Playlists</h2>
          <p className="mt-1 text-sm text-flaque-steel">
            Save the current library result as a private or public playlist.
          </p>
        </div>

        <button
          className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={() => {
            void onRefreshPlaylists();
          }}
          disabled={loadingPlaylists}
        >
          {loadingPlaylists ? "Refreshing..." : "Refresh playlists"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_auto]">
        <input
          className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
          type="text"
          placeholder="Playlist name"
          value={newPlaylistName}
          onChange={(event) => setNewPlaylistName(event.target.value)}
        />

        <select
          className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
          value={newVisibility}
          onChange={(event) => setNewVisibility(event.target.value as PlaylistVisibility)}
        >
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>

        <button
          className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={() => {
            void handleCreatePlaylist();
          }}
          disabled={creating}
        >
          {creating ? "Saving..." : `Save ${currentTrackIds.length} tracks`}
        </button>
      </div>

      {playlistsError ? (
        <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {playlistsError}
        </p>
      ) : null}

      {actionMessage ? <p className="mt-3 text-sm text-flaque-steel">{actionMessage}</p> : null}

      {playlists.length === 0 ? (
        <p className="mt-4 text-sm text-flaque-steel">No playlists yet. Save one from your current library result.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {playlists.map((playlist) => {
            const running = activePlaylistId === playlist.id;
            const canEdit = playlist.isOwner;

            return (
              <article
                key={playlist.id}
                className="rounded-2xl border border-flaque-clay/55 bg-flaque-cream/45 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-flaque-ink">{playlist.name}</p>
                    <p className="text-xs text-flaque-steel">
                      {playlist.owner.username}
                      {playlist.isOwner ? " (you)" : ""}
                      {" - "}
                      {playlist.trackIds.length} tracks
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${
                      playlist.visibility === "public"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-flaque-clay bg-white text-flaque-steel"
                    }`}
                  >
                    {playlist.visibility}
                  </span>
                </div>

                <p className="mt-2 text-[11px] text-flaque-steel/90">
                  Updated: {formatDateTime(playlist.updatedAt)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream"
                    type="button"
                    onClick={() => onPlayPlaylist(playlist)}
                  >
                    Play
                  </button>

                  {canEdit ? (
                    <button
                      className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={() => {
                        void runPlaylistAction(
                          playlist,
                          () => onUpdatePlaylist(playlist.id, { trackIds: currentTrackIds }),
                          `Updated tracks for \"${playlist.name}\".`
                        );
                      }}
                      disabled={running}
                    >
                      Update tracks
                    </button>
                  ) : null}

                  {canEdit ? (
                    <button
                      className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={() => {
                        const nextName = window.prompt("Rename playlist", playlist.name);
                        if (nextName === null) {
                          return;
                        }

                        void runPlaylistAction(
                          playlist,
                          () => onUpdatePlaylist(playlist.id, { name: nextName.trim() }),
                          `Renamed playlist to \"${nextName.trim()}\".`
                        );
                      }}
                      disabled={running}
                    >
                      Rename
                    </button>
                  ) : null}

                  {canEdit ? (
                    <button
                      className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={() => {
                        const nextVisibility = playlist.visibility === "public" ? "private" : "public";
                        void runPlaylistAction(
                          playlist,
                          () => onUpdatePlaylist(playlist.id, { visibility: nextVisibility }),
                          `Playlist is now ${nextVisibility}.`
                        );
                      }}
                      disabled={running}
                    >
                      Make {playlist.visibility === "public" ? "private" : "public"}
                    </button>
                  ) : null}

                  {canEdit ? (
                    <button
                      className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={() => {
                        const confirmed = window.confirm(`Delete playlist \"${playlist.name}\"?`);
                        if (!confirmed) {
                          return;
                        }

                        void runPlaylistAction(
                          playlist,
                          () => onDeletePlaylist(playlist.id),
                          `Deleted playlist \"${playlist.name}\".`
                        );
                      }}
                      disabled={running}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
