import type { JSX } from "react";
import { useTranslation } from "react-i18next";

type PlayerEmptyProps = {
  expanded: boolean;
  onNavigateToLibrary?: () => void;
};

export function PlayerEmpty({ expanded, onNavigateToLibrary }: PlayerEmptyProps): JSX.Element {
  const { t } = useTranslation("player");
  return (
    <section className={expanded
      ? "flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl m-4 border border-flaque-clay/50 bg-white/75 p-6 shadow-panel backdrop-blur-sm"
      : "rounded-3xl border border-flaque-clay/60 bg-white/85 p-6 shadow-panel backdrop-blur-sm"
    }>
      <h2 className="font-display text-xl text-flaque-ink">{t("empty.title")}</h2>
      <p className="mt-2 text-sm text-flaque-steel">
        {t("empty.subtitle")}
      </p>
      {onNavigateToLibrary ? (
        <button
          className="mt-4 rounded-xl border border-flaque-clay/60 bg-flaque-cream/80 px-4 py-2 text-sm font-medium text-flaque-ink transition hover:bg-flaque-sand"
          type="button"
          onClick={onNavigateToLibrary}
        >
          {t("empty.browseLibrary")}
        </button>
      ) : null}
    </section>
  );
}
