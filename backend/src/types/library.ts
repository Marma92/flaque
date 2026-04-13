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

export type PlaylistVisibility = "public" | "private";

export type Playlist = {
  id: string;
  name: string;
  authorId: string;
  visibility: PlaylistVisibility;
  trackIds: string[];
  description: string;
  cover: string | null;
  hearts: string[];
  heartCount: number;
  listenCount: number;
  collaborators: string[];
};

export type LibraryIndex = {
  generatedAt: string;
  totalTracks: number;
  tracks: Track[];
  playlists?: Playlist[];
};
