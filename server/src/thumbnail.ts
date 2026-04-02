import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const THUMB_WIDTH = 300;
const THUMB_QUALITY = 70;

/**
 * Returns a thumbnail for the given image data.
 * Uses a disk cache under `<libraryDir>/.thumbs/` to avoid regenerating.
 */
export async function getThumbnail(
  libraryDir: string,
  folderName: string,
  filename: string,
  originalData: Buffer
): Promise<{ data: Buffer; mime: string }> {
  const thumbDir = path.join(libraryDir, ".thumbs", folderName);
  const thumbName = path.basename(filename, path.extname(filename)) + ".webp";
  const thumbPath = path.join(thumbDir, thumbName);

  // Try disk cache first
  try {
    const data = await fs.readFile(thumbPath);
    return { data, mime: "image/webp" };
  } catch {
    // not cached yet
  }

  // Generate thumbnail
  const data = await sharp(originalData)
    .resize(THUMB_WIDTH, undefined, { withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();

  // Write cache (fire-and-forget)
  fs.mkdir(thumbDir, { recursive: true })
    .then(() => fs.writeFile(thumbPath, data))
    .catch(() => {});

  return { data, mime: "image/webp" };
}
