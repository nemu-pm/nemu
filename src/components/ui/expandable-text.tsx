import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type ExpandableTextProps = {
  value: string;
  /**
   * Number of lines to clamp when collapsed.
   * NOTE: implemented via CSS line clamp styles (not Tailwind line-clamp-* classes).
   */
  lines?: number;
  defaultExpanded?: boolean;
  /** Controlled expanded state (optional). */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  className?: string;
  /** Wrapper around the text block (useful for cards/panels). */
  containerClassName?: string;
  /** Classes applied to the text element in both collapsed and expanded states. */
  textClassName?: string;
  triggerClassName?: string;
};

export function ExpandableText({
  value,
  lines = 3,
  defaultExpanded = false,
  expanded: expandedProp,
  onExpandedChange,
  className,
  containerClassName,
  textClassName,
  triggerClassName,
}: ExpandableTextProps) {
  const { t } = useTranslation();
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);
  const expanded = expandedProp ?? uncontrolledExpanded;
  const setExpanded = onExpandedChange ?? setUncontrolledExpanded;
  const collapsedRef = useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = useState(false);

  const collapsedClampStyle = useMemo(() => {
    return {
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: String(lines),
      overflow: "hidden",
    } as const;
  }, [lines]);

  // Detect actual visual overflow (scrollHeight > clientHeight) in collapsed state.
  useLayoutEffect(() => {
    const el = collapsedRef.current;
    if (!el || expanded) return;
    setIsClamped(el.scrollHeight > el.clientHeight);
  }, [value, expanded, lines]);

  if (!value) return null;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className={className}>
      <div className={containerClassName}>
        <CollapsibleContent>
          <p className={textClassName}>{value}</p>
        </CollapsibleContent>
        {!expanded && (
          <p ref={collapsedRef} className={textClassName} style={collapsedClampStyle}>
            {value}
          </p>
        )}
      </div>

      {isClamped && (
        <CollapsibleTrigger
          className={cn(
            "w-full mt-1.5 py-1 text-xs flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted/50",
            triggerClassName
          )}
        >
          <HugeiconsIcon icon={expanded ? ArrowUp01Icon : ArrowDown01Icon} className="size-3" />
          {expanded ? t("common.collapse") : t("common.expand")}
        </CollapsibleTrigger>
      )}
    </Collapsible>
  );
}


