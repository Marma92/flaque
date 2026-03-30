import { ChangeEvent, DragEvent, FormEvent, useMemo, useRef, useState } from "react";

import type { UploadTrackPreview, UploadTracksResult } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import { formatDuration } from "../utils/format";

type UploadViewProps = {
  onUpload: (input: {
    files: File[];
    artist?: string;
    album?: string;
    metadataOverrides?: Array<{
      title?: string;
      artist?: string;
      album?: string;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inspectRequestRef = useRef(0);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewByFileKey, setPreviewByFileKey] = useState<Record<string, PreviewState>>({});
  const [editableMetadataByFileKey, setEditableMetadataByFileKey] = useState<
    Record<string, { title: string; artist: string; album: string }>
  >({});
  const [uploadArtist, setUploadArtist] = useState("");
  const [uploadAlbum, setUploadAlbum] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number>(0);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const selectedFileCountLabel = useMemo(() => {
    if (pendingFiles.length === 0) {
      return "No files selected yet";
    }

    return `${pendingFiles.length} file${pendingFiles.length > 1 ? "s" : ""} selected`;
  }, [pendingFiles.length]);

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
              error: error instanceof Error ? error.message : "Unable to inspect metadata"
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
      setUploadMessage("Select at least one file before uploading.");
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
      if (!title && !artist && !album) {
        return null;
      }

      return {
        title: title || undefined,
        artist: artist || undefined,
        album: album || undefined
      };
    });

    try {
      const result = await onUpload({
        files: pendingFiles,
        artist: uploadArtist.trim() || undefined,
        album: uploadAlbum.trim() || undefined,
        metadataOverrides,
        onProgress: (progress) => {
          setUploadProgressPercent(progress.percent);
        }
      });

      const dedupMessage =
        result.deduplicated > 0 ? ` (${result.deduplicated} duplicate${result.deduplicated > 1 ? "s" : ""} skipped)` : "";
      setUploadMessage(
        `Upload complete: ${result.uploaded}/${result.processed} file${result.processed > 1 ? "s" : ""} stored${dedupMessage}.`
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
      setUploadMessage(error instanceof Error ? error.message : "Upload failed");
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
        <h2 className="font-display text-2xl text-flaque-ink">Upload</h2>
        <p className="mt-2 text-sm text-flaque-steel">
          Select audio files to preview metadata and embedded cover before storing them in your library.
        </p>

        <form className="mt-4 space-y-4" onSubmit={handleUploadSubmit}>
          <label className="block text-sm text-flaque-ink" htmlFor="upload-audio-files">
            Files
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
            <p className="text-sm font-medium text-flaque-ink">Drag and drop audio files here</p>
            <p className="mt-1 text-xs text-flaque-steel">or click to browse your local files</p>
          </div>

          <p className="text-sm text-flaque-steel">{selectedFileCountLabel}</p>

          <p className="text-xs text-flaque-steel/90">Supported formats: FLAC, MP3, WAV, OGG, Opus, M4A.</p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-sm text-flaque-ink">
              Artist override (optional)
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                value={uploadArtist}
                onChange={(event) => setUploadArtist(event.target.value)}
                disabled={uploading}
                placeholder="Apply artist to all uploaded files"
              />
            </label>

            <label className="text-sm text-flaque-ink">
              Album override (optional)
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                value={uploadAlbum}
                onChange={(event) => setUploadAlbum(event.target.value)}
                disabled={uploading}
                placeholder="Apply album to all uploaded files"
              />
            </label>

            <div className="flex items-end">
              <button
                className="w-full rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={uploading || pendingFiles.length === 0}
              >
                {uploading
                  ? "Uploading..."
                  : `Upload ${pendingFiles.length} file${pendingFiles.length > 1 ? "s" : ""}`}
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
                Retry upload
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {pendingFiles.length > 0 ? (
        <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
          <h3 className="font-display text-xl text-flaque-ink">Metadata preview</h3>
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
                "Unknown artist";
              const year = extractYearFromTags(preview?.tags);
              const albumBase = preview?.tags.album?.trim() || "Unknown album";
              const album = year ? `${albumBase} (${year})` : albumBase;
              const editableMetadata = editableMetadataByFileKey[fileKey];
              const editableTitle = editableMetadata?.title ?? title;
              const editableArtist = editableMetadata?.artist ?? artist;
              const editableAlbum = editableMetadata?.album ?? albumBase;
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
                      alt={`Cover preview for ${file.name}`}
                    />

                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="truncate font-medium text-flaque-ink" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-xs text-flaque-steel">{formatFileSize(file.size)}</p>

                      {previewState?.loading ? (
                        <p className="text-xs text-flaque-steel">Reading metadata...</p>
                      ) : previewState?.error ? (
                        <p className="text-xs text-red-700">{previewState.error}</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 text-sm">
                          <label className="text-flaque-steel">
                            Title
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
                                    album: current[fileKey]?.album ?? editableAlbum
                                  }
                                }));
                              }}
                            />
                          </label>
                          <label className="text-flaque-steel">
                            Artist
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
                                    album: current[fileKey]?.album ?? editableAlbum
                                  }
                                }));
                              }}
                            />
                          </label>
                          <label className="text-flaque-steel">
                            Album
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
                                    album: nextAlbum
                                  }
                                }));
                              }}
                            />
                          </label>

                          {year ? (
                            <label className="text-flaque-steel">
                              Year
                              <input
                                className="mt-1 w-full rounded-lg border border-flaque-clay bg-white px-2 py-1 text-flaque-ink"
                                value={year}
                                readOnly
                              />
                            </label>
                          ) : null}

                          <p className="text-xs text-flaque-steel">
                            {preview?.codec?.toUpperCase() ?? "Unknown codec"}
                            {preview?.duration ? ` - ${formatDuration(preview.duration)}` : ""}
                            {trackPosition ? ` - Track ${trackPosition}` : ""}
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
