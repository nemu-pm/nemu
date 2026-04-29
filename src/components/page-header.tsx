import { useEffect, useState } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface HeaderAction {
  label?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

interface PageHeaderProps {
  title: string;
  icon?: string;
  action?: HeaderAction;
  actions?: HeaderAction[];
  loading?: boolean;
  className?: string;
}

/**
 * Read the *visual* scroll position. While vaul has the page locked
 * (`body { position: fixed; top: -<scrollY>px }`) `window.scrollY` is 0
 * even though the page is still visually scrolled — fall back to the
 * locked offset so headers don't snap to the unscrolled state every
 * time a sheet opens.
 */
function readVisualScrollY(): number {
  const top = document.body.style.top;
  if (top && top.startsWith("-")) {
    const parsed = parseInt(top, 10);
    if (Number.isFinite(parsed)) return -parsed;
  }
  return window.scrollY;
}

/**
 * Drives downstream `useTransform`s without React re-renders during
 * scroll. Tracks `style` mutations on `<body>` so vaul applying or
 * releasing its scroll-lock keeps the value in sync.
 */
function useScrollMotionValue(): MotionValue<number> {
  const scrollY = useMotionValue(0);
  useEffect(() => {
    const update = () => scrollY.set(readVisualScrollY());
    update();
    window.addEventListener("scroll", update, { passive: true });
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
    });
    return () => {
      window.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scrollY]);
  return scrollY;
}

// Backdrop styled like the original PageHeader: a vertical gradient from
// solid `--background` at the top to transparent at the bottom, with a
// light blur applied to whatever is behind. The mask keeps the top 20%
// fully opaque and fades the rest to transparent past the bar — giving
// a soft wall, not a frosted-glass tint.
const BACKDROP_MASK = "linear-gradient(to bottom, black 20%, transparent)";
const BACKDROP_BACKGROUND =
  "linear-gradient(to bottom, var(--background), transparent)";

/**
 * Page header with iOS-26-style scroll behaviour.
 *
 * Mobile:
 *  - The large title is rendered in normal page flow (a sibling of the
 *    sticky bar, not inside it). It scrolls with content; the sticky
 *    bar's `backdrop-filter` blurs it as it passes underneath.
 *  - The sticky bar always shows actions on the right; a centered title
 *    overlay fades in once the inline title has scrolled out of view.
 *
 * Desktop:
 *  - Classic single sticky bar — title and actions in one row, backdrop
 *    fades in on first scroll.
 *
 * Animations are driven by `MotionValue`s, so scroll never causes React
 * re-renders.
 */
