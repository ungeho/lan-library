import { useParams, Link, useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
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

  const startPage = Number(
    searchParams.get("page") ??
    (bookId ? localStorage.getItem(`reading-progress-${bookId}`) : null) ??
    0
  );
  const [currentPage, setCurrentPage] = useState(startPage);
  const [spread, setSpread] = useState(false);
  const [direction, setDirection] = useState<ReadingDirection>(() => {
    return (localStorage.getItem("reading-direction") as ReadingDirection) || "rtl";
  });
  const [showUI, setShowUI] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookId) return;
    setLoading(true);
    api.getPages(bookId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // Mark as reading and update lastReadAt
    api.updateBook(bookId, { readingStatus: "reading", lastReadAt: new Date().toISOString() }).catch(() => {});
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

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      readerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Save reading progress
  useEffect(() => {
    if (bookId) {
      localStorage.setItem(`reading-progress-${bookId}`, String(currentPage));
    }
  }, [bookId, currentPage]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowLeft": goLeft(); break;
        case "ArrowRight": goRight(); break;
        case "ArrowUp": case "PageUp": goPrev(); break;
        case "ArrowDown": case "PageDown": goNext(); break;
        case " ": e.preventDefault(); goNext(); break;
        case "f": setSpread((s) => !s); break;
        case "Escape":
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else setShowUI((s) => !s);
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goLeft, goRight, goNext, goPrev]);

  // Preload adjacent pages for faster navigation
  useEffect(() => {
    if (!data) return;
    const preloadRange = spread ? 4 : 2;
    const start = Math.max(0, currentPage - preloadRange);
    const end = Math.min(data.pages.length - 1, currentPage + (spread ? 2 : 1) + preloadRange);
    const imgs = data.pages.slice(start, end + 1).map((p) => {
      const img = new Image();
      img.src = p.url;
      return img;
    });
    return () => {
      imgs.forEach((img) => { img.src = ""; });
    };
  }, [data, currentPage, spread]);

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
      ref={readerRef}
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
          <div key={page.index} className={styles.pageWrapper}>
            <div className={styles.pageSpinner} />
            <img
              src={page.url}
              alt={`Page ${page.index + 1}`}
              className={styles.page}
              draggable={false}
            />
          </div>
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
            <button className={styles.controlBtn} onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} title="全画面切替">
              {isFullscreen ? "全画面解除" : "全画面"}
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
