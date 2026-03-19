export type LibrarySection = "music" | "artists" | "albums" | "playlist";

export type LibraryFilters = {
  owner?: string;
  artist?: string;
  album?: string;
  q?: string;
};
