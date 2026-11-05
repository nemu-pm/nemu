import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyToClipboard } from "@/lib/utils";
import { addSourceListLinkFor, nemuAddSourceListLink } from "./source-directory-links";

const EXAMPLE_ADDRESS = "https://example.com/sources/index.min.json";

/**
 * First-party help at /help/source-directories: what sources and source
 * directories are, the one nemu includes, how people add another, and the
 * add link format for directory publishers (with a link builder). It names no
 * third-party directory: nemu does not host or point to anyone else's list.
 * Copy lives in the `sourceDirectoriesHelp` namespace (en, zh; other locales
 * fall back to English).
 */
export function SourceDirectoriesPage() {
  const { t } = useTranslation();
  const title = t("sourceDirectoriesHelp.title");
  const exampleLink = nemuAddSourceListLink(EXAMPLE_ADDRESS);

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
      <p className="mt-3 text-muted-foreground">{t("sourceDirectoriesHelp.intro")}</p>

      <section className="mt-8">
        <h2 className="text-base font-semibold">{t("sourceDirectoriesHelp.builtInTitle")}</h2>
        <p className="mt-2 text-muted-foreground">{t("sourceDirectoriesHelp.builtIn")}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">{t("sourceDirectoriesHelp.addTitle")}</h2>
        <p className="mt-2 text-muted-foreground">{t("sourceDirectoriesHelp.addIntro")}</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>{t("sourceDirectoriesHelp.addLink")}</li>
          <li>{t("sourceDirectoriesHelp.addPaste")}</li>
          <li>{t("sourceDirectoriesHelp.addAidoku")}</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">{t("sourceDirectoriesHelp.publishersTitle")}</h2>
        <p className="mt-2 text-muted-foreground">{t("sourceDirectoriesHelp.publishersIntro")}</p>
        <CodeBlock>{"nemu://addSourceList?url=<address>"}</CodeBlock>
        <p className="mt-2 text-muted-foreground">{t("sourceDirectoriesHelp.publishersAddress")}</p>
        <p className="mt-3 text-muted-foreground">{t("sourceDirectoriesHelp.publishersExample")}</p>
        <CodeBlock>{`<a href="${exampleLink}">Add to nemu</a>`}</CodeBlock>
        <p className="mt-3 text-muted-foreground">{t("sourceDirectoriesHelp.publishersAlsoAccepted")}</p>
        <CodeBlock>
          {"aidoku://addSourceList?url=<address>\nhttps://aidoku.app/add-source-list/?url=<address>"}
        </CodeBlock>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>{t("sourceDirectoriesHelp.ruleHttps")}</li>
          <li>{t("sourceDirectoriesHelp.ruleConfirm")}</li>
          <li>{t("sourceDirectoriesHelp.ruleShowAddress")}</li>
        </ul>
        <LinkBuilder />
      </section>

      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-base font-semibold">{t("sourceDirectoriesHelp.disclaimerTitle")}</h2>
        <p className="mt-2 text-muted-foreground">{t("sourceDirectoriesHelp.disclaimer")}</p>
      </section>
    </main>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs whitespace-pre-wrap break-all">
      {children}
    </pre>
  );
}

/** Address in, add link out, by the rules the app applies when adding. */
function LinkBuilder() {
  const { t } = useTranslation();
  const [address, setAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const result = address.trim() ? addSourceListLinkFor(address) : null;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    if (result?.ok && (await copyToClipboard(result.link))) setCopied(true);
  };

  return (
    <div className="mt-5 rounded-xl border border-border bg-muted/40 px-4 py-4">
      <label htmlFor="source-directory-address" className="font-semibold">
        {t("sourceDirectoriesHelp.builderTitle")}
      </label>
      <Input
        id="source-directory-address"
        className="mt-2"
        type="url"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={EXAMPLE_ADDRESS}
        value={address}
        onChange={(event) => {
          setAddress(event.target.value);
          setCopied(false);
        }}
      />
      {result?.ok ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 font-mono text-xs break-all">{result.link}</code>
          <Button variant="outline" onClick={() => void copy()} aria-live="polite">
            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} />
            {copied ? t("sourceDirectoriesHelp.copied") : t("sourceDirectoriesHelp.copyLink")}
          </Button>
        </div>
      ) : result ? (
        <p className="mt-2 text-destructive" role="alert">
          {t(
            result.reason === "not-https"
              ? "sourceDirectoriesHelp.builderNotHttps"
              : result.reason === "local-host"
                ? "sourceDirectoriesHelp.builderLocal"
                : "sourceDirectoriesHelp.builderInvalid",
          )}
        </p>
      ) : (
        <p className="mt-2 text-muted-foreground">{t("sourceDirectoriesHelp.builderHint")}</p>
      )}
    </div>
  );
}
