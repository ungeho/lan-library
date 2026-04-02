import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../hooks/useApi";
import { Loading, ErrorMessage } from "../components/Loading";
import type { Book, Section, Series, Category } from "../types";
import styles from "./Bookshelf.module.css";

export function Bookshelf() {
  const [books, setBooks] = useState<Book[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeSection, setActiveSection] = useState<string>("");
  const [query, setQuery] = useState("");
  const [filterSeries, setFilterSeries] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

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

  // Group by series
  const seriesMap = new Map(allSeries.map((s) => [s.id, s.name]));
  const grouped = new Map<string, Book[]>();
  const ungrouped: Book[] = [];

  for (const book of books) {
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

  return (
    <div className={styles.container}>
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
      </div>

      {loading && <Loading />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && books.length === 0 && (
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
              <BookCard key={b.id} book={b} />
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
              <BookCard key={b.id} book={b} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BookCard({ book }: { book: Book }) {
  return (
    <Link to={`/book/${book.id}`} className={styles.card}>
      <div className={styles.cover}>
        {book.coverImage ? (
          <img src={book.coverImage} alt={book.title} loading="lazy" />
        ) : (
          <div className={styles.placeholder}>No Cover</div>
        )}
      </div>
      <div className={styles.info}>
        <span className={styles.title}>{book.title}</span>
        <span className={styles.meta}>
          {book.volumeNumber != null && `第${book.volumeNumber}巻 · `}
          {book.pageCount}P
        </span>
      </div>
    </Link>
  );
}
