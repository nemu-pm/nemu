// Postcard serialization using @variegated-coffee/serde-postcard-ts
import {
  tryEncodeString,
  tryEncodeVarintI64,
  tryDecodeString,
  tryDecodeVarintU32,
  tryDecodeVarintI64,
  tryDecodeF32,
  tryDecodeU8,
} from "@variegated-coffee/serde-postcard-ts";

export { tryEncodeString, tryDecodeString };

// Encode a string for postcard format
export function encodeString(str: string): Uint8Array {
  const result = tryEncodeString(str);
  if (!result.ok) {
    throw new Error(`Failed to encode string: ${result.error}`);
  }
  return result.value.bytes;
}

// Decode a string from postcard format
export function decodeString(bytes: Uint8Array, offset = 0): [string, number] {
  const result = tryDecodeString(bytes, offset);
  if (!result.ok) {
    throw new Error(`Failed to decode string at offset ${offset}: ${result.error}`);
  }
  return [result.value.value, result.value.bytesRead + offset];
}

// Encode empty Vec (just length 0)
export function encodeEmptyVec(): Uint8Array {
  return new Uint8Array([0]);
}

// Encode Option<String> - None = 0, Some = 1 + string
export function encodeOptionString(str: string | null): Uint8Array {
  if (str === null) {
    return new Uint8Array([0]); // None
  }
  const strBytes = encodeString(str);
  const result = new Uint8Array(1 + strBytes.length);
  result[0] = 1; // Some
  result.set(strBytes, 1);
  return result;
}

// Decode Option<String>
export function decodeOptionString(bytes: Uint8Array, offset = 0): [string | null, number] {
  if (bytes[offset] === 0) {
    return [null, offset + 1];
  }
  return decodeString(bytes, offset + 1);
}

// Decode varint u32
export function decodeVarint(bytes: Uint8Array, offset = 0): [number, number] {
  const result = tryDecodeVarintU32(bytes, offset);
  if (!result.ok) {
    throw new Error(`Failed to decode varint: ${result.error}`);
  }
  return [result.value.value, result.value.bytesRead + offset];
}

// Decode i32 (little-endian fixed size)
export function decodeI32(bytes: Uint8Array, offset: number): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
  return [view.getInt32(0, true), offset + 4];
}

// Decode i64 (zigzag varint, as number - may lose precision for very large values)
export function decodeI64(bytes: Uint8Array, offset: number): [number, number] {
  const result = tryDecodeVarintI64(bytes, offset);
  if (!result.ok) {
    throw new Error(`Failed to decode i64: ${result.error}`);
  }
  // Convert BigInt to number (may lose precision for values > Number.MAX_SAFE_INTEGER)
  return [Number(result.value.value), result.value.bytesRead + offset];
}

// Decode f32
export function decodeF32(bytes: Uint8Array, offset: number): [number, number] {
  const result = tryDecodeF32(bytes, offset);
  if (!result.ok) {
    throw new Error(`Failed to decode f32: ${result.error}`);
  }
  return [result.value.value, result.value.bytesRead + offset];
}

// Decode u8
export function decodeU8(bytes: Uint8Array, offset: number): [number, number] {
  const result = tryDecodeU8(bytes, offset);
  if (!result.ok) {
    throw new Error(`Failed to decode u8: ${result.error}`);
  }
  return [result.value.value, result.value.bytesRead + offset];
}

// Decode bool
export function decodeBool(bytes: Uint8Array, offset: number): [boolean, number] {
  return [bytes[offset] !== 0, offset + 1];
}

// Decode Option<T>
export function decodeOption<T>(
  bytes: Uint8Array, 
  offset: number, 
  decodeInner: (bytes: Uint8Array, offset: number) => [T, number]
): [T | null, number] {
  if (bytes[offset] === 0) {
    return [null, offset + 1];
  }
  return decodeInner(bytes, offset + 1);
}

