// Types for Keiyoushi (Tachiyomi/Mihon) WASM sources

export interface SourceInfo {
  id: string;
  name: string;
  lang: string;
  baseUrl: string;
}

export interface MangaDto {
  url: string;
  title: string;
  artist?: string;
  author?: string;
  description?: string;
  genre: string[];
  status: number;
  thumbnailUrl?: string;
  initialized: boolean;
}

export interface ChapterDto {
  url: string;
  name: string;
  dateUpload: number;
  chapterNumber: number;
  scanlator?: string;
}

export interface PageDto {
  index: number;
  url: string;
  imageUrl?: string;
}

export interface MangasPageDto {
  mangas: MangaDto[];
  hasNextPage: boolean;
}

// Manifest format (simplified - could expand later)
export interface KeiyoushiManifest {
  id: string;
  name: string;
  lang: string;
  version: string;
  wasmPath: string;
}

