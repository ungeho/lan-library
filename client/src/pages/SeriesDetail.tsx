import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { api } from "../hooks/useApi";
import { Loading, ErrorMessage } from "../components/Loading";
import type { Book, Series } from "../types";
import styles from "./SeriesDetail.module.css";

export function SeriesDetail() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const navigate = useNavigate();
  const [series, setSeries] = useState<Series | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seriesId) return;
    setLoading(true);
    Promise.all([
      api.getSeries(),
      api.getBooks({ seriesId }),
    ])
      .then(([allSeries, seriesBooks]) => {
        const s = allSeries.find((x) => x.id === seriesId) ?? null;
        setSeries(s);
        const sorted = [...seriesBooks].sort(
          (a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0)
        );
        setBooks(sorted);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [seriesId]);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!series) return <ErrorMessage message="シリーズが見つかりません" />;

  const author = books.find((b) => b.author)?.author ?? null;

  return (
    <div className={styles.container}>
      <Link to="/" className={styles.back}>← 本棚</Link>

      <div className={styles.header}>
        <h1 className={styles.title}>{series.name}</h1>
        {author && <p className={styles.author}>{author}</p>}
        <p className={styles.meta}>{books.length}巻</p>
      </div>

      <div className={styles.grid}>
        {books.map((b) => (
          <div
            key={b.id}
            className={styles.card}
            onClick={() => navigate(`/book/${b.id}`)}
          >
            <div className={styles.cover}>
              {b.coverImage ? (
                <img src={b.coverImage} alt={b.title} loading="lazy" />
              ) : (
                <div className={styles.placeholder}>No Cover</div>
              )}
            </div>
            <div className={styles.info}>
              <span className={styles.cardTitle}>
                {b.volumeNumber != null ? `第${b.volumeNumber}巻` : b.title}
              </span>
              <span className={styles.cardMeta}>{b.pageCount}P</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
