import { useCallback, useEffect, useRef } from "react";

import type { AlbumEntry } from "../types";
import { getAlbumKey } from "../utils/appUtils";
import { defaultCoverImage, getAlbumCoverSrc } from "../utils/covers";

import "./Coverflow.css";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Map a scroll-based progress value (0..1) to the coverflow transform.
 *
 * Matches the original CSS animation-timeline keyframes:
 *   0%  → translateX(-100%) rotateY(-45deg)          (entering from right)
 *  35%  → translateX(0)     rotateY(-45deg)
 *  50%  → rotateY(0)        translateZ(1em) scale(1.5) (center)
 *  65%  → translateX(0)     rotateY(45deg)
 * 100%  → translateX(100%)  rotateY(45deg)            (exiting to left)
 */
function coverTransform(progress: number): string {
  const p = Math.max(0, Math.min(1, progress));

  let tx: number;
  let ry: number;
  let tz: number;
  let s: number;

  if (p <= 0.35) {
    const t = p / 0.35;
    tx = lerp(-100, 0, t);
    ry = -45;
    tz = 0;
    s = 1;
  } else if (p <= 0.5) {
    const t = (p - 0.35) / 0.15;
    tx = 0;
    ry = lerp(-45, 0, t);
    tz = lerp(0, 1, t);
    s = lerp(1, 1.5, t);
  } else if (p <= 0.65) {
    const t = (p - 0.5) / 0.15;
    tx = 0;
    ry = lerp(0, 45, t);
    tz = lerp(1, 0, t);
    s = lerp(1.5, 1, t);
  } else {
    const t = (p - 0.65) / 0.35;
    tx = lerp(0, 100, t);
    ry = 45;
    tz = 0;
    s = 1;
  }

  return `perspective(40em) translateX(${tx.toFixed(1)}%) rotateY(${ry.toFixed(1)}deg) translateZ(${tz.toFixed(2)}em) scale(${s.toFixed(3)})`;
}

type CoverflowProps = {
  albums: AlbumEntry[];
  selectedAlbum: AlbumEntry | null;
  onAlbumSelect: (album: AlbumEntry) => void;
};

export function Coverflow({ albums, selectedAlbum, onAlbumSelect }: CoverflowProps): JSX.Element {
  const selectedKey = selectedAlbum ? getAlbumKey(selectedAlbum) : null;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const updateTransforms = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const items = wrapper.querySelectorAll<HTMLElement>(".cards li");
    const scrollLeft = wrapper.scrollLeft;
    const viewWidth = wrapper.clientWidth;
    const centerX = scrollLeft + viewWidth / 2;

    let closestIdx = 0;
    let closestDist = Infinity;

    for (let i = 0; i < items.length; i++) {
      const li = items[i];
      const cover = li.querySelector<HTMLElement>(".cover-transform");
      if (!cover) continue;

      const liCenter = li.offsetLeft + li.offsetWidth / 2;
      const halfRange = viewWidth / 2 + li.offsetWidth / 2;
      const offset = liCenter - centerX;

      const dist = Math.abs(offset);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }

      const progress = 0.5 - (offset / halfRange) * 0.5;
      cover.style.transform = coverTransform(progress);
    }

    // Update the label with the centered album info
    const label = labelRef.current;
    if (label && albums[closestIdx]) {
      const album = albums[closestIdx];
      const titleEl = label.querySelector<HTMLElement>(".coverflow-title");
      const artistEl = label.querySelector<HTMLElement>(".coverflow-artist");
      if (titleEl) titleEl.textContent = album.name;
      if (artistEl) artistEl.textContent = album.artist ?? "";
    }
  }, [albums]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    function onScroll() {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateTransforms);
    }

    wrapper.addEventListener("scroll", onScroll, { passive: true });
    updateTransforms();

    return () => {
      wrapper.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [updateTransforms, albums]);

  // Scroll to the selected album on mount
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !selectedKey) return;

    const items = wrapper.querySelectorAll<HTMLElement>(".cards li");
    for (let i = 0; i < items.length; i++) {
      if (items[i].classList.contains("selected")) {
        wrapper.scrollTo({
          left: items[i].offsetLeft - wrapper.clientWidth / 2 + items[i].offsetWidth / 2,
          behavior: "instant"
        });
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="coverflow">
      <div className="cards-wrapper" ref={wrapperRef}>
        <ul className="cards">
          {albums.map((album) => {
            const albumKey = getAlbumKey(album);
            const isSelected = selectedKey === albumKey;
            const albumTitle = album.artist ? `${album.artist} - ${album.name}` : album.name;
            const coverSrc = getAlbumCoverSrc(album);

            return (
              <li key={albumKey} className={isSelected ? "selected" : undefined}>
                <div className="cover-transform">
                  <img
                    draggable={false}
                    src={coverSrc}
                    width={1200}
                    height={1200}
                    alt={`Cover for ${albumTitle}`}
                    onError={(e) => {
                      e.currentTarget.src = defaultCoverImage;
                      const reflection = e.currentTarget.nextElementSibling as HTMLElement | null;
                      if (reflection) {
                        reflection.style.backgroundImage = `url("${defaultCoverImage}")`;
                      }
                    }}
                    onClick={(e) => {
                      const li = (e.currentTarget as HTMLElement).closest("li");
                      const wrapper = wrapperRef.current;
                      if (li && wrapper) {
                        wrapper.scrollTo({
                          left: li.offsetLeft - wrapper.clientWidth / 2 + li.offsetWidth / 2,
                          behavior: "smooth",
                        });
                      }
                      onAlbumSelect(album);
                    }}
                  />
                  <div
                    className="cover-reflection"
                    style={{ backgroundImage: `url("${coverSrc}")` }}
                    aria-hidden="true"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="coverflow-label" ref={labelRef}>
        <span className="coverflow-title">{(selectedAlbum ?? albums[0])?.name ?? ""}</span>
        <span className="coverflow-artist">{(selectedAlbum ?? albums[0])?.artist ?? ""}</span>
      </div>
    </section>
  );
}
