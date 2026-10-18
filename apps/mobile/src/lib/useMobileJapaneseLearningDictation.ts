import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import type { AppLanguage } from "@/data/schema";
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import {
  buildMobileJapaneseLearningDictationOptions,
  classifyMobileJapaneseLearningDictationError,
  getMobileJapaneseLearningDictationTranscript,
  isMobileJapaneseLearningDictationAvailable,
  reduceMobileJapaneseLearningDictationStatus,
} from "./mobileJapaneseLearningDictation";
import { getMobileJapaneseLearningDictationModule } from "./mobileJapaneseLearningDictationModule";

export type MobileJapaneseLearningDictation = {
  /** False when the native module is missing or no recognizer is usable — hide the mic. */
  available: boolean;
  listening: boolean;
  /** Web `toggleListening`: stop when listening, else start. */
  toggle: () => void;
  /** Cancel an in-flight session without delivering further transcripts. */
  abort: () => void;
};

/**
 * Voice input for the Nemu chat composer — the mobile counterpart of web
 * `LineInputBar`'s `SpeechRecognition` wiring (chat/ui/drawer.tsx). Each
 * result replaces the draft via `onTranscript`; nothing is sent automatically.
 */
export function useMobileJapaneseLearningDictation({
  active,
  appLanguage,
  onTranscript,
}: {
  /** Drawer visible. Hiding it aborts, like web's cleanup `abort()`. */
  active: boolean;
  appLanguage: AppLanguage;
  onTranscript: (text: string) => void;
}): MobileJapaneseLearningDictation {
  const module = getMobileJapaneseLearningDictationModule();
  const available = useMemo(
    () => isMobileJapaneseLearningDictationAvailable(module),
    [module],
  );
  const [status, dispatch] = useReducer(
    reduceMobileJapaneseLearningDictationStatus,
    "idle",
  );
  const onTranscriptRef = useRef(onTranscript);
  /** True from our `start()` until its `end` / `error` / our `abort()`. */
  const sessionRef = useRef(false);
  /** Bumped by every stop/abort so a pending permission prompt can't start late. */
  const attemptRef = useRef(0);
  const statusRef = useRef(status);
  useLayoutEffect(() => {
    onTranscriptRef.current = onTranscript;
    statusRef.current = status;
  });

  useEffect(() => {
    if (!module || !available) return;
    const subscriptions = [
      module.addListener("start", () => {
        if (sessionRef.current) dispatch({ type: "start" });
      }),
      module.addListener("result", (event: ExpoSpeechRecognitionResultEvent) => {
        if (!sessionRef.current) return;
        const transcript = getMobileJapaneseLearningDictationTranscript(event);
        if (transcript !== null) onTranscriptRef.current(transcript);
      }),
      module.addListener("end", () => {
        sessionRef.current = false;
        dispatch({ type: "end" });
      }),
      module.addListener("error", (event: ExpoSpeechRecognitionErrorEvent) => {
        const wasOurs = sessionRef.current;
        sessionRef.current = false;
        dispatch({ type: "error", error: event.error });
        if (
          wasOurs &&
          __DEV__ &&
          classifyMobileJapaneseLearningDictationError(event.error) !== "benign"
        ) {
          console.warn("Speech recognition error:", event.error, event.message);
        }
      }),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [available, module]);

  const abort = useCallback(() => {
    attemptRef.current += 1;
    if (sessionRef.current && module) {
      sessionRef.current = false;
      try {
        module.abort();
      } catch {
        // Already stopped natively.
      }
    }
    if (statusRef.current !== "idle") dispatch({ type: "abort" });
  }, [module]);

  // Web aborts on unmount and whenever the recognizer is rebuilt for a new language.
  useEffect(() => {
    if (!active) abort();
    return abort;
  }, [abort, active, appLanguage]);

  const toggle = useCallback(() => {
    if (!module || !available) return;
    if (statusRef.current === "listening") {
      attemptRef.current += 1;
      // Keep the session open so the final result still lands, like web `stop()`.
      try {
        module.stop();
      } catch {
        sessionRef.current = false;
      }
      dispatch({ type: "toggle-stop" });
      return;
    }
    const attempt = ++attemptRef.current;
    dispatch({ type: "toggle-start" });
    void (async () => {
      try {
        const permission = await module.requestPermissionsAsync();
        if (attempt !== attemptRef.current) return;
        if (!permission.granted) {
          dispatch({ type: "permission-denied" });
          return;
        }
        sessionRef.current = true;
        module.start(buildMobileJapaneseLearningDictationOptions(appLanguage));
      } catch (error) {
        if (attempt !== attemptRef.current) return;
        sessionRef.current = false;
        dispatch({ type: "error", error: "unknown" });
        if (__DEV__) console.warn("Speech recognition failed to start:", error);
      }
    })();
  }, [appLanguage, available, module]);

  const listening = status === "listening";
  return useMemo(
    () => ({ available, listening, toggle, abort }),
    [abort, available, listening, toggle],
  );
}
