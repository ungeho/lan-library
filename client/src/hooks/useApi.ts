import type { Book, Section, Series, Category } from "../types";

const BASE = "/api/library";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  // Books
  getBooks: (params?: { q?: string; sectionId?: string; seriesId?: string; categoryId?: string }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.sectionId) sp.set("sectionId", params.sectionId);
    if (params?.seriesId) sp.set("seriesId", params.seriesId);
    if (params?.categoryId) sp.set("categoryId", params.categoryId);
    const qs = sp.toString();
    return request<Book[]>(`${BASE}/books${qs ? `?${qs}` : ""}`);
  },
  getBook: (id: string) => request<Book>(`${BASE}/books/${id}`),
  updateBook: (id: string, data: Partial<Pick<Book, "title" | "sectionId" | "seriesId" | "volumeNumber" | "categoryIds">>) =>
    request<Book>(`${BASE}/books/${id}`, json(data)),
  getPages: (bookId: string) => request<{ bookId: string; pages: { index: number; filename: string; url: string }[] }>(`${BASE}/books/${bookId}/pages`),

  // Sections
  getSections: () => request<Section[]>(`${BASE}/sections`),
  createSection: (name: string) => request<Section>(`${BASE}/sections`, post({ name })),
  updateSection: (id: string, name: string) => request<Section>(`${BASE}/sections/${id}`, json({ name })),
  deleteSection: (id: string) => request<void>(`${BASE}/sections/${id}`, { method: "DELETE" }),

  // Series
  getSeries: () => request<Series[]>(`${BASE}/series`),
  createSeries: (name: string) => request<Series>(`${BASE}/series`, post({ name })),
  updateSeries: (id: string, name: string) => request<Series>(`${BASE}/series/${id}`, json({ name })),
  deleteSeries: (id: string) => request<void>(`${BASE}/series/${id}`, { method: "DELETE" }),

  // Categories
  getCategories: () => request<Category[]>(`${BASE}/categories`),
  createCategory: (name: string, parentId?: string | null) => request<Category>(`${BASE}/categories`, post({ name, parentId })),
  updateCategory: (id: string, data: Partial<Pick<Category, "name" | "parentId">>) => request<Category>(`${BASE}/categories/${id}`, json(data)),
  deleteCategory: (id: string) => request<void>(`${BASE}/categories/${id}`, { method: "DELETE" }),
};
