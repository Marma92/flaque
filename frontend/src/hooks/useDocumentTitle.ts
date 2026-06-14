import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { Track } from "../types";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "../utils/tracks";

const DEFAULT_DOCUMENT_TITLE = "flaque";

export function useDocumentTitle(track: Track | null): void {
  const { t, i18n } = useTranslation("common");
  useEffect(() => {
    if (!track) {
      document.title = DEFAULT_DOCUMENT_TITLE;
      return;
    }
    const title = getTrackDisplayTitle(track);
    const artist = getTrackDisplayArtist(track) ?? t("unknownArtist");
    document.title = `${title} - ${artist} | Flaque`;
  }, [track, t, i18n.language]);
}
