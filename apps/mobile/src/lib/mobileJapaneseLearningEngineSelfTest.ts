/**
 * QA-only engine self-test, compiled in only when a bundle is built with
 * EXPO_PUBLIC_NEMU_JL_ENGINE_SELFTEST=1 (Expo inlines the flag; production
 * bundles never run it). On launch it runs the real on-device engines on
 *   - up to 8 reader-cached page images (Library/Caches/nemu-reader-page-image-cache)
 *   - any image placed in Documents/nemu-engine-selftest/
 * installs the analyzer pack if needed, analyzes every Japanese transcript,
 * and writes Documents/nemu-engine-selftest/result.json for the reviewer.
 */
import {
  getMobileJapaneseLearningCapabilities,
  getMobileJapaneseLearningEngineRuns,
  mobileJapaneseLearningNowMs,
} from "./mobileJapaneseLearningEngine";
import { convertMobileIchiranSegments } from "./mobileJapaneseLearningGrammar";
import {
  ensureMobileJapaneseLearningAnalysisPack,
  getMobileJapaneseLearningAnalysisPackStatus,
  runMobileOnDeviceAnalysis,
  subscribeMobileJapaneseLearningAnalysisPackProgress,
} from "./mobileJapaneseLearningOnDeviceAnalysis";
import { runMobileOnDeviceOcr } from "./mobileJapaneseLearningOnDeviceOcr";

const IMAGE_PATTERN = /\.(png|jpe?g|webp|heic|gif)$/i;

export async function runMobileJapaneseLearningEngineSelfTest(): Promise<void> {
  const { Directory, File, Paths } = await import("expo-file-system");
  const outDir = new Directory(Paths.document, "nemu-engine-selftest");
  if (!outDir.exists) outDir.create({ intermediates: true });
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    capabilities: getMobileJapaneseLearningCapabilities(),
  };
  const write = async () => {
    report.engineRuns = getMobileJapaneseLearningEngineRuns();
    await new File(outDir, "result.json").write(JSON.stringify(report, null, 2));
  };
  const signal = new AbortController().signal;
  try {
    const files: string[] = [];
    const cacheDir = new Directory(Paths.cache, "nemu-reader-page-image-cache");
    if (cacheDir.exists) {
      for (const entry of cacheDir.list()) {
        if (entry instanceof File && IMAGE_PATTERN.test(entry.name) && files.length < 8) {
          files.push(entry.uri);
        }
      }
    }
    for (const entry of outDir.list()) {
      if (entry instanceof File && IMAGE_PATTERN.test(entry.name)) files.push(entry.uri);
    }
    const pages: unknown[] = [];
    const transcripts: string[] = [];
    for (const uri of files) {
      const started = mobileJapaneseLearningNowMs();
      try {
        const result = await runMobileOnDeviceOcr(
          { imageUri: uri },
          {
            signal,
            resolveImage: async () => ({
              identity: uri,
              tiles: [{ fileUri: uri, offsetX: 0, offsetY: 0 }],
            }),
          },
        );
        pages.push({
          file: uri.split("/").pop(),
          wallMs: Math.round(mobileJapaneseLearningNowMs() - started),
          engine: result.engine,
          detections: result.detections,
        });
        for (const detection of result.detections) {
          if (detection.label === "ja") transcripts.push(detection.text);
        }
      } catch (error) {
        pages.push({ file: uri.split("/").pop(), error: String(error) });
      }
      report.pages = pages;
      await write();
    }

    const progress: unknown[] = [];
    const unsubscribe = subscribeMobileJapaneseLearningAnalysisPackProgress((event) => {
      if (progress.length < 400) progress.push({ ...event, atMs: Math.round(mobileJapaneseLearningNowMs()) });
    });
    report.packBefore = await getMobileJapaneseLearningAnalysisPackStatus();
    const installStarted = mobileJapaneseLearningNowMs();
    try {
      report.packAfter = await ensureMobileJapaneseLearningAnalysisPack({ signal });
      report.packInstallMs = Math.round(mobileJapaneseLearningNowMs() - installStarted);
    } catch (error) {
      report.packError = String(error);
    } finally {
      unsubscribe();
      report.packProgressSample = progress.filter(
        (_, index) => index % 20 === 0 || index === progress.length - 1,
      );
    }
    await write();

    const analyses: unknown[] = [];
    const inputs = ["庭には二羽鶏がいる", ...transcripts].slice(0, 16);
    for (const text of inputs) {
      const started = mobileJapaneseLearningNowMs();
      try {
        const result = await runMobileOnDeviceAnalysis(text, { signal });
        const tokens = convertMobileIchiranSegments(result.segments as never);
        analyses.push({
          text,
          wallMs: Math.round(mobileJapaneseLearningNowMs() - started),
          tokens: tokens.map((token) => ({
            word: token.word,
            reading: token.reading,
            partOfSpeech: token.partOfSpeech,
            conjugationTypes: token.conjugationTypes,
            meaning: token.meanings[0]?.text ?? token.conjugations[0]?.meanings[0]?.text ?? "",
          })),
        });
      } catch (error) {
        analyses.push({ text, error: String(error) });
      }
    }
    report.analyses = analyses;
  } catch (error) {
    report.error = String(error);
  }
  report.finishedAt = new Date().toISOString();
  await write();
  console.info("[japanese-learning] engine self-test finished", outDir.uri);
}
