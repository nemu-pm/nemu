import type { ReaderPlugin, ReaderPluginContext } from '../../types';
import i18n from '@/lib/i18n';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy02Icon } from '@hugeicons/core-free-icons';
import { DualReadPopoverContent, DualReadOverlay, DualReadReaderOverlay, resetDualReadLoaders } from './components';
import { disposeDualReadWorker } from './dhash-worker-client';
import { useDualReadStore } from './store';

const t = (key: string) => i18n.t(`plugin.dualRead.${key}`);

const DualReadIcon = <HugeiconsIcon icon={Copy02Icon} className="size-5" />;

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
        icon: DualReadIcon,
        onClick: (_ctx: ReaderPluginContext) => {
          const { popoverOpen, setPopoverOpen } = useDualReadStore.getState();
          setPopoverOpen(!popoverOpen);
        },
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
