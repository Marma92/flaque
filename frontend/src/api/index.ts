export { ApiError, setUnauthorizedHandler } from "./client";

export {
  getCurrentUser,
  login,
  requestPasswordReset,
  resetPasswordWithToken,
  logout,
  getMySessions,
  revokeMySession,
  logoutOtherSessions
} from "./auth";

export {
  myProfilePhotoUrl,
  uploadMyProfilePhoto,
  updateMyPassword,
  getUsers,
  createUserAccount,
  updateMyEmail,
  updateMyLanguage,
  patchUserAccount,
  deleteUserAccount,
  resetUserPassword,
  getMyPlayStats,
  getMyPlaybackState,
  setMyPlaybackState,
  clearMyPlaybackState
} from "./users";
export type { PlayStatsResponse, PlaybackState } from "./users";

export {
  getLibrary,
  getRecentUploads,
  getTracks,
  getArtists,
  getAlbums,
  getArtistAlbums,
  getAlbumTracks,
  getLibrarySettings,
  patchLibrarySettings
} from "./library";
export type { TracksResponse, RecentUploadAlbum, RecentUploadItem, LibrarySettings } from "./library";

export { coverPathUrl, coverUrl } from "./covers";
export { streamUrl } from "./streaming";

export {
  getAdjacentTrack,
  updateTrackMetadata,
  deleteTrackFile,
  bulkDeleteTracks,
  bulkUpdateTrackMetadata,
  reportTrackPlay,
  reportTrackSkip
} from "./tracks";

export { uploadTracks, rebuildIndex } from "./uploads";
export type { UploadTracksInput, UploadTracksResult, UploadTrackPreview } from "./uploads";

export {
  createPlaylist,
  patchPlaylist,
  deletePlaylist,
  heartPlaylist,
  reportPlaylistListen,
  playlistCoverUrl,
  uploadPlaylistCover,
  deletePlaylistCover,
  getAutoPlaylists,
  getAutoPlaylistDetail,
  regenerateAutoPlaylists,
  getForYouPlaylists,
  getForYouPlaylistDetail,
  dismissForYouPlaylist,
  regenerateForYouPlaylists,
  getPersonalPlaylists,
  getPersonalPlaylistDetail,
  regeneratePersonalPlaylists,
  getAutoPlaylistConfig,
  patchAutoPlaylistConfig
} from "./playlists";
export type { AutoPlaylistConfig } from "./playlists";

export {
  createRadioStation,
  getRadioState,
  getRadioQueue,
  rebuildRadioStation
} from "./radio";

export {
  getGenreSynonyms,
  putGenreSynonym,
  deleteGenreSynonym,
  resetGenreSynonyms,
  getEnrichmentStatus,
  startEnrichment,
  stopEnrichment,
  getEnrichmentLog,
  clearEnrichmentLog,
  reEnrichTrack,
  reapplyGenreSynonyms,
  getLibraryGenreLabels,
  getGenreCacheStats,
  clearGenreCache
} from "./genre";
export type {
  GenreSynonyms,
  EnrichmentStatus,
  EnrichmentCurrentTrack,
  EnrichmentLogEntry,
  ReEnrichResult,
  LibraryGenreLabel,
  GenreCacheStats
} from "./genre";

export {
  getSystemStats,
  getVersionInfo,
  checkForUpdates,
  triggerUpdate,
  getUpdateStatus
} from "./server";
export type { SystemStats, VersionInfo, UpdateStatus } from "./server";

export { getStorageUsage, getLogFiles, getLogEntries } from "./logs";
export type { LogFile, LogEntry, StorageUsage } from "./logs";

export {
  getBackupConfig,
  updateBackupConfig,
  createBackup,
  getBackups,
  deleteBackup,
  restoreBackup,
  getBackupDownloadUrl,
  purgeExpiredBackups
} from "./backup";
export type { BackupConfig, BackupEntry } from "./backup";
