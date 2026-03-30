export type LibrarySection = "home" | "music" | "artists" | "albums" | "playlists";

export type LibraryFilters = {
  owner?: string;
  artist?: string;
  album?: string;
  q?: string;
};
