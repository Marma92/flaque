import type { AlbumListProps } from "./AlbumList";
import { getAlbumKey } from "../utils/appUtils";

export function Coverflow({ albums, selectedAlbum, onAlbumSelect, getAlbumCoverSrc }: AlbumListProps): JSX.Element {
  const selectedKey = selectedAlbum ? getAlbumKey(selectedAlbum) : null;

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
          gap: 1em;
          padding: 0.25rem 0;
          overscroll-behavior: contain;
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
          --size: 6;
          min-height: calc(var(--cover-size) * 2.35);
          width: calc(var(--cover-size) * var(--size));
          margin: 0;
          padding: calc(var(--cover-size) / 2.4) 0;
          position: relative;
          max-width: 100%;
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

        .cards li img {
          display: block;
          width: var(--cover-size);
          height: var(--cover-size);
          border: 1px solid rgb(var(--flaque-clay-rgb) / 0.65);
          border-radius: 0.6rem;
          -webkit-box-reflect: below 0.5em linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.25));
          animation: linear rotate-cover both;
          animation-timeline: view(inline);
          transform: translateX(-100%) rotateY(-45deg);
          transform-style: preserve-3d;
          will-change: transform;
          position: relative;
          user-select: none;
          transition: border-color 160ms ease;
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

        @keyframes rotate-cover {
          0% {
            transform: translateX(-100%) rotateY(-45deg);
          }
          35% {
            transform: translateX(0) rotateY(-45deg);
          }
          50% {
            transform: rotateY(0deg) translateZ(1em) scale(1.5);
          }
          65% {
            transform: translateX(0) rotateY(45deg);
          }
          100% {
            transform: translateX(100%) rotateY(45deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .cards li img {
            animation: none;
            transform: none;
          }
        }
      `}</style>

      <section className="coverflow">
        <div className="cards-wrapper">
          <ul className="cards">
            {albums.map((album) => {
              const albumKey = getAlbumKey(album);
              const isSelected = selectedKey === albumKey;
              const albumTitle = album.artist ? `${album.artist} - ${album.name}` : album.name;

              return (
                <li key={albumKey} className={isSelected ? "selected" : undefined}>
                  {/* <button
                    type="button"
                    onClick={() => onAlbumSelect(album)}
                    title={albumTitle}
                    aria-pressed={isSelected}
                  > */}
                    <img draggable={false} src={getAlbumCoverSrc(album)} width={1200} height={1200} alt={`Cover for ${albumTitle}`} onClick={() => onAlbumSelect(album)} />
                  {/* </button> */}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </>
  );
}
