import { Link } from "@tanstack/react-router";
import { memo } from "react";
import type { Chapter } from "@/lib/sources";
import { cn } from "@/lib/utils";
import { formatChapterTitle, formatChapterSubtitle } from "@/lib/format-chapter";
import { ChapterProgress } from "@/components/chapter-progress";
import { hapticPress } from "@/lib/haptics";

/** Minimal progress info needed for chapter display */
interface ChapterProgressInfo {
  progress: number;
  total: number;
  completed: boolean;
}

interface ChapterGridProps {
  chapters: Chapter[];
  progress: Record<string, ChapterProgressInfo>;
  registryId: string;
  sourceId: string;
  mangaId: string;
}

interface ChapterCellProps {
  chapter: Chapter;
  chapterProgress?: ChapterProgressInfo;
  registryId: string;
  sourceId: string;
  mangaId: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Single chapter cell - uses exact same title/subtitle logic as original */
const ChapterCell = memo(function ChapterCell({
  chapter,
  chapterProgress,
  registryId,
  sourceId,
  mangaId,
}: ChapterCellProps) {
  const isRead = chapterProgress?.completed ?? false;
  const isLocked = chapter.locked && !isRead;
  const isInProgress = !isRead && chapterProgress && chapterProgress.progress > 0;
  const isNew = chapter.dateUploaded && (Date.now() - chapter.dateUploaded) < SEVEN_DAYS_MS;

  // Exact same content structure as original
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className={cn(
          "chapter-cell-title",
          isRead && "text-muted-foreground"
        )}>
          {formatChapterTitle(chapter)}
        </p>
        {(() => {
          const subtitle = formatChapterSubtitle(chapter);
          return subtitle ? (
            <p className="chapter-cell-subtitle">{subtitle}</p>
          ) : null;
        })()}
      </div>

      <ChapterProgress
        page={chapterProgress?.progress ?? 0}
        total={chapterProgress?.total ?? 0}
        completed={isRead}
        locked={chapter.locked}
        className="shrink-0"
      />
    </>
  );

  // Locked chapters are not clickable
  if (isLocked) {
    return (
      <div className="chapter-cell chapter-cell-locked">
        {content}
      </div>
    );
  }

  return (
    <Link
      to="/sources/$registryId/$sourceId/$mangaId/$chapterId"
      params={{
        registryId,
        sourceId,
        mangaId,
        chapterId: chapter.id,
      }}
      search={{ page: undefined }}
      className={cn(
        "chapter-cell",
        isNew && !isRead && "chapter-cell-new",
        isRead && "chapter-cell-read",
        isInProgress && "chapter-cell-progress"
      )}
      onClick={hapticPress}
    >
      {content}
    </Link>
  );
});

/**
 * Chapter grid component - displays chapters in a space-efficient grid
 * Responsive: 2 cols (mobile) → 3 cols (tablet) → 4 cols (desktop)
 */
export function ChapterGrid({
  chapters,
  progress,
  registryId,
  sourceId,
  mangaId,
}: ChapterGridProps) {
  if (chapters.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No chapters available
      </div>
    );
  }

  return (
    <div className="chapter-grid">
      {chapters.map((chapter) => (
        <ChapterCell
          key={chapter.id}
          chapter={chapter}
          chapterProgress={progress[chapter.id]}
          registryId={registryId}
          sourceId={sourceId}
          mangaId={mangaId}
        />
      ))}
    </div>
  );
}
