import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AddSourceDialog } from "@/components/add-source-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";

type LibraryEmptyProps = {
  variant: "no-sources" | "no-manga";
};

export function LibraryEmpty({ variant }: LibraryEmptyProps) {
  const { t } = useTranslation();
  const [addSourceOpen, setAddSourceOpen] = useState(false);

  const isNoSources = variant === "no-sources";

  return (
    <>
      <div
        className="flex h-full min-h-[60vh] flex-col items-center justify-center p-4"
        style={{
          paddingTop: "calc(1rem + var(--nemu-safe-top, 0px))",
          paddingBottom: "calc(1rem + var(--nemu-safe-bottom, 0px))",
        }}
      >
        {/* Portrait illustration with magical floating animation */}
        <div className="relative mb-4 portrait-container">
          {/* Ethereal glow layers that pulse independently */}
          <div className="absolute inset-0 translate-y-8 blur-3xl animate-glow-pulse">
            <div className="h-full w-full rounded-full bg-gradient-to-b from-[#7b9ad0]/50 via-[#c4a6d6]/30 to-transparent" />
          </div>
          <div className="absolute inset-0 translate-y-12 blur-2xl animate-glow-drift">
            <div className="h-full w-full rounded-full bg-gradient-radial from-[#d4b8e8]/25 via-[#9bb5e0]/15 to-transparent" />
          </div>

          {/* Main portrait with layered magical motion */}
          <div className="relative animate-ethereal-float">
            <div className="animate-gentle-sway">
              <div className="animate-gentle-rotate">
                <div className="animate-soft-breathe">
                  <img
                    src="/portrait.png"
                    alt=""
                    className="w-[100vw] object-contain sm:max-w-md md:max-w-lg portrait-image"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Text content */}
        <div className="flex max-w-xs flex-col items-center gap-2 text-center">
          <h2 className="text-lg font-medium tracking-tight">
            {t(isNoSources ? "library.noSources" : "library.empty")}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t(isNoSources ? "library.noSourcesDescription" : "library.emptyDescription")}
          </p>
        </div>

        {/* Action button */}
        <div className="mt-6">
          {isNoSources ? (
            <Button size="lg" onClick={() => setAddSourceOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} />
              {t("library.addSource")}
            </Button>
          ) : (
            <Link to="/search" search={{ q: "" }}>
              <Button size="lg">
                {t("library.startSearching")}
              </Button>
            </Link>
          )}
        </div>

        {/* CSS for magical floating animation */}
        <style>{`
          /* Primary ethereal float - smooth continuous vertical drift */
          @keyframes ethereal-float {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-12px);
            }
          }
          
          /* Gentle horizontal sway - offset sine wave */
          @keyframes gentle-sway {
            0%, 100% {
              transform: translateX(0);
            }
            50% {
              transform: translateX(4px);
            }
          }
          
          /* Soft breathing scale */
          @keyframes soft-breathe {
            0%, 100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.012);
            }
          }
          
          /* Subtle rotation drift */
          @keyframes gentle-rotate {
            0%, 100% {
              transform: rotate(-0.5deg);
            }
            50% {
              transform: rotate(0.5deg);
            }
          }
          
          /* Glow pulse - ethereal aura breathing */
          @keyframes glow-pulse {
            0%, 100% {
              opacity: 0.25;
              transform: translateY(8px) scale(1);
            }
            50% {
              opacity: 0.4;
              transform: translateY(14px) scale(1.06);
            }
          }
          
          /* Glow drift - secondary glow */
          @keyframes glow-drift {
            0%, 100% {
              opacity: 0.15;
              transform: translateY(12px) translateX(-4px);
            }
            50% {
              opacity: 0.25;
              transform: translateY(18px) translateX(4px);
            }
          }
          
          .animate-ethereal-float {
            animation: ethereal-float 5s ease-in-out infinite;
          }
          
          .animate-gentle-sway {
            animation: gentle-sway 7s ease-in-out infinite;
          }
          
          .animate-soft-breathe {
            animation: soft-breathe 4s ease-in-out infinite;
          }
          
          .animate-gentle-rotate {
            animation: gentle-rotate 9s ease-in-out infinite;
          }
          
          .animate-glow-pulse {
            animation: glow-pulse 4s ease-in-out infinite;
          }
          
          .animate-glow-drift {
            animation: glow-drift 6s ease-in-out infinite;
          }
          
          /* Staggered start for organic feel - different phases */
          .portrait-container .animate-gentle-sway {
            animation-delay: -2.5s;
          }
          .portrait-container .animate-soft-breathe {
            animation-delay: -1.2s;
          }
          .portrait-container .animate-gentle-rotate {
            animation-delay: -4s;
          }
          .portrait-container .animate-glow-drift {
            animation-delay: -3s;
          }
          
          /* Portrait image base state with transition */
          .portrait-image {
            filter: brightness(1) drop-shadow(0 20px 40px rgba(123, 154, 208, 0.15));
            transition: filter 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          /* Hover glow enhancement - smooth transition both ways */
          .portrait-container:hover .portrait-image {
            filter: brightness(1.06) drop-shadow(0 25px 55px rgba(196, 166, 214, 0.35));
          }
        `}</style>
      </div>

      <AddSourceDialog open={addSourceOpen} onOpenChange={setAddSourceOpen} />
    </>
  );
}