export function PageHeader({
  title,
  icon,
  action,
  actions,
  loading,
  className,
}: PageHeaderProps) {
  const allActions = actions ?? (action ? [action] : []);
  const isMobile = useIsMobile();
  const scrollY = useScrollMotionValue();

  // Backdrop opacity stays scroll-driven so it tracks scroll speed 1:1.
  const mobileBackdropOpacity = useTransform(scrollY, [10, 40], [0, 1]);
  const desktopBackdropOpacity = useTransform(scrollY, [4, 24], [0, 1]);

  // Centered-title appearance is a TIME-based animation, not scroll-driven.
  // Once the user crosses the threshold, the title plays a keyframed
  // rise+unblur+fade in fixed real time regardless of scroll velocity.
  // Hysteresis (60 to show, 30 to hide) prevents thrashing if the user
  // hovers right around the edge.
  const [collapsed, setCollapsed] = useState(false);
  useMotionValueEvent(scrollY, "change", (latest) => {
    setCollapsed((prev) => {
      if (prev && latest < 30) return false;
      if (!prev && latest > 60) return true;
      return prev;
    });
  });

  const titleIcon = icon ? (
    <img
      src={icon}
      alt=""
      className={cn(
        "rounded-md object-cover shrink-0",
        isMobile ? "size-8" : "size-8",
      )}
    />
  ) : null;

  if (isMobile) {
    // The sticky bar takes 0 layout height (negative margin-bottom equal
    // to its own height). The inline title row below sits at the top of
    // the page exactly where the original PageHeader's row was; the
    // sticky bar visually overlays that same row so actions appear on
    // its top-right corner. This is the iOS Notes layout — no empty bar
    // above the title at scroll=0.
    return (
      <>
        <div
          data-slot="page-header-bar"
          className={cn("sticky top-0 z-40 pointer-events-none", className)}
          style={{
            paddingTop: "calc(var(--nemu-safe-top, 0px) + 0.75rem)",
            paddingBottom: "0.75rem",
            // Bar height = paddingTop + min-h-[2.5rem] + paddingBottom.
            // Negate it so the bar takes 0 layout space and the inline
            // title row below sits exactly where the bar visually is.
            marginBottom:
              "calc(-1 * (var(--nemu-safe-top, 0px) + 4rem))",
          }}
        >
          <motion.div
            aria-hidden
            className="absolute inset-x-0 top-0 h-[150%] pointer-events-none"
            style={{
              opacity: mobileBackdropOpacity,
              background: BACKDROP_BACKGROUND,
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              maskImage: BACKDROP_MASK,
              WebkitMaskImage: BACKDROP_MASK,
            }}
          />

          <div className="relative flex items-center min-h-[2.5rem]">
            <motion.div
              className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex items-center gap-2 max-w-[60%]"
              initial={false}
              // Keyframes shape a slow-front, fast-back curve: by mid-time
              // only ~10% of the change has happened, then the title
              // accelerates into its rest state. Reversed on un-collapse.
              animate={
                collapsed
                  ? {
                      opacity: [0, 0.1, 1],
                      y: [10, 8, 0],
                      filter: ["blur(8px)", "blur(7px)", "blur(0px)"],
                    }
                  : {
                      opacity: [1, 0.1, 0],
                      y: [0, 8, 10],
                      filter: ["blur(0px)", "blur(7px)", "blur(8px)"],
                    }
              }
              transition={{
                duration: 0.32,
                times: [0, 0.5, 1],
                ease: ["easeIn", "easeOut"],
              }}
            >
              {icon && (
                <img
                  src={icon}
                  alt=""
                  className="rounded-md object-cover shrink-0 size-6"
                />
              )}
              <h2 className="font-medium text-foreground text-base whitespace-nowrap truncate">
                {title}
              </h2>
              {loading && (
                <Spinner className="text-muted-foreground size-4" />
              )}
            </motion.div>

            {allActions.length > 0 && (
              <div className="ml-auto shrink-0 flex gap-2 pointer-events-auto">
                {allActions.map((act, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size={act.label ? "sm" : "icon-sm"}
                    onClick={act.onClick}
                    className={act.label ? "gap-1.5" : undefined}
                  >
                    {act.icon}
                    {act.label && (
                      <span className="whitespace-nowrap">{act.label}</span>
                    )}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Inline title in flow. Sits at the top of the page (the sticky
            bar above adds 0 layout space), so its left-aligned big title
            occupies the same row that holds the actions on the right. */}
        <div
          className="flex items-center gap-2 min-h-[2.5rem]"
          style={{
            paddingTop: "calc(var(--nemu-safe-top, 0px) + 0.75rem)",
            paddingBottom: "0.75rem",
            // Cancel any space-y-* margin from the parent so the title
            // sits flush at the top, not below an invisible bar.
            marginTop: 0,
            // Reserve space on the right so a long title doesn't run
            // into the action buttons that overlay this row.
            paddingRight:
              allActions.length > 0
                ? `${allActions.length * 2.5 + 0.5}rem`
                : undefined,
          }}
        >
          {titleIcon}
          <h1 className="font-bold text-foreground text-2xl truncate">
            {title}
          </h1>
          {loading && <Spinner className="text-muted-foreground" />}
        </div>
      </>
    );
  }

  return (
    <header
      data-slot="page-header"
      className={cn("sticky top-0 z-40", className)}
      style={{ paddingTop: "var(--nemu-safe-top, 0px)" }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[150%] pointer-events-none"
        style={{
          opacity: desktopBackdropOpacity,
          background: BACKDROP_BACKGROUND,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          maskImage: BACKDROP_MASK,
          WebkitMaskImage: BACKDROP_MASK,
        }}
      />
      <div className="relative flex items-center justify-between min-h-[2.5rem]">
        <div className="flex items-center gap-2">
          {titleIcon}
          <h1 className="font-bold text-foreground text-2xl">{title}</h1>
          {loading && <Spinner className="text-muted-foreground" />}
        </div>
        {allActions.length > 0 && (
          <div className="ml-auto shrink-0 flex gap-2">
            {allActions.map((act, i) => (
              <Button
                key={i}
                variant="outline"
                size={act.label ? "sm" : "icon-sm"}
                onClick={act.onClick}
                className={act.label ? "gap-1.5" : undefined}
              >
                {act.icon}
                {act.label && (
                  <span className="whitespace-nowrap">{act.label}</span>
                )}
              </Button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
