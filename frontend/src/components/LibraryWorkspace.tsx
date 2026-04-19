import { HomePanels, type HomePanelsProps } from "./HomePanels";
import { LibraryAlbumsSection, type LibraryAlbumsSectionProps } from "./LibraryAlbumsSection";
import { LibraryArtistsSection, type LibraryArtistsSectionProps } from "./LibraryArtistsSection";
import { PaginatedLibrary, type PaginatedLibraryProps } from "./PaginatedLibrary";
import { PlaylistsSection, type PlaylistsSectionProps } from "./PlaylistsSection";
import type { LibrarySection } from "../types/library";

type LibraryWorkspaceProps = {
  activeLibrarySection: LibrarySection;
  playlistsProps: PlaylistsSectionProps;
  artistsProps: LibraryArtistsSectionProps;
  albumsProps: LibraryAlbumsSectionProps;
  homeProps: HomePanelsProps;
  musicProps: PaginatedLibraryProps;
};

/**
 * Thin section switcher — each section receives its own bundled props.
 */
export function LibraryWorkspace({
  activeLibrarySection,
  playlistsProps,
  artistsProps,
  albumsProps,
  homeProps,
  musicProps
}: LibraryWorkspaceProps): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {activeLibrarySection === "playlists" && <PlaylistsSection {...playlistsProps} />}
      {activeLibrarySection === "artists" && <LibraryArtistsSection {...artistsProps} />}
      {activeLibrarySection === "albums" && <LibraryAlbumsSection {...albumsProps} />}
      {activeLibrarySection === "home" && <HomePanels {...homeProps} />}
      {activeLibrarySection === "music" && <PaginatedLibrary {...musicProps} />}
    </div>
  );
}
