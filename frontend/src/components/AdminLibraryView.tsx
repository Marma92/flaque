import { useRef, useState } from "react";

import { AiRecommendationPanel } from "./adminLibrary/AiRecommendationPanel";
import { AutoPlaylistConfigPanel } from "./adminLibrary/AutoPlaylistConfigPanel";
import { EnrichmentLogPanel } from "./adminLibrary/EnrichmentLogPanel";
import { EnrichmentPanel } from "./adminLibrary/EnrichmentPanel";
import { GenreSynonymsPanel, type GenreSynonymsPanelHandle } from "./adminLibrary/GenreSynonymsPanel";
import { LibraryLabelsPanel } from "./adminLibrary/LibraryLabelsPanel";

type AdminLibraryViewProps = {
  onAutoPlaylistsRegenerated?: () => void;
};

export function AdminLibraryView({ onAutoPlaylistsRegenerated }: AdminLibraryViewProps): JSX.Element {
  // Bumped to force the LibraryLabelsPanel to re-fetch after the
  // synonym table changes (add/delete/reset/reapply).
  const [labelRefreshKey, setLabelRefreshKey] = useState(0);
  // Bumped on every enrichment status poll while a run is in progress
  // so the log panel keeps pace.
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  const synonymsRef = useRef<GenreSynonymsPanelHandle | null>(null);

  return (
    <div className="m-4 space-y-4">
      <GenreSynonymsPanel
        ref={synonymsRef}
        onSynonymsChanged={() => setLabelRefreshKey((k) => k + 1)}
      />

      <LibraryLabelsPanel
        refreshKey={labelRefreshKey}
        onPromote={(label) => synonymsRef.current?.promoteLabel(label)}
      />

      <EnrichmentPanel
        onPollTick={(status) => {
          if (status.running) setLogRefreshKey((k) => k + 1);
        }}
      />

      <EnrichmentLogPanel refreshKey={logRefreshKey} />

      <AutoPlaylistConfigPanel onAutoPlaylistsRegenerated={onAutoPlaylistsRegenerated} />

      <AiRecommendationPanel />
    </div>
  );
}
