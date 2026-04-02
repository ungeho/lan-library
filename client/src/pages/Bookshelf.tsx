import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../hooks/useApi";
import { Loading, ErrorMessage } from "../components/Loading";
import type { Book, Section, Series, Category, ReadingStatus } from "../types";
import styles from "./Bookshelf.module.css";

type SortKey = "title" | "createdAt" | "pageCount" | "lastReadAt" | "rating";

export function Bookshelf() {
  const [books, setBooks] = useState<Book[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeSection, setActiveSection] = useState<string>(
    () => sessionStorage.getItem("bookshelf-active-section") ?? ""
  );
  const [query, setQuery] = useState("");
  const [filterSeries, setFilterSeries] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState<ReadingStatus | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("title");

  // Drag & drop
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Bulk edit
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSectionId, setBulkSectionId] = useState("");
  const [bulkSeriesId, setBulkSeriesId] = useState("");
  const [bulkCategoryIds, setBulkCategoryIds] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => {
    sessionStorage.setItem("bookshelf-active-section", activeSection);
  }, [activeSection]);

  // Load metadata
  useEffect(() => {
    Promise.all([
      api.getSections(),
      api.getSeries(),
      api.getCategories(),
    ]).then(([sec, ser, cat]) => {
      setAllSections(sec);
      setAllSeries(ser);
      setAllCategories(cat);
    }).catch(() => {});
  }, []);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { q?: string; sectionId?: string; seriesId?: string; categoryId?: string } = {};
      if (query) params.q = query;
      if (activeSection) params.sectionId = activeSection;
      if (filterSeries) params.seriesId = filterSeries;
      if (filterCategory) params.categoryId = filterCategory;
      setBooks(await api.getBooks(params));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [query, activeSection, filterSeries, filterCategory]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files].filter((f) => f.name.toLowerCase().endsWith(".zip"));
    if (files.length === 0) return;
    setUploading(true);
    api.uploadFiles(files)
      .then(() => fetchBooks())
      .catch(() => alert("アップロードに失敗しました"))
      .finally(() => setUploading(false));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
    setBulkSectionId("");
    setBulkSeriesId("");
    setBulkCategoryIds([]);
  }

  async function handleBulkSave() {
    if (selected.size === 0) return;
    setBulkSaving(true);
    try {
      const update: Partial<Pick<Book, "sectionId" | "seriesId" | "categoryIds">> = {};
      if (bulkSectionId === "__clear__") update.sectionId = null;
      else if (bulkSectionId) update.sectionId = bulkSectionId;
      if (bulkSeriesId === "__clear__") update.seriesId = null;
      else if (bulkSeriesId) update.seriesId = bulkSeriesId;
      if (bulkCategoryIds.length > 0) update.categoryIds = bulkCategoryIds;
      await api.bulkUpdateBooks([...selected], update);
      exitSelectMode();
      fetchBooks();
    } catch {
      alert("一括更新に失敗しました");
    } finally {
      setBulkSaving(false);
    }
  }

  // Filter by status + sort
  const displayBooks = useMemo(() => {
    let filtered = filterStatus ? books.filter((b) => b.readingStatus === filterStatus) : books;
    const sorted = [...filtered];
    switch (sortKey) {
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title, "ja"));
        break;
      case "createdAt":
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "pageCount":
        sorted.sort((a, b) => b.pageCount - a.pageCount);
        break;
      case "lastReadAt":
        sorted.sort((a, b) => (b.lastReadAt ?? "").localeCompare(a.lastReadAt ?? ""));
        break;
      case "rating":
        sorted.sort((a, b) => b.rating - a.rating);
        break;
    }
    return sorted;
  }, [books, filterStatus, sortKey]);

  // Group by series
  const seriesMap = new Map(allSeries.map((s) => [s.id, s.name]));
  const grouped = new Map<string, Book[]>();
  const ungrouped: Book[] = [];

  for (const book of displayBooks) {
    if (book.seriesId) {
      const group = grouped.get(book.seriesId) ?? [];
      group.push(book);
      grouped.set(book.seriesId, group);
    } else {
      ungrouped.push(book);
    }
  }

  for (const group of grouped.values()) {
    group.sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0));
  }

  const allBookIds = displayBooks.map((b) => b.id);
  const allSelected = allBookIds.length > 0 && allBookIds.every((id) => selected.has(id));

  return (
    <div
      className={styles.container}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {dragging && (
        <div className={styles.dropOverlay}>
          <div className={styles.dropMessage}>ZIPファイルをドロップして追加</div>
        </div>
      )}

      {uploading && (
        <div className={styles.uploadBanner}>アップロード中...</div>
      )}

      {/* Section tabs */}
      {allSections.length > 0 && (
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeSection === "" ? styles.tabActive : ""}`}
            onClick={() => setActiveSection("")}
          >
            すべて
          </button>
          {allSections.map((sec) => (
            <button
              key={sec.id}
              className={`${styles.tab} ${activeSection === sec.id ? styles.tabActive : ""}`}
              onClick={() => setActiveSection(sec.id)}
            >
              {sec.name}
            </button>
          ))}
          <button
            className={`${styles.tab} ${activeSection === "__none__" ? styles.tabActive : ""}`}
            onClick={() => setActiveSection("__none__")}
          >
            未分類
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className={styles.filters}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="タイトル・カテゴリ・セクションで検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className={styles.select}
          value={filterSeries}
          onChange={(e) => setFilterSeries(e.target.value)}
        >
          <option value="">全シリーズ</option>
          {allSeries.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">全カテゴリ</option>
          {allCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as ReadingStatus | "")}
        >
          <option value="">全ステータス</option>
          <option value="unread">未読</option>
          <option value="reading">読書中</option>
          <option value="completed">読了</option>
        </select>
        <select
          className={styles.select}
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          <option value="title">タイトル順</option>
          <option value="createdAt">追加日順</option>
          <option value="pageCount">ページ数順</option>
          <option value="lastReadAt">最近読んだ順</option>
          <option value="rating">評価順</option>
        </select>
        <button
          className={`${styles.selectBtn} ${selectMode ? styles.selectBtnActive : ""}`}
          onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
        >
          {selectMode ? "選択解除" : "一括編集"}
        </button>
      </div>

      {/* Bulk edit bar */}
      {selectMode && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkTop}>
            <label className={styles.bulkCheckAll}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => {
                  if (allSelected) setSelected(new Set());
                  else setSelected(new Set(allBookIds));
                }}
              />
              すべて選択（{selected.size}/{books.length}）
            </label>
          </div>
          <div className={styles.bulkFields}>
            <select
              className={styles.select}
              value={bulkSectionId}
              onChange={(e) => setBulkSectionId(e.target.value)}
            >
              <option value="">セクション変更なし</option>
              <option value="__clear__">セクションを外す</option>
              {allSections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              className={styles.select}
              value={bulkSeriesId}
              onChange={(e) => setBulkSeriesId(e.target.value)}
            >
              <option value="">シリーズ変更なし</option>
              <option value="__clear__">シリーズを外す</option>
              {allSeries.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <div className={styles.bulkCategories}>
              {allCategories.map((c) => (
                <label key={c.id} className={styles.bulkCheckbox}>
                  <input
                    type="checkbox"
                    checked={bulkCategoryIds.includes(c.id)}
                    onChange={() =>
                      setBulkCategoryIds((prev) =>
                        prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <button
            className={styles.bulkSaveBtn}
            disabled={selected.size === 0 || bulkSaving}
            onClick={handleBulkSave}
          >
            {bulkSaving ? "保存中..." : `${selected.size}件を更新`}
          </button>
        </div>
      )}

      {loading && <Loading />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && displayBooks.length === 0 && (
        <div className={styles.empty}>
          <p>ライブラリが空です</p>
          <p className={styles.hint}>
            <code>library/</code> フォルダに作品フォルダを追加してください
          </p>
        </div>
      )}

      {/* Series groups */}
      {[...grouped.entries()].map(([seriesId, group]) => (
        <section key={seriesId} className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {seriesMap.get(seriesId) ?? "不明なシリーズ"}
          </h2>
          <div className={styles.grid}>
            {group.map((b) => (
              <BookCard
                key={b.id}
                book={b}
                selectMode={selectMode}
                isSelected={selected.has(b.id)}
                onToggle={() => toggleSelect(b.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Ungrouped */}
      {ungrouped.length > 0 && (
        <section className={styles.section}>
          {grouped.size > 0 && (
            <h2 className={styles.sectionTitle}>単独作品</h2>
          )}
          <div className={styles.grid}>
            {ungrouped.map((b) => (
              <BookCard
                key={b.id}
                book={b}
                selectMode={selectMode}
                isSelected={selected.has(b.id)}
                onToggle={() => toggleSelect(b.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BookCard({
  book,
  selectMode,
  isSelected,
  onToggle,
}: {
  book: Book;
  selectMode: boolean;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const inner = (
    <>
      <div className={styles.cover}>
        {book.coverImage ? (
          <img src={book.coverImage} alt={book.title} loading="lazy" />
        ) : (
          <div className={styles.placeholder}>No Cover</div>
        )}
        {selectMode && (
          <div className={`${styles.selectOverlay} ${isSelected ? styles.selectOverlayActive : ""}`}>
            <div className={styles.selectCheck}>{isSelected ? "✓" : ""}</div>
          </div>
        )}
      </div>
      <div className={styles.info}>
        <span className={styles.title}>{book.title}</span>
        <span className={styles.meta}>
          {book.volumeNumber != null && `第${book.volumeNumber}巻 · `}
          {book.pageCount}P
          {book.rating > 0 && (
            <span className={styles.cardRating}>
              {" · "}
              <span className={styles.cardStar}>★</span>
              {book.rating}
            </span>
          )}
        </span>
        {book.readingStatus !== "unread" && (
          <span className={`${styles.cardStatus} ${styles[`cardStatus_${book.readingStatus}`]}`}>
            {book.readingStatus === "reading" ? "読書中" : "読了"}
          </span>
        )}
      </div>
    </>
  );

  if (selectMode) {
    return (
      <div className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`} onClick={onToggle}>
        {inner}
      </div>
    );
  }

  return (
    <Link to={`/book/${book.id}`} className={styles.card}>
      {inner}
    </Link>
  );
}
