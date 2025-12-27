import { useTranslation } from "react-i18next";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogClose,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Github01Icon, LinkSquare01Icon } from "@hugeicons/core-free-icons";
import packageJson from "../../package.json";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const APP_VERSION = packageJson.version;

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const { t } = useTranslation();

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-sm">
        <ResponsiveDialogHeader className="items-center text-center">
          {/* App icon with subtle glow - interactive! */}
          <div className="relative mx-auto mb-2 group">
            {/* Soft ambient glow */}
            <div className="absolute inset-0 rounded-2xl bg-[#6b8cce]/30 blur-2xl scale-125" />

            {/* Icon container - cute squish animation on press */}
            <div
              className="relative size-20 rounded-2xl overflow-hidden shadow-lg ring-1 ring-white/10 transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.82] active:rotate-[-4deg] cursor-pointer select-none"
            >
              <img
                src="/icon.jpg"
                alt="nemu"
                className="size-full object-cover pointer-events-none"
              />
            </div>
          </div>

          <ResponsiveDialogTitle className="text-xl">
            <span
              className="text-primary"
              style={{
                fontFamily: "'Noto Serif JP Variable', serif",
                fontWeight: 500,
                letterSpacing: "-0.02em",
                fontFeatureSettings: '"palt" 1',
              }}
            >
              nemu
            </span>
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-center">
            {t("about.tagline")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {/* Version badge */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/50 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
            v{APP_VERSION}
          </div>
        </div>

        {/* Description */}
        <p className="text-center text-sm text-muted-foreground leading-relaxed px-2">
          {t("about.description")}
        </p>

        {/* Links section */}
        <div className="flex flex-col gap-2 pt-2">
          <a
            href="https://github.com/nemu-pm/nemu"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors group"
          >
            <div className="size-8 rounded-lg bg-foreground/5 flex items-center justify-center group-hover:bg-foreground/10 transition-colors">
              <HugeiconsIcon icon={Github01Icon} className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t("about.sourceCode")}</p>
              <p className="text-xs text-muted-foreground truncate">github.com/nemu-pm/nemu</p>
            </div>
            <HugeiconsIcon icon={LinkSquare01Icon} className="size-4 text-muted-foreground" />
          </a>
        </div>

        <ResponsiveDialogFooter>
          <ResponsiveDialogClose render={<Button variant="outline" />}>
            {t("common.done")}
          </ResponsiveDialogClose>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
