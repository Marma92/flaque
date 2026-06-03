import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { coverUrl } from "../../api";
import defaultCoverImage from "../../assets/default-cover.png";
import type { Track } from "../../types";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "../../utils/tracks";

type SortableTrackItemProps = {
  id: string;
  track: Track | undefined;
  saving: boolean;
  onRemove: (id: string) => void;
};

export function SortableTrackItem({ id, track, saving, onRemove }: SortableTrackItemProps): JSX.Element {
  const { t } = useTranslation(["playlists", "common"]);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? "relative" as const : undefined
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg bg-flaque-cream/40 px-2 py-1.5 ${
        isDragging ? "shadow-lg ring-2 ring-flaque-sand/60" : ""
      }`}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none rounded p-0.5 text-flaque-steel/50 transition hover:text-flaque-ink active:cursor-grabbing"
        aria-label={t("playlists:track.dragToReorder")}
        {...attributes}
        {...listeners}
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md">
        {track ? (
          <img
            src={coverUrl(track.id)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
          />
        ) : (
          <img src={defaultCoverImage} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-flaque-ink">
          {track ? getTrackDisplayTitle(track) : id}
        </p>
        {track ? (
          <p className="truncate text-[10px] text-flaque-steel">
            {getTrackDisplayArtist(track) ?? t("common:unknownArtist")}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-red-400 transition hover:text-red-600 disabled:opacity-30"
        onClick={() => onRemove(id)}
        disabled={saving}
        aria-label={t("playlists:track.remove")}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}
