import type { ReaderPlugin, ReaderPluginContext } from '../../types';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy02Icon } from '@hugeicons/core-free-icons';
import { DualReadPopoverContent, DualReadOverlay, DualReadReaderOverlay, resetDualReadLoaders } from './components';
import { disposeDualReadWorker } from './dhash-worker-client';
import { useDualReadStore } from './store';

const DualReadIcon = <HugeiconsIcon icon={Copy02Icon} className="size-5" />;

export const dualReaderPlugin: ReaderPlugin = {
  manifest: {
    id: 'dual-reader',
    name: 'Dual Read',
    description: 'Read the same manga from two linked sources with quick switching.',
    icon: DualReadIcon,
    defaultEnabled: true,
    builtin: true,
  },

  navbarActions: [
    {
      id: 'dual-read',
      label: 'Dual Read',
      icon: DualReadIcon,
      onClick: (_ctx: ReaderPluginContext) => {
        const { popoverOpen, setPopoverOpen } = useDualReadStore.getState();
        setPopoverOpen(!popoverOpen);
      },
      usePopoverOpen: () => useDualReadStore((s) => s.popoverOpen),
      popoverContent: () => <DualReadPopoverContent />,
      onPopoverClose: () => useDualReadStore.getState().setPopoverOpen(false),
    },
  ],

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
    onChapterChange: (_chapterId: string, _ctx: ReaderPluginContext) => {
      useDualReadStore.getState().setNudgeOpen(false);
    },
    onUnmount: () => {
      resetDualReadLoaders();
      disposeDualReadWorker();
      useDualReadStore.getState().cleanupRuntime();
    },
  },
};

export default dualReaderPlugin;
