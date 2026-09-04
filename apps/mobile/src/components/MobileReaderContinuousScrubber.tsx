import {
  forwardRef,
  memo,
  useImperativeHandle,
  useState,
} from "react";
import {
  MobileReaderScrubber,
  type MobileReaderScrubberProps,
} from "@/components/MobileReaderScrubber";
import type { ReaderContinuousScrollMetrics } from "@/lib/mobileReaderProgress";

export type MobileReaderContinuousScrubberHandle = {
  updateMetrics(metrics: ReaderContinuousScrollMetrics): void;
};

type MobileReaderContinuousScrubberProps = Omit<
  MobileReaderScrubberProps,
  "continuousScroll" | "scrollProgress" | "scrollable"
> & {
  initialMetrics: ReaderContinuousScrollMetrics;
};

function sameMetrics(
  left: ReaderContinuousScrollMetrics,
  right: ReaderContinuousScrollMetrics,
) {
  return (
    left.contentOffset === right.contentOffset &&
    left.contentLength === right.contentLength &&
    left.viewportLength === right.viewportLength &&
    left.maximumOffset === right.maximumOffset &&
    left.progress === right.progress &&
    left.scrollable === right.scrollable
  );
}

const MobileReaderContinuousScrubberComponent = forwardRef<
  MobileReaderContinuousScrubberHandle,
  MobileReaderContinuousScrubberProps
>(function MobileReaderContinuousScrubber(
  { initialMetrics, ...scrubberProps },
  ref,
) {
  const [metrics, setMetrics] = useState(initialMetrics);

  useImperativeHandle(
    ref,
    () => ({
      updateMetrics(nextMetrics) {
        setMetrics((currentMetrics) =>
          sameMetrics(currentMetrics, nextMetrics)
            ? currentMetrics
            : nextMetrics,
        );
      },
    }),
    [],
  );

  return (
    <MobileReaderScrubber
      {...scrubberProps}
      continuousScroll
      scrollProgress={metrics.progress}
      scrollable={metrics.scrollable}
    />
  );
});

/** Keeps high-frequency scroll progress updates out of the full reader tree. */
export const MobileReaderContinuousScrubber = memo(
  MobileReaderContinuousScrubberComponent,
);
