import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, PlusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/utils";
import {
  LISTED_SOURCE_DIRECTORIES,
  nemuAddDirectoryLink,
  type DirectoryLanguage,
  type ListedSourceDirectory,
} from "./directories-list";

/**
 * Public list of source directories at /directories, each with a one-tap
 * `nemu://addSourceList` link (nemu shows the address and asks before adding)
 * and the address to copy. The app itself lists no third-party directory; it
 * opens this page. Copy lives in the `directoriesPage` namespace (en, zh;
 * other locales fall back to English). The list is data:
 * `./directories-list.ts`.
 */
export function DirectoriesPage() {
  const { t, i18n } = useTranslation();
  const title = t("directoriesPage.title");
  const language: DirectoryLanguage = i18n.resolvedLanguage === "zh" ? "zh" : "en";
  const [onPhone] = useState(isPhoneOrTablet);

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · nemu`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-sm leading-relaxed text-foreground select-text sm:px-6 sm:py-14">
      <div className="flex items-center gap-2 text-muted-foreground">
        <img src="/favicon.svg" alt="" className="size-5 rounded" />
        <span className="font-medium">nemu</span>
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-muted-foreground">{t("directoriesPage.intro")}</p>

      <section className="mt-6 rounded-xl border border-border bg-muted/40 px-4 py-3">
        <h2 className="font-semibold">{t("directoriesPage.howTitle")}</h2>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t("directoriesPage.howTap")}</li>
          <li>{t("directoriesPage.howCopy")}</li>
        </ul>
        {!onPhone && (
          <p className="mt-2 text-muted-foreground">{t("directoriesPage.desktopHint")}</p>
        )}
      </section>

      <h2 className="mt-10 text-base font-semibold">{t("directoriesPage.listTitle")}</h2>
      <ul className="mt-3 space-y-3">
        {LISTED_SOURCE_DIRECTORIES.map((directory) => (
          <li key={directory.id}>
            <DirectoryCard directory={directory} language={language} />
          </li>
        ))}
      </ul>

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-base font-semibold">{t("directoriesPage.disclaimerTitle")}</h2>
        <p className="mt-2 text-muted-foreground">{t("directoriesPage.disclaimer")}</p>
        <p className="mt-2 text-muted-foreground">
          {t("directoriesPage.removal")}{" "}
          <a
            href={ISSUES_URL}
            className="text-primary underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            {ISSUES_URL.replace("https://", "")}
          </a>
        </p>
      </section>
    </main>
  );
}

const ISSUES_URL = "https://github.com/nemu-pm/nemu/issues";

function DirectoryCard({
  directory,
  language,
}: {
  directory: ListedSourceDirectory;
  language: DirectoryLanguage;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    if (await copyToClipboard(directory.indexUrl)) setCopied(true);
  };

  return (
    <article className="card-nemu rounded-xl px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-base font-semibold">
          {directory.localizedName?.[language] ?? directory.name}
        </h3>
        <span className="text-xs text-muted-foreground">
          {t("directoriesPage.by")}{" "}
          <a
            href={directory.publisherUrl}
            className="underline underline-offset-2 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            {directory.publisher}
          </a>
        </span>
      </div>
      <p className="mt-1 text-muted-foreground">{directory.description[language]}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("directoriesPage.languages", { value: formatLanguages(directory.languages, language, t) })}
      </p>
      <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground">{directory.indexUrl}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {directory.builtIn ? (
          <span className="inline-flex h-9 items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
            <HugeiconsIcon icon={Tick02Icon} className="size-4" />
            {t("directoriesPage.builtIn")}
          </span>
        ) : (
          <a href={nemuAddDirectoryLink(directory.indexUrl)} className={buttonVariants()}>
            <HugeiconsIcon icon={PlusSignIcon} />
            {t("directoriesPage.add")}
          </a>
        )}
        <Button variant="outline" onClick={() => void copy()} aria-live="polite">
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} />
          {copied ? t("directoriesPage.copied") : t("directoriesPage.copy")}
        </Button>
      </div>
    </article>
  );
}

function formatLanguages(
  codes: string[],
  language: DirectoryLanguage,
  t: (key: string) => string,
): string {
  if (codes.includes("multi")) return t("directoriesPage.multiLanguage");
  const names = new Intl.DisplayNames([language], { type: "language" });
  return codes.map((code) => names.of(code) ?? code).join(", ");
}

/** nemu:// only opens where nemu is installed: iPhone, iPad (desktop-class UA included), Android. */
function isPhoneOrTablet(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}
