/**
 * Inline section header used to group library content (artists by letter,
 * albums by letter or year). Renders the label next to a fading divider.
 */
export function SectionLabel({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-semibold text-flaque-steel">{label}</span>
      <div
        className="flex-1 h-[2px] border-t-[2px] border-flaque-clay/40"
        style={{
          maskImage: "linear-gradient(to right, black 50%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, black 50%, transparent)"
        }}
      />
    </div>
  );
}
