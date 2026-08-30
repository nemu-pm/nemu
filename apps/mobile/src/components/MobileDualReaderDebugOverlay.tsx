/**
 * Mobile dual-reader debug overlay — on-screen HUD showing the alignment
 * pipeline snapshot + event log. Native counterpart to web's
 * `DualReadDebugOverlay` (`src/lib/plugins/builtin/dual-reader/components.tsx:126`).
 *
 * Gated by the `debugOverlay` reader-plugin setting
 * (`mobileReaderPlugins.ts:116-121`) — this component *wires that stub*. Reads
 * the setting from `useMobileReaderPlugins()` (the dual-reader plugin's
 * `values.debugOverlay`) and the snapshot/events from the mobile debug store.
 *
 * Differences from web:
 * - Web reads `debugOverlay` from a dedicated plugin-settings store; mobile
 *   reads it from the shared `useMobileReaderPlugins()` hook (plugin values live
 *   in `UserSettings.readerPlugins`).
 * - Web computes a per-page `planStatus` breakdown from `ctx.getPageMeta`;
 *   mobile has no page-meta in the shared reader context, so this HUD shows the
 *   snapshot's `lastRenderPlanSummary` instead. The per-page breakdown can be
 *   added in T5 when ReaderScreen wires page meta.
 * - Positioning is a fixed top offset (web tracks the navbar via ResizeObserver).
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { nemuFontWeight } from "@/design-system";
import { useMobileReaderPlugins } from "@/data/mobileHooks";
import {
  useMobileDualReaderDebugStore,
  getMobileDualReadDebugStore,
} from "@/lib/mobileDualReaderDebugStore";
import { useMobileDualReaderStore } from "@/lib/mobileDualReaderStore";
import { useMobileDualReaderContext } from "./MobileDualReaderContext";

function formatTs(ts: number | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return String(ts);
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function MobileDualReaderDebugOverlay() {
  const ctx = useMobileDualReaderContext();
  const plugins = useMobileReaderPlugins();
  const dualReadPlugin = plugins.data.find((plugin) => plugin.id === "dual-reader");
  const debugOverlay = Boolean(dualReadPlugin?.values.debugOverlay);

  const snapshot = useMobileDualReaderDebugStore((s) => s.snapshot);
  const events = useMobileDualReaderDebugStore((s) => s.events);
  const clear = useMobileDualReaderDebugStore((s) => s.clear);

  const secondaryRenderPlansByChapter = useMobileDualReaderStore(
    (s) => s.secondaryRenderPlansByChapter,
  );
  const driftDeltaByChapter = useMobileDualReaderStore((s) => s.driftDeltaByChapter);
  const enabled = useMobileDualReaderStore((s) => s.enabled);

  const [collapsed, setCollapsed] = useState(false);

  // Mirror the debugOverlay setting into the debug store (web does the same).
  useEffect(() => {
    getMobileDualReadDebugStore().getState().setOverlayEnabled(debugOverlay);
    if (!debugOverlay) {
      getMobileDualReadDebugStore().getState().clear();
    }
  }, [debugOverlay]);

  // Keep the snapshot's session/dualRead-enabled flags fresh.
  useEffect(() => {
    if (!debugOverlay) return;
    getMobileDualReadDebugStore()
      .getState()
      .updateSnapshot({
        sessionKey: ctx.primaryChapter ? `${ctx.registryId}:${ctx.sourceId}:${ctx.mangaId}` : null,
        dualReadEnabled: enabled,
      });
  }, [debugOverlay, enabled, ctx.registryId, ctx.sourceId, ctx.mangaId, ctx.primaryChapter]);

  // Plan coverage for the current primary chapter (proxy for web's per-page breakdown).
  const planSummary = useMemo(() => {
    if (!debugOverlay) return "";
    const primaryId = ctx.primaryChapter?.id;
    if (!primaryId) return "—";
    const plans = secondaryRenderPlansByChapter[primaryId];
    if (!plans) return "none";
    const entries = Object.entries(plans);
    if (entries.length === 0) return "none";
    return entries
      .map(([index, plan]) => {
        const drift = driftDeltaByChapter[primaryId] ?? 0;
        const driftStale = plan.kind === "missing" ? false : plan.driftDelta !== drift;
        return `${index}:${plan.kind}${driftStale ? "(d)" : ""}`;
      })
      .join(" · ");
  }, [
    debugOverlay,
    ctx.primaryChapter,
    secondaryRenderPlansByChapter,
    driftDeltaByChapter,
  ]);

  if (!debugOverlay) return null;

  const visible = snapshot.visiblePageIndices;
  const stable = snapshot.stableVisiblePageIndices;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Dual Read Debug</Text>
            <Text style={styles.subtitle}>
              session={snapshot.sessionKey ?? "—"} · dualRead=
              {snapshot.dualReadEnabled ? "on" : "off"}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.button}
              onPress={() => setCollapsed((v) => !v)}
              accessibilityRole="button"
            >
              <Text style={styles.buttonLabel}>{collapsed ? "Expand" : "Minimize"}</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={clear} accessibilityRole="button">
              <Text style={styles.buttonLabel}>Clear</Text>
            </Pressable>
            <Pressable
              style={styles.button}
              onPress={() => plugins.setPluginValue("dual-reader", "debugOverlay", false)}
              accessibilityRole="button"
            >
              <Text style={styles.buttonLabel}>Hide</Text>
            </Pressable>
          </View>
        </View>

        {!collapsed && (
          <View style={styles.body}>
            <View style={styles.grid}>
              <View style={styles.cell}>
                <Text style={styles.cellLabel}>Visible</Text>
                <Text style={styles.cellValue}>
                  {visible.length ? visible.join(", ") : "—"}
                </Text>
                <Text style={styles.cellSub}>{planSummary}</Text>
              </View>
              <View style={styles.cell}>
                <Text style={styles.cellLabel}>Stable</Text>
                <Text style={styles.cellValue}>
                  {stable.length ? stable.join(", ") : "—"}
                </Text>
              </View>
              <View style={styles.cell}>
                <Text style={styles.cellLabel}>Render plan</Text>
                <Text style={styles.cellValue}>
                  {formatTs(snapshot.lastRenderPlanRunTs)}
                  {snapshot.lastRenderPlanSummary ? ` · ${snapshot.lastRenderPlanSummary}` : ""}
                </Text>
              </View>
              <View style={styles.cell}>
                <Text style={styles.cellLabel}>Alignment queue</Text>
                <Text style={styles.cellValue}>
                  {formatTs(snapshot.lastAlignmentQueueTs)} · total=
                  {snapshot.alignmentQueueTotal} · stable={snapshot.alignmentQueueStable} · backfill=
                  {snapshot.alignmentQueueBackfill}
                </Text>
              </View>
              <View style={styles.cell}>
                <Text style={styles.cellLabel}>In-flight</Text>
                <Text style={styles.cellValue}>
                  pending={snapshot.alignmentPending} · controllers=
                  {snapshot.alignmentControllers} · slots=
                  {snapshot.alignmentQueueAvailableSlots}
                </Text>
              </View>
              <View style={styles.cell}>
                <Text style={styles.cellLabel}>Run queue (preview)</Text>
                <Text style={styles.cellValue}>
                  {snapshot.alignmentRunQueue.length
                    ? snapshot.alignmentRunQueue.join(", ")
                    : "—"}
                </Text>
              </View>
            </View>

            <View style={styles.eventsBox}>
              <Text style={styles.eventsTitle}>Events</Text>
              <ScrollView style={styles.eventsScroll}>
                {events
                  .slice()
                  .reverse()
                  .map((event, index) => (
                    <Text key={`${event.ts}:${index}`} style={styles.eventLine}>
                      <Text style={styles.eventTs}>{formatTs(event.ts)} </Text>
                      <Text style={styles.eventType}>{event.type}</Text>
                      {event.data ? (
                        <Text style={styles.eventData}> · {safeJson(event.data)}</Text>
                      ) : null}
                    </Text>
                  ))}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 90,
    zIndex: 99999,
  },
  panel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.8)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: nemuFontWeight.semibold,
    lineHeight: 16,
  },
  subtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    lineHeight: 14,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  button: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  buttonLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontWeight: nemuFontWeight.medium,
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  cell: {
    flexGrow: 1,
    flexBasis: "47%",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cellLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    lineHeight: 14,
  },
  cellValue: {
    color: "#ffffff",
    fontSize: 11,
    lineHeight: 14,
  },
  cellSub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    lineHeight: 13,
  },
  eventsBox: {
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 8,
  },
  eventsTitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontWeight: nemuFontWeight.semibold,
    marginBottom: 4,
  },
  eventsScroll: {
    maxHeight: 220,
  },
  eventLine: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    lineHeight: 14,
  },
  eventTs: {
    color: "rgba(255,255,255,0.6)",
  },
  eventType: {
    color: "#ffffff",
  },
  eventData: {
    color: "rgba(255,255,255,0.6)",
  },
});