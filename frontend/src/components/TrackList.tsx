import { Fragment, KeyboardEvent, MouseEvent, useState } from "react";

import type { Playlist, Track } from "../types";
import { formatDuration } from "../utils/format";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayLyrics,
  getTrackDisplayTitle
} from "../utils/tracks";
import { PlaylistPicker } from "./PlaylistPicker";

type TrackListProps = {
  tracks: Track[];
  currentTrackId?: string;
  ownerNameById?: Record<string, string>;
  onTrackSelect: (track: Track) => void;
  playlists?: Playlist[];
  onAddTrackToPlaylist?: (input: { trackId: string; playlistId: string }) => Promise<void> | void;
  emptyMessage?: string;
  constrainHeight?: boolean;
  showTrackNumber?: boolean;
};

export function TrackList({
  tracks,
  currentTrackId,
  ownerNameById,
  onTrackSelect,
  playlists = [],
  onAddTrackToPlaylist,
  emptyMessage = "No tracks match this filter yet.",
  constrainHeight = true,
  showTrackNumber = false
}: TrackListProps): JSX.Element {
  const resolveOwnerLabel = (owner: string): string => ownerNameById?.[owner] ?? owner;
  const [playlistPickerTrackId, setPlaylistPickerTrackId] = useState<string | null>(null);

  const hasPlaylistAction = Boolean(onAddTrackToPlaylist);
  const hasPlayablePlaylists = playlists.length > 0;

  function handleTrackSelect(track: Track): void {
    setPlaylistPickerTrackId(null);
    onTrackSelect(track);
  }

  function handleTrackRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, track: Track): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleTrackSelect(track);
  }

  function handleAddToPlaylistClick(event: MouseEvent<HTMLButtonElement>, trackId: string): void {
    event.stopPropagation();
    setPlaylistPickerTrackId((currentTrackIdValue) => (currentTrackIdValue === trackId ? null : trackId));
  }

  function getLyricsBadgeClassName(selected: boolean): string {
    return `inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold leading-none ${
      selected ? "bg-flaque-cream/25 text-flaque-cream" : "bg-flaque-ink/10 text-flaque-ink/60"
    }`;
  }

  function getGenrePillClassName(selected: boolean): string {
    return `inline-block max-w-[7rem] truncate rounded-full px-1.5 py-px text-[10px] leading-tight ${
      selected
        ? "bg-flaque-cream/20 text-flaque-cream/90"
        : "bg-flaque-ink/8 text-flaque-steel"
    }`;
  }

  return (
    <>
      <div className="space-y-3 p-4 md:hidden">
        {tracks.map((track) => {
          const selected = track.id === currentTrackId;
          const trackTitle = getTrackDisplayTitle(track);
          const trackArtist = getTrackDisplayArtist(track) ?? "Unknown";
          const trackAlbum = getTrackDisplayAlbumWithYear(track) ?? "Unknown";
          const hasLyrics = Boolean(getTrackDisplayLyrics(track));
          const showPlaylistPicker = playlistPickerTrackId === track.id;

          return (
            <div
              key={track.id}
              className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                selected
                  ? "border-flaque-ink bg-flaque-ink text-flaque-cream"
                  : "border-flaque-clay/60 bg-flaque-cream/45 text-flaque-ink hover:bg-flaque-cream"
              }`}
            >
              <div className="flex items-start gap-2">
                {hasPlaylistAction ? (
                  <button
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold transition ${
                      selected
                        ? "border-flaque-cream/40 bg-flaque-cream/20 text-flaque-cream hover:bg-flaque-cream/30"
                        : "border-flaque-clay bg-white text-flaque-ink hover:bg-flaque-cream"
                    } ${showPlaylistPicker ? "ring-2 ring-flaque-sand/55" : ""}`}
                    type="button"
                    aria-label={`Add ${trackTitle} to playlist`}
                    title={hasPlayablePlaylists ? "Add to playlist" : "Create a playlist first"}
                    onClick={(event) => handleAddToPlaylistClick(event, track.id)}
                    disabled={!hasPlayablePlaylists}
                  >
                    +
                  </button>
                ) : null}

                <button className="min-w-0 flex-1 text-left" type="button" onClick={() => handleTrackSelect(track)}>
                  <p className="text-sm font-medium">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {hasLyrics ? <span className={getLyricsBadgeClassName(selected)}>L</span> : null}
                      <span className="min-w-0 truncate" title={trackTitle}>
                        {trackTitle}
                      </span>
                    </span>
                  </p>
                  <p className={`mt-1 truncate text-xs ${selected ? "text-flaque-cream/85" : "text-flaque-steel"}`}>
                    {trackArtist}
                  </p>
                  <p className={`truncate text-xs ${selected ? "text-flaque-cream/75" : "text-flaque-steel/80"}`}>
                    {trackAlbum}
                  </p>

                  {track.tags.genre && track.tags.genre.length > 0 ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {track.tags.genre.slice(0, 3).map((genre) => (
                        <span key={genre} className={getGenrePillClassName(selected)} title={genre}>
                          {genre}
                        </span>
                      ))}
                    </span>
                  ) : null}

                  <span
                    className={`mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.12em] ${
                      selected ? "text-flaque-cream/75" : "text-flaque-steel/85"
                    }`}
                  >
                    <span>{resolveOwnerLabel(track.owner)}</span>
                    <span>
                      {formatDuration(track.duration)} - {track.codec}
                    </span>
                  </span>
                </button>
              </div>

              {showPlaylistPicker && onAddTrackToPlaylist ? (
                <div className={`mt-2 ${selected ? "text-flaque-cream" : "text-flaque-ink"}`}>
                  {hasPlayablePlaylists ? (
                    <PlaylistPicker
                      trackId={track.id}
                      playlists={playlists}
                      onAddTrackToPlaylist={onAddTrackToPlaylist}
                      onDismiss={() => setPlaylistPickerTrackId(null)}
                    />
                  ) : (
                    <p className="text-xs text-flaque-steel">Create a playlist first to add tracks.</p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}

        {tracks.length === 0 ? <p className="text-sm text-flaque-steel">{emptyMessage}</p> : null}
      </div>

      <div className={`hidden overflow-auto md:block${constrainHeight ? " max-h-[50vh]" : ""}`}>
        <table className="w-full min-w-[780px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
            <tr>
              <th className="w-10 px-1 py-3 font-medium text-center" aria-label="Playlist actions">
              </th>
              {showTrackNumber ? <th className="w-8 px-0 py-3 text-center font-medium">#</th> : null}
              <th className="pl-1 pr-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Artist</th>
              <th className="px-4 py-3 font-medium">Album</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Codec</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => {
              const selected = track.id === currentTrackId;
              const trackTitle = getTrackDisplayTitle(track);
              const trackArtist = getTrackDisplayArtist(track) ?? "Unknown";
              const trackAlbum = getTrackDisplayAlbumWithYear(track) ?? "Unknown";
              const hasLyrics = Boolean(getTrackDisplayLyrics(track));
              const showPlaylistPicker = playlistPickerTrackId === track.id;

              return (
                <Fragment key={track.id}>
                  <tr
                    role="button"
                    tabIndex={0}
                    aria-label={`Play ${trackTitle}`}
                    className={`cursor-pointer border-t border-flaque-clay/40 transition ${
                      selected ? "bg-flaque-sand/20" : "hover:bg-flaque-cream/60"
                    }`}
                    onClick={() => handleTrackSelect(track)}
                    onKeyDown={(event) => handleTrackRowKeyDown(event, track)}
                  >
                    <td className="px-1 py-3 text-center">
                      {hasPlaylistAction ? (
                        <button
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-lg border border-flaque-clay bg-white text-sm font-semibold text-flaque-ink transition hover:bg-flaque-cream ${
                            showPlaylistPicker ? "ring-2 ring-flaque-sand/55" : ""
                          }`}
                          type="button"
                          aria-label={`Add ${trackTitle} to playlist`}
                          title={hasPlayablePlaylists ? "Add to playlist" : "Create a playlist first"}
                          onClick={(event) => handleAddToPlaylistClick(event, track.id)}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                          }}
                          disabled={!hasPlayablePlaylists}
                        >
                          +
                        </button>
                      ) : null}
                    </td>
                    {showTrackNumber ? (
                      <td className="px-0 py-3 text-center text-xs text-flaque-steel">{track.tags.trackNumber ?? ""}</td>
                    ) : null}
                    <td className="pl-1 pr-4 py-3 text-flaque-ink">
                      <span className="flex max-w-[24rem] min-w-0 items-center gap-1.5">
                        {hasLyrics ? <span className={getLyricsBadgeClassName(false)}>L</span> : null}
                        <span className="min-w-0 truncate" title={trackTitle}>
                          {trackTitle}
                        </span>
                        {track.tags.genre && track.tags.genre.length > 0 ? (
                          <>
                            {track.tags.genre.slice(0, 2).map((genre) => (
                              <span key={genre} className={getGenrePillClassName(selected)} title={genre}>
                                {genre}
                              </span>
                            ))}
                          </>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-flaque-steel">{trackArtist}</td>
                    <td className="px-4 py-3 text-flaque-steel">{trackAlbum}</td>
                    <td className="px-4 py-3 text-flaque-steel">{resolveOwnerLabel(track.owner)}</td>
                    <td className="px-4 py-3 text-flaque-steel">{formatDuration(track.duration)}</td>
                    <td className="px-4 py-3 uppercase text-flaque-steel">{track.codec}</td>
                  </tr>

                  {showPlaylistPicker && onAddTrackToPlaylist ? (
                    <tr className="border-t border-flaque-clay/30 bg-flaque-cream/30">
                      <td className="px-4 pb-3 pt-1" colSpan={showTrackNumber ? 8 : 7}>
                        {hasPlayablePlaylists ? (
                          <PlaylistPicker
                            trackId={track.id}
                            playlists={playlists}
                            onAddTrackToPlaylist={onAddTrackToPlaylist}
                            onDismiss={() => setPlaylistPickerTrackId(null)}
                          />
                        ) : (
                          <p className="text-xs text-flaque-steel">Create a playlist first to add tracks.</p>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {tracks.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-flaque-steel" colSpan={showTrackNumber ? 8 : 7}>
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
