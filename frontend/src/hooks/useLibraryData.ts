import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { getAlbumTracks, getAlbums, getArtists, getLibrary } from "../api";
import type { AlbumEntry, ArtistEntry, LibraryResponse, Playlist, Track, User } from "../types";
import type { LibraryFilters, LibrarySection } from "../types/library";
import { getAlbumKey, normalizeText, sortAlbumTracksByNumber, type ViewName } from "../utils/appUtils";
import { getTrackDisplayAlbum, getTrackDisplayArtist } from "../utils/tracks";

const EMPTY_LIBRARY: LibraryResponse = {
  generatedAt: "",
  totalTracks: 0,
  totalPlaylists: 0,
  owners: [],
  artists: [],
  albums: [],
  tracks: [],
  playlists: []
};

type UseLibraryDataArgs = {
  user: User | null;
  activeView: ViewName;
  activeLibrarySection: LibrarySection;
};

type UseLibraryDataResult = {
  filters: LibraryFilters;
  setFilters: Dispatch<SetStateAction<LibraryFilters>>;
  library: LibraryResponse;
  allTracksLibrary: LibraryResponse;
  availablePlaylists: Playlist[];
  libraryArtists: ArtistEntry[];
  libraryAlbums: AlbumEntry[];
  selectedAlbum: AlbumEntry | null;
  selectedAlbumTracks: Track[];
  selectedAlbumTracksError: string | null;
  loadingLibrary: boolean;
  loadingAllTracks: boolean;
  loadingLibraryArtists: boolean;
  loadingLibraryAlbums: boolean;
  loadingSelectedAlbumTracks: boolean;
  libraryError: string | null;
  setLibraryError: Dispatch<SetStateAction<string | null>>;
  allTracksError: string | null;
  setAllTracksError: Dispatch<SetStateAction<string | null>>;
  libraryMetadataError: string | null;
  refreshCurrentLibrary: () => Promise<void>;
  refreshAllTracks: () => Promise<void>;
  selectAlbum: (album: AlbumEntry) => void;
  clearSelectedAlbum: () => void;
};

/**
 * Centralizes library fetch lifecycle, filters and metadata section state.
 */
