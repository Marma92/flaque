export type User = {
  id: string;
  username: string;
  role: "admin" | "user";
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
};

export type ArtistEntry = {
  name: string;
  trackCount: number;
  photo?: string;
  previewTrackId?: string;
};

export type AlbumEntry = {
  id?: string;
  name: string;
  artist?: string;
  artists?: string[];
  trackCount: number;
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
};

export type LibraryResponse = {
  generatedAt: string;
  totalTracks: number;
  totalPlaylists?: number;
  owners: string[];
  artists: ArtistEntry[];
  albums: AlbumEntry[];
  tracks: Track[];
  playlists?: Playlist[];
};

export type TrackMetadataPatch = {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
};
