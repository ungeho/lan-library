export interface Section {
  id: string;
  name: string;
}

export interface Book {
  id: string;
  folderName: string;
  sourceType: "folder" | "zip";
  title: string;
  sectionId: string | null;
  seriesId: string | null;
  volumeNumber: number | null;
  categoryIds: string[];
  createdAt: string;
  coverImage: string | null;
  pageCount: number;
}

export interface Series {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface Page {
  index: number;
  filename: string;
  url: string;
}

export interface PagesResponse {
  bookId: string;
  pages: Page[];
}
