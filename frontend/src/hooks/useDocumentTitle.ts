import { useEffect } from "react";

import type { Track } from "../types";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "../utils/tracks";

const DEFAULT_DOCUMENT_TITLE = "Flaque Hifi Player";

export function useDocumentTitle(track: Track | null): void {
  useEffect(() => {
    if (!track) {
      document.title = DEFAULT_DOCUMENT_TITLE;
      return;
    }
    const title = getTrackDisplayTitle(track);
    const artist = getTrackDisplayArtist(track) ?? "Unknown artist";
    document.title = `${title} - ${artist} | Flaque`;
  }, [track]);
}
