// aidoku namespace - Aidoku-specific object creation
import { GlobalStore, isArray } from "../global-store";
import type { Manga, Chapter, Page, MangaPageResult, DeepLink, MangaStatus, ContentRating, Viewer } from "../types";

export function createAidokuImports(store: GlobalStore) {
  return {
    create_manga: (
      idPtr: number, idLen: number,
      coverPtr: number, coverLen: number,
      titlePtr: number, titleLen: number,
      authorPtr: number, authorLen: number,
      artistPtr: number, artistLen: number,
      descPtr: number, descLen: number,
      urlPtr: number, urlLen: number,
      tagsPtr: number, tagLensPtr: number, tagCount: number,
      status: number,
      nsfw: number,
      viewer: number
    ): number => {
      if (idLen <= 0) return -1;

      const key = store.readString(idPtr, idLen);
      if (!key) return -1;

      // Parse tags array
      const tags: string[] = [];
      if (tagCount > 0 && tagsPtr > 0 && tagLensPtr > 0) {
        const tagPtrs = store.readBytes(tagsPtr, tagCount * 4);
        const tagLens = store.readBytes(tagLensPtr, tagCount * 4);
        if (tagPtrs && tagLens) {
          const ptrView = new DataView(tagPtrs.buffer, tagPtrs.byteOffset);
          const lenView = new DataView(tagLens.buffer, tagLens.byteOffset);
          for (let i = 0; i < tagCount; i++) {
            const ptr = ptrView.getInt32(i * 4, true);
            const len = lenView.getInt32(i * 4, true);
            const tag = store.readString(ptr, len);
            if (tag) tags.push(tag);
          }
        }
      }

      const manga: Manga = {
        key,
        title: titleLen > 0 ? store.readString(titlePtr, titleLen) || undefined : undefined,
        cover: coverLen > 0 ? store.readString(coverPtr, coverLen) || undefined : undefined,
        authors: authorLen > 0 ? [store.readString(authorPtr, authorLen)!] : undefined,
        artists: artistLen > 0 ? [store.readString(artistPtr, artistLen)!] : undefined,
        description: descLen > 0 ? store.readString(descPtr, descLen) || undefined : undefined,
        url: urlLen > 0 ? store.readString(urlPtr, urlLen) || undefined : undefined,
        tags: tags.length > 0 ? tags : undefined,
        status: status as MangaStatus,
        contentRating: nsfw as ContentRating,
        viewer: viewer as Viewer,
      };

      return store.storeStdValue(manga);
    },

    create_manga_result: (mangaArrayDesc: number, hasMore: number): number => {
      const mangaArray = store.readStdValue(mangaArrayDesc);
      if (!isArray(mangaArray)) return -1;

      const result: MangaPageResult = {
        entries: mangaArray as Manga[],
        hasNextPage: hasMore !== 0,
      };

      return store.storeStdValue(result);
    },

    create_chapter: (
      idPtr: number, idLen: number,
      titlePtr: number, titleLen: number,
      volume: number,
      chapter: number,
      dateUploaded: number,
      scanlatorPtr: number, scanlatorLen: number,
      urlPtr: number, urlLen: number,
      langPtr: number, langLen: number
    ): number => {
      if (idLen <= 0) return -1;

      const key = store.readString(idPtr, idLen);
      if (!key) return -1;

      const chapterObj: Chapter = {
        key,
        title: titleLen > 0 ? store.readString(titlePtr, titleLen) || undefined : undefined,
        volumeNumber: volume >= 0 ? volume : undefined,
        chapterNumber: chapter >= 0 ? chapter : undefined,
        dateUploaded: dateUploaded > 0 ? dateUploaded * 1000 : undefined,
        scanlator: scanlatorLen > 0 ? store.readString(scanlatorPtr, scanlatorLen) || undefined : undefined,
        url: urlLen > 0 ? store.readString(urlPtr, urlLen) || undefined : undefined,
        lang: langLen > 0 ? store.readString(langPtr, langLen) || "en" : "en",
        sourceOrder: store.chapterCounter++,
      };

      return store.storeStdValue(chapterObj);
    },

    create_page: (
      index: number,
      imageUrlPtr: number, imageUrlLen: number,
      base64Ptr: number, base64Len: number,
      textPtr: number, textLen: number
    ): number => {
      const page: Page = {
        index,
        url: imageUrlLen > 0 ? store.readString(imageUrlPtr, imageUrlLen) || undefined : undefined,
        base64: base64Len > 0 ? store.readString(base64Ptr, base64Len) || undefined : undefined,
        text: textLen > 0 ? store.readString(textPtr, textLen) || undefined : undefined,
      };

      return store.storeStdValue(page);
    },

    create_deeplink: (mangaDesc: number, chapterDesc: number): number => {
      const deepLink: DeepLink = {
        manga: mangaDesc > 0 ? store.readStdValue(mangaDesc) as Manga | undefined : undefined,
        chapter: chapterDesc > 0 ? store.readStdValue(chapterDesc) as Chapter | undefined : undefined,
      };

      return store.storeStdValue(deepLink);
    },
  };
}

