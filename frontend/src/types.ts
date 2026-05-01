import type { Playlist, Track } from "@flaque/shared";

export type {
  Playlist,
  PlaylistVisibility,
  Track,
  TrackTagExtraValue,
  TrackTags
} from "@flaque/shared";

export type User = {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
};

export type UserSession = {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  userAgent: string | null;
  ipAddress: string | null;
  label: string | null;
  current: boolean;
};

export type ArtistEntry = {
  name: string;
  normalizedName: string;
  albumCount: number;
  trackCount: number;
  totalDuration: number;
  photo?: string;
  previewTrackId?: string;
};

export type AlbumEntry = {
  id?: string;
  name: string;
  artist?: string;
  artists?: string[];
  trackCount: number;
  year?: number;
  totalDuration?: number;
  cover?: string;
  previewTrackId?: string;
};

export type LibraryResponse = {
  generatedAt: string;
  totalTracks: number;
  totalPlaylists?: number;
  owners: string[];
  ownerNamesById?: Record<string, string>;
  artists: ArtistEntry[];
  albums: AlbumEntry[];
  tracks: Track[];
  playlists?: Playlist[];
};

export type TrackMetadataPatch = {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  year?: number | null;
  genre?: string[] | null;
};

export type RadioTrack = {
  trackId: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  durationSec: number;
  startsAt: string;
  endsAt: string;
  coverUrl?: string | null;
  streamUrl: string;
};

export type RadioStationNowPlaying = {
  id: string;
  currentTrack: RadioTrack | null;
  nextTrack: RadioTrack | null;
};

export type RadioStateResponse = {
  serverNow: string;
  status: "running" | "stopped";
  station: RadioStationNowPlaying | null;
};

export type RadioCreateResponse = {
  serverNow: string;
  success: boolean;
  message: string;
  station: RadioStationNowPlaying | null;
};

export type RadioQueueResponse = {
  serverNow: string;
  station: {
    id: string;
    trackList: RadioTrack[];
  } | null;
};

export type AutoAxis = "decade-genre" | "genre-tempo";

export type TempoBucket = "slow" | "mid" | "driving" | "fast";

export type AutoPlaylistSummary = {
  id: string;
  name: string;
  genre: string;
  decade: number;
  axis?: AutoAxis;
  tempo?: TempoBucket;
  trackCount: number;
  generatedAt: string;
  colors?: [string, string, string];
  gradientAngle?: number;
  /** Up to 4 cover paths (relative under the data dir). Empty/missing → render gradient. */
  mosaicCovers?: string[];
};

export type AutoPlaylistDetail = AutoPlaylistSummary & {
  trackIds: string[];
};

export type ForYouPlaylistSummary = {
  id: string;
  name: string;
  seedArtist: string;
  /** Relative path under the data dir; serve via /api/covers/from-path. */
  seedArtistPhoto?: string;
  trackCount: number;
  generatedAt: string;
};

export type ForYouPlaylistDetail = ForYouPlaylistSummary & {
  trackIds: string[];
};
