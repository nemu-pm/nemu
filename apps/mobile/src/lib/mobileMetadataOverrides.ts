import type {
  ExternalIds,
  LibraryEntry,
  LocalLibraryItem,
  MangaMetadata,
  UserOverrides,
} from "@/data/schema";
import { getEntryCover, getEntryTitle } from "@/data/schema";

export type MobileMetadataFormValues = {
  title: string;
  authorsText: string;
  description: string;
  tagsText: string;
  coverUrl: string;
  status: number;
  externalIds?: ExternalIds;
};

export type MobileMetadataFieldKey =
  | "title"
  | "authorsText"
  | "description"
  | "tagsText"
  | "coverUrl"
  | "status";

export type MobileMetadataFieldOverrideState = Record<MobileMetadataFieldKey, boolean>;

export const MOBILE_MANGA_STATUS_OPTIONS = [
  { value: 0, label: "Unknown" },
  { value: 1, label: "Ongoing" },
  { value: 2, label: "Completed" },
  { value: 3, label: "Cancelled" },
  { value: 4, label: "Hiatus" },
] as const;

function normalizeText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export function listToMetadataInput(values: string[] | undefined): string {
  return values?.join(", ") ?? "";
}

export function metadataInputToList(value: string): string[] | undefined {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? [...new Set(items)] : undefined;
}

function sameStringList(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function metadataTextListSame(a: string, b: string): boolean {
  return sameStringList(metadataInputToList(a), metadataInputToList(b));
}

function compactExternalIds(value: ExternalIds | undefined): ExternalIds | undefined {
  if (!value) return undefined;
  const compacted: ExternalIds = {};
  if (typeof value.mangaUpdates === "number") compacted.mangaUpdates = value.mangaUpdates;
  if (typeof value.aniList === "number") compacted.aniList = value.aniList;
  if (typeof value.mal === "number") compacted.mal = value.mal;
  return Object.keys(compacted).length ? compacted : undefined;
}

function setMetadataOverride<K extends keyof MangaMetadata>(
  metadata: Partial<MangaMetadata>,
  key: K,
  value: MangaMetadata[K] | undefined,
  baseValue: MangaMetadata[K] | undefined
) {
  const sameValue = Array.isArray(value) || Array.isArray(baseValue)
    ? sameStringList(value as string[] | undefined, baseValue as string[] | undefined)
    : value === baseValue;

  if (sameValue) {
    delete metadata[key];
    return;
  }

  metadata[key] = value;
}

export function mobileMetadataFormFromEntry(entry: LibraryEntry): MobileMetadataFormValues {
  const effective = {
    ...entry.item.metadata,
    ...entry.item.overrides?.metadata,
  };
  return {
    title: getEntryTitle(entry),
    authorsText: listToMetadataInput(effective.authors),
    description: effective.description ?? "",
    tagsText: listToMetadataInput(effective.tags),
    coverUrl: getEntryCover(entry) ?? "",
    status: effective.status ?? 0,
    externalIds: compactExternalIds(entry.item.externalIds),
  };
}

export function mobileMetadataFormFromBase(entry: LibraryEntry): MobileMetadataFormValues {
  const base = entry.item.metadata;
  return {
    title: base.title,
    authorsText: listToMetadataInput(base.authors),
    description: base.description ?? "",
    tagsText: listToMetadataInput(base.tags),
    coverUrl: base.cover ?? "",
    status: base.status ?? 0,
    externalIds: compactExternalIds(entry.item.externalIds),
  };
}

export function getMobileMetadataFieldOverrideState(
  form: MobileMetadataFormValues,
  baseForm: MobileMetadataFormValues
): MobileMetadataFieldOverrideState {
  return {
    title: form.title !== baseForm.title,
    authorsText: !metadataTextListSame(form.authorsText, baseForm.authorsText),
    description: form.description !== baseForm.description,
    tagsText: !metadataTextListSame(form.tagsText, baseForm.tagsText),
    coverUrl: form.coverUrl !== baseForm.coverUrl,
    status: form.status !== baseForm.status,
  };
}

export function canResetMobileMetadataEditorForm({
  form,
  baseForm,
  hasSelectedCoverAsset,
}: {
  form: MobileMetadataFormValues;
  baseForm: MobileMetadataFormValues;
  hasSelectedCoverAsset: boolean;
}): boolean {
  if (hasSelectedCoverAsset) return true;
  return Object.values(getMobileMetadataFieldOverrideState(form, baseForm)).some(
    Boolean,
  );
}

export function resetMobileMetadataField(
  form: MobileMetadataFormValues,
  baseForm: MobileMetadataFormValues,
  field: MobileMetadataFieldKey
): MobileMetadataFormValues {
  return {
    ...form,
    [field]: baseForm[field],
  };
}

export function buildMobileMetadataEditedItem(
  entry: LibraryEntry,
  form: MobileMetadataFormValues,
  updatedAt: number
): LocalLibraryItem {
  const base = entry.item.metadata;
  const metadata: Partial<MangaMetadata> = {
    ...(entry.item.overrides?.metadata ?? {}),
  };
  const title = normalizeText(form.title) ?? base.title;
  const description = normalizeText(form.description) ?? (base.description ? "" : undefined);
  const authors = metadataInputToList(form.authorsText) ?? (base.authors?.length ? [] : undefined);
  const tags = metadataInputToList(form.tagsText) ?? (base.tags?.length ? [] : undefined);
  const coverUrl = normalizeText(form.coverUrl);
  const status = Number.isFinite(form.status) ? form.status : 0;
  const externalIds =
    form.externalIds === undefined
      ? compactExternalIds(entry.item.externalIds)
      : compactExternalIds(form.externalIds);

  setMetadataOverride(metadata, "title", title, base.title);
  setMetadataOverride(metadata, "authors", authors, base.authors);
  setMetadataOverride(metadata, "description", description, base.description);
  setMetadataOverride(metadata, "tags", tags, base.tags);
  setMetadataOverride(metadata, "status", status, base.status ?? 0);

  const nextOverrides: UserOverrides = { ...(entry.item.overrides ?? {}) };
  if (Object.keys(metadata).length) {
    nextOverrides.metadata = metadata;
  } else {
    delete nextOverrides.metadata;
  }
  if (coverUrl && coverUrl !== base.cover) {
    nextOverrides.coverUrl = coverUrl;
  } else {
    delete nextOverrides.coverUrl;
  }
  const hasOverrides = Boolean(nextOverrides.metadata) || Boolean(nextOverrides.coverUrl);

  return {
    ...entry.item,
    externalIds,
    overrides: hasOverrides ? nextOverrides : undefined,
    updatedAt,
  };
}
