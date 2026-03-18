export type User = {
  id: string;
  username: string;
  role: "admin" | "user";
};

export type ActivityWindow = "7d" | "30d";

export type PlaylistVisibility = "private" | "public";

export type Playlist = {
  id: string;
  name: string;
  visibility: PlaylistVisibility;
  owner: {
    id: string;
    username: string;
  };
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
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
  uploadedAt?: string;
  tags: TrackTags;
  cover?: string;
};

export type ArtistEntry = {
  name: string;
  trackCount: number;
};

export type AlbumEntry = {
  name: string;
  artist?: string;
  trackCount: number;
};

export type LibraryResponse = {
  generatedAt: string;
  totalTracks: number;
  owners: string[];
  artists: ArtistEntry[];
  albums: AlbumEntry[];
  tracks: Track[];
};

export type RecentUploadEntry = {
  track: Track;
  at: string;
  ownerId: string;
  byUserId?: string;
  byUsername?: string;
};

export type RecentDeletionEntry = {
  trackId: string;
  ownerId: string;
  path: string;
  at: string;
  byUserId?: string;
  byUsername?: string;
};

export type TrackMetadataPatch = {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
};
