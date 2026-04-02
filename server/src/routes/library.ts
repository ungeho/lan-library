import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import type { MetadataStore } from "../store.js";
import { listImages, readImage } from "../bookSource.js";
import { getThumbnail } from "../thumbnail.js";

export function libraryRouter(libraryDir: string, store: MetadataStore): Router {
  const router = Router();

  // Helper: build image URL for a book
  function imageUrl(folderName: string, filename: string) {
    return `/api/library/image/${encodeURIComponent(folderName)}/${encodeURIComponent(filename)}`;
  }

  function thumbUrl(folderName: string, filename: string) {
    return `/api/library/thumb/${encodeURIComponent(folderName)}/${encodeURIComponent(filename)}`;
  }

  // ── Books ──

  // GET /api/library/books?q=&sectionId=&seriesId=&categoryId=
  router.get("/books", async (req, res) => {
    await store.sync();
    const q = req.query.q as string | undefined;
    const sectionId = req.query.sectionId as string | undefined;
    const seriesId = req.query.seriesId as string | undefined;
    const categoryId = req.query.categoryId as string | undefined;

    let books = q ? store.search(q) : store.getBooks();

    if (sectionId === "__none__") {
      books = books.filter((b) => b.sectionId === null);
    } else if (sectionId) {
      books = books.filter((b) => b.sectionId === sectionId);
    }
    if (seriesId) {
      books = books.filter((b) => b.seriesId === seriesId);
    }
    if (categoryId) {
      books = books.filter((b) => b.categoryIds.includes(categoryId));
    }

    const result = books.map((b) => ({
      ...b,
      coverImage: b.coverFilename ? thumbUrl(b.folderName, b.coverFilename) : null,
    }));

    res.json(result);
  });

  // GET /api/library/books/:id
  router.get("/books/:id", async (req, res) => {
    const book = store.getBook(req.params.id);
    if (!book) { res.status(404).json({ error: "Not found" }); return; }

    res.json({
      ...book,
      coverImage: book.coverFilename ? imageUrl(book.folderName, book.coverFilename) : null,
    });
  });

  // PATCH /api/library/books/bulk — must be before :id route
  router.patch("/books/bulk", async (req, res) => {
    const { ids, update } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids required" });
      return;
    }
    const count = await store.bulkUpdateBooks(ids, update ?? {});
    res.json({ updated: count });
  });

  // PATCH /api/library/books/:id
  router.patch("/books/:id", async (req, res) => {
    const updated = await store.updateBook(req.params.id, req.body);
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  });

  // POST /api/library/upload — upload ZIP files via drag & drop
  const upload = multer({ dest: path.join(libraryDir, ".uploads") });
  router.post("/upload", upload.array("files"), async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files" });
      return;
    }

    const added: string[] = [];
    for (const file of files) {
      const originalName = file.originalname;
      if (!originalName.toLowerCase().endsWith(".zip")) {
        await fs.unlink(file.path).catch(() => {});
        continue;
      }
      const dest = path.join(libraryDir, originalName);
      // Don't overwrite existing files
      try {
        await fs.access(dest);
        await fs.unlink(file.path).catch(() => {});
      } catch {
        await fs.rename(file.path, dest);
        added.push(originalName);
      }
    }

    // Trigger sync to pick up new books
    await store.sync();
    res.json({ added });
  });

  // GET /api/library/books/:id/pages
  router.get("/books/:id/pages", async (req, res) => {
    const book = store.getBook(req.params.id);
    if (!book) { res.status(404).json({ error: "Not found" }); return; }

    const images = await listImages(libraryDir, book.folderName, book.sourceType);

    res.json({
      bookId: book.id,
      pages: images.map((filename, index) => ({
        index,
        filename,
        url: imageUrl(book.folderName, filename),
      })),
    });
  });

  // ── Sections ──

  router.get("/sections", (_req, res) => {
    res.json(store.getSections());
  });

  router.post("/sections", async (req, res) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const s = await store.createSection(name);
    res.status(201).json(s);
  });

  router.patch("/sections/:id", async (req, res) => {
    const s = await store.updateSection(req.params.id, req.body.name);
    if (!s) { res.status(404).json({ error: "Not found" }); return; }
    res.json(s);
  });

  router.delete("/sections/:id", async (req, res) => {
    const ok = await store.deleteSection(req.params.id);
    if (!ok) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  });

  // ── Series ──

  router.get("/series", (_req, res) => {
    res.json(store.getSeries());
  });

  router.post("/series", async (req, res) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const s = await store.createSeries(name);
    res.status(201).json(s);
  });

  router.patch("/series/:id", async (req, res) => {
    const s = await store.updateSeries(req.params.id, req.body.name);
    if (!s) { res.status(404).json({ error: "Not found" }); return; }
    res.json(s);
  });

  router.delete("/series/:id", async (req, res) => {
    const ok = await store.deleteSeries(req.params.id);
    if (!ok) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  });

  // ── Categories ──

  router.get("/categories", (_req, res) => {
    res.json(store.getCategories());
  });

  router.post("/categories", async (req, res) => {
    const { name, parentId } = req.body;
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const c = await store.createCategory(name, parentId ?? null);
    res.status(201).json(c);
  });

  router.patch("/categories/:id", async (req, res) => {
    const c = await store.updateCategory(req.params.id, req.body);
    if (!c) { res.status(404).json({ error: "Not found" }); return; }
    res.json(c);
  });

  router.delete("/categories/:id", async (req, res) => {
    const ok = await store.deleteCategory(req.params.id);
    if (!ok) { res.status(404).json({ error: "Not found" }); return; }
    res.status(204).end();
  });

  // ── Thumbnail serving ──

  router.get("/thumb/:folderName/:filename", async (req, res) => {
    const { folderName, filename } = req.params;
    const book = store.getBookByFolder(folderName);
    const sourceType = book?.sourceType ?? "folder";

    const original = await readImage(libraryDir, folderName, sourceType, filename);
    if (!original) { res.status(404).json({ error: "Not found" }); return; }

    const thumb = await getThumbnail(libraryDir, folderName, filename, original.data);
    res.set("Content-Type", thumb.mime);
    res.set("Cache-Control", "public, max-age=604800");
    res.send(thumb.data);
  });

  // ── Image serving ──

  // Image serving: folderName and filename are URL-encoded.
  // For ZIP entries with subdirs, the filename is encoded (e.g. "subdir%2F001.jpg").
  router.get("/image/:folderName/:filename", async (req, res) => {
    const filename = req.params.filename;
    const book = store.getBookByFolder(req.params.folderName);
    const sourceType = book?.sourceType ?? "folder";

    const result = await readImage(
      libraryDir,
      req.params.folderName,
      sourceType,
      filename
    );

    if (!result) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.set("Content-Type", result.mime);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(result.data);
  });

  return router;
}
