import { useMemo } from 'react';
import type { ReaderPlugin, ReaderPluginContext } from '../../types';
import { usePluginCtx } from '../../context';
import i18n from '@/lib/i18n';
import { useStores } from '@/data/context';
import { DualReadPopoverContent, DualReadOverlay, DualReadReaderOverlay, resetDualReadLoaders } from './components';
import { disposeDualReadWorker } from './dhash-worker-client';
import { useDualReadStore } from './store';
import iconImage from './icon.png';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy02Icon } from '@hugeicons/core-free-icons';

const t = (key: string) => i18n.t(`plugin.dualRead.${key}`);

const DualReadIcon = (
  <img src={iconImage} alt="" className="size-10 rounded-md object-cover" />
);

/** Hook to check if dual read should be visible (has linked sources) */
function useDualReadVisible(): boolean {
  const ctx = usePluginCtx();
  const { useLibraryStore } = useStores();
  const entries = useLibraryStore((s) => s.entries);
  
  return useMemo(() => {
    const entry = entries.find((e) =>
      e.sources.some(
        (s) =>
          s.registryId === ctx.registryId &&
          s.sourceId === ctx.sourceId &&
          s.sourceMangaId === ctx.mangaId
      )
    );
    // Only show if there are 2+ sources (meaning there are candidates to link)
    return (entry?.sources.length ?? 0) > 1;
  }, [entries, ctx.registryId, ctx.sourceId, ctx.mangaId]);
}

export const dualReaderPlugin: ReaderPlugin = {
  get manifest() {
    return {
      id: 'dual-reader',
      name: t('name'),
      description: t('description'),
      icon: DualReadIcon,
      defaultEnabled: true,
      builtin: true,
    };
  },

  get navbarActions() {
    return [
      {
        id: 'dual-read',
        label: t('navbarLabel'),
        icon: <HugeiconsIcon icon={Copy02Icon} className="size-5" />,
        onClick: (_ctx: ReaderPluginContext) => {
          const { popoverOpen, setPopoverOpen } = useDualReadStore.getState();
          setPopoverOpen(!popoverOpen);
        },
        useIsVisible: useDualReadVisible,
        usePopoverOpen: () => useDualReadStore((s) => s.popoverOpen),
        popoverContent: () => <DualReadPopoverContent />,
        onPopoverClose: () => useDualReadStore.getState().setPopoverOpen(false),
      },
    ];
  },

  pageOverlays: [
    {
      id: 'dual-read-overlay',
      zIndex: 20,
      render: (pageIndex: number, ctx: ReaderPluginContext) => (
        <DualReadOverlay pageIndex={pageIndex} ctx={ctx} />
      ),
    },
  ],

  readerOverlays: [
    {
      id: 'dual-read-root',
      zIndex: 30,
      render: (ctx: ReaderPluginContext) => <DualReadReaderOverlay ctx={ctx} />,
    },
  ],

  settingsSections: [],

  hooks: {
    onMount: (ctx: ReaderPluginContext) => {
      const store = useDualReadStore.getState();
      resetDualReadLoaders();
      store.startSession(`${ctx.registryId}:${ctx.sourceId}:${ctx.mangaId}`);
    },
    onUnmount: () => {
      resetDualReadLoaders();
      disposeDualReadWorker();
      useDualReadStore.getState().cleanupRuntime();
    },
  },
};

export default dualReaderPlugin;
