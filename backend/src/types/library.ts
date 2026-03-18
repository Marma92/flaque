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

export type LibraryIndex = {
  generatedAt: string;
  totalTracks: number;
  tracks: Track[];
};

export type UserRole = "admin" | "user";

export type AuthUser = {
  id: string;
  username: string;
  role: UserRole;
};
