import Svg, { Circle, Path, Rect } from "react-native-svg";
import { nemuColorWithAlpha } from "@/design-system";
import type { MobileChapterDownloadStatus } from "@/lib/downloads/mobileDownloadTypes";

const STROKE = 1.5;

/**
 * A chapter's download state at the end of its row, in the row's own glyph
 * language (one stroke weight, drawn, no fills but the finished state):
 * - queued: a dashed ring around an arrow;
 * - downloading: a ring that fills with the pages saved, around a stop square
 *   (the App Store's idiom: touch and hold the row to cancel);
 * - paused: the same ring around an arrow;
 * - failed: an exclamation mark in the danger colour;
 * - downloaded: a filled disc with an arrow (arrow.down.circle.fill).
 */
export function MobileChapterDownloadGlyph({
  status,
  color,
  dangerColor,
  size = 17,
}: {
  status: MobileChapterDownloadStatus;
  color: string;
  dangerColor: string;
  size?: number;
}) {
  if (status.kind === "none") return null;
  const r = 7.25;
  const circumference = 2 * Math.PI * r;
  const arrow = (stroke: string) => (
    <Path
      d="M9 5.4v6.6M6.3 9.5 9 12.2l2.7-2.7"
      stroke={stroke}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
  const ring = (progress: number) => (
    <>
      <Circle cx={9} cy={9} r={r} stroke={nemuColorWithAlpha(color, 0.22)} strokeWidth={STROKE} fill="none" />
      <Circle
        cx={9}
        cy={9}
        r={r}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - Math.max(0.04, Math.min(1, progress)))}
        transform="rotate(-90 9 9)"
      />
    </>
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" accessibilityElementsHidden importantForAccessibility="no">
      {status.kind === "queued" ? (
        <>
          <Circle
            cx={9}
            cy={9}
            r={r}
            stroke={nemuColorWithAlpha(color, 0.55)}
            strokeWidth={STROKE}
            strokeDasharray="2.2 2.4"
            fill="none"
          />
          {arrow(nemuColorWithAlpha(color, 0.75))}
        </>
      ) : status.kind === "downloading" ? (
        <>
          {ring(status.progress)}
          <Rect x={6.6} y={6.6} width={4.8} height={4.8} rx={1} fill={color} />
        </>
      ) : status.kind === "paused" ? (
        <>
          {ring(status.progress)}
          {arrow(color)}
        </>
      ) : status.kind === "failed" ? (
        <>
          <Circle cx={9} cy={9} r={r} stroke={dangerColor} strokeWidth={STROKE} fill="none" />
          <Path d="M9 5.2v4.6" stroke={dangerColor} strokeWidth={1.8} strokeLinecap="round" />
          <Circle cx={9} cy={12.5} r={1.05} fill={dangerColor} />
        </>
      ) : (
        <>
          <Circle cx={9} cy={9} r={8} fill={color} />
          <Path
            d="M9 5.2v6.8M6.2 9.4 9 12.2l2.8-2.8"
            stroke="#fff"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      )}
    </Svg>
  );
}
