import { useCallback, useEffect, useRef } from "react";

import type { AlbumListProps } from "./AlbumList";
import { getAlbumKey } from "../utils/appUtils";

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

  return `translateX(${tx.toFixed(1)}%) rotateY(${ry.toFixed(1)}deg) translateZ(${tz.toFixed(2)}em) scale(${s.toFixed(3)})`;
}

export function Coverflow({ albums, selectedAlbum, onAlbumSelect, getAlbumCoverSrc }: AlbumListProps): JSX.Element {
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

  return (
    <>
      <style>{`
        .coverflow, .coverflow * {
          box-sizing: border-box;
          padding: 0;
          margin: 0;
        }

        .coverflow {
          --cover-size: 11rem;
          width: 100%;
          font-family: "IBM Plex Sans", sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1em;
          padding: 0.25rem 0;
          overscroll-behavior: contain;
        }

        @media (min-width: 1280px) {
          .coverflow {
            --cover-size: 14rem;
          }
        }

        @media (max-width: 1024px) {
          .coverflow {
            --cover-size: 9rem;
          }
        }

        @media (max-width: 600px) {
          .coverflow {
            --cover-size: 6rem;
          }
        }

        .cards-wrapper {
          overflow-x: scroll;
          min-height: calc(var(--cover-size) * 2.6);
          width: 100%;
          margin: 0 auto;
          padding: calc(var(--cover-size) / 2.4) 0;
          position: relative;
          perspective: 40em;
          scroll-snap-type: x mandatory;
          scrollbar-width: thin;
        }

        .cards {
          list-style: none;
          white-space: nowrap;
          transform-style: preserve-3d;
        }

        .cards-wrapper li {
          scroll-snap-align: center;
        }

        .cards li {
          display: inline-block;
          width: var(--cover-size);
          height: var(--cover-size);
          transform-style: preserve-3d;
        }

        .cover-transform {
          transform-style: preserve-3d;
          will-change: transform;
          transform: translateX(-100%) rotateY(-45deg);
        }

        .cover-transform img {
          display: block;
          width: var(--cover-size);
          height: var(--cover-size);
          border: 1px solid rgb(var(--flaque-clay-rgb) / 0.65);
          border-radius: 0.6rem;
          position: relative;
          user-select: none;
          transition: border-color 160ms ease;
          cursor: pointer;
        }

        .cover-reflection {
          width: var(--cover-size);
          height: calc(var(--cover-size) * 0.45);
          margin-top: 0.5em;
          background-size: var(--cover-size) var(--cover-size);
          background-position: bottom;
          transform: scaleY(-1);
          -webkit-mask-image: linear-gradient(to top, rgba(0,0,0,0.22), transparent);
          mask-image: linear-gradient(to top, rgba(0,0,0,0.22), transparent);
          border-radius: 0.6rem;
          pointer-events: none;
        }

        .cards li button {
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
        }

        .cards li button:focus-visible {
          outline: 2px solid rgb(var(--flaque-ink-rgb));
          outline-offset: 2px;
          border-radius: 0.7rem;
        }

        .cards li.selected img {
          border-color: rgb(var(--flaque-ink-rgb) / 0.5);
        }

        .cards li:first-of-type {
          margin-left: calc(50% - (var(--cover-size) / 2));
        }

        .cards li:last-of-type {
          margin-right: calc(50% - (var(--cover-size) / 2));
        }

        .coverflow {
          position: relative;
        }

        .coverflow-label {
          position: absolute;
          top: calc(0.25rem + var(--cover-size) * 1.667);
          left: 0;
          right: 0;
          text-align: center;
          line-height: 1.3;
          display: flex;
          flex-direction: column;
          align-items: center;
          pointer-events: none;
          z-index: 1;
        }

        .coverflow-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: rgb(var(--flaque-ink-rgb));
          max-width: 20rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .coverflow-artist {
          font-size: 0.8rem;
          color: rgb(var(--flaque-steel-rgb));
          max-width: 20rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (prefers-reduced-motion: reduce) {
          .cover-transform {
            transform: none !important;
          }
        }
      `}</style>

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
          <span className="coverflow-title">{albums[0]?.name ?? ""}</span>
          <span className="coverflow-artist">{albums[0]?.artist ?? ""}</span>
        </div>
      </section>
    </>
  );
}