// Decode Vec<T>
export function decodeVec<T>(
  bytes: Uint8Array, 
  offset: number, 
  decodeItem: (bytes: Uint8Array, offset: number) => [T, number]
): [T[], number] {
  const [len, lenEnd] = decodeVarint(bytes, offset);
  const items: T[] = [];
  let pos = lenEnd;
  
  for (let i = 0; i < len; i++) {
    const [item, itemEnd] = decodeItem(bytes, pos);
    items.push(item);
    pos = itemEnd;
  }
  
  return [items, pos];
}

// Decode Chapter from postcard
export interface DecodedChapter {
  key: string;
  title: string | null;
  chapterNumber: number | null;
  volumeNumber: number | null;
  dateUploaded: number | null;
  scanlators: string[] | null;
  url: string | null;
  language: string | null;
  thumbnail: string | null;
  locked: boolean;
}

export function decodeChapter(bytes: Uint8Array, offset: number): [DecodedChapter, number] {
  let pos = offset;
  
  let key: string;
  let title: string | null;
  let chapterNumber: number | null;
  let volumeNumber: number | null;
  let dateUploaded: number | null;
  let scanlators: string[] | null;
  let url: string | null;
  let language: string | null;
  let thumbnail: string | null;
  let locked: boolean;
  
  [key, pos] = decodeString(bytes, pos);
  [title, pos] = decodeOption(bytes, pos, decodeString);
  [chapterNumber, pos] = decodeOption(bytes, pos, decodeF32);
  [volumeNumber, pos] = decodeOption(bytes, pos, decodeF32);
  [dateUploaded, pos] = decodeOption(bytes, pos, decodeI64);
  [scanlators, pos] = decodeOption(bytes, pos, (b, o) => decodeVec(b, o, decodeString));
  [url, pos] = decodeOption(bytes, pos, decodeString);
  [language, pos] = decodeOption(bytes, pos, decodeString);
  [thumbnail, pos] = decodeOption(bytes, pos, decodeString);
  [locked, pos] = decodeBool(bytes, pos);
  
  return [{
    key, title, chapterNumber, volumeNumber, dateUploaded, 
    scanlators, url, language, thumbnail, locked
  }, pos];
}

// Decode Manga from postcard (field order from aidoku-rs Manga struct)
export interface DecodedManga {
  key: string;
  title: string;
  cover: string | null;
  artists: string[] | null;
  authors: string[] | null;
  description: string | null;
  url: string | null;
  tags: string[] | null;
  status: number;
  contentRating: number;
  viewer: number;
  updateStrategy: number;
  nextUpdateTime: number | null;
  chapters: DecodedChapter[] | null;
}

export function decodeManga(bytes: Uint8Array, offset: number): [DecodedManga, number] {
  let pos = offset;
  
  let key: string;
  let title: string;
  let cover: string | null;
  let artists: string[] | null;
  let authors: string[] | null;
  let description: string | null;
  let url: string | null;
  let tags: string[] | null;
  let status: number;
  let contentRating: number;
  let viewer: number;
  let updateStrategy: number;
  let nextUpdateTime: number | null;
  
  // Field order matches aidoku-rs Manga struct
  [key, pos] = decodeString(bytes, pos);
  [title, pos] = decodeString(bytes, pos);
  [cover, pos] = decodeOption(bytes, pos, decodeString);
  [artists, pos] = decodeOption(bytes, pos, (b, o) => decodeVec(b, o, decodeString));
  [authors, pos] = decodeOption(bytes, pos, (b, o) => decodeVec(b, o, decodeString));
  [description, pos] = decodeOption(bytes, pos, decodeString);
  [url, pos] = decodeOption(bytes, pos, decodeString);
  [tags, pos] = decodeOption(bytes, pos, (b, o) => decodeVec(b, o, decodeString));
  
  // Enums encoded as u8
  [status, pos] = decodeU8(bytes, pos);
  [contentRating, pos] = decodeU8(bytes, pos);
  [viewer, pos] = decodeU8(bytes, pos);
  [updateStrategy, pos] = decodeU8(bytes, pos);
  
  // next_update_time: Option<i64>
  [nextUpdateTime, pos] = decodeOption(bytes, pos, decodeI64);
  
  // chapters: Option<Vec<Chapter>>
  let chapters: DecodedChapter[] | null;
  [chapters, pos] = decodeOption(bytes, pos, (b, o) => decodeVec(b, o, decodeChapter));
  
  return [{
    key, title, cover, artists, authors, description, url, tags, 
    status, contentRating, viewer, updateStrategy, nextUpdateTime, chapters
  }, pos];
}

