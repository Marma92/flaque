import { HomePanels } from "./HomePanels";
import { LibraryAlbumsSection } from "./LibraryAlbumsSection";
import { LibraryArtistsSection } from "./LibraryArtistsSection";
import { LibraryPlaylistSection } from "./LibraryPlaylistSection";
import { PaginatedLibrary } from "./PaginatedLibrary";
import type { AlbumEntry, ArtistEntry, LibraryResponse, Playlist, PlaylistVisibility, Track } from "../types";
import type { LibraryFilters, LibrarySection } from "../types/library";
import type { UploadPeriod } from "../hooks/useRecentlyUploaded";

type LibraryWorkspaceProps = {
  activeLibrarySection: LibrarySection;
  onSectionChange: (section: LibrarySection) => void;
  availablePlaylists: Playlist[];
  ownerNameById: Record<string, string>;
  onCreatePlaylist: (input: { name: string; visibility: PlaylistVisibility }) => Promise<void>;
  onPlayPlaylist: (playlist: Playlist) => void;
  onPatchPlaylist: (playlistId: string, patch: { name?: string; visibility?: PlaylistVisibility; trackIds?: string[] }) => Promise<void>;
  onDeletePlaylist: (playlistId: string) => Promise<void>;
  allTracksById: Map<string, Track>;
  libraryMetadataError: string | null;
  loadingLibraryArtists: boolean;
  libraryArtists: ArtistEntry[];
  selectedArtist: ArtistEntry | null;
  artistAlbums: AlbumEntry[];
  selectedArtistAlbum: AlbumEntry | null;
  selectedArtistAlbumTracks: Track[];
  loadingSelectedArtistAlbumTracks: boolean;
  selectedArtistAlbumTracksError: string | null;
  loadingArtistAlbums: boolean;
  currentTrackId?: string;
  onArtistSelect: (artist: ArtistEntry) => void;
  onArtistBack: () => void;
  onArtistAlbumSelect: (album: AlbumEntry) => void;
  onArtistAlbumBack: () => void;
  onArtistAlbumTrackSelect: (track: Track) => void;
  onPlayAlbum: (album: AlbumEntry) => void;
  manageablePlaylists: Playlist[];
  onAddTrackToPlaylist: (input: { trackId: string; playlistId: string }) => Promise<void>;
  loadingLibraryAlbums: boolean;
  libraryAlbums: AlbumEntry[];
  selectedAlbum: AlbumEntry | null;
  selectedAlbumTracks: Track[];
  loadingSelectedAlbumTracks: boolean;
  selectedAlbumTracksError: string | null;
  onAlbumSelect: (album: AlbumEntry) => void;
  onAlbumBack: () => void;
  onAlbumTrackSelect: (track: Track) => void;
  recentTracks: Track[];
  onRecentTrackReplay: (track: Track) => void;
  library: LibraryResponse;
  filters: LibraryFilters;
  onFilterChange: (next: LibraryFilters) => void;
  onLibraryTrackSelect: (track: Track) => void;
  // Recently uploaded
  recentlyUploadedTracks: Track[];
  recentlyUploadedLoading: boolean;
  recentlyUploadedPeriod: UploadPeriod;
  onRecentlyUploadedPeriodChange: (period: UploadPeriod) => void;
  // Paginated library
  paginatedTracks: Track[];
  paginatedTotal: number;
  paginatedLoading: boolean;
  paginatedLoadingMore: boolean;
  paginatedHasMore: boolean;
  paginatedSentinelRef: (node: HTMLDivElement | null) => void;
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
  onPatchPlaylist,
  onDeletePlaylist,
  allTracksById,
  libraryMetadataError,
  loadingLibraryArtists,
  libraryArtists,
  selectedArtist,
  artistAlbums,
  selectedArtistAlbum,
  selectedArtistAlbumTracks,
  loadingSelectedArtistAlbumTracks,
  selectedArtistAlbumTracksError,
  loadingArtistAlbums,
  currentTrackId,
  onArtistSelect,
  onArtistBack,
  onArtistAlbumSelect,
  onArtistAlbumBack,
  onArtistAlbumTrackSelect,
  onPlayAlbum,
  manageablePlaylists,
  onAddTrackToPlaylist,
  loadingLibraryAlbums,
  libraryAlbums,
  selectedAlbum,
  selectedAlbumTracks,
  loadingSelectedAlbumTracks,
  selectedAlbumTracksError,
  onAlbumSelect,
  onAlbumBack,
  onAlbumTrackSelect,
  recentTracks,
  onRecentTrackReplay,
  library,
  filters,
  onFilterChange,
  onLibraryTrackSelect,
  recentlyUploadedTracks,
  recentlyUploadedLoading,
  recentlyUploadedPeriod,
  onRecentlyUploadedPeriodChange,
  paginatedTracks,
  paginatedTotal,
  paginatedLoading,
  paginatedLoadingMore,
  paginatedHasMore,
  paginatedSentinelRef
}: LibraryWorkspaceProps): JSX.Element {
  return (
    <div className="h-full min-h-0 space-y-4 overflow-y-auto">
      {activeLibrarySection === "playlists" ? (
        <LibraryPlaylistSection
          availablePlaylists={availablePlaylists}
          manageablePlaylists={manageablePlaylists}
          ownerNameById={ownerNameById}
          allTracksById={allTracksById}
          onCreatePlaylist={onCreatePlaylist}
          onPlayPlaylist={onPlayPlaylist}
          onPatchPlaylist={onPatchPlaylist}
          onDeletePlaylist={onDeletePlaylist}
        />
      ) : null}

      {activeLibrarySection === "artists" ? (
        <LibraryArtistsSection
          libraryMetadataError={libraryMetadataError}
          loadingArtists={loadingLibraryArtists}
          artists={libraryArtists}
          selectedArtist={selectedArtist}
          artistAlbums={artistAlbums}
          selectedArtistAlbum={selectedArtistAlbum}
          selectedArtistAlbumTracks={selectedArtistAlbumTracks}
          loadingSelectedArtistAlbumTracks={loadingSelectedArtistAlbumTracks}
          selectedArtistAlbumTracksError={selectedArtistAlbumTracksError}
          loadingArtistAlbums={loadingArtistAlbums}
          currentTrackId={currentTrackId}
          ownerNameById={ownerNameById}
          onArtistSelect={onArtistSelect}
          onArtistBack={onArtistBack}
          onArtistAlbumSelect={onArtistAlbumSelect}
          onArtistAlbumBack={onArtistAlbumBack}
          onArtistAlbumTrackSelect={onArtistAlbumTrackSelect}
          onPlayAlbum={onPlayAlbum}
          playlists={manageablePlaylists}
          onAddTrackToPlaylist={onAddTrackToPlaylist}
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
          onPlayAlbum={onPlayAlbum}
          onBack={onAlbumBack}
          onTrackSelect={onAlbumTrackSelect}
          playlists={manageablePlaylists}
          onAddTrackToPlaylist={onAddTrackToPlaylist}
        />
      ) : null}

      {activeLibrarySection === "home" ? (
        <>
          <HomePanels
            recentTracks={recentTracks}
            onRecentTrackReplay={onRecentTrackReplay}
            recentlyUploadedTracks={recentlyUploadedTracks}
            recentlyUploadedLoading={recentlyUploadedLoading}
            recentlyUploadedPeriod={recentlyUploadedPeriod}
            onRecentlyUploadedPeriodChange={onRecentlyUploadedPeriodChange}
            onRecentlyUploadedTrackSelect={onLibraryTrackSelect}
            ownerNameById={ownerNameById}
          />

        </>
      ) : null}

      {activeLibrarySection === "music" ? (
        <PaginatedLibrary
          owners={library.owners}
          ownerNameById={ownerNameById}
          artists={library.artists}
          albums={library.albums}
          filters={filters}
          onFilterChange={onFilterChange}
          tracks={paginatedTracks}
          total={paginatedTotal}
          loading={paginatedLoading}
          loadingMore={paginatedLoadingMore}
          hasMore={paginatedHasMore}
          sentinelRef={paginatedSentinelRef}
          currentTrackId={currentTrackId}
          onTrackSelect={onLibraryTrackSelect}
          playlists={manageablePlaylists}
          onAddTrackToPlaylist={onAddTrackToPlaylist}
        />
      ) : null}
    </div>
  );
}
