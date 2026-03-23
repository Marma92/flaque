import { LibraryAlbumsSection } from "./LibraryAlbumsSection";
import { LibraryArtistsSection } from "./LibraryArtistsSection";
import { LibraryPlaylistSection } from "./LibraryPlaylistSection";
import { LibraryView } from "./LibraryView";
import { RecentTracksPanel } from "./RecentTracksPanel";
import type { AlbumEntry, ArtistEntry, LibraryResponse, Playlist, PlaylistVisibility, Track } from "../types";
import type { LibraryFilters, LibrarySection } from "../types/library";

type LibraryWorkspaceProps = {
  activeLibrarySection: LibrarySection;
  onSectionChange: (section: LibrarySection) => void;
  availablePlaylists: Playlist[];
  ownerNameById: Record<string, string>;
  onCreatePlaylist: (input: { name: string; visibility: PlaylistVisibility }) => Promise<void>;
  onPlayPlaylist: (playlist: Playlist) => void;
  libraryMetadataError: string | null;
  loadingLibraryArtists: boolean;
  libraryArtists: ArtistEntry[];
  loadingLibraryAlbums: boolean;
  libraryAlbums: AlbumEntry[];
  selectedAlbum: AlbumEntry | null;
  selectedAlbumTracks: Track[];
  loadingSelectedAlbumTracks: boolean;
  selectedAlbumTracksError: string | null;
  currentTrackId?: string;
  onAlbumSelect: (album: AlbumEntry) => void;
  onAlbumTrackSelect: (track: Track) => void;
  recentTracks: Track[];
  onRecentTrackReplay: (track: Track) => void;
  library: LibraryResponse;
  filters: LibraryFilters;
  onFilterChange: (next: LibraryFilters) => void;
  onLibraryTrackSelect: (track: Track) => void;
  manageablePlaylists: Playlist[];
  onAddTrackToPlaylist: (input: { trackId: string; playlistId: string }) => Promise<void>;
};

/**
 * Renders the complete library workspace with section-specific panels.
 */
export function LibraryWorkspace({
  activeLibrarySection,
  onSectionChange,
  availablePlaylists,
  ownerNameById,
  onCreatePlaylist,
  onPlayPlaylist,
  libraryMetadataError,
  loadingLibraryArtists,
  libraryArtists,
  loadingLibraryAlbums,
  libraryAlbums,
  selectedAlbum,
  selectedAlbumTracks,
  loadingSelectedAlbumTracks,
  selectedAlbumTracksError,
  currentTrackId,
  onAlbumSelect,
  onAlbumTrackSelect,
  recentTracks,
  onRecentTrackReplay,
  library,
  filters,
  onFilterChange,
  onLibraryTrackSelect,
  manageablePlaylists,
  onAddTrackToPlaylist
}: LibraryWorkspaceProps): JSX.Element {
  return (
    <div className="space-y-4">
      {activeLibrarySection === "playlists" ? (
        <LibraryPlaylistSection
          availablePlaylists={availablePlaylists}
          ownerNameById={ownerNameById}
          onCreatePlaylist={onCreatePlaylist}
          onPlayPlaylist={onPlayPlaylist}
        />
      ) : null}

      {activeLibrarySection === "artists" ? (
        <LibraryArtistsSection
          libraryMetadataError={libraryMetadataError}
          loadingArtists={loadingLibraryArtists}
          artists={libraryArtists}
        />
      ) : null}

      {activeLibrarySection === "albums" ? (
        <LibraryAlbumsSection
          libraryMetadataError={libraryMetadataError}
          loadingAlbums={loadingLibraryAlbums}
          albums={libraryAlbums}
          selectedAlbum={selectedAlbum}
          selectedAlbumTracks={selectedAlbumTracks}
          loadingSelectedAlbumTracks={loadingSelectedAlbumTracks}
          selectedAlbumTracksError={selectedAlbumTracksError}
          currentTrackId={currentTrackId}
          ownerNameById={ownerNameById}
          onAlbumSelect={onAlbumSelect}
          onTrackSelect={onAlbumTrackSelect}
          playlists={manageablePlaylists}
          onAddTrackToPlaylist={onAddTrackToPlaylist}
        />
      ) : null}

      {activeLibrarySection === "music" ? (
        <>
          <RecentTracksPanel tracks={recentTracks} onTrackReplay={onRecentTrackReplay} />

          <LibraryView
            generatedAt={library.generatedAt}
            tracks={library.tracks}
            owners={library.owners}
            ownerNameById={ownerNameById}
            artists={library.artists}
            albums={library.albums}
            filters={filters}
            onFilterChange={onFilterChange}
            currentTrackId={currentTrackId}
            onTrackSelect={onLibraryTrackSelect}
            playlists={manageablePlaylists}
            onAddTrackToPlaylist={onAddTrackToPlaylist}
          />
        </>
      ) : null}
    </div>
  );
}