// Decode MangaPageResult
export interface DecodedMangaPageResult {
  entries: DecodedManga[];
  hasNextPage: boolean;
}

export function decodeMangaPageResult(bytes: Uint8Array, offset = 0): DecodedMangaPageResult {
  let pos = offset;
  
  const [entries, entriesEnd] = decodeVec(bytes, pos, decodeManga);
  pos = entriesEnd;
  
  const [hasNextPage] = decodeBool(bytes, pos);
  
  return { entries, hasNextPage };
}

// Decode Page from postcard
// PageContent enum variants:
// 0 = Url(String, Option<HashMap<String, String>>)
// 1 = Text(String)
// 2 = Zip(String, String)
export interface DecodedPage {
  url: string | null;
  text: string | null;
  context: Record<string, string> | null;
  thumbnail: string | null;
  hasDescription: boolean;
  description: string | null;
}

export function decodePage(bytes: Uint8Array, offset: number): [DecodedPage, number] {
  let pos = offset;
  
  let url: string | null = null;
  let text: string | null = null;
  let context: Record<string, string> | null = null;
  
  // content: PageContent (enum)
  const [variant, variantEnd] = decodeVarint(bytes, pos);
  pos = variantEnd;
  
  if (variant === 0) {
    // Url(String, Option<PageContext>)
    [url, pos] = decodeString(bytes, pos);
    
    // Option<PageContext> where PageContext = HashMap<String, String>
    const hasContext = bytes[pos++];
    if (hasContext === 1) {
      context = {};
      const [mapLen, mapLenEnd] = decodeVarint(bytes, pos);
      pos = mapLenEnd;
      for (let i = 0; i < mapLen; i++) {
        let key: string, value: string;
        [key, pos] = decodeString(bytes, pos);
        [value, pos] = decodeString(bytes, pos);
        context[key] = value;
      }
    }
  } else if (variant === 1) {
    // Text(String)
    [text, pos] = decodeString(bytes, pos);
  } else if (variant === 2) {
    // Zip(String, String) - treat as url for now
    let zipUrl: string, filePath: string;
    [zipUrl, pos] = decodeString(bytes, pos);
    [filePath, pos] = decodeString(bytes, pos);
    url = `${zipUrl}#${filePath}`;
  }
  
  // thumbnail: Option<String>
  let thumbnail: string | null;
  [thumbnail, pos] = decodeOption(bytes, pos, decodeString);
  
  // has_description: bool
  let hasDescription: boolean;
  [hasDescription, pos] = decodeBool(bytes, pos);
  
  // description: Option<String>
  let description: string | null;
  [description, pos] = decodeOption(bytes, pos, decodeString);
  
  return [{
    url, text, context, thumbnail, hasDescription, description
  }, pos];
}

// Decode Vec<Page>
export function decodePageList(bytes: Uint8Array, offset = 0): DecodedPage[] {
  const [pages] = decodeVec(bytes, offset, decodePage);
  return pages;
}

// Filter decoding

// Decoded filter types
export interface DecodedSortSelection {
  index: number;
  ascending: boolean;
}

export interface DecodedGenreSelection {
  index: number;
  state: number; // -1 = excluded, 0 = none, 1 = included
}

export interface DecodedFilter {
  type: number;
  name: string;
  options?: string[];
  default?: number | boolean | DecodedSortSelection | DecodedGenreSelection[];
  canAscend?: boolean;
  canExclude?: boolean;
  filters?: DecodedFilter[];
}

