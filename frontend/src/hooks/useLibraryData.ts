import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { getAlbumTracks, getAlbums, getArtistAlbums, getArtists, getLibrary } from "../api";
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
  selectedArtist: ArtistEntry | null;
  artistAlbums: AlbumEntry[];
  selectedArtistAlbum: AlbumEntry | null;
  selectedArtistAlbumTracks: Track[];
  selectedArtistAlbumTracksError: string | null;
  libraryAlbums: AlbumEntry[];
  selectedAlbum: AlbumEntry | null;
  selectedAlbumTracks: Track[];
  selectedAlbumTracksError: string | null;
  loadingLibrary: boolean;
  loadingAllTracks: boolean;
  loadingLibraryArtists: boolean;
  loadingArtistAlbums: boolean;
  loadingSelectedArtistAlbumTracks: boolean;
  loadingLibraryAlbums: boolean;
  loadingSelectedAlbumTracks: boolean;
  libraryError: string | null;
  setLibraryError: Dispatch<SetStateAction<string | null>>;
  allTracksError: string | null;
  setAllTracksError: Dispatch<SetStateAction<string | null>>;
  libraryMetadataError: string | null;
  refreshCurrentLibrary: () => Promise<void>;
  refreshAllTracks: () => Promise<void>;
  selectArtist: (artist: ArtistEntry) => void;
  clearSelectedArtist: () => void;
  selectArtistAlbum: (album: AlbumEntry) => void;
  clearSelectedArtistAlbum: () => void;
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
  const [selectedArtist, setSelectedArtist] = useState<ArtistEntry | null>(null);
  const [artistAlbums, setArtistAlbums] = useState<AlbumEntry[]>([]);
  const [selectedArtistAlbum, setSelectedArtistAlbum] = useState<AlbumEntry | null>(null);
  const [selectedArtistAlbumTracks, setSelectedArtistAlbumTracks] = useState<Track[]>([]);
  const [loadingSelectedArtistAlbumTracks, setLoadingSelectedArtistAlbumTracks] = useState(false);
  const [selectedArtistAlbumTracksError, setSelectedArtistAlbumTracksError] = useState<string | null>(null);
  const [libraryAlbums, setLibraryAlbums] = useState<AlbumEntry[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumEntry | null>(null);
  const [selectedAlbumTracks, setSelectedAlbumTracks] = useState<Track[]>([]);
  const [loadingSelectedAlbumTracks, setLoadingSelectedAlbumTracks] = useState(false);
  const [selectedAlbumTracksError, setSelectedAlbumTracksError] = useState<string | null>(null);
  const [loadingLibraryArtists, setLoadingLibraryArtists] = useState(false);
  const [loadingArtistAlbums, setLoadingArtistAlbums] = useState(false);
  const [loadingLibraryAlbums, setLoadingLibraryAlbums] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [allTracksError, setAllTracksError] = useState<string | null>(null);
  const [libraryMetadataError, setLibraryMetadataError] = useState<string | null>(null);

  const libraryRequestIdRef = useRef(0);
  const allTracksRequestIdRef = useRef(0);
  const artistsRequestIdRef = useRef(0);
  const artistAlbumsRequestIdRef = useRef(0);
  const selectedArtistAlbumTracksRequestIdRef = useRef(0);
  const albumsRequestIdRef = useRef(0);
  const selectedAlbumTracksRequestIdRef = useRef(0);

  const availablePlaylists = useMemo(() => {
    return library.playlists ?? [];
  }, [library.playlists]);

  function getAlbumTracksFromLoadedLibraries(album: AlbumEntry): Track[] {
    const selectedAlbumName = normalizeText(album.name);
    const selectedAlbumArtist = normalizeText(album.artist);

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
      setSelectedArtist(null);
      setArtistAlbums([]);
      setSelectedArtistAlbum(null);
      setSelectedArtistAlbumTracks([]);
      setSelectedArtistAlbumTracksError(null);
      setLibraryAlbums([]);
      setLoadingLibrary(false);
      setLoadingAllTracks(false);
      setLoadingLibraryArtists(false);
      setLoadingArtistAlbums(false);
      setLoadingSelectedArtistAlbumTracks(false);
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

    getArtists({})
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
  }, [activeLibrarySection, activeView, user]);

  useEffect(() => {
    if (activeLibrarySection !== "artists") {
      setSelectedArtist(null);
      setArtistAlbums([]);
      setSelectedArtistAlbum(null);
      setSelectedArtistAlbumTracks([]);
      setSelectedArtistAlbumTracksError(null);
      setLoadingSelectedArtistAlbumTracks(false);
      setLoadingArtistAlbums(false);
      return;
    }

    setSelectedArtist((current) => {
      if (!current) {
        return null;
      }

      return libraryArtists.some((artist) => normalizeText(artist.name) === normalizeText(current.name)) ? current : null;
    });
  }, [activeLibrarySection, libraryArtists]);

  useEffect(() => {
    if (activeLibrarySection !== "artists" || !selectedArtist) {
      return;
    }

    const requestId = artistAlbumsRequestIdRef.current + 1;
    artistAlbumsRequestIdRef.current = requestId;

    setLoadingArtistAlbums(true);
    setLibraryMetadataError(null);

    getArtistAlbums(selectedArtist.normalizedName, {})
      .then((albums) => {
        if (artistAlbumsRequestIdRef.current !== requestId) {
          return;
        }

        setArtistAlbums(albums);
        setSelectedArtistAlbum((current) => {
          if (!current) {
            return null;
          }

          const currentKey = getAlbumKey(current);
          return albums.some((album) => getAlbumKey(album) === currentKey) ? current : null;
        });
      })
      .catch((error) => {
        if (artistAlbumsRequestIdRef.current !== requestId) {
          return;
        }

        setArtistAlbums([]);
        setSelectedArtistAlbum(null);
        setSelectedArtistAlbumTracks([]);
        setSelectedArtistAlbumTracksError(null);
        setLibraryMetadataError(error instanceof Error ? error.message : "Failed to load artist albums");
      })
      .finally(() => {
        if (artistAlbumsRequestIdRef.current === requestId) {
          setLoadingArtistAlbums(false);
        }
      });
  }, [activeLibrarySection, selectedArtist]);

  useEffect(() => {
    if (activeLibrarySection !== "artists" || !selectedArtistAlbum) {
      return;
    }

    const fallbackTracks = getAlbumTracksFromLoadedLibraries(selectedArtistAlbum);

    if (!selectedArtistAlbum.id) {
      setSelectedArtistAlbumTracks(sortAlbumTracksByNumber(fallbackTracks));
      setSelectedArtistAlbumTracksError(null);
      setLoadingSelectedArtistAlbumTracks(false);
      return;
    }

    const requestId = selectedArtistAlbumTracksRequestIdRef.current + 1;
    selectedArtistAlbumTracksRequestIdRef.current = requestId;

    setLoadingSelectedArtistAlbumTracks(true);
    setSelectedArtistAlbumTracksError(null);

    getAlbumTracks(selectedArtistAlbum.id)
      .then((tracks) => {
        if (selectedArtistAlbumTracksRequestIdRef.current !== requestId) {
          return;
        }

        setSelectedArtistAlbumTracks(sortAlbumTracksByNumber(tracks));
      })
      .catch((error) => {
        if (selectedArtistAlbumTracksRequestIdRef.current !== requestId) {
          return;
        }

        setSelectedArtistAlbumTracks(sortAlbumTracksByNumber(fallbackTracks));
        setSelectedArtistAlbumTracksError(error instanceof Error ? error.message : "Failed to load album tracks");
      })
      .finally(() => {
        if (selectedArtistAlbumTracksRequestIdRef.current === requestId) {
          setLoadingSelectedArtistAlbumTracks(false);
        }
      });
  }, [activeLibrarySection, allTracksLibrary.tracks, library.tracks, selectedArtistAlbum]);

  useEffect(() => {
    if (activeLibrarySection !== "artists" || selectedArtistAlbum) {
      return;
    }

    setSelectedArtistAlbumTracks([]);
    setSelectedArtistAlbumTracksError(null);
    setLoadingSelectedArtistAlbumTracks(false);
  }, [activeLibrarySection, selectedArtistAlbum]);

  useEffect(() => {
    if (!user || activeView !== "library" || activeLibrarySection !== "albums") {
      return;
    }

    const requestId = albumsRequestIdRef.current + 1;
    albumsRequestIdRef.current = requestId;

    setLoadingLibraryAlbums(true);
    setLibraryMetadataError(null);

    getAlbums({})
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
  }, [activeLibrarySection, activeView, user]);

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
  }, [activeLibrarySection, allTracksLibrary.tracks, library.tracks, selectedAlbum]);

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
    if (selectedAlbum && getAlbumKey(album) === getAlbumKey(selectedAlbum)) return;
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

  function selectArtist(artist: ArtistEntry): void {
    setSelectedArtist(artist);
    setArtistAlbums([]);
    setSelectedArtistAlbum(null);
    setSelectedArtistAlbumTracks([]);
    setSelectedArtistAlbumTracksError(null);
    setLoadingSelectedArtistAlbumTracks(false);
  }

  function clearSelectedArtist(): void {
    setSelectedArtist(null);
    setArtistAlbums([]);
    setSelectedArtistAlbum(null);
    setSelectedArtistAlbumTracks([]);
    setSelectedArtistAlbumTracksError(null);
    setLoadingSelectedArtistAlbumTracks(false);
    setLoadingArtistAlbums(false);
  }

  function selectArtistAlbum(album: AlbumEntry): void {
    setSelectedArtistAlbum(album);
    setSelectedArtistAlbumTracks([]);
    setSelectedArtistAlbumTracksError(null);
  }

  function clearSelectedArtistAlbum(): void {
    setSelectedArtistAlbum(null);
    setSelectedArtistAlbumTracks([]);
    setSelectedArtistAlbumTracksError(null);
    setLoadingSelectedArtistAlbumTracks(false);
  }

  return {
    filters,
    setFilters,
    library,
    allTracksLibrary,
    availablePlaylists,
    libraryArtists,
    selectedArtist,
    artistAlbums,
    selectedArtistAlbum,
    selectedArtistAlbumTracks,
    selectedArtistAlbumTracksError,
    libraryAlbums,
    selectedAlbum,
    selectedAlbumTracks,
    selectedAlbumTracksError,
    loadingLibrary,
    loadingAllTracks,
    loadingLibraryArtists,
    loadingArtistAlbums,
    loadingSelectedArtistAlbumTracks,
    loadingLibraryAlbums,
    loadingSelectedAlbumTracks,
    libraryError,
    setLibraryError,
    allTracksError,
    setAllTracksError,
    libraryMetadataError,
    refreshCurrentLibrary,
    refreshAllTracks,
    selectArtist,
    clearSelectedArtist,
    selectArtistAlbum,
    clearSelectedArtistAlbum,
    selectAlbum,
    clearSelectedAlbum
  };
}
