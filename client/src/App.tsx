import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Header } from "./components/Header";
import { Bookshelf } from "./pages/Bookshelf";
import { BookDetail } from "./pages/BookDetail";
import { Reader } from "./pages/Reader";
import { useDarkMode } from "./hooks/useDarkMode";

export default function App() {
  const [dark, toggleDark] = useDarkMode();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/read/:bookId" element={<Reader />} />
        <Route
          path="*"
          element={
            <>
              <Header dark={dark} onToggleDark={toggleDark} />
              <main>
                <Routes>
                  <Route path="/" element={<Bookshelf />} />
                  <Route path="/book/:bookId" element={<BookDetail />} />
                </Routes>
              </main>
            </>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