// Decode SortSelection
function decodeSortSelection(bytes: Uint8Array, offset: number): [DecodedSortSelection, number] {
  let pos = offset;
  let index: number;
  let ascending: boolean;

  [index, pos] = decodeVarint(bytes, pos);
  [ascending, pos] = decodeBool(bytes, pos);

  return [{ index, ascending }, pos];
}

// Decode GenreSelection
function decodeGenreSelection(bytes: Uint8Array, offset: number): [DecodedGenreSelection, number] {
  let pos = offset;
  let index: number;
  let state: number;

  [index, pos] = decodeVarint(bytes, pos);
  // State is encoded as i8 (zigzag varint)
  const [stateRaw, stateEnd] = decodeVarint(bytes, pos);
  // Decode zigzag
  state = (stateRaw >>> 1) ^ -(stateRaw & 1);
  pos = stateEnd;

  return [{ index, state }, pos];
}

// Decode a single Filter
export function decodeFilter(bytes: Uint8Array, offset: number): [DecodedFilter, number] {
  let pos = offset;

  // Filter is an enum with variants:
  // 0 = Title(String)
  // 1 = Author(String)
  // 2 = Select { name, options, default }
  // 3 = Sort { name, options, default, can_ascend }
  // 4 = Check { name, default }
  // 5 = Group { name, filters }
  // 6 = Genre { name, options, can_exclude, default }

  const [variant, variantEnd] = decodeVarint(bytes, pos);
  pos = variantEnd;

  let name: string;

  switch (variant) {
    case 0: // Title
      [name, pos] = decodeString(bytes, pos);
      return [{ type: 0, name }, pos];

    case 1: // Author
      [name, pos] = decodeString(bytes, pos);
      return [{ type: 1, name }, pos];

    case 2: { // Select
      [name, pos] = decodeString(bytes, pos);
      let options: string[];
      [options, pos] = decodeVec(bytes, pos, decodeString);
      let defaultVal: number;
      [defaultVal, pos] = decodeVarint(bytes, pos);
      return [{ type: 2, name, options, default: defaultVal }, pos];
    }

    case 3: { // Sort
      [name, pos] = decodeString(bytes, pos);
      let options: string[];
      [options, pos] = decodeVec(bytes, pos, decodeString);
      let defaultVal: DecodedSortSelection;
      [defaultVal, pos] = decodeSortSelection(bytes, pos);
      let canAscend: boolean;
      [canAscend, pos] = decodeBool(bytes, pos);
      return [{ type: 3, name, options, default: defaultVal, canAscend }, pos];
    }

    case 4: { // Check
      [name, pos] = decodeString(bytes, pos);
      let defaultVal: boolean;
      [defaultVal, pos] = decodeBool(bytes, pos);
      return [{ type: 4, name, default: defaultVal }, pos];
    }

    case 5: { // Group
      [name, pos] = decodeString(bytes, pos);
      let filters: DecodedFilter[];
      [filters, pos] = decodeVec(bytes, pos, decodeFilter);
      return [{ type: 5, name, filters }, pos];
    }

    case 6: { // Genre
      [name, pos] = decodeString(bytes, pos);
      let options: string[];
      [options, pos] = decodeVec(bytes, pos, decodeString);
      let canExclude: boolean;
      [canExclude, pos] = decodeBool(bytes, pos);
      let defaultVal: DecodedGenreSelection[];
      [defaultVal, pos] = decodeVec(bytes, pos, decodeGenreSelection);
      return [{ type: 6, name, options, canExclude, default: defaultVal }, pos];
    }

    default:
      throw new Error(`Unknown filter variant: ${variant}`);
  }
}

// Decode Vec<Filter>
export function decodeFilterList(bytes: Uint8Array, offset = 0): DecodedFilter[] {
  const [filters] = decodeVec(bytes, offset, decodeFilter);
  return filters;
}

// ============================================================================
// Encoding helpers for WASM communication
// ============================================================================

