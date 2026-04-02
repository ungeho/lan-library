import styles from "./Loading.module.css";

export function Loading() {
  return <div className={styles.loading}>読み込み中...</div>;
}

export function ErrorMessage({ message }: { message: string }) {
  return <div className={styles.error}>{message}</div>;
}
