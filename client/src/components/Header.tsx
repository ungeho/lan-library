import { Link } from "react-router-dom";
import styles from "./Header.module.css";

interface Props {
  dark: boolean;
  onToggleDark: () => void;
}

export function Header({ dark, onToggleDark }: Props) {
  return (
    <header className={styles.header}>
      <Link to="/" className={styles.logo}>
        LAN Library
      </Link>
      <button className={styles.themeBtn} onClick={onToggleDark} title="テーマ切替">
        {dark ? "☀️" : "🌙"}
      </button>
    </header>
  );
}
