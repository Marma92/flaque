import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { AlbumEntry, ArtistEntry } from "../types";
import type { LibrarySection } from "../types/library";
import { navigateTo, type ViewName } from "../utils/appUtils";

type UseLibraryNavigationArgs = {
  setActiveView: Dispatch<SetStateAction<ViewName>>;
  setActiveLibrarySection: Dispatch<SetStateAction<LibrarySection>>;
  setPlaylistDetailId: Dispatch<SetStateAction<string | null>>;
  selectArtist: (artist: ArtistEntry) => void;
  clearSelectedArtist: () => void;
  clearSelectedArtistAlbum: () => void;
  selectAlbum: (album: AlbumEntry) => void;
  clearSelectedAlbum: () => void;
};

export type UseLibraryNavigationResult = {
  /** Move to a library section, dropping every drill-down selection. */
  goToSection: (section: LibrarySection) => void;
  /** Open the playlists section, optionally focused on one playlist. */
  openPlaylists: (playlistDetailId?: string | null) => void;
  /** Open the artists section focused on `artist`. */
  openArtist: (artist: ArtistEntry) => void;
  /**
   * Open the albums section focused on `album`. Pass `setView: false` when the
   * caller is already inside the library view and only changes section.
   */
  openAlbum: (album: AlbumEntry, options?: { setView?: boolean }) => void;
  /** Drop every drill-down selection without changing section. */
  resetSelections: () => void;
};

/**
 * Library navigation in one place.
 *
 * Moving between library sections always meant the same dance — push the route,
 * set the section, drop the playlist detail id, and clear the artist/album
 * drill-down state — repeated at six call sites in `AuthenticatedApp` with
 * slightly different subsets each time.
 *
 * One subtlety is deliberately preserved: when navigating *in order to* select
 * an album, the previously selected album is NOT cleared first. `selectAlbum`
 * short-circuits when the same album is selected again, which keeps its already
 * loaded tracks; clearing first would defeat that guard and force a refetch.
 * `selectArtist` resets its own sub-state, so it has no such constraint.
 */
export function useLibraryNavigation({
  setActiveView,
  setActiveLibrarySection,
  setPlaylistDetailId,
  selectArtist,
  clearSelectedArtist,
  clearSelectedArtistAlbum,
  selectAlbum,
  clearSelectedAlbum
}: UseLibraryNavigationArgs): UseLibraryNavigationResult {
  const resetSelections = useCallback((): void => {
    clearSelectedArtist();
    clearSelectedArtistAlbum();
    clearSelectedAlbum();
  }, [clearSelectedArtist, clearSelectedArtistAlbum, clearSelectedAlbum]);

  const goToSection = useCallback(
    (section: LibrarySection): void => {
      navigateTo("library", section);
      setActiveLibrarySection(section);
      setPlaylistDetailId(null);
      resetSelections();
    },
    [resetSelections, setActiveLibrarySection, setPlaylistDetailId]
  );

  const openPlaylists = useCallback(
    (playlistDetailId: string | null = null): void => {
      navigateTo("library", "playlists");
      setActiveLibrarySection("playlists");
      setPlaylistDetailId(playlistDetailId);
      resetSelections();
    },
    [resetSelections, setActiveLibrarySection, setPlaylistDetailId]
  );

  const openArtist = useCallback(
    (artist: ArtistEntry): void => {
      navigateTo("library", "artists");
      setActiveView("library");
      setActiveLibrarySection("artists");
      setPlaylistDetailId(null);
      // No clearSelectedArtist: selectArtist resets its own sub-state below.
      clearSelectedAlbum();
      clearSelectedArtistAlbum();
      selectArtist(artist);
    },
    [
      clearSelectedAlbum,
      clearSelectedArtistAlbum,
      selectArtist,
      setActiveLibrarySection,
      setActiveView,
      setPlaylistDetailId
    ]
  );

  const openAlbum = useCallback(
    (album: AlbumEntry, options?: { setView?: boolean }): void => {
      navigateTo("library", "albums");
      if (options?.setView !== false) {
        setActiveView("library");
      }
      setActiveLibrarySection("albums");
      setPlaylistDetailId(null);
      // No clearSelectedAlbum: that would defeat selectAlbum's identity guard.
      clearSelectedArtist();
      clearSelectedArtistAlbum();
      selectAlbum(album);
    },
    [
      clearSelectedArtist,
      clearSelectedArtistAlbum,
      selectAlbum,
      setActiveLibrarySection,
      setActiveView,
      setPlaylistDetailId
    ]
  );

  return { goToSection, openPlaylists, openArtist, openAlbum, resetSelections };
}
