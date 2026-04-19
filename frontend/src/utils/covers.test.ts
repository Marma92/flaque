import { describe, expect, it, vi } from "vitest";

import { getAlbumCoverSrc, getArtistPhotoSrc } from "./covers";
import { coverPathUrl, coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";

describe("getAlbumCoverSrc", () => {
  const mockAlbumWithCover: any = {
    cover: "album1.jpg",
    previewTrackId: "track1"
  };

  const mockAlbumWithPreviewTrack: any = {
    cover: null,
    previewTrackId: "track1"
  };

  const mockAlbumWithNothing: any = {
    cover: null,
    previewTrackId: null
  };

  it("returns coverPathUrl when album has cover", () => {
    const result = getAlbumCoverSrc(mockAlbumWithCover);
    expect(result).toBe(coverPathUrl("album1.jpg"));
  });

  it("returns coverUrl when album has previewTrackId but no cover", () => {
    const result = getAlbumCoverSrc(mockAlbumWithPreviewTrack);
    expect(result).toBe(coverUrl("track1"));
  });

  it("returns defaultCoverImage when album has neither cover nor previewTrackId", () => {
    const result = getAlbumCoverSrc(mockAlbumWithNothing);
    expect(result).toBe(defaultCoverImage);
  });
});

describe("getArtistPhotoSrc", () => {
  const mockArtistWithPhoto: any = {
    photo: "artist1.jpg",
    previewTrackId: "track1"
  };

  const mockArtistWithPreviewTrack: any = {
    photo: null,
    previewTrackId: "track1"
  };

  const mockArtistWithNothing: any = {
    photo: null,
    previewTrackId: null
  };

  it("returns coverPathUrl when artist has photo", () => {
    const result = getArtistPhotoSrc(mockArtistWithPhoto);
    expect(result).toBe(coverPathUrl("artist1.jpg"));
  });

  it("returns coverUrl when artist has previewTrackId but no photo", () => {
    const result = getArtistPhotoSrc(mockArtistWithPreviewTrack);
    expect(result).toBe(coverUrl("track1"));
  });

  it("returns defaultCoverImage when artist has neither photo nor previewTrackId", () => {
    const result = getArtistPhotoSrc(mockArtistWithNothing);
    expect(result).toBe(defaultCoverImage);
  });
});