import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

type PageEmptyProps = {
  icon: IconSvgElement;
  title: string;
  description?: string;
  /** Action element (button, link, etc.) */
  action?: React.ReactNode;
  /** Height variant: "full" for page-level, "inline" for embedded */
  variant?: "full" | "inline";
  className?: string;
};

export function PageEmpty({
  icon,
  title,
  description,
  action,
  variant = "full",
  className,
}: PageEmptyProps) {
  return (
    <Empty
      className={cn(
        variant === "full" ? "h-full min-h-[60vh]" : "min-h-[40vh]",
        className
      )}
    >
      <EmptyHeader>
        <EmptyMedia>
          <div className="rounded-full bg-muted p-6">
            <HugeiconsIcon
              icon={icon}
              className="size-12 text-muted-foreground"
            />
          </div>
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription className="selectable">{description}</EmptyDescription>}
      </EmptyHeader>
      {action}
    </Empty>
  );
}

