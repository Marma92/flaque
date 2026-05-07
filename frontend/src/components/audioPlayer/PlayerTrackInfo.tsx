import type { JSX } from "react";

type PlayerTrackInfoProps = {
  expanded: boolean;
  isRadioStopped: boolean;
  displayTitle: string;
  displayArtist: string;
  displayAlbumWithYear: string | undefined;
  codecLabel: string;
  hasLyrics: boolean;
  canOpenTrackArtist: boolean;
  canOpenTrackAlbum: boolean;
  onOpenTrackArtist?: () => void;
  onOpenTrackAlbum?: () => void;
};

export function PlayerTrackInfo({
  expanded,
  isRadioStopped,
  displayTitle,
  displayArtist,
  displayAlbumWithYear,
  codecLabel,
  hasLyrics,
  canOpenTrackArtist,
  canOpenTrackAlbum,
  onOpenTrackArtist,
  onOpenTrackAlbum
}: PlayerTrackInfoProps): JSX.Element {
  const secondaryTextClassName = expanded
    ? "truncate text-sm text-flaque-steel/90"
    : "overflow-x-auto scrollbar-hide whitespace-nowrap text-sm text-flaque-steel";
  const metaTextClassName = expanded
    ? "text-xs uppercase tracking-[0.2em] text-flaque-steel/70"
    : "font-body text-[10px] text-flaque-steel/80";
  const textBlockClassName = expanded ? "space-y-1" : "space-y-0.5";

  if (isRadioStopped) {
    return (
      <div className={textBlockClassName}>
        <p className={`font-display text-flaque-ink leading-tight ${expanded ? "text-2xl" : "text-lg"}`}>
          Radio stopped
        </p>
      </div>
    );
  }

  return (
    <div className={textBlockClassName}>
      {expanded ? (
        <p
          className="font-display text-flaque-ink leading-tight text-2xl truncate"
          title={displayTitle}
        >
          {displayTitle}
        </p>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <p
            className="min-w-0 truncate font-display text-flaque-ink leading-tight text-lg"
            title={displayTitle}
          >
            {displayTitle}
          </p>
          {hasLyrics ? (
            <span className="shrink-0 rounded bg-flaque-ink/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-flaque-ink/70 dark:bg-flaque-cream/10 dark:text-flaque-cream/70">
              L<span className="hidden sm:inline">yrics</span>
            </span>
          ) : null}
        </div>
      )}
      {expanded ? (
        <>
          <p className={secondaryTextClassName}>
            {canOpenTrackArtist ? (
              <button
                className="max-w-full truncate rounded-sm text-left underline-offset-2 transition hover:text-flaque-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand/70"
                type="button"
                title={`Open artist: ${displayArtist}`}
                onClick={onOpenTrackArtist}
              >
                {displayArtist}
              </button>
            ) : (
              displayArtist
            )}
          </p>
          {displayAlbumWithYear ? (
            <p className="truncate text-xs text-flaque-steel/80">
              {canOpenTrackAlbum ? (
                <button
                  className="max-w-full truncate rounded-sm text-left underline-offset-2 transition hover:text-flaque-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand/70"
                  type="button"
                  title={`Open album: ${displayAlbumWithYear}`}
                  onClick={onOpenTrackAlbum}
                >
                  {displayAlbumWithYear}
                </button>
              ) : (
                displayAlbumWithYear
              )}
            </p>
          ) : null}
          <p className={metaTextClassName}>
            {codecLabel}
            {hasLyrics ? (
              <span className="ml-2 rounded bg-flaque-ink/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-flaque-ink/70 dark:bg-flaque-cream/10 dark:text-flaque-cream/70">
                Lyrics
              </span>
            ) : null}
          </p>
        </>
      ) : (
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 overflow-x-auto scrollbar-hide whitespace-nowrap font-body text-xs text-flaque-steel">
            {canOpenTrackArtist ? (
              <button
                className="rounded-sm text-left underline-offset-2 transition hover:text-flaque-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand/70"
                type="button"
                title={`Open artist: ${displayArtist}`}
                onClick={onOpenTrackArtist}
              >
                {displayArtist}
              </button>
            ) : (
              displayArtist
            )}
            {displayAlbumWithYear ? (
              <>
                {" - "}
                {canOpenTrackAlbum ? (
                  <button
                    className="rounded-sm text-left underline-offset-2 transition hover:text-flaque-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand/70"
                    type="button"
                    title={`Open album: ${displayAlbumWithYear}`}
                    onClick={onOpenTrackAlbum}
                  >
                    {displayAlbumWithYear}
                  </button>
                ) : (
                  displayAlbumWithYear
                )}
              </>
            ) : null}
          </p>
          <p className={`${metaTextClassName} shrink-0 whitespace-nowrap`}>{codecLabel}</p>
        </div>
      )}
    </div>
  );
}
