import { motion } from "motion/react";
import { useScrollProgress } from "@/hooks/use-scroll-progress";
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
  /** Show a loading spinner next to the title */
  loading?: boolean;
  className?: string;
}

const springTransition = { type: "spring", stiffness: 300, damping: 30 } as const;

/**
 * PageHeader with iOS 26-style collapsed title bar behaviour.
 *
 * Three visual zones as the user scrolls:
 *  0…15px  – large inline title, no backdrop
 *  15…35px – gradient backdrop fades in
 *  30…55px – centered collapsed title fades in
 *
 * On desktop the collapsing is skipped; the header only gets a subtle
 * background once scrolled.
 */
export function PageHeader({ title, icon, action, actions, loading, className }: PageHeaderProps) {
  const allActions = actions ?? (action ? [action] : []);
  const isMobile = useIsMobile();

  // Two-phase progress values:
  //   gradientPhase 0→1 over 15…35px scroll  (backdrop fades in)
  //   titlePhase    0→1 over 30…55px scroll   (centered title fades in)
  const gradientPhase = useScrollProgress(15, 35);
  const titlePhase = useScrollProgress(30, 55);
  const isCollapsed = titlePhase > 0.01;

  // Desktop: simple scrolled state, no collapsing
  const desktopScrolled = gradientPhase > 0;

  return (
    <motion.header
      data-slot="page-header"
      className={cn("sticky top-0 z-40", className)}
      initial={false}
      animate={{
        paddingTop: isMobile
          ? isCollapsed
            ? "calc(var(--nemu-safe-top, 0px) + 0.75rem)"
            : "var(--nemu-safe-top, 0px)"
          : desktopScrolled
            ? "0.5rem"
            : "var(--nemu-safe-top, 0px)",
        paddingBottom: isMobile
          ? isCollapsed ? "0.5rem" : "0"
          : desktopScrolled ? "0.25rem" : "0",
      }}
      transition={springTransition}
    >
      {/* Phase 1: gradient backdrop – fades in as user scrolls past title */}
      <motion.div
        className="absolute inset-x-0 top-0 h-[150%] bg-gradient-to-b from-background to-transparent pointer-events-none"
        style={{
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          maskImage: "linear-gradient(to bottom, black 20%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 20%, transparent)",
        }}
        initial={false}
        animate={{
          opacity: isMobile ? gradientPhase : desktopScrolled ? 1 : 0,
        }}
        transition={{ duration: 0 }}
      />

      <div className="relative flex items-center justify-between min-h-[2.5rem]">
        {/* Large inline title – visible when NOT collapsed, hidden when collapsed */}
        {isMobile && (
          <motion.div
            className="flex items-center gap-2"
            initial={false}
            animate={{
              opacity: 1 - titlePhase,
              y: 0,
            }}
            transition={{ duration: 0 }}
            style={{ pointerEvents: isCollapsed ? "none" : "auto" }}
          >
            {icon && (
              <img
                src={icon}
                alt=""
                className="rounded-md object-cover shrink-0 size-8"
              />
            )}
            <h1 className="font-bold text-foreground text-2xl">
              {title}
            </h1>
            {loading && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Spinner className="text-muted-foreground" />
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Desktop: single title with subtle scale */}
        {!isMobile && (
          <motion.div
            className="flex items-center gap-2"
            initial={false}
            animate={{ scale: desktopScrolled ? 0.95 : 1 }}
            transition={springTransition}
          >
            {icon && (
              <img
                src={icon}
                alt=""
                className={cn(
                  "rounded-md object-cover shrink-0",
                  desktopScrolled ? "size-6" : "size-8"
                )}
              />
            )}
            <h1
              className={cn(
                "font-bold text-foreground",
                desktopScrolled ? "text-xl" : "text-2xl"
              )}
            >
              {title}
            </h1>
            {loading && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Spinner className="text-muted-foreground" />
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Phase 2: centered collapsed title – fades in once gradient is established */}
        {isMobile && (
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none"
            initial={false}
            animate={{ opacity: titlePhase }}
            transition={{ duration: 0 }}
          >
            {icon && (
              <img
                src={icon}
                alt=""
                className="rounded-md object-cover shrink-0 size-6"
              />
            )}
            <h1 className="font-bold text-foreground text-lg whitespace-nowrap">
              {title}
            </h1>
            {loading && (
              <Spinner className="text-muted-foreground" />
            )}
          </motion.div>
        )}

        {allActions.length > 0 && (
          <motion.div
            className="ml-auto shrink-0 flex gap-2"
            initial={false}
            animate={{
              scale: isMobile ? (isCollapsed ? 0.95 : 1) : desktopScrolled ? 0.95 : 1,
            }}
            transition={springTransition}
          >
            {allActions.map((act, i) => (
              <Button
                key={i}
                variant="outline"
                size={act.label ? "sm" : "icon-sm"}
                onClick={act.onClick}
                className={act.label ? "gap-0" : undefined}
              >
                {act.icon}
                {act.label && (
                  <motion.span
                    className="grid"
                    initial={false}
                    animate={{
                      gridTemplateColumns: isCollapsed ? "0fr" : "1fr",
                      paddingLeft: isCollapsed ? 0 : 6,
                    }}
                    transition={springTransition}
                  >
                    <span className="overflow-hidden whitespace-nowrap">
                      {act.label}
                    </span>
                  </motion.span>
                )}
              </Button>
            ))}
          </motion.div>
        )}
      </div>
    </motion.header>
  );
}
