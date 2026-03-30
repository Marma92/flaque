import { useEffect, useMemo, useRef } from "react";

import type { SyncedLyricsLine } from "../utils/tracks";

type SyncedLyricsOverlayProps = {
  lines: SyncedLyricsLine[];
  currentTime: number;
};

export function SyncedLyricsOverlay({ lines, currentTime }: SyncedLyricsOverlayProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeIndexRef = useRef(-1);

  const activeIndex = useMemo(() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (currentTime >= lines[i].t) return i;
    }
    return -1;
  }, [lines, currentTime]);

  useEffect(() => {
    if (activeIndex === activeIndexRef.current) return;
    activeIndexRef.current = activeIndex;

    const container = containerRef.current;
    if (!container || activeIndex < 0) return;

    const activeElement = container.children[activeIndex] as HTMLElement | undefined;
    if (!activeElement) return;

    activeElement.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto overflow-x-hidden text-left text-sm leading-relaxed">
      {lines.map((line, index) => (
        <p
          key={index}
          className={`py-0.5 transition-all duration-300 ${
            index === activeIndex
              ? "text-[#ffffff] font-medium scale-[1.02] origin-left"
              : index < activeIndex
                ? "text-[#ffffff]/50"
                : "text-[#ffffff]/30"
          }`}
        >
          {line.text}
        </p>
      ))}
    </div>
  );
}
