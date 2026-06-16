import { useTranslation } from "react-i18next";

import type { Track } from "../types";
import { TrackCardGrid } from "./TrackCardGrid";

type RecentTracksPanelProps = {
  tracks: Track[];
  onTrackReplay: (track: Track) => void;
  gridClassName?: string;
};

/**
 * Compact list of recently played tracks shown in the Library view.
 */
export function RecentTracksPanel({ tracks, onTrackReplay, gridClassName }: RecentTracksPanelProps): JSX.Element | null {
  const { t } = useTranslation("home");

  if (tracks.length === 0) {
    return null;
  }

  const visibleTracks = tracks.slice(0, 12);

  return (
    <section className="flaque-panel p-5">
      <h2 className="font-display text-xl text-flaque-ink">{t("playedRecently")}</h2>
      <TrackCardGrid tracks={visibleTracks} onTrackSelect={onTrackReplay} gridClassName={gridClassName} />
    </section>
  );
}
