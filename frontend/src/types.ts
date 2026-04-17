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

export type TrackTagExtraValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>;

export type TrackTags = {
  title?: string;
  artist?: string;
  artists?: string[];
  album?: string;
  albumArtist?: string;
  year?: number;
  date?: string;
  originalDate?: string;
  genre?: string[];
  trackNumber?: number;
  trackTotal?: number;
  discNumber?: number;
  discTotal?: number;
  composer?: string[];
  lyricist?: string[];
  comment?: string[];
  bpm?: number;
  isrc?: string[];
  label?: string[];
  copyright?: string;
  language?: string;
  encodedBy?: string;
  extra?: Record<string, TrackTagExtraValue>;
};

export type Track = {
  id: string;
  owner: string;
  path: string;
  duration: number;
  mimeType: string;
  codec: string;
  bitrate?: number;
  sampleRate?: number;
  tags: TrackTags;
  cover?: string;
  addedAt?: string;
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

export type PlaylistVisibility = "public" | "private";

export type Playlist = {
  id: string;
  name: string;
  authorId: string;
  visibility: PlaylistVisibility;
  trackIds: string[];
  trackCount?: number;
  description: string;
  cover: string | null;
  hearts: string[];
  heartCount: number;
  listenCount: number;
  collaborators: string[];
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

export type AutoPlaylistSummary = {
  id: string;
  name: string;
  genre: string;
  decade: number;
  trackCount: number;
  generatedAt: string;
  colors?: [string, string, string];
};

export type AutoPlaylistDetail = AutoPlaylistSummary & {
  trackIds: string[];
};

export type ForYouPlaylistSummary = {
  id: string;
  name: string;
  seedArtist: string;
  trackCount: number;
  generatedAt: string;
};

export type ForYouPlaylistDetail = ForYouPlaylistSummary & {
  trackIds: string[];
};
