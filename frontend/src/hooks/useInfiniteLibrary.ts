import { useCallback, useEffect, useRef, useState } from "react";

import { getTracks } from "../api";
import type { Track, User } from "../types";
import type { LibraryFilters } from "../types/library";

type UseInfiniteLibraryArgs = {
  user: User | null;
  filters: LibraryFilters;
  pageSize?: number;
};

type UseInfiniteLibraryResult = {
  tracks: Track[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  total: number;
  sentinelRef: (node: HTMLDivElement | null) => void;
  refresh: () => void;
};

export function useInfiniteLibrary({
  user,
  filters,
  pageSize = 30
}: UseInfiniteLibraryArgs): UseInfiniteLibraryResult {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const pageRef = useRef(1);
  const requestIdRef = useRef(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(false);

  const fetchPage = useCallback(
    (page: number, append: boolean) => {
      if (!user) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      loadingRef.current = true;

      getTracks({
        page,
        limit: pageSize,
        owner: filters.owner,
        artist: filters.artist,
        album: filters.album,
        q: filters.q
      })
        .then((response) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          if (append) {
            setTracks((prev) => [...prev, ...response.tracks]);
          } else {
            setTracks(response.tracks);
          }

          setTotal(response.total);
          const moreAvailable = response.page < response.totalPages;
          setHasMore(moreAvailable);
          hasMoreRef.current = moreAvailable;
          pageRef.current = response.page;
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          if (!append) {
            setTracks([]);
            setTotal(0);
            setHasMore(false);
            hasMoreRef.current = false;
          }
        })
        .finally(() => {
          if (requestIdRef.current === requestId) {
            setLoading(false);
            setLoadingMore(false);
            loadingRef.current = false;
          }
        });
    },
    [user, filters.owner, filters.artist, filters.album, filters.q, pageSize]
  );

  // Reset and fetch page 1 when user or filters change
  useEffect(() => {
    if (!user) {
      setTracks([]);
      setTotal(0);
      setHasMore(false);
      hasMoreRef.current = false;
      setLoading(false);
      setLoadingMore(false);
      loadingRef.current = false;
      return;
    }

    pageRef.current = 1;
    fetchPage(1, false);
  }, [fetchPage, refreshNonce]);

  // Load next page triggered by IntersectionObserver
  const loadNextPage = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) {
      return;
    }
    const nextPage = pageRef.current + 1;
    fetchPage(nextPage, true);
  }, [fetchPage]);

  // Sentinel ref callback: wire up IntersectionObserver
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      sentinelNodeRef.current = node;

      if (!node) {
        return;
      }

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            loadNextPage();
          }
        },
        { rootMargin: "200px" }
      );

      observerRef.current.observe(node);
    },
    [loadNextPage]
  );

  function refresh(): void {
    setRefreshNonce((n) => n + 1);
  }

  return { tracks, loading, loadingMore, hasMore, total, sentinelRef, refresh };
}
