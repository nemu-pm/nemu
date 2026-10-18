import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const SUPPORT_URL = "https://github.com/nemu-pm/nemu/issues";

type PolicySection = { heading: string; body: Array<string | string[]> };

/**
 * Public privacy policy at /privacy (linked from App Store Connect). The text
 * lives in the `privacy` namespace of the locale files; locales without a
 * translation fall back to English. Keep it true to docs/app-store/data-flows.md.
 * TODO: the "kept for 30 days" log statement is only true once the Convex log
 * stream exists and the OCR host runs services/ocr/logrotate.conf
 * (docs/app-store/log-retention.md); remove this note then.
 */
export function PrivacyPage() {
  const { t } = useTranslation();
  const title = t("privacy.title");
  const sections = t("privacy.sections", { returnObjects: true }) as PolicySection[];

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · nemu`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-foreground select-text">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-muted-foreground">{t("privacy.updated")}</p>
      {sections.map((section) => (
        <section key={section.heading} className="mt-8">
          <h2 className="text-base font-semibold">{section.heading}</h2>
          {section.body.map((block, index) =>
            Array.isArray(block) ? (
              <ul key={index} className="mt-2 list-disc space-y-1.5 pl-5">
                {block.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p key={index} className="mt-2">
                {linkSupportUrl(block)}
              </p>
            ),
          )}
        </section>
      ))}
    </main>
  );
}

function linkSupportUrl(text: string) {
  if (!text.includes(SUPPORT_URL)) return text;
  const [before, after] = text.split(SUPPORT_URL);
  return (
    <>
      {before}
      <a
        href={SUPPORT_URL}
        className="text-primary underline underline-offset-2"
        target="_blank"
        rel="noreferrer"
      >
        {SUPPORT_URL}
      </a>
      {after}
    </>
  );
}
