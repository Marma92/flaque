import { patchPlaylistMetadataFile } from "./metadata";

export async function togglePlaylistHeart(
  playlistId: string,
  userId: string
): Promise<{ hearted: boolean; heartCount: number }> {
  const updated = await patchPlaylistMetadataFile(playlistId, (metadata) => {
    const hearts = metadata.hearts.filter((id) => id !== userId);
    const wasHearted = hearts.length < metadata.hearts.length;
    if (!wasHearted) {
      hearts.push(userId);
    }
    return { ...metadata, hearts };
  });

  return {
    hearted: updated.hearts.includes(userId),
    heartCount: updated.hearts.length
  };
}

export async function incrementPlaylistListenCount(playlistId: string): Promise<number> {
  const updated = await patchPlaylistMetadataFile(playlistId, (metadata) => ({
    ...metadata,
    listenCount: metadata.listenCount + 1
  }));
  return updated.listenCount;
}

export async function updatePlaylistCover(
  playlistId: string,
  coverPath: string | null
): Promise<void> {
  await patchPlaylistMetadataFile(playlistId, (metadata) => ({
    ...metadata,
    cover: coverPath
  }));
}
