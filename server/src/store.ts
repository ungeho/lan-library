import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";

// ---------- Types ----------

export type SourceType = "folder" | "zip";

export interface Section {
  id: string;
  name: string;
}

export type ReadingStatus = "unread" | "reading" | "completed";

export interface Book {
  id: string;
  folderName: string;
  sourceType: SourceType;
  title: string;
  author: string | null;
  sectionId: string | null;
  seriesId: string | null;
  volumeNumber: number | null;
  categoryIds: string[];
  createdAt: string;
  pageCount: number;
  coverFilename: string | null;
  rating: number;
  readingStatus: ReadingStatus;
  lastReadAt: string | null;
}

export interface Series {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Metadata {
  sections: Section[];
  books: Book[];
  series: Series[];
  categories: Category[];
}

// ---------- Store ----------

const uid = () => crypto.randomUUID().slice(0, 8);

export class MetadataStore {
  private data: Metadata = { sections: [], books: [], series: [], categories: [] };
  private filePath: string;
  private dirty = false;

  constructor(private libraryDir: string) {
    this.filePath = path.join(libraryDir, ".metadata.json");
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      // Ensure all expected fields exist (migration from older metadata)
      this.data = {
        sections: parsed.sections ?? [],
        books: (parsed.books ?? []).map((b: Record<string, unknown>) => ({
          ...b,
          sourceType: b.sourceType ?? "folder",
          author: b.author ?? null,
          sectionId: b.sectionId ?? null,
          pageCount: b.pageCount ?? 0,
          coverFilename: b.coverFilename ?? null,
          rating: b.rating ?? 0,
          readingStatus: b.readingStatus ?? "unread",
          lastReadAt: b.lastReadAt ?? null,
        })),
        series: parsed.series ?? [],
        categories: parsed.categories ?? [],
      };
    } catch {
      this.data = { sections: [], books: [], series: [], categories: [] };
    }
  }

