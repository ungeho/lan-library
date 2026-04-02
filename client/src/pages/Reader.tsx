import { useParams, Link, useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { api } from "../hooks/useApi";
import { Loading, ErrorMessage } from "../components/Loading";
import type { PagesResponse } from "../types";
import styles from "./Reader.module.css";

type ReadingDirection = "rtl" | "ltr";

export function Reader() {
  const { bookId } = useParams<{ bookId: string }>();
  const [searchParams] = useSearchParams();

  const [data, setData] = useState<PagesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const startPage = Number(searchParams.get("page") ?? 0);
  const [currentPage, setCurrentPage] = useState(startPage);
  const [spread, setSpread] = useState(false);
  const [direction, setDirection] = useState<ReadingDirection>(() => {
    return (localStorage.getItem("reading-direction") as ReadingDirection) || "rtl";
  });
  const [showUI, setShowUI] = useState(true);

  useEffect(() => {
    if (!bookId) return;
    setLoading(true);
    api.getPages(bookId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [bookId]);

  const totalPages = data?.pages.length ?? 0;
  const maxPage = spread ? Math.max(0, totalPages - 2) : Math.max(0, totalPages - 1);

  const goNext = useCallback(() => {
    setCurrentPage((p) => Math.min(p + (spread ? 2 : 1), maxPage));
  }, [spread, maxPage]);

  const goPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(p - (spread ? 2 : 1), 0));
  }, [spread]);

  const goLeft = useCallback(() => {
    if (direction === "rtl") goNext(); else goPrev();
  }, [direction, goNext, goPrev]);

  const goRight = useCallback(() => {
    if (direction === "rtl") goPrev(); else goNext();
  }, [direction, goNext, goPrev]);

  useEffect(() => {
    localStorage.setItem("reading-direction", direction);
  }, [direction]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowLeft": goLeft(); break;
        case "ArrowRight": goRight(); break;
        case "ArrowUp": case "PageUp": goPrev(); break;
        case "ArrowDown": case "PageDown": goNext(); break;
        case " ": e.preventDefault(); goNext(); break;
        case "f": setSpread((s) => !s); break;
        case "Escape": setShowUI((s) => !s); break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goLeft, goRight, goNext, goPrev]);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!data || data.pages.length === 0) {
    return <ErrorMessage message="ページが見つかりません" />;
  }

  const currentPages = spread
    ? data.pages.slice(currentPage, currentPage + 2)
    : [data.pages[currentPage]];

  const displayPages =
    spread && direction === "rtl" ? [...currentPages].reverse() : currentPages;

  return (
    <div
      className={styles.reader}
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < rect.width / 3) goLeft();
        else if (x > (rect.width * 2) / 3) goRight();
        else setShowUI((s) => !s);
      }}
    >
      <div className={`${styles.viewport} ${spread ? styles.spread : ""}`}>
        {displayPages.map((page) => (
          <img
            key={page.index}
            src={page.url}
            alt={`Page ${page.index + 1}`}
            className={styles.page}
            draggable={false}
          />
        ))}
      </div>

      {showUI && (
        <>
          <div className={styles.topBar}>
            <Link to={`/book/${bookId}`} className={styles.backBtn} onClick={(e) => e.stopPropagation()}>
              ← 戻る
            </Link>
            <span className={styles.pageInfo}>
              {currentPage + 1}
              {spread && currentPage + 1 < totalPages ? `-${currentPage + 2}` : ""}
              {" / "}{totalPages}
            </span>
          </div>

          <div className={styles.bottomBar}>
            <button className={styles.controlBtn} onClick={(e) => { e.stopPropagation(); setSpread((s) => !s); }} title="見開き切替 (F)">
              {spread ? "単ページ" : "見開き"}
            </button>
            <button className={styles.controlBtn} onClick={(e) => { e.stopPropagation(); setDirection((d) => d === "rtl" ? "ltr" : "rtl"); }} title="読み方向切替">
              {direction === "rtl" ? "右→左" : "左→右"}
            </button>
            <input
              type="range"
              className={styles.slider}
              min={0}
              max={maxPage}
              value={currentPage}
              onChange={(e) => { e.stopPropagation(); setCurrentPage(Number(e.target.value)); }}
              onClick={(e) => e.stopPropagation()}
              style={{ direction: direction === "rtl" ? "rtl" : "ltr" }}
            />
          </div>
        </>
      )}
    </div>
  );
}
