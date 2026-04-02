import { lazy, Suspense, useMemo } from 'react';
import type { ReaderPlugin, ReaderPluginContext } from '../../types';
import { usePluginCtx } from '../../context';
import i18n from '@/lib/i18n';
import { useStores } from '@/data/context';
import { disposeDualReadWorker } from './dhash-worker-client';
import { resetDualReadLoaders } from './loader-state';
import { useDualReadStore } from './store';
import { useDualReadPluginSettingsStore } from './settings';
import iconImage from './icon.png';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy02Icon } from '@hugeicons/core-free-icons';
import type { Setting } from '@/lib/settings';

// Lazy-load heavy components (125KB) — only rendered when reader is active
const LazyDualReadPopoverContent = lazy(() => import('./components').then(m => ({ default: m.DualReadPopoverContent })));
const LazyDualReadOverlay = lazy(() => import('./components').then(m => ({ default: m.DualReadOverlay })));
const LazyDualReadReaderOverlay = lazy(() => import('./components').then(m => ({ default: m.DualReadReaderOverlay })));

const t = (key: string) => i18n.t(`plugin.dualRead.${key}`);

const DualReadIcon = (
  <img src={iconImage} alt="" className="size-10 rounded-md object-cover" />
);

const getSettingsSchema = (): Setting[] => [
  {
    type: 'group',
    title: t('settings.debug.title'),
    items: [
      {
        type: 'switch',
        key: 'debugOverlay',
        title: t('settings.debug.overlayTitle'),
        subtitle: t('settings.debug.overlaySubtitle'),
        default: false,
      },
    ],
  },
];

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

  get settingsSchema() {
    return getSettingsSchema();
  },

  getSettings: () => {
    return { ...useDualReadPluginSettingsStore.getState().settings } as Record<string, unknown>;
  },

  setSettings: (values: Record<string, unknown>) => {
    useDualReadPluginSettingsStore.getState().setSettings(values);
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
        popoverContent: () => <Suspense><LazyDualReadPopoverContent /></Suspense>,
        onPopoverClose: () => useDualReadStore.getState().setPopoverOpen(false),
      },
    ];
  },

  pageOverlays: [
    {
      id: 'dual-read-overlay',
      zIndex: 20,
      render: (pageIndex: number, ctx: ReaderPluginContext) => (
        <Suspense><LazyDualReadOverlay pageIndex={pageIndex} ctx={ctx} /></Suspense>
      ),
    },
  ],

  readerOverlays: [
    {
      id: 'dual-read-root',
      zIndex: 30,
      render: (ctx: ReaderPluginContext) => <Suspense><LazyDualReadReaderOverlay ctx={ctx} /></Suspense>,
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
