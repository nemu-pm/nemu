/**
 * Core provider types for manga sources
 */

// ============ MANGA SOURCE INTERFACE ============

export interface MangaSource {
  readonly id: string;
  readonly name: string;

  search(query: string): Promise<SearchResult<Manga>>;
  getManga(mangaId: string): Promise<Manga>;
  getChapters(mangaId: string): Promise<Chapter[]>;
  getPages(mangaId: string, chapterId: string): Promise<Page[]>;

  dispose(): void;
}

// ============ SEARCH RESULT WITH PAGINATION ============

export interface SearchResult<T> {
  items: T[];
  hasMore: boolean;
  loadMore?: () => Promise<SearchResult<T>>;
}

// ============ CONTENT TYPES ============

export const MangaStatus = {
  Unknown: 0,
  Ongoing: 1,
  Completed: 2,
  Cancelled: 3,
  Hiatus: 4,
} as const;

export type MangaStatus = (typeof MangaStatus)[keyof typeof MangaStatus];

export interface Manga {
  id: string;
  title: string;
  cover?: string;
  authors?: string[];
  artists?: string[];
  description?: string;
  tags?: string[];
  status?: MangaStatus;
  url?: string;
}

export interface Chapter {
  id: string;
  title?: string;
  chapterNumber?: number;
  volumeNumber?: number;
  dateUploaded?: number;
  scanlator?: string;
  url?: string;
}

export interface Page {
  index: number;
  getImage(): Promise<Blob>;
}

