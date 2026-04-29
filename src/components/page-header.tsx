import { useEffect } from "react";
import {
  motion,
  useMotionValue,
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

// Mask: opaque (full blur) until the bottom 24px, then fade to transparent.
// The blur layer extends 24px below the bar, so the gradient lands as a
// soft fade just below the bar's bottom edge — content above the bar is
// fully blurred, content immediately below is clear.
const BACKDROP_MASK =
  "linear-gradient(to bottom, black calc(100% - 24px), transparent)";

const BACKDROP_BG_DESKTOP =
  "color-mix(in oklch, var(--background) 65%, transparent)";
const BACKDROP_BG_MOBILE =
  "color-mix(in oklch, var(--background) 55%, transparent)";

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

  // Mobile: backdrop appears just before the inline title slides under
  // the bar; centered overlay fades in just after.
  const mobileBackdropOpacity = useTransform(scrollY, [10, 40], [0, 1]);
  const mobileCenteredOpacity = useTransform(scrollY, [40, 70], [0, 1]);
  // Desktop: backdrop appears as soon as any meaningful scroll happens.
  const desktopBackdropOpacity = useTransform(scrollY, [4, 24], [0, 1]);

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
    return (
      <>
        <div
          data-slot="page-header-bar"
          className={cn("sticky top-0 z-40", className)}
        >
          <motion.div
            aria-hidden
            className="absolute inset-x-0 top-0 pointer-events-none"
            style={{
              height: "calc(100% + 24px)",
              opacity: mobileBackdropOpacity,
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              backgroundColor: BACKDROP_BG_MOBILE,
              maskImage: BACKDROP_MASK,
              WebkitMaskImage: BACKDROP_MASK,
            }}
          />

          <div
            className="relative flex items-center min-h-[2.75rem]"
            style={{ paddingTop: "var(--nemu-safe-top, 0px)" }}
          >
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 max-w-[60%] pointer-events-none"
              style={{
                opacity: mobileCenteredOpacity,
                top: "var(--nemu-safe-top, 0px)",
                bottom: 0,
                margin: "auto 0",
                height: "fit-content",
              }}
            >
              {icon && (
                <img
                  src={icon}
                  alt=""
                  className="rounded-md object-cover shrink-0 size-6"
                />
              )}
              <h2 className="font-semibold text-foreground text-base whitespace-nowrap truncate">
                {title}
              </h2>
              {loading && (
                <Spinner className="text-muted-foreground size-4" />
              )}
            </motion.div>

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
        </div>

        <div className="flex items-center gap-2">
          {titleIcon}
          <h1 className="font-bold text-foreground text-2xl">{title}</h1>
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
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: "calc(100% + 16px)",
          opacity: desktopBackdropOpacity,
          backdropFilter: "blur(16px) saturate(170%)",
          WebkitBackdropFilter: "blur(16px) saturate(170%)",
          backgroundColor: BACKDROP_BG_DESKTOP,
          maskImage: BACKDROP_MASK,
          WebkitMaskImage: BACKDROP_MASK,
        }}
      />
      <div className="relative flex items-center justify-between min-h-[2.5rem] py-2">
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