  private async save(): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    this.dirty = false;
  }

  /**
   * Scan library directory and sync: add new folders/zips, remove missing ones.
   */
  async sync(): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.libraryDir);
    } catch {
      entries = [];
    }

    const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

    const sources: { name: string; type: SourceType; pageCount: number; coverFilename: string | null }[] = [];

    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const fullPath = path.join(this.libraryDir, entry);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat) continue;

      if (stat.isDirectory()) {
        const files = await fs.readdir(fullPath).catch(() => []);
        const imageFiles = files
          .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
          .sort();
        if (imageFiles.length > 0) {
          sources.push({ name: entry, type: "folder", pageCount: imageFiles.length, coverFilename: imageFiles[0] });
        }
      } else if (entry.toLowerCase().endsWith(".zip")) {
        try {
          const zip = new AdmZip(fullPath);
          const imageEntries = zip
            .getEntries()
            .filter((e) => !e.isDirectory && IMAGE_EXT.has(path.extname(e.entryName).toLowerCase()))
            .map((e) => e.entryName)
            .sort();
          if (imageEntries.length > 0) {
            sources.push({ name: entry, type: "zip", pageCount: imageEntries.length, coverFilename: imageEntries[0] });
          }
        } catch {
          // Invalid zip, skip
        }
      }
    }

    const existingNames = new Set(this.data.books.map((b) => b.folderName));
    const actualNames = new Set(sources.map((s) => s.name));

    // Add new
    for (const src of sources) {
      if (!existingNames.has(src.name)) {
        const displayTitle =
          src.type === "zip" ? src.name.replace(/\.zip$/i, "") : src.name;
        this.data.books.push({
          id: uid(),
          folderName: src.name,
          sourceType: src.type,
          title: displayTitle,
          author: null,
          sectionId: null,
          seriesId: null,
          volumeNumber: null,
          categoryIds: [],
          createdAt: new Date().toISOString(),
          pageCount: src.pageCount,
          coverFilename: src.coverFilename,
          rating: 0,
          readingStatus: "unread",
          lastReadAt: null,
        });
        this.dirty = true;
      }
    }

    // Update sourceType, pageCount, coverFilename for existing books
    const sourceMap = new Map(sources.map((s) => [s.name, s]));
    for (const book of this.data.books) {
      const src = sourceMap.get(book.folderName);
      if (!src) continue;
      if (book.sourceType !== src.type) {
        book.sourceType = src.type;
        this.dirty = true;
      }
      if (book.pageCount !== src.pageCount || book.coverFilename !== src.coverFilename) {
        book.pageCount = src.pageCount;
        book.coverFilename = src.coverFilename;
        this.dirty = true;
      }
    }

    // Remove missing
    const before = this.data.books.length;
    this.data.books = this.data.books.filter((b) => actualNames.has(b.folderName));
    if (this.data.books.length !== before) this.dirty = true;

    if (this.dirty) await this.save();
  }

  // ---------- Books ----------

  getBooks(): Book[] {
    return this.data.books;
  }

  getBook(id: string): Book | undefined {
    return this.data.books.find((b) => b.id === id);
  }

  getBookByFolder(folderName: string): Book | undefined {
    return this.data.books.find((b) => b.folderName === folderName);
  }

  async updateBook(
    id: string,
    update: Partial<Pick<Book, "title" | "author" | "sectionId" | "seriesId" | "volumeNumber" | "categoryIds" | "rating" | "readingStatus" | "lastReadAt">>
  ): Promise<Book | null> {
    const book = this.data.books.find((b) => b.id === id);
    if (!book) return null;
    if (update.title !== undefined) book.title = update.title;
    if (update.author !== undefined) book.author = update.author;
    if (update.sectionId !== undefined) book.sectionId = update.sectionId;
    if (update.seriesId !== undefined) book.seriesId = update.seriesId;
    if (update.volumeNumber !== undefined) book.volumeNumber = update.volumeNumber;
    if (update.categoryIds !== undefined) book.categoryIds = update.categoryIds;
    if (update.rating !== undefined) book.rating = update.rating;
    if (update.readingStatus !== undefined) book.readingStatus = update.readingStatus;
    if (update.lastReadAt !== undefined) book.lastReadAt = update.lastReadAt;
    await this.save();
    return book;
  }

  async bulkUpdateBooks(
    ids: string[],
    update: Partial<Pick<Book, "title" | "author" | "sectionId" | "seriesId" | "categoryIds">> & {
      addCategoryIds?: string[];
      removeCategoryIds?: string[];
    }
  ): Promise<number> {
    let count = 0;
    for (const book of this.data.books) {
      if (!ids.includes(book.id)) continue;
      if (update.title !== undefined) book.title = update.title;
      if (update.author !== undefined) book.author = update.author;
      if (update.sectionId !== undefined) book.sectionId = update.sectionId;
      if (update.seriesId !== undefined) book.seriesId = update.seriesId;
      if (update.categoryIds !== undefined) book.categoryIds = update.categoryIds;
      if (update.addCategoryIds) {
        for (const id of update.addCategoryIds) {
          if (!book.categoryIds.includes(id)) book.categoryIds.push(id);
        }
      }
      if (update.removeCategoryIds) {
        book.categoryIds = book.categoryIds.filter((id) => !update.removeCategoryIds!.includes(id));
      }
      count++;
    }
    if (count > 0) await this.save();
    return count;
  }

  async bulkAssignVolumes(
    orderedIds: string[],
    startFrom: number
  ): Promise<number> {
    let count = 0;
    for (let i = 0; i < orderedIds.length; i++) {
      const book = this.data.books.find((b) => b.id === orderedIds[i]);
      if (!book) continue;
      book.volumeNumber = startFrom + i;
      count++;
    }
    if (count > 0) await this.save();
    return count;
  }

  // ---------- Sections ----------

  getSections(): Section[] {
    return this.data.sections;
  }

  async createSection(name: string): Promise<Section> {
    const s: Section = { id: uid(), name };
    this.data.sections.push(s);
    await this.save();
    return s;
  }

  async updateSection(id: string, name: string): Promise<Section | null> {
    const s = this.data.sections.find((x) => x.id === id);
    if (!s) return null;
    s.name = name;
    await this.save();
    return s;
  }

  async deleteSection(id: string): Promise<boolean> {
    const before = this.data.sections.length;
    this.data.sections = this.data.sections.filter((x) => x.id !== id);
    for (const b of this.data.books) {
      if (b.sectionId === id) b.sectionId = null;
    }
    if (this.data.sections.length !== before) {
      await this.save();
      return true;
    }
    return false;
  }

  // ---------- Series ----------

  getSeries(): Series[] {
    return this.data.series;
  }

  async createSeries(name: string): Promise<Series> {
    const s: Series = { id: uid(), name };
    this.data.series.push(s);
    await this.save();
    return s;
  }

  async updateSeries(id: string, name: string): Promise<Series | null> {
    const s = this.data.series.find((x) => x.id === id);
    if (!s) return null;
    s.name = name;
    await this.save();
    return s;
  }

  async deleteSeries(id: string): Promise<boolean> {
    const before = this.data.series.length;
    this.data.series = this.data.series.filter((x) => x.id !== id);
    // Unlink books from this series
    for (const b of this.data.books) {
      if (b.seriesId === id) b.seriesId = null;
    }
    if (this.data.series.length !== before) {
      await this.save();
      return true;
    }
    return false;
  }

  // ---------- Categories ----------

  getCategories(): Category[] {
    return this.data.categories;
  }

  async createCategory(name: string, parentId: string | null = null): Promise<Category> {
    const c: Category = { id: uid(), name, parentId };
    this.data.categories.push(c);
    await this.save();
    return c;
  }

  async updateCategory(id: string, update: Partial<Pick<Category, "name" | "parentId">>): Promise<Category | null> {
    const c = this.data.categories.find((x) => x.id === id);
    if (!c) return null;
    if (update.name !== undefined) c.name = update.name;
    if (update.parentId !== undefined) c.parentId = update.parentId;
    await this.save();
    return c;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const before = this.data.categories.length;
    this.data.categories = this.data.categories.filter((x) => x.id !== id);
    // Unlink from books
    for (const b of this.data.books) {
      b.categoryIds = b.categoryIds.filter((cid) => cid !== id);
    }
    // Orphan children → root
    for (const c of this.data.categories) {
      if (c.parentId === id) c.parentId = null;
    }
    if (this.data.categories.length !== before) {
      await this.save();
      return true;
    }
    return false;
  }

  // ---------- Search ----------

  search(query: string): Book[] {
    const q = query.toLowerCase();
    const sectionMap = new Map(this.data.sections.map((s) => [s.id, s.name.toLowerCase()]));
    const seriesMap = new Map(this.data.series.map((s) => [s.id, s.name.toLowerCase()]));
    const catMap = new Map(this.data.categories.map((c) => [c.id, c.name.toLowerCase()]));

    return this.data.books.filter((b) => {
      if (b.title.toLowerCase().includes(q)) return true;
      if (b.author && b.author.toLowerCase().includes(q)) return true;
      if (b.sectionId && sectionMap.get(b.sectionId)?.includes(q)) return true;
      if (b.seriesId && seriesMap.get(b.seriesId)?.includes(q)) return true;
      if (b.categoryIds.some((cid) => catMap.get(cid)?.includes(q))) return true;
      return false;
    });
  }
}