// Concatenate multiple Uint8Arrays
export function concatBytes(arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Encode varint (unsigned)
export function encodeVarint(val: number): Uint8Array {
  const bytes: number[] = [];
  while (val >= 0x80) {
    bytes.push((val & 0x7f) | 0x80);
    val >>>= 7;
  }
  bytes.push(val);
  return new Uint8Array(bytes);
}

// Encode Vec<String>
export function encodeVecString(arr: string[]): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(encodeVarint(arr.length));
  for (const s of arr) {
    parts.push(encodeString(s));
  }
  return concatBytes(parts);
}

// Encode bool
export function encodeBool(val: boolean): Uint8Array {
  return new Uint8Array([val ? 1 : 0]);
}

// Encode i32 (zigzag varint)
export function encodeI32(val: number): Uint8Array {
  // zigzag encoding
  const zigzag = (val << 1) ^ (val >> 31);
  return encodeVarint(zigzag >>> 0);
}

// Encode f32 (little-endian)
export function encodeF32(val: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setFloat32(0, val, true);
  return new Uint8Array(buf);
}

/**
 * Encode any JS value to postcard format.
 * Supports: string, number, boolean, string[], and plain objects with string values.
 */
export function encodeValue(value: unknown): Uint8Array {
  if (value === null || value === undefined) {
    return new Uint8Array([0]); // Null/None
  }
  if (typeof value === "boolean") {
    return encodeBool(value);
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return encodeI32(value);
    }
    return encodeF32(value);
  }
  if (typeof value === "string") {
    return encodeString(value);
  }
  if (Array.isArray(value)) {
    // Assume string array (Vec<String>)
    return encodeVecString(value.map(String));
  }
  // For objects, we don't have a standard encoding - return empty
  console.warn("[postcard] Cannot encode object type:", typeof value);
  return new Uint8Array([0]);
}

// Encode Option<String> as raw bytes (alias for encodeOptionString)
export function encodeOptionBytes(str: string | null): Uint8Array {
  if (str === null) return new Uint8Array([0]);
  const strBytes = encodeString(str);
  const result = new Uint8Array(1 + strBytes.length);
  result[0] = 1;
  result.set(strBytes, 1);
  return result;
}

// Encode Option<Vec<String>>
export function encodeOptionVecString(arr: string[] | null): Uint8Array {
  if (arr === null) return new Uint8Array([0]);
  const parts: Uint8Array[] = [new Uint8Array([1])]; // Some
  parts.push(encodeVarint(arr.length));
  for (const s of arr) {
    parts.push(encodeString(s));
  }
  return concatBytes(parts);
}

// Encode Option<f32>
export function encodeOptionF32(val: number | null): Uint8Array {
  if (val === null) return new Uint8Array([0]);
  const buf = new ArrayBuffer(5);
  const view = new DataView(buf);
  view.setUint8(0, 1);
  view.setFloat32(1, val, true);
  return new Uint8Array(buf);
}

// Encode Option<i64> (zigzag varint)
export function encodeOptionI64(val: number | null): Uint8Array {
  if (val === null) return new Uint8Array([0]);
  const result = tryEncodeVarintI64(BigInt(val));
  if (!result.ok) {
    throw new Error(`Failed to encode i64: ${result.error}`);
  }
  const varintBytes = result.value.bytes;
  const combined = new Uint8Array(1 + varintBytes.length);
  combined[0] = 1; // Some
  combined.set(varintBytes, 1);
  return combined;
}

// ============================================================================
// Manga/Chapter encoders for WASM
// ============================================================================

import type { Manga, Chapter } from "./types";

