import type { AppLanguage } from "@/data/schema";
import type { SelfHostedBackend } from "./backend";
import type { SelfHostedTransport } from "./http";
import { createKavitaBackend, type KavitaLabels } from "./kavita";
import { createKomgaBackend } from "./komga";
import { createSuwayomiBackend } from "./suwayomi";
import type { SelfHostedConfig, SelfHostedCredentials } from "./policy";

const KAVITA_LABELS: Record<AppLanguage, KavitaLabels> = {
  en: { volume: (n) => `Volume ${n}`, chapter: (n) => `Chapter ${n}`, special: "Special" },
  zh: { volume: (n) => `第 ${n} 卷`, chapter: (n) => `第 ${n} 话`, special: "特别篇" },
  ja: { volume: (n) => `第${n}巻`, chapter: (n) => `第${n}話`, special: "特別編" },
};

export function createSelfHostedBackend(input: {
  config: SelfHostedConfig;
  credentials: SelfHostedCredentials;
  transport: SelfHostedTransport;
  language: AppLanguage;
}): SelfHostedBackend {
  const { config, credentials, transport } = input;
  switch (config.kind) {
    case "komga":
      return createKomgaBackend({ server: config.server, credentials, transport });
    case "kavita":
      return createKavitaBackend({
        server: config.server,
        credentials,
        transport,
        labels: KAVITA_LABELS[input.language],
      });
    case "suwayomi":
      return createSuwayomiBackend({ server: config.server, credentials, transport });
  }
}
