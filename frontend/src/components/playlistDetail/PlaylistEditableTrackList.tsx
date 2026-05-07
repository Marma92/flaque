import type { JSX } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable";

import type { Track } from "../../types";
import { SortableTrackItem } from "./SortableTrackItem";

type PlaylistEditableTrackListProps = {
  trackIds: string[];
  allTracksById: Map<string, Track>;
  saving: boolean;
  onTrackIdsChange: (next: string[]) => void;
};

export function PlaylistEditableTrackList({
  trackIds,
  allTracksById,
  saving,
  onTrackIdsChange
}: PlaylistEditableTrackListProps): JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = trackIds.indexOf(active.id as string);
    const newIndex = trackIds.indexOf(over.id as string);
    onTrackIdsChange(arrayMove(trackIds, oldIndex, newIndex));
  }

  function handleRemove(id: string): void {
    onTrackIdsChange(trackIds.filter((t) => t !== id));
  }

  return (
    <div className="rounded-2xl border border-flaque-clay/60 bg-white/85 shadow-panel backdrop-blur-sm">
      <div className="px-4 pt-3 pb-1">
        <p className="text-sm font-medium text-flaque-ink">
          Tracks <span className="text-flaque-steel">({trackIds.length})</span>
        </p>
      </div>
      {trackIds.length === 0 ? (
        <p className="px-5 py-4 text-sm text-flaque-steel">No tracks in this playlist.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={trackIds} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1 p-3">
              {trackIds.map((id) => (
                <SortableTrackItem
                  key={id}
                  id={id}
                  track={allTracksById.get(id)}
                  saving={saving}
                  onRemove={handleRemove}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