// Encode manga for WASM (matches aidoku-rs Manga struct order)
export function encodeManga(manga: Manga): Uint8Array {
  const parts: Uint8Array[] = [];

  // key (String)
  parts.push(encodeString(manga.key || manga.id || ""));
  // title (String)
  parts.push(encodeString(manga.title || ""));
  // cover (Option<String>)
  parts.push(encodeOptionBytes(manga.cover || null));
  // artists (Option<Vec<String>>)
  parts.push(encodeOptionVecString(manga.artists || null));
  // authors (Option<Vec<String>>)
  parts.push(encodeOptionVecString(manga.authors || null));
  // description (Option<String>)
  parts.push(encodeOptionBytes(manga.description || null));
  // url (Option<String>)
  parts.push(encodeOptionBytes(manga.url || null));
  // tags (Option<Vec<String>>)
  parts.push(encodeOptionVecString(manga.tags || null));
  // status (u8)
  parts.push(new Uint8Array([manga.status || 0]));
  // content_rating (u8)
  parts.push(new Uint8Array([manga.nsfw || 0]));
  // viewer (u8)
  parts.push(new Uint8Array([manga.viewer || 0]));
  // update_strategy (u8)
  parts.push(new Uint8Array([0]));
  // next_update_time (Option<i64>)
  parts.push(new Uint8Array([0])); // None
  // chapters (Option<Vec<Chapter>>)
  parts.push(new Uint8Array([0])); // None

  return concatBytes(parts);
}

// Encode HashMap<String, String>
export function encodeHashMap(map: Record<string, string>): Uint8Array {
  const entries = Object.entries(map);
  const parts: Uint8Array[] = [];
  parts.push(encodeVarint(entries.length));
  for (const [key, value] of entries) {
    parts.push(encodeString(key));
    parts.push(encodeString(value));
  }
  return concatBytes(parts);
}

// Encode PageContext (HashMap<String, String>)
export function encodePageContext(context: Record<string, string> | null): Uint8Array {
  if (context === null) return new Uint8Array([0]); // None
  const mapBytes = encodeHashMap(context);
  const result = new Uint8Array(1 + mapBytes.length);
  result[0] = 1; // Some
  result.set(mapBytes, 1);
  return result;
}

// Encode u16 (little-endian)
export function encodeU16(val: number): Uint8Array {
  const buf = new ArrayBuffer(2);
  const view = new DataView(buf);
  view.setUint16(0, val, true);
  return new Uint8Array(buf);
}

// Encode ImageResponse for process_page_image
// Struct: { code: u16, headers: HashMap, request: ImageRequest, image: ImageRef }
// ImageRequest: { url: Option<String>, headers: HashMap }
// ImageRef is serialized as i32 (rid)
export function encodeImageResponse(
  code: number,
  headers: Record<string, string>,
  requestUrl: string | null,
  requestHeaders: Record<string, string>,
  imageRid: number
): Uint8Array {
  const parts: Uint8Array[] = [];
  
  // code: u16
  parts.push(encodeU16(code));
  
  // headers: HashMap<String, String>
  parts.push(encodeHashMap(headers));
  
  // request: ImageRequest { url: Option<String>, headers: HashMap }
  parts.push(encodeOptionBytes(requestUrl));
  parts.push(encodeHashMap(requestHeaders));
  
  // image: ImageRef (serialized as i32 zigzag varint)
  parts.push(encodeI32(imageRid));
  
  return concatBytes(parts);
}

// Encode chapter for WASM (matches aidoku-rs Chapter struct)
export function encodeChapter(chapter: Chapter): Uint8Array {
  const parts: Uint8Array[] = [];

  // key: String
  parts.push(encodeString(chapter.key || chapter.id || ""));
  // title: Option<String>
  parts.push(encodeOptionBytes(chapter.title || null));
  // chapter_number: Option<f32>
  parts.push(encodeOptionF32(chapter.chapterNumber ?? null));
  // volume_number: Option<f32>
  parts.push(encodeOptionF32(chapter.volumeNumber ?? null));
  // date_uploaded: Option<i64>
  parts.push(encodeOptionI64(chapter.dateUploaded ? Math.floor(chapter.dateUploaded / 1000) : null));
  // scanlators: Option<Vec<String>>
  if (chapter.scanlator) {
    parts.push(new Uint8Array([1])); // Some
    parts.push(encodeVarint(1)); // vec len = 1
    parts.push(encodeString(chapter.scanlator));
  } else {
    parts.push(new Uint8Array([0])); // None
  }
  // url: Option<String>
  parts.push(encodeOptionBytes(chapter.url || null));
  // language: Option<String>
  parts.push(encodeOptionBytes(chapter.lang || null));
  // thumbnail: Option<String>
  parts.push(new Uint8Array([0])); // None
  // locked: bool
  parts.push(new Uint8Array([0])); // false

  return concatBytes(parts);
}

