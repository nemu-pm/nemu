import { LOCAL_ARCHIVE_DIRECTORY_NAME, LOCAL_ARCHIVE_PAGE_EXTENSIONS, LOCAL_ARCHIVE_URI_SCHEME } from "./policy";

/**
 * Anything persisted (library covers, the archive index) refers to files
 * relative to the documents directory. iOS gives the app a different container
 * path after an update or a restore, so an absolute `file://` URI stored today
 * is wrong tomorrow. Persisted covers use `nemu-local://<volumeId>/<page>` and
 * are resolved to the current container when they are about to be shown.
 */
const VOLUME_ID = /^v-[0-9a-f]{32}$/;
const PAGE_NAME = new RegExp(`^\\d{6}\\.(?:${LOCAL_ARCHIVE_PAGE_EXTENSIONS.join("|")})$`);
const COVER_URI = new RegExp(
  `^${LOCAL_ARCHIVE_URI_SCHEME}://(v-[0-9a-f]{32})/(\\d{6}\\.(?:${LOCAL_ARCHIVE_PAGE_EXTENSIONS.join("|")}))$`,
);

export function isLocalArchiveVolumeId(value: string): boolean {
  return VOLUME_ID.test(value);
}

export function isLocalArchivePageName(value: string): boolean {
  return PAGE_NAME.test(value);
}

export function localArchiveRelativeUri(volumeId: string, pageName: string): string {
  if (!isLocalArchiveVolumeId(volumeId) || !isLocalArchivePageName(pageName)) {
    throw new Error("Invalid local archive page reference.");
  }
  return `${LOCAL_ARCHIVE_URI_SCHEME}://${volumeId}/${pageName}`;
}

/** The `file://` URI under `documentRootUri` for a persisted reference, or null when it is not one. */
export function resolveLocalArchiveUri(uri: string, documentRootUri: string): string | null {
  const match = COVER_URI.exec(uri);
  if (!match) return null;
  const root = documentRootUri.endsWith("/") ? documentRootUri : `${documentRootUri}/`;
  return `${root}${LOCAL_ARCHIVE_DIRECTORY_NAME}/${match[1]}/pages/${match[2]}`;
}
