import type {
  Chapter,
  Filter,
  FilterValue,
  Listing,
  Manga,
  MangaPageResult,
} from "@/sources/aidokuContract";
import type { SelfHostedKind } from "./policy";

/** A page the server will serve; `index` is the zero-based reading position. */
export type SelfHostedPageRef = {
  index: number;
  url: string;
};

/**
 * What the app needs from a server, independent of the server's API. Komga,
 * Kavita and Suwayomi each implement it from their own official HTTP API; the
 * executor adapter turns it into the source interface the library, reader and
 * updates already use. Everything here talks to the one server the user entered.
 */
export interface SelfHostedBackend {
  readonly kind: SelfHostedKind;
  /** Verifies reachability and the login. Throws a `SelfHostedError` with a specific code. */
  testConnection(signal?: AbortSignal): Promise<{ version?: string }>;
  getListings(): Promise<Listing[]>;
  getFilters(): Promise<Filter[]>;
  getMangaListForListing(listing: Listing, page: number): Promise<MangaPageResult>;
  search(query: string | null, page: number, filters: FilterValue[]): Promise<MangaPageResult>;
  getMangaDetails(manga: Manga): Promise<Manga>;
  getChapterList(manga: Manga): Promise<Chapter[]>;
  getPageList(manga: Manga, chapter: Chapter): Promise<SelfHostedPageRef[]>;
  /**
   * The request that fetches an image of this server (cover or page): the URL
   * (a server that wants its key in the query adds it here, so it is never
   * stored in a persisted cover or cached page list) plus the auth headers.
   */
  imageRequest(url: string): Promise<{ url: string; headers: Record<string, string> }>;
  /** Whether `url` is an image URL of the server this backend talks to. */
  isServerUrl(url: string): boolean;
  /** Called when the user's saved login changes; drops any cached session. */
  dispose(): void;
}
