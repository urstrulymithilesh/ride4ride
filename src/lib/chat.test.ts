import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  extForMime,
  isAllowedImagePath,
  validateImageFile,
} from "@/lib/chat";

function fileOf(type: string, size: number): File {
  return new File([new Uint8Array(size)], "up", { type });
}

describe("validateImageFile", () => {
  it("accepts allowed image types within size", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      expect(validateImageFile(fileOf(type, 1024))).toBeNull();
    }
  });

  it("rejects non-image types", () => {
    expect(validateImageFile(fileOf("video/mp4", 1024))).toContain("Only image");
    expect(validateImageFile(fileOf("audio/mpeg", 1024))).toContain("Only image");
    expect(validateImageFile(fileOf("", 1024))).toContain("Only image");
  });

  it("rejects oversize images", () => {
    expect(validateImageFile(fileOf("image/png", MAX_IMAGE_BYTES + 1))).toContain(
      "5 MB",
    );
  });
});

describe("extForMime", () => {
  it("maps known mimes, falls back to bin", () => {
    expect(extForMime("image/jpeg")).toBe("jpg");
    expect(extForMime("video/mp4")).toBe("bin");
  });
});

describe("isAllowedImagePath", () => {
  const conv = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  it("accepts images inside the conversation folder", () => {
    expect(isAllowedImagePath(`${conv}/photo.png`, conv)).toBe(true);
    expect(isAllowedImagePath(`${conv}/PHOTO.JPG`, conv)).toBe(true);
  });

  it("rejects other folders, missing folders, and non-images", () => {
    expect(isAllowedImagePath(`other/photo.png`, conv)).toBe(false);
    expect(isAllowedImagePath(`photo.png`, conv)).toBe(false);
    expect(isAllowedImagePath(`${conv}/clip.mp4`, conv)).toBe(false);
    expect(isAllowedImagePath(`${conv}/noext`, conv)).toBe(false);
  });

  it("pins prefix-trick behavior explicitly", () => {
    // `..` segments pass the prefix check (they are part of the key
    // string); the extension check is what refuses non-images. Pinned so
    // any future tightening of this guard shows up as a deliberate diff.
    expect(isAllowedImagePath(`${conv}/../other/x.png`, conv)).toBe(true);
    expect(isAllowedImagePath(`${conv}-evil/x.png`, conv)).toBe(false);
  });
});
