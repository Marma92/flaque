export type User = {
  id: string;
  username: string;
  role: "admin" | "user";
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
  tags: {
    title?: string;
    artist?: string;
    album?: string;
  };
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

export type TrackMetadataPatch = {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
};