// ============================================================================
// FilterValue encoding for aidoku-rs
// ============================================================================

import type { FilterValue, FilterType, GenreState } from "./types";

/**
 * Encode a FilterValue for aidoku-rs get_search_manga_list.
 * aidoku-rs FilterValue enum variants:
 * 0 = Text { id: String, value: String }
 * 1 = Sort { id: String, index: i32, ascending: bool }
 * 2 = Check { id: String, value: i32 }
 * 3 = Select { id: String, value: String }
 * 4 = MultiSelect { id: String, included: Vec<String>, excluded: Vec<String> }
 * 5 = Range { id: String, from: Option<f32>, to: Option<f32> }
 */
export function encodeFilterValue(filter: FilterValue): Uint8Array {
  const parts: Uint8Array[] = [];
  const id = filter.name || "";

  // Note: TypeScript FilterType enum values:
  // Title = 0, Author = 1, Select = 2, Sort = 3, Check = 4, Group = 5, Genre = 6

  switch (filter.type) {
    case 0: // Title -> Text
    case 1: // Author -> Text
      parts.push(encodeVarint(0)); // Text variant
      parts.push(encodeString(id));
      parts.push(encodeString(String(filter.value || "")));
      break;

    case 3: { // Sort
      parts.push(encodeVarint(1)); // Sort variant
      parts.push(encodeString(id));
      // value is { index: number, ascending: boolean }
      const sortVal = filter.value as { index: number; ascending: boolean } | undefined;
      parts.push(encodeI32(sortVal?.index ?? 0));
      parts.push(encodeBool(sortVal?.ascending ?? false));
      break;
    }

    case 4: // Check
      parts.push(encodeVarint(2)); // Check variant
      parts.push(encodeString(id));
      // value is boolean, encode as i32 (0 = unchecked, 1 = checked)
      parts.push(encodeI32(filter.value ? 1 : 0));
      break;

    case 2: // Select
      parts.push(encodeVarint(3)); // Select variant
      parts.push(encodeString(id));
      // value is string or index - encode as string
      parts.push(encodeString(String(filter.value ?? "")));
      break;

    case 6: { // Genre -> MultiSelect
      parts.push(encodeVarint(4)); // MultiSelect variant
      parts.push(encodeString(id));
      // value is MultiSelectValue { included: string[], excluded: string[] }
      // These are string IDs, NOT indices!
      const multiVal = filter.value as { included?: string[]; excluded?: string[] } | undefined;
      parts.push(encodeVecString(multiVal?.included ?? []));
      parts.push(encodeVecString(multiVal?.excluded ?? []));
      break;
    }

    case 5: // Group - skip, groups are containers not values
    default:
      // Unknown type, encode as empty Text
      parts.push(encodeVarint(0)); // Text variant
      parts.push(encodeString(id));
      parts.push(encodeString(""));
      break;
  }

  return concatBytes(parts);
}

/**
 * Encode Vec<FilterValue> for aidoku-rs
 */
export function encodeFilterValues(filters: FilterValue[]): Uint8Array {
  const parts: Uint8Array[] = [];
  
  // Filter out Group type and encode each
  const validFilters = filters.filter(f => f.type !== 5);
  
  parts.push(encodeVarint(validFilters.length));
  for (const filter of validFilters) {
    parts.push(encodeFilterValue(filter));
  }
  
  return concatBytes(parts);
}