export function useLibraryData({
  user,
  activeView,
  activeLibrarySection
}: UseLibraryDataArgs): UseLibraryDataResult {
  const [filters, setFilters] = useState<LibraryFilters>({});

  const [library, setLibrary] = useState<LibraryResponse>(EMPTY_LIBRARY);
  const [allTracksLibrary, setAllTracksLibrary] = useState<LibraryResponse>(EMPTY_LIBRARY);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingAllTracks, setLoadingAllTracks] = useState(false);
  const [libraryArtists, setLibraryArtists] = useState<ArtistEntry[]>([]);
  const [libraryAlbums, setLibraryAlbums] = useState<AlbumEntry[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumEntry | null>(null);
  const [selectedAlbumTracks, setSelectedAlbumTracks] = useState<Track[]>([]);
  const [loadingSelectedAlbumTracks, setLoadingSelectedAlbumTracks] = useState(false);
  const [selectedAlbumTracksError, setSelectedAlbumTracksError] = useState<string | null>(null);
  const [loadingLibraryArtists, setLoadingLibraryArtists] = useState(false);
  const [loadingLibraryAlbums, setLoadingLibraryAlbums] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [allTracksError, setAllTracksError] = useState<string | null>(null);
  const [libraryMetadataError, setLibraryMetadataError] = useState<string | null>(null);

  const libraryRequestIdRef = useRef(0);
  const allTracksRequestIdRef = useRef(0);
  const artistsRequestIdRef = useRef(0);
  const albumsRequestIdRef = useRef(0);
  const selectedAlbumTracksRequestIdRef = useRef(0);

  const availablePlaylists = useMemo(() => {
    return library.playlists ?? [];
  }, [library.playlists]);

  function getAlbumTracksFromLoadedLibraries(album: AlbumEntry): Track[] {
    const selectedAlbumName = normalizeText(album.name);
    const selectedAlbumArtist = normalizeText(album.artist);
    const ownerFilter = normalizeText(filters.owner);

    const trackMap = new Map<string, Track>();
    for (const track of allTracksLibrary.tracks) {
      trackMap.set(track.id, track);
    }
    for (const track of library.tracks) {
      trackMap.set(track.id, track);
    }

    const sourceTracks = Array.from(trackMap.values());

    return sourceTracks.filter((track) => {
      if (normalizeText(getTrackDisplayAlbum(track)) !== selectedAlbumName) {
        return false;
      }

      if (ownerFilter && normalizeText(track.owner) !== ownerFilter) {
        return false;
      }

      if (!selectedAlbumArtist) {
        return true;
      }

      return normalizeText(getTrackDisplayArtist(track)) === selectedAlbumArtist;
    });
  }

  useEffect(() => {
    if (!user) {
      setLibrary(EMPTY_LIBRARY);
      setAllTracksLibrary(EMPTY_LIBRARY);
      setLibraryArtists([]);
      setLibraryAlbums([]);
      setLoadingLibrary(false);
      setLoadingAllTracks(false);
      setLoadingLibraryArtists(false);
      setLoadingLibraryAlbums(false);
      setLibraryError(null);
      setAllTracksError(null);
      setLibraryMetadataError(null);
      return;
    }

    const requestId = libraryRequestIdRef.current + 1;
    libraryRequestIdRef.current = requestId;

    setLoadingLibrary(true);
    setLibraryError(null);

    getLibrary(filters)
      .then((payload) => {
        if (libraryRequestIdRef.current !== requestId) {
          return;
        }

        setLibrary(payload);
      })
      .catch((error) => {
        if (libraryRequestIdRef.current !== requestId) {
          return;
        }

        setLibraryError(error instanceof Error ? error.message : "Failed to load library");
      })
      .finally(() => {
        if (libraryRequestIdRef.current === requestId) {
          setLoadingLibrary(false);
        }
      });
  }, [filters, user]);

  useEffect(() => {
    if (!user || activeView !== "library" || activeLibrarySection !== "artists") {
      return;
    }

    const requestId = artistsRequestIdRef.current + 1;
    artistsRequestIdRef.current = requestId;

    setLoadingLibraryArtists(true);
    setLibraryMetadataError(null);

    getArtists({
      owner: filters.owner,
      q: filters.q
    })
      .then((artists) => {
        if (artistsRequestIdRef.current !== requestId) {
          return;
        }

        setLibraryArtists(artists);
      })
      .catch((error) => {
        if (artistsRequestIdRef.current !== requestId) {
          return;
        }

        setLibraryMetadataError(error instanceof Error ? error.message : "Failed to load artists");
      })
      .finally(() => {
        if (artistsRequestIdRef.current === requestId) {
          setLoadingLibraryArtists(false);
        }
      });
  }, [activeLibrarySection, activeView, filters.owner, filters.q, user]);

  useEffect(() => {
    if (!user || activeView !== "library" || activeLibrarySection !== "albums") {
      return;
    }

    const requestId = albumsRequestIdRef.current + 1;
    albumsRequestIdRef.current = requestId;

    setLoadingLibraryAlbums(true);
    setLibraryMetadataError(null);

    getAlbums({
      owner: filters.owner,
      artist: filters.artist,
      q: filters.q
    })
      .then((albums) => {
        if (albumsRequestIdRef.current !== requestId) {
          return;
        }

        setLibraryAlbums(albums);
      })
      .catch((error) => {
        if (albumsRequestIdRef.current !== requestId) {
          return;
        }

        setLibraryMetadataError(error instanceof Error ? error.message : "Failed to load albums");
      })
      .finally(() => {
        if (albumsRequestIdRef.current === requestId) {
          setLoadingLibraryAlbums(false);
        }
      });
  }, [activeLibrarySection, activeView, filters.artist, filters.owner, filters.q, user]);

  useEffect(() => {
    if (activeLibrarySection !== "albums") {
      setSelectedAlbum(null);
      setSelectedAlbumTracks([]);
      setSelectedAlbumTracksError(null);
      setLoadingSelectedAlbumTracks(false);
      return;
    }

    setSelectedAlbum((current) => {
      if (!current) {
        return null;
      }

      const currentKey = getAlbumKey(current);
      return libraryAlbums.some((album) => getAlbumKey(album) === currentKey) ? current : null;
    });
  }, [activeLibrarySection, libraryAlbums]);

  useEffect(() => {
    if (activeLibrarySection !== "albums" || !selectedAlbum) {
      return;
    }

    const fallbackTracks = getAlbumTracksFromLoadedLibraries(selectedAlbum);

    if (!selectedAlbum.id) {
      setSelectedAlbumTracks(sortAlbumTracksByNumber(fallbackTracks));
      setSelectedAlbumTracksError(null);
      setLoadingSelectedAlbumTracks(false);
      return;
    }

    const requestId = selectedAlbumTracksRequestIdRef.current + 1;
    selectedAlbumTracksRequestIdRef.current = requestId;

    setLoadingSelectedAlbumTracks(true);
    setSelectedAlbumTracksError(null);

    getAlbumTracks(selectedAlbum.id)
      .then((tracks) => {
        if (selectedAlbumTracksRequestIdRef.current !== requestId) {
          return;
        }

        setSelectedAlbumTracks(sortAlbumTracksByNumber(tracks));
      })
      .catch((error) => {
        if (selectedAlbumTracksRequestIdRef.current !== requestId) {
          return;
        }

        setSelectedAlbumTracks(sortAlbumTracksByNumber(fallbackTracks));
        setSelectedAlbumTracksError(error instanceof Error ? error.message : "Failed to load album tracks");
      })
      .finally(() => {
        if (selectedAlbumTracksRequestIdRef.current === requestId) {
          setLoadingSelectedAlbumTracks(false);
        }
      });
  }, [activeLibrarySection, allTracksLibrary.tracks, filters.owner, library.tracks, selectedAlbum]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const requestId = allTracksRequestIdRef.current + 1;
    allTracksRequestIdRef.current = requestId;

    setLoadingAllTracks(true);
    setAllTracksError(null);

    getLibrary({})
      .then((payload) => {
        if (allTracksRequestIdRef.current !== requestId) {
          return;
        }

        setAllTracksLibrary(payload);
      })
      .catch((error) => {
        if (allTracksRequestIdRef.current !== requestId) {
          return;
        }

        setAllTracksError(error instanceof Error ? error.message : "Failed to load tracks");
      })
      .finally(() => {
        if (allTracksRequestIdRef.current === requestId) {
          setLoadingAllTracks(false);
        }
      });
  }, [user]);

  async function refreshCurrentLibrary(): Promise<void> {
    const requestId = libraryRequestIdRef.current + 1;
    libraryRequestIdRef.current = requestId;

    setLoadingLibrary(true);
    setLibraryError(null);

    try {
      const payload = await getLibrary(filters);
      if (libraryRequestIdRef.current !== requestId) {
        return;
      }

      setLibrary(payload);
    } catch (error) {
      if (libraryRequestIdRef.current !== requestId) {
        return;
      }

      setLibraryError(error instanceof Error ? error.message : "Failed to load library");
    } finally {
      if (libraryRequestIdRef.current === requestId) {
        setLoadingLibrary(false);
      }
    }
  }

  async function refreshAllTracks(): Promise<void> {
    const requestId = allTracksRequestIdRef.current + 1;
    allTracksRequestIdRef.current = requestId;

    setLoadingAllTracks(true);
    setAllTracksError(null);

    try {
      const payload = await getLibrary({});
      if (allTracksRequestIdRef.current !== requestId) {
        return;
      }

      setAllTracksLibrary(payload);
    } catch (error) {
      if (allTracksRequestIdRef.current !== requestId) {
        return;
      }

      setAllTracksError(error instanceof Error ? error.message : "Failed to load tracks");
    } finally {
      if (allTracksRequestIdRef.current === requestId) {
        setLoadingAllTracks(false);
      }
    }
  }

  function selectAlbum(album: AlbumEntry): void {
    setSelectedAlbum(album);
    setSelectedAlbumTracks([]);
    setSelectedAlbumTracksError(null);
  }

  function clearSelectedAlbum(): void {
    setSelectedAlbum(null);
    setSelectedAlbumTracks([]);
    setSelectedAlbumTracksError(null);
    setLoadingSelectedAlbumTracks(false);
  }

  return {
    filters,
    setFilters,
    library,
    allTracksLibrary,
    availablePlaylists,
    libraryArtists,
    libraryAlbums,
    selectedAlbum,
    selectedAlbumTracks,
    selectedAlbumTracksError,
    loadingLibrary,
    loadingAllTracks,
    loadingLibraryArtists,
    loadingLibraryAlbums,
    loadingSelectedAlbumTracks,
    libraryError,
    setLibraryError,
    allTracksError,
    setAllTracksError,
    libraryMetadataError,
    refreshCurrentLibrary,
    refreshAllTracks,
    selectAlbum,
    clearSelectedAlbum
  };
}
