import { ChangeEvent, DragEvent, FormEvent, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { UploadTrackPreview, UploadTracksResult } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import { formatDuration } from "../utils/format";

type UploadViewProps = {
  onUpload: (input: {
    files: File[];
    artist?: string;
    album?: string;
    year?: number;
    metadataOverrides?: Array<{
      title?: string;
      artist?: string;
      album?: string;
      year?: number;
      genre?: string[];
    } | null>;
    onProgress?: (input: { loaded: number; total: number; percent: number }) => void;
  }) => Promise<UploadTracksResult>;
  onInspectFile: (file: File) => Promise<UploadTrackPreview>;
};

type PreviewState = {
  loading: boolean;
  preview?: UploadTrackPreview;
  error?: string;
};

function getFileKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function extractYearFromTags(tags?: UploadTrackPreview["tags"]): string | undefined {
  if (!tags) {
    return undefined;
  }

  if (typeof tags.year === "number" && Number.isFinite(tags.year)) {
    return String(Math.trunc(tags.year));
  }

  const dateCandidates = [tags.date, tags.originalDate];
  for (const candidate of dateCandidates) {
    if (!candidate) {
      continue;
    }

    const match = candidate.match(/(?:^|\D)(\d{4})(?:\D|$)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

export function UploadView({ onUpload, onInspectFile }: UploadViewProps): JSX.Element {
  const { t } = useTranslation(["admin", "common"]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inspectRequestRef = useRef(0);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewByFileKey, setPreviewByFileKey] = useState<Record<string, PreviewState>>({});
  const [editableMetadataByFileKey, setEditableMetadataByFileKey] = useState<
    Record<string, { title: string; artist: string; album: string; year: string; genre: string }>
  >({});
  const [uploadArtist, setUploadArtist] = useState("");
  const [uploadAlbum, setUploadAlbum] = useState("");
  const [uploadYear, setUploadYear] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number>(0);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const selectedFileCountLabel = useMemo(() => {
    if (pendingFiles.length === 0) {
      return t("admin:upload.noFiles");
    }

    return t("admin:upload.filesSelected", { count: pendingFiles.length });
  }, [pendingFiles.length, t]);

  async function inspectFiles(files: File[]): Promise<void> {
    const requestId = inspectRequestRef.current + 1;
    inspectRequestRef.current = requestId;

    const initialState: Record<string, PreviewState> = {};
    for (const file of files) {
      initialState[getFileKey(file)] = { loading: true };
    }
    setPreviewByFileKey(initialState);

    await Promise.all(
      files.map(async (file) => {
        const fileKey = getFileKey(file);

        try {
          const preview = await onInspectFile(file);
          if (inspectRequestRef.current !== requestId) {
            return;
          }

          setPreviewByFileKey((current) => ({
            ...current,
            [fileKey]: {
              loading: false,
              preview
            }
          }));
        } catch (error) {
          if (inspectRequestRef.current !== requestId) {
            return;
          }

          setPreviewByFileKey((current) => ({
            ...current,
            [fileKey]: {
              loading: false,
              error: error instanceof Error ? error.message : t("admin:upload.inspectFailed")
            }
          }));
        }
      })
    );
  }

  function setFilesForUpload(files: File[]): void {
    setPendingFiles(files);
    setUploadMessage(null);
    setEditableMetadataByFileKey({});

    if (files.length === 0) {
      inspectRequestRef.current += 1;
      setPreviewByFileKey({});
      return;
    }

    void inspectFiles(files);
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>): void {
    setFilesForUpload(Array.from(event.target.files ?? []));
  }

  function handleDropZoneDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    if (!uploading) {
      setDraggingFiles(true);
    }
  }

  function handleDropZoneDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDraggingFiles(false);
  }

  function handleDropZoneDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDraggingFiles(false);
    if (uploading) {
      return;
    }

    setFilesForUpload(Array.from(event.dataTransfer.files ?? []));
  }

  async function runUpload(): Promise<void> {
    if (pendingFiles.length === 0) {
      setUploadMessage(t("admin:upload.selectFirst"));
      return;
    }

    setUploading(true);
    setUploadProgressPercent(0);
    setUploadMessage(null);

    const metadataOverrides = pendingFiles.map((file) => {
      const fileKey = getFileKey(file);
      const editedMetadata = editableMetadataByFileKey[fileKey];
      if (!editedMetadata) {
        return null;
      }

      const title = editedMetadata.title.trim();
      const artist = editedMetadata.artist.trim();
      const album = editedMetadata.album.trim();
      const yearStr = editedMetadata.year.trim();
      const yearNum = yearStr ? Number(yearStr) : undefined;
      const year = yearNum && Number.isInteger(yearNum) && yearNum >= 1000 && yearNum <= 2999 ? yearNum : undefined;
      const genreStr = editedMetadata.genre.trim();
      const genre = genreStr
        ? genreStr.split(",").map((g) => g.trim()).filter(Boolean)
        : undefined;
      if (!title && !artist && !album && year === undefined && !genre) {
        return null;
      }

      return {
        title: title || undefined,
        artist: artist || undefined,
        album: album || undefined,
        year,
        genre: genre && genre.length > 0 ? genre : undefined
      };
    });

    try {
      const globalYearStr = uploadYear.trim();
      const globalYearNum = globalYearStr ? Number(globalYearStr) : undefined;
      const globalYear = globalYearNum && Number.isInteger(globalYearNum) && globalYearNum >= 1000 && globalYearNum <= 2999
        ? globalYearNum
        : undefined;

      const result = await onUpload({
        files: pendingFiles,
        artist: uploadArtist.trim() || undefined,
        album: uploadAlbum.trim() || undefined,
        year: globalYear,
        metadataOverrides,
        onProgress: (progress) => {
          setUploadProgressPercent(progress.percent);
        }
      });

      const dedupMessage =
        result.deduplicated > 0 ? t("admin:upload.dedup", { count: result.deduplicated }) : "";
      setUploadMessage(
        t("admin:upload.uploadComplete", { uploaded: result.uploaded, count: result.processed, dedup: dedupMessage })
      );
      setUploadProgressPercent(100);

      setPendingFiles([]);
      setPreviewByFileKey({});
      setEditableMetadataByFileKey({});
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setUploadProgressPercent(0);
      setUploadMessage(error instanceof Error ? error.message : t("admin:upload.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await runUpload();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h2 className="font-display text-2xl text-flaque-ink">{t("admin:upload.title")}</h2>
        <p className="mt-2 text-sm text-flaque-steel">
          {t("admin:upload.description")}
        </p>

        <form className="mt-4 space-y-4" onSubmit={handleUploadSubmit}>
          <label className="block text-sm text-flaque-ink" htmlFor="upload-audio-files">
            {t("admin:upload.filesLabel")}
          </label>

          <input
            id="upload-audio-files"
            ref={fileInputRef}
            className="sr-only"
            type="file"
            multiple
            accept=".flac,.mp3,.wav,.ogg,.opus,.m4a"
            disabled={uploading}
            onChange={handleFileSelection}
          />

          <div
            className={`rounded-2xl border border-dashed px-4 py-5 text-center transition ${
              draggingFiles
                ? "border-flaque-ink bg-flaque-cream/75"
                : "border-flaque-clay/70 bg-flaque-cream/35 hover:bg-flaque-cream/50"
            } ${uploading ? "opacity-70" : "cursor-pointer"}`}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onDrop={handleDropZoneDrop}
            onClick={() => {
              if (!uploading) {
                fileInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={uploading ? -1 : 0}
            onKeyDown={(event) => {
              if (uploading) {
                return;
              }

              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <p className="text-sm font-medium text-flaque-ink">{t("admin:upload.dropHere")}</p>
            <p className="mt-1 text-xs text-flaque-steel">{t("admin:upload.orBrowse")}</p>
          </div>

          <p className="text-sm text-flaque-steel">{selectedFileCountLabel}</p>

          <p className="text-xs text-flaque-steel/90">{t("admin:upload.supportedFormats")}</p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="text-sm text-flaque-ink">
              {t("admin:upload.artistOverride")}
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                value={uploadArtist}
                onChange={(event) => setUploadArtist(event.target.value)}
                disabled={uploading}
                placeholder={t("admin:upload.applyArtist")}
              />
            </label>

            <label className="text-sm text-flaque-ink">
              {t("admin:upload.albumOverride")}
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                value={uploadAlbum}
                onChange={(event) => setUploadAlbum(event.target.value)}
                disabled={uploading}
                placeholder={t("admin:upload.applyAlbum")}
              />
            </label>

            <label className="text-sm text-flaque-ink">
              {t("admin:upload.yearOverride")}
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                inputMode="numeric"
                value={uploadYear}
                onChange={(event) => setUploadYear(event.target.value)}
                disabled={uploading}
                placeholder={t("admin:fields.yearPlaceholder")}
              />
            </label>

            <div className="flex items-end">
              <button
                className="w-full rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={uploading || pendingFiles.length === 0}
              >
                {uploading
                  ? t("admin:upload.uploading")
                  : t("admin:upload.uploadFiles", { count: pendingFiles.length })}
              </button>
            </div>
          </div>

          {uploading ? (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-flaque-clay/40">
                <div
                  className="h-full rounded-full bg-flaque-ink transition-[width] duration-200"
                  style={{ width: `${uploadProgressPercent}%` }}
                />
              </div>
              <p className="text-xs text-flaque-steel">Uploading... {uploadProgressPercent}%</p>
            </div>
          ) : null}
        </form>

        {uploadMessage ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-flaque-steel" role="status" aria-live="polite">
              {uploadMessage}
            </p>
            {pendingFiles.length > 0 && !uploading ? (
              <button
                className="rounded-lg border border-flaque-clay bg-white px-3 py-1 text-xs text-flaque-ink transition hover:bg-flaque-cream"
                type="button"
                onClick={() => {
                  void runUpload();
                }}
              >
                {t("admin:upload.retry")}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {pendingFiles.length > 0 ? (
        <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
          <h3 className="font-display text-xl text-flaque-ink">{t("admin:upload.metadataPreview")}</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pendingFiles.map((file) => {
              const fileKey = getFileKey(file);
              const previewState = previewByFileKey[fileKey];
              const preview = previewState?.preview;
              const title = preview?.tags.title?.trim() || file.name;
              const artist =
                preview?.tags.artist?.trim() ||
                preview?.tags.albumArtist?.trim() ||
                preview?.tags.artists?.find((entry) => entry.trim()) ||
                t("common:unknownArtist");
              const year = extractYearFromTags(preview?.tags);
              const albumBase = preview?.tags.album?.trim() || t("admin:upload.unknownAlbum");
              const album = year ? `${albumBase} (${year})` : albumBase;
              const genreFromTags = preview?.tags.genre?.join(", ") ?? "";
              const editableMetadata = editableMetadataByFileKey[fileKey];
              const editableTitle = editableMetadata?.title ?? title;
              const editableArtist = editableMetadata?.artist ?? artist;
              const editableAlbum = editableMetadata?.album ?? albumBase;
              const editableYear = editableMetadata?.year ?? (year ?? "");
              const editableGenre = editableMetadata?.genre ?? genreFromTags;
              const trackPosition =
                typeof preview?.tags.trackNumber === "number"
                  ? `${preview.tags.trackNumber}${
                      typeof preview.tags.trackTotal === "number" ? `/${preview.tags.trackTotal}` : ""
                    }`
                  : undefined;

              return (
                <article key={fileKey} className="rounded-2xl border border-flaque-clay/60 bg-flaque-cream/45 p-4">
                  <div className="flex items-start gap-4">
                    <img
                      className="h-20 w-20 shrink-0 rounded-xl border border-flaque-clay/60 object-cover"
                      src={preview?.coverDataUrl ?? defaultCoverImage}
                      alt={t("admin:upload.coverAlt", { name: file.name })}
                    />

                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="truncate font-medium text-flaque-ink" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-xs text-flaque-steel">{formatFileSize(file.size)}</p>

                      {previewState?.loading ? (
                        <p className="text-xs text-flaque-steel">{t("admin:upload.readingMetadata")}</p>
                      ) : previewState?.error ? (
                        <p className="text-xs text-red-700">{previewState.error}</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 text-sm">
                          <label className="text-flaque-steel">
                            {t("admin:fields.title")}
                            <input
                              className="mt-1 w-full rounded-lg border border-flaque-clay bg-white px-2 py-1 text-flaque-ink"
                              value={editableTitle}
                              disabled={uploading}
                              onChange={(event) => {
                                const nextTitle = event.target.value;
                                setEditableMetadataByFileKey((current) => ({
                                  ...current,
                                  [fileKey]: {
                                    title: nextTitle,
                                    artist: current[fileKey]?.artist ?? editableArtist,
                                    album: current[fileKey]?.album ?? editableAlbum,
                                    year: current[fileKey]?.year ?? editableYear,
                                    genre: current[fileKey]?.genre ?? editableGenre
                                  }
                                }));
                              }}
                            />
                          </label>
                          <label className="text-flaque-steel">
                            {t("admin:fields.artist")}
                            <input
                              className="mt-1 w-full rounded-lg border border-flaque-clay bg-white px-2 py-1 text-flaque-ink"
                              value={editableArtist}
                              disabled={uploading}
                              onChange={(event) => {
                                const nextArtist = event.target.value;
                                setEditableMetadataByFileKey((current) => ({
                                  ...current,
                                  [fileKey]: {
                                    title: current[fileKey]?.title ?? editableTitle,
                                    artist: nextArtist,
                                    album: current[fileKey]?.album ?? editableAlbum,
                                    year: current[fileKey]?.year ?? editableYear,
                                    genre: current[fileKey]?.genre ?? editableGenre
                                  }
                                }));
                              }}
                            />
                          </label>
                          <label className="text-flaque-steel">
                            {t("admin:fields.album")}
                            <input
                              className="mt-1 w-full rounded-lg border border-flaque-clay bg-white px-2 py-1 text-flaque-ink"
                              value={editableAlbum}
                              disabled={uploading}
                              onChange={(event) => {
                                const nextAlbum = event.target.value;
                                setEditableMetadataByFileKey((current) => ({
                                  ...current,
                                  [fileKey]: {
                                    title: current[fileKey]?.title ?? editableTitle,
                                    artist: current[fileKey]?.artist ?? editableArtist,
                                    album: nextAlbum,
                                    year: current[fileKey]?.year ?? editableYear,
                                    genre: current[fileKey]?.genre ?? editableGenre
                                  }
                                }));
                              }}
                            />
                          </label>

                          <label className="text-flaque-steel">
                            {t("admin:fields.year")}
                            <input
                              className="mt-1 w-full rounded-lg border border-flaque-clay bg-white px-2 py-1 text-flaque-ink"
                              value={editableYear}
                              disabled={uploading}
                              inputMode="numeric"
                              placeholder={t("admin:fields.yearPlaceholder")}
                              onChange={(event) => {
                                const nextYear = event.target.value;
                                setEditableMetadataByFileKey((current) => ({
                                  ...current,
                                  [fileKey]: {
                                    title: current[fileKey]?.title ?? editableTitle,
                                    artist: current[fileKey]?.artist ?? editableArtist,
                                    album: current[fileKey]?.album ?? editableAlbum,
                                    year: nextYear,
                                    genre: current[fileKey]?.genre ?? editableGenre
                                  }
                                }));
                              }}
                            />
                          </label>

                          <label className="text-flaque-steel">
                            {t("admin:fields.genre")}
                            <input
                              className="mt-1 w-full rounded-lg border border-flaque-clay bg-white px-2 py-1 text-flaque-ink"
                              value={editableGenre}
                              disabled={uploading}
                              placeholder={t("admin:fields.genrePlaceholder")}
                              onChange={(event) => {
                                const nextGenre = event.target.value;
                                setEditableMetadataByFileKey((current) => ({
                                  ...current,
                                  [fileKey]: {
                                    title: current[fileKey]?.title ?? editableTitle,
                                    artist: current[fileKey]?.artist ?? editableArtist,
                                    album: current[fileKey]?.album ?? editableAlbum,
                                    year: current[fileKey]?.year ?? editableYear,
                                    genre: nextGenre
                                  }
                                }));
                              }}
                            />
                            <span className="mt-0.5 block text-[10px] text-flaque-steel/80">{t("admin:fields.commaSeparated")}</span>
                          </label>

                          <p className="text-xs text-flaque-steel">
                            {preview?.codec?.toUpperCase() ?? t("admin:upload.unknownCodec")}
                            {preview?.duration ? ` - ${formatDuration(preview.duration)}` : ""}
                            {trackPosition ? t("admin:upload.trackSuffix", { position: trackPosition }) : ""}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
