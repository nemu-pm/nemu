import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BrowseSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  showCancel?: boolean;
}

export const BrowseSearchBar = forwardRef<HTMLInputElement, BrowseSearchBarProps>(
  function BrowseSearchBar(
    { value, onChange, onSubmit, onCancel, autoFocus, showCancel = true },
    ref
  ) {
    const { t } = useTranslation();

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit();
    };

    return (
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={ref}
            type="search"
            placeholder={t("browse.searchPlaceholder")}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="pl-10"
            autoFocus={autoFocus}
          />
        </div>
        {showCancel && onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancel}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
          </Button>
        )}
      </form>
    );
  }
);

