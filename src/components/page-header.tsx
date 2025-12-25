import { motion } from "motion/react";
import { useScrollPosition } from "@/hooks/use-scroll-position";
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

export function PageHeader({ title, icon, action, actions, loading, className }: PageHeaderProps) {
  // Support both single action and array of actions
  const allActions = actions ?? (action ? [action] : []);
  const isScrolled = useScrollPosition(10);
  const isMobile = useIsMobile();
  const collapseText = isScrolled && isMobile;
  return (
    <motion.header
      className={cn("sticky top-0 z-40", className)}
      initial={false}
      animate={{
        paddingTop: isScrolled ? "0.75rem" : "0",
        paddingBottom: isScrolled ? "0.75rem" : "0",
      }}
      transition={springTransition}
    >
      {/* Background gradient: opaque top → transparent bottom, extends 150% height */}
      <motion.div
        className="absolute inset-x-0 top-0 h-[150%] bg-gradient-to-b from-background to-transparent pointer-events-none"
        style={{
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          maskImage: "linear-gradient(to bottom, black 20%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 20%, transparent)",
        }}
        initial={false}
        animate={{ opacity: isScrolled ? 1 : 0 }}
        transition={springTransition}
      />
      <div
        className="relative flex items-center justify-between min-h-[2.5rem]"
      >
        <motion.div
          className={cn(
            "flex items-center gap-2",
            isScrolled && isMobile && "absolute left-1/2 -translate-x-1/2"
          )}
          initial={false}
          animate={{ scale: isScrolled ? (isMobile ? 0.875 : 0.95) : 1 }}
          transition={springTransition}
        >
          {icon && (
            <img
              src={icon}
              alt=""
              className={cn(
                "rounded-md object-cover shrink-0",
                isScrolled ? "size-6" : "size-8"
              )}
            />
          )}
          <h1
            className={cn(
              "font-bold text-foreground",
              isScrolled ? (isMobile ? "text-lg" : "text-xl") : "text-2xl"
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

        {allActions.length > 0 && (
          <motion.div
            className="ml-auto shrink-0 flex gap-2"
            initial={false}
            animate={{ scale: isScrolled ? 0.95 : 1 }}
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
                      gridTemplateColumns: collapseText ? "0fr" : "1fr",
                      paddingLeft: collapseText ? 0 : 6,
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

