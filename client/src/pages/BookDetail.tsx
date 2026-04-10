import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { api } from "../hooks/useApi";
import { Loading, ErrorMessage } from "../components/Loading";
import type { Book, Section, Series, Category, PagesResponse, ReadingStatus } from "../types";
import styles from "./BookDetail.module.css";

export function BookDetail() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();

  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<PagesResponse | null>(null);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editSectionId, setEditSectionId] = useState<string>("");
  const [editSeriesId, setEditSeriesId] = useState<string>("");
  const [editVolume, setEditVolume] = useState<string>("");
  const [editCategoryIds, setEditCategoryIds] = useState<string[]>([]);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSeriesName, setNewSeriesName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");

  useEffect(() => {
    if (!bookId) return;
    setLoading(true);
    Promise.all([
      api.getBook(bookId),
      api.getPages(bookId),
      api.getSections(),
      api.getSeries(),
      api.getCategories(),
    ])
      .then(([b, p, sec, ser, cat]) => {
        setBook(b);
        setPages(p);
        setAllSections(sec);
        setAllSeries(ser);
        setAllCategories(cat);
        setEditTitle(b.title);
        setEditAuthor(b.author ?? "");
        setEditSectionId(b.sectionId ?? "");
        setEditSeriesId(b.seriesId ?? "");
        setEditVolume(b.volumeNumber != null ? String(b.volumeNumber) : "");
        setEditCategoryIds(b.categoryIds);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [bookId]);

  async function handleSave() {
    if (!bookId) return;
    try {
      const updated = await api.updateBook(bookId, {
        title: editTitle,
        author: editAuthor || null,
        sectionId: editSectionId || null,
        seriesId: editSeriesId || null,
        volumeNumber: editVolume ? Number(editVolume) : null,
        categoryIds: editCategoryIds,
      });
      setBook({ ...book!, ...updated });
      setEditing(false);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    }
  }

  async function handleCreateSection() {
    if (!newSectionName.trim()) return;
    const s = await api.createSection(newSectionName.trim());
    setAllSections((prev) => [...prev, s]);
    setEditSectionId(s.id);
    setNewSectionName("");
  }

  async function handleCreateSeries() {
    if (!newSeriesName.trim()) return;
    const s = await api.createSeries(newSeriesName.trim());
    setAllSeries((prev) => [...prev, s]);
    setEditSeriesId(s.id);
    setNewSeriesName("");
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    const c = await api.createCategory(newCategoryName.trim());
    setAllCategories((prev) => [...prev, c]);
    setEditCategoryIds((prev) => [...prev, c.id]);
    setNewCategoryName("");
  }

  function toggleCategory(catId: string) {
    setEditCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!book || !pages) return null;

  const sectionName = book.sectionId
    ? allSections.find((s) => s.id === book.sectionId)?.name
    : null;
  const seriesName = book.seriesId
    ? allSeries.find((s) => s.id === book.seriesId)?.name
    : null;

  return (
    <div className={styles.container}>
      <Link to="/" className={styles.back}>← 本棚</Link>

      <div className={styles.layout}>
        {/* Cover */}
        <div className={styles.coverCol}>
          <div className={styles.cover}>
            {book.coverImage ? (
              <img src={book.coverImage} alt={book.title} />
            ) : (
              <div className={styles.placeholder}>No Cover</div>
            )}
          </div>
          <button
            className={styles.readBtn}
            onClick={() => navigate(`/read/${bookId}`)}
          >
            読む
          </button>
        </div>

        {/* Info */}
        <div className={styles.infoCol}>
          {!editing ? (
            <>
              <h1 className={styles.title}>{book.title}</h1>
              {book.author && (
                <p className={styles.author}>{book.author}</p>
              )}
              {sectionName && (
                <p className={styles.meta}>
                  セクション: <span className={styles.tag}>{sectionName}</span>
                </p>
              )}
              {seriesName && (
                <p className={styles.meta}>
                  シリーズ: {seriesName}
                  {book.volumeNumber != null && ` 第${book.volumeNumber}巻`}
                </p>
              )}
              {book.categoryIds.length > 0 && (
                <div className={styles.tags}>
                  {book.categoryIds.map((cid) => {
                    const cat = allCategories.find((c) => c.id === cid);
                    return cat ? (
                      <span key={cid} className={styles.tag}>{cat.name}</span>
                    ) : null;
                  })}
                </div>
              )}
              <p className={styles.meta}>{book.pageCount} ページ</p>

              {/* Rating */}
              <div className={styles.ratingRow}>
                <StarRating
                  value={book.rating}
                  onChange={async (r) => {
                    const updated = await api.updateBook(book.id, { rating: r });
                    if (updated) setBook({ ...book, ...updated });
                  }}
                />
              </div>

              {/* Reading status */}
              <div className={styles.statusRow}>
                <StatusBadge status={book.readingStatus} />
                <select
                  className={styles.statusSelect}
                  value={book.readingStatus}
                  onChange={async (e) => {
                    const status = e.target.value as ReadingStatus;
                    const updated = await api.updateBook(book.id, { readingStatus: status });
                    if (updated) setBook({ ...book, ...updated });
                  }}
                >
                  <option value="unread">未読</option>
                  <option value="reading">読書中</option>
                  <option value="completed">読了</option>
                </select>
              </div>

              <button
                className={styles.editBtn}
                onClick={() => setEditing(true)}
              >
                編集
              </button>
            </>
          ) : (
            <div className={styles.editForm}>
              <label className={styles.label}>
                タイトル
                <input
                  className={styles.input}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </label>

              <label className={styles.label}>
                著者名
                <input
                  className={styles.input}
                  value={editAuthor}
                  onChange={(e) => setEditAuthor(e.target.value)}
                  placeholder="著者名"
                />
              </label>

              <label className={styles.label}>
                セクション
                <div className={styles.row}>
                  <select
                    className={styles.input}
                    value={editSectionId}
                    onChange={(e) => setEditSectionId(e.target.value)}
                  >
                    <option value="">なし</option>
                    {allSections.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <input
                    className={styles.inputSmall}
                    placeholder="新規セクション"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateSection()}
                  />
                  <button className={styles.addBtn} onClick={handleCreateSection}>+</button>
                </div>
              </label>

              <label className={styles.label}>
                シリーズ
                <div className={styles.row}>
                  <select
                    className={styles.input}
                    value={editSeriesId}
                    onChange={(e) => setEditSeriesId(e.target.value)}
                  >
                    <option value="">なし</option>
                    {allSeries.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <input
                    className={styles.inputSmall}
                    placeholder="新規シリーズ"
                    value={newSeriesName}
                    onChange={(e) => setNewSeriesName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateSeries()}
                  />
                  <button className={styles.addBtn} onClick={handleCreateSeries}>+</button>
                </div>
              </label>

              <label className={styles.label}>
                巻数
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  placeholder="例: 1"
                  value={editVolume}
                  onChange={(e) => setEditVolume(e.target.value)}
                />
              </label>

              <div className={styles.label}>
                カテゴリ
                <div className={styles.categoryGrid}>
                  {allCategories.map((c) => (
                    <label key={c.id} className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={editCategoryIds.includes(c.id)}
                        onChange={() => toggleCategory(c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
                <div className={styles.row}>
                  <input
                    className={styles.inputSmall}
                    placeholder="新規カテゴリ"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateCategory()}
                  />
                  <button className={styles.addBtn} onClick={handleCreateCategory}>+</button>
                </div>
              </div>

              <div className={styles.editActions}>
                <button className={styles.saveBtn} onClick={handleSave}>保存</button>
                <button className={styles.cancelBtn} onClick={() => setEditing(false)}>キャンセル</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Page thumbnails */}
      {pages.pages.length > 0 && (
        <ThumbGrid pages={pages.pages} bookId={bookId!} />
      )}
    </div>
  );
}

const THUMB_LIMIT = 50;

function ThumbGrid({ pages, bookId }: { pages: { index: number; filename: string; url: string }[]; bookId: string }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(
    () => (showAll ? pages : pages.slice(0, THUMB_LIMIT)),
    [pages, showAll]
  );

  return (
    <div className={styles.thumbSection}>
      <h2 className={styles.thumbTitle}>ページ一覧</h2>
      <div className={styles.thumbGrid}>
        {visible.map((p) => (
          <div
            key={p.index}
            className={styles.thumb}
            onClick={() => navigate(`/read/${bookId}?page=${p.index}`)}
          >
            <img src={p.url} alt={`Page ${p.index + 1}`} loading="lazy" />
            <span className={styles.thumbLabel}>{p.index + 1}</span>
          </div>
        ))}
      </div>
      {!showAll && pages.length > THUMB_LIMIT && (
        <button
          className={styles.showAllBtn}
          onClick={() => setShowAll(true)}
        >
          すべて表示（{pages.length}ページ）
        </button>
      )}
    </div>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (r: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className={styles.stars} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={`${styles.star} ${star <= (hover || value) ? styles.starFilled : ""}`}
          onMouseEnter={() => setHover(star)}
          onClick={() => onChange(star === value ? 0 : star)}
        >
          ★
        </span>
      ))}
    </div>
  );
}

const STATUS_LABELS: Record<ReadingStatus, string> = {
  unread: "未読",
  reading: "読書中",
  completed: "読了",
};

function StatusBadge({ status }: { status: ReadingStatus }) {
  return (
    <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
