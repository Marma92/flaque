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
  ownerNameById?: Record<string, string>;
};

const periodOptions: { value: UploadPeriod; label: string; shortLabel: string }[] = [
  { value: "7d", label: "7 days", shortLabel: "7d" },
  { value: "30d", label: "30 days", shortLabel: "30d" }
];

export function RecentlyUploadedPanel({
  tracks,
  loading,
  period,
  onPeriodChange,
  onTrackSelect,
  gridClassName,
  ownerNameById
}: RecentlyUploadedPanelProps): JSX.Element | null {
  if (!loading && tracks.length === 0) {
    return null;
  }

  return (
    <section className="border border-flaque-clay/60 rounded-xl bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="shrink-0 font-display text-xl text-flaque-ink">Recent Uploads</h2>
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
              <span className="md:hidden">{option.shortLabel}</span>
              <span className="hidden md:inline">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && tracks.length === 0 ? (
        <p className="mt-3 text-sm text-flaque-steel">Loading...</p>
      ) : (
        <TrackCardGrid tracks={tracks} onTrackSelect={onTrackSelect} gridClassName={gridClassName} ownerNameById={ownerNameById} showOwner />
      )}
    </section>
  );
}
