import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

// ── Cache ──

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const imageListCache = new Map<string, CacheEntry<string[]>>();
const zipInstanceCache = new Map<string, CacheEntry<AdmZip>>();

const LIST_TTL = 60_000;       // image list: 1 min
const ZIP_INSTANCE_TTL = 300_000; // zip instance: 5 min

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttl: number): void {
  cache.set(key, { data, expiry: Date.now() + ttl });
}

function getZipInstance(zipPath: string): AdmZip | null {
  const cached = getCached(zipInstanceCache, zipPath);
  if (cached) return cached;
  try {
    const zip = new AdmZip(zipPath);
    setCached(zipInstanceCache, zipPath, zip, ZIP_INSTANCE_TTL);
    return zip;
  } catch {
    return null;
  }
}

/** Clear caches (e.g. after sync detects changes) */
export function invalidateCache(folderName?: string): void {
  if (folderName) {
    for (const key of imageListCache.keys()) {
      if (key.includes(folderName)) imageListCache.delete(key);
    }
    for (const key of zipInstanceCache.keys()) {
      if (key.includes(folderName)) zipInstanceCache.delete(key);
    }
  } else {
    imageListCache.clear();
    zipInstanceCache.clear();
  }
}

// ── Public API ──

/**
 * Returns sorted image filenames for a book source (folder or zip).
 * Results are cached for performance.
 */
export async function listImages(
  libraryDir: string,
  folderName: string,
  sourceType: "folder" | "zip"
): Promise<string[]> {
  const cacheKey = `${libraryDir}/${folderName}`;
  const cached = getCached(imageListCache, cacheKey);
  if (cached) return cached;

  let images: string[];

  if (sourceType === "zip") {
    const zip = getZipInstance(path.join(libraryDir, folderName));
    images = zip
      ? zip
          .getEntries()
          .filter((e) => !e.isDirectory && isImageFile(e.entryName))
          .map((e) => e.entryName)
          .sort()
      : [];
  } else {
    const dir = path.join(libraryDir, folderName);
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    images = files.filter(isImageFile).sort();
  }

  setCached(imageListCache, cacheKey, images, LIST_TTL);
  return images;
}

/**
 * Returns image data and mime type from a book source.
 * ZIP instances are cached to avoid re-parsing the archive per image.
 */
export async function readImage(
  libraryDir: string,
  folderName: string,
  sourceType: "folder" | "zip",
  filename: string
): Promise<{ data: Buffer; mime: string } | null> {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
  };
  const mime = mimeMap[ext] ?? "application/octet-stream";

  if (sourceType === "zip") {
    const zip = getZipInstance(path.join(libraryDir, folderName));
    if (!zip) return null;
    const entry = zip.getEntry(filename);
    if (!entry) return null;
    const data = await new Promise<Buffer>((resolve, reject) => {
      entry.getDataAsync((buf, err) => {
        if (err) reject(new Error(String(err)));
        else resolve(buf);
      });
    });
    return { data, mime };
  }

  // folder
  const filePath = path.join(libraryDir, folderName, filename);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(libraryDir))) return null;

  try {
    const data = await fs.readFile(resolved);
    return { data: Buffer.from(data), mime };
  } catch {
    return null;
  }
}
