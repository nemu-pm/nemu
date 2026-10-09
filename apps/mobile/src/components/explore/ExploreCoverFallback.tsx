import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { MobileExploreCoverPlaceholder } from "./MobileExploreCoverPlaceholder";

/** A cover that has not arrived by now is treated as missing. */
const PLACEHOLDER_AFTER_MS = 900;

/**
 * What a cover slot shows before its image: the slot's own soft tint at
 * first (a cached cover resolves within a frame or two, so nothing flashes),
 * and the lettered placeholder book only when the cover is really slow or
 * missing.
 */
export function ExploreCoverFallback({
  title,
  width,
  color,
}: {
  title: string;
  width: number;
  /** The slot's tint while waiting. */
  color: string;
}) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), PLACEHOLDER_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  if (late) return <MobileExploreCoverPlaceholder title={title} width={width} />;
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />;
}
