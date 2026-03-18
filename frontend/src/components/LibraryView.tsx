import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";

import type { AlbumEntry, ArtistEntry, Track } from "../types";

type LibraryFilter = {
  owner?: string;
  artist?: string;
  album?: string;
  q?: string;
};

type LibraryViewProps = {
  generatedAt: string;
  tracks: Track[];
  owners: string[];
  artists: ArtistEntry[];
  albums: AlbumEntry[];
  filters: LibraryFilter;
  onFilterChange: (next: LibraryFilter) => void;
  currentTrackId?: string;
  onTrackSelect: (track: Track) => void;
  onUpload: (input: {
    files: File[];
    artist?: string;
    album?: string;
  }) => Promise<{
    processed: number;
    uploaded: number;
    deduplicated: number;
  }>;
};

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function LibraryView({
  generatedAt,
  tracks,
  owners,
  artists,
  albums,
  filters,
  onFilterChange,
  currentTrackId,
  onTrackSelect,
  onUpload
}: LibraryViewProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadArtist, setUploadArtist] = useState("");
  const [uploadAlbum, setUploadAlbum] = useState("");
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const generatedAtLabel = useMemo(() => {
    if (!generatedAt) {
      return "never";
    }
    try {
      return new Date(generatedAt).toLocaleString();
    } catch {
      return generatedAt;
    }
  }, [generatedAt]);

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>): void {
    setPendingFiles(Array.from(event.target.files ?? []));
    setUploadMessage(null);
  }

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pendingFiles.length === 0) {
      setUploadMessage("Select at least one file before uploading.");
      return;
    }

    setUploading(true);
    setUploadMessage(null);

    try {
      const result = await onUpload({
        files: pendingFiles,
        artist: uploadArtist.trim() || undefined,
        album: uploadAlbum.trim() || undefined
      });

      const dedupMessage =
        result.deduplicated > 0 ? ` (${result.deduplicated} duplicate${result.deduplicated > 1 ? "s" : ""})` : "";
      setUploadMessage(
        `Upload complete: ${result.uploaded}/${result.processed} file${result.processed > 1 ? "s" : ""} stored${dedupMessage}. Index updated.`
      );

      setPendingFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-flaque-ink">Library</h2>
            <p className="text-sm text-flaque-steel">Latest index rebuild: {generatedAtLabel}</p>
          </div>
        </div>

        <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5" onSubmit={handleUploadSubmit}>
          <label className="text-sm text-flaque-ink md:col-span-2">
            Files
            <input
              ref={fileInputRef}
              className="mt-1 block w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="file"
              multiple
              accept=".flac,.mp3,.wav,.ogg,.opus,.m4a"
              disabled={uploading}
              onChange={handleFileSelection}
            />
          </label>

          <label className="text-sm text-flaque-ink">
            Artist (optional)
            <input
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="text"
              placeholder="Force artist tag"
              value={uploadArtist}
              onChange={(event) => setUploadArtist(event.target.value)}
              disabled={uploading}
            />
          </label>

          <label className="text-sm text-flaque-ink">
            Album (optional)
            <input
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="text"
              placeholder="Force album tag"
              value={uploadAlbum}
              onChange={(event) => setUploadAlbum(event.target.value)}
              disabled={uploading}
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
        </form>

        {pendingFiles.length > 0 ? (
          <p className="mt-2 text-sm text-flaque-steel">
            {pendingFiles.length} file{pendingFiles.length > 1 ? "s" : ""} selected.
          </p>
        ) : null}

        {uploadMessage ? <p className="mt-3 text-sm text-flaque-steel">{uploadMessage}</p> : null}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            value={filters.owner ?? ""}
            onChange={(event) =>
              onFilterChange({
                ...filters,
                owner: event.target.value || undefined
              })
            }
          >
            <option value="">All owners</option>
            {owners.map((owner) => (
              <option key={owner} value={owner}>
                {owner}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            value={filters.artist ?? ""}
            onChange={(event) =>
              onFilterChange({
                ...filters,
                artist: event.target.value || undefined
              })
            }
          >
            <option value="">All artists</option>
            {artists.map((artist) => (
              <option key={artist.name} value={artist.name}>
                {artist.name}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            value={filters.album ?? ""}
            onChange={(event) =>
              onFilterChange({
                ...filters,
                album: event.target.value || undefined
              })
            }
          >
            <option value="">All albums</option>
            {albums.map((album) => (
              <option key={`${album.artist ?? "unknown"}-${album.name}`} value={album.name}>
                {album.artist ? `${album.artist} - ${album.name}` : album.name}
              </option>
            ))}
          </select>

          <input
            className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="search"
            placeholder="Search title, artist, album"
            value={filters.q ?? ""}
            onChange={(event) =>
              onFilterChange({
                ...filters,
                q: event.target.value || undefined
              })
            }
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-flaque-clay/60 bg-white/85 shadow-panel backdrop-blur-sm">
        <div className="max-h-[50vh] overflow-auto">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Artist</th>
                <th className="px-4 py-3 font-medium">Album</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Codec</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => {
                const selected = track.id === currentTrackId;
                return (
                  <tr
                    key={track.id}
                    className={`cursor-pointer border-t border-flaque-clay/40 transition ${
                      selected ? "bg-flaque-sand/20" : "hover:bg-flaque-cream/60"
                    }`}
                    onClick={() => onTrackSelect(track)}
                  >
                    <td className="px-4 py-3 text-flaque-ink">{track.tags.title ?? track.path}</td>
                    <td className="px-4 py-3 text-flaque-steel">{track.tags.artist ?? "Unknown"}</td>
                    <td className="px-4 py-3 text-flaque-steel">{track.tags.album ?? "Unknown"}</td>
                    <td className="px-4 py-3 text-flaque-steel">{track.owner}</td>
                    <td className="px-4 py-3 text-flaque-steel">{formatDuration(track.duration)}</td>
                    <td className="px-4 py-3 uppercase text-flaque-steel">{track.codec}</td>
                  </tr>
                );
              })}
              {tracks.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-flaque-steel" colSpan={6}>
                    No tracks match this filter yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
