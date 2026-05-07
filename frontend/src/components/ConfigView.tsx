import type { Track, TrackMetadataPatch, User } from "../types";
import { FilesSection } from "./config/FilesSection";
import { IndexOpsSection } from "./config/IndexOpsSection";

export type ConfigSection = "index" | "files" | "users" | "server" | "backup" | "library";

export type ConfigViewProps = {
  currentUser: User;
  tracks: Track[];
  ownerNameById?: Record<string, string>;
  loadingTracks: boolean;
  trackError: string | null;
  rebuilding: boolean;
  onRebuildIndex: () => Promise<void>;
  onRefreshTracks: () => Promise<void>;
  onDeleteTrack: (trackId: string) => Promise<void>;
  onUpdateTrackMetadata: (trackId: string, patch: TrackMetadataPatch) => Promise<void>;
  onBulkDeleteTracks: (trackIds: string[]) => Promise<void>;
  onBulkUpdateTrackMetadata: (trackIds: string[], patch: TrackMetadataPatch) => Promise<void>;
  activeSection: ConfigSection;
  onSectionChange: (section: ConfigSection) => void;
};

export function ConfigView({
  tracks,
  ownerNameById,
  loadingTracks,
  trackError,
  rebuilding,
  onRebuildIndex,
  onRefreshTracks,
  onDeleteTrack,
  onUpdateTrackMetadata,
  onBulkDeleteTracks,
  onBulkUpdateTrackMetadata,
  activeSection
}: ConfigViewProps): JSX.Element {
  return (
    <div className="space-y-4">
      {trackError ? (
        <p
          className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="status"
          aria-live="polite"
        >
          {trackError}
        </p>
      ) : null}

      {activeSection === "index" ? (
        <IndexOpsSection
          loadingTracks={loadingTracks}
          rebuilding={rebuilding}
          onRefreshTracks={onRefreshTracks}
          onRebuildIndex={onRebuildIndex}
        />
      ) : null}

      {activeSection === "files" ? (
        <FilesSection
          tracks={tracks}
          ownerNameById={ownerNameById}
          onDeleteTrack={onDeleteTrack}
          onUpdateTrackMetadata={onUpdateTrackMetadata}
          onBulkDeleteTracks={onBulkDeleteTracks}
          onBulkUpdateTrackMetadata={onBulkUpdateTrackMetadata}
        />
      ) : null}
    </div>
  );
}
