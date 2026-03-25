import type { Track } from "../types";
import type { UploadPeriod } from "../hooks/useRecentlyUploaded";
import { TrackCardGrid } from "./TrackCardGrid";

type RecentlyUploadedPanelProps = {
  tracks: Track[];
  loading: boolean;
  period: UploadPeriod;
  onPeriodChange: (period: UploadPeriod) => void;
  onTrackSelect: (track: Track) => void;
  gridClassName?: string;
};

const periodOptions: { value: UploadPeriod; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" }
];

export function RecentlyUploadedPanel({
  tracks,
  loading,
  period,
  onPeriodChange,
  onTrackSelect,
  gridClassName
}: RecentlyUploadedPanelProps): JSX.Element | null {
  if (!loading && tracks.length === 0) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl text-flaque-ink">Recently Uploaded</h2>
        <div className="flex gap-1">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                period === option.value
                  ? "bg-flaque-ink text-white"
                  : "border border-flaque-clay bg-white text-flaque-steel hover:bg-flaque-cream"
              }`}
              type="button"
              onClick={() => onPeriodChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading && tracks.length === 0 ? (
        <p className="mt-3 text-sm text-flaque-steel">Loading...</p>
      ) : (
        <TrackCardGrid tracks={tracks} onTrackSelect={onTrackSelect} gridClassName={gridClassName} />
      )}
    </section>
  );
}
