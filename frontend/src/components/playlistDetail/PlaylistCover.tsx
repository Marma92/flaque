import type { JSX } from "react";

import { coverUrl, playlistCoverUrl } from "../../api";
import defaultCoverImage from "../../assets/default-cover.png";
import type { Playlist, Track } from "../../types";

type PlaylistCoverProps = {
  playlist: Playlist;
  mosaicTracks: Track[];
};

export function PlaylistCover({ playlist, mosaicTracks }: PlaylistCoverProps): JSX.Element {
  if (playlist.cover) {
    return (
      <img
        src={playlistCoverUrl(playlist.id)}
        alt={playlist.name}
        className="h-full w-full rounded-2xl object-cover"
      />
    );
  }

  if (mosaicTracks.length === 0) {
    return (
      <img src={defaultCoverImage} alt="" className="h-full w-full rounded-2xl object-cover" />
    );
  }

  if (mosaicTracks.length === 1) {
    return (
      <img
        src={coverUrl(mosaicTracks[0]!.id)}
        alt=""
        className="h-full w-full rounded-2xl object-cover"
        onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
      />
    );
  }

  const slots = Array.from({ length: 4 }, (_, i) => mosaicTracks[i] ?? null);

  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2 overflow-hidden rounded-2xl">
      {slots.map((track, i) =>
        track ? (
          <img
            key={i}
            src={coverUrl(track.id)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
          />
        ) : (
          <img key={i} src={defaultCoverImage} alt="" className="h-full w-full object-cover" />
        )
      )}
    </div>
  );
}

export function getPlaylistMosaicTracks(trackIds: string[], allTracksById: Map<string, Track>): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];
  for (const id of trackIds) {
    if (result.length >= 4) break;
    const track = allTracksById.get(id);
    if (!track) continue;
    const albumKey = track.tags.album ?? track.id;
    if (!seen.has(albumKey)) {
      seen.add(albumKey);
      result.push(track);
    }
  }
  return result;
}
