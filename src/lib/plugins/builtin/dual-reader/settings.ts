import { create } from 'zustand';
import { createPluginStorage } from '../../types';

const storage = createPluginStorage('dual-reader');
const SETTINGS_KEY = 'pluginSettings:v1';

export type DualReadPluginSettings = {
  debugOverlay: boolean;
};

const DEFAULT_SETTINGS: DualReadPluginSettings = {
  debugOverlay: false,
};

function loadSettings(): DualReadPluginSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const raw = storage.get<Partial<DualReadPluginSettings>>(SETTINGS_KEY);
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS;
  return {
    debugOverlay: typeof raw.debugOverlay === 'boolean' ? raw.debugOverlay : DEFAULT_SETTINGS.debugOverlay,
  };
}

function persistSettings(settings: DualReadPluginSettings) {
  if (typeof window === 'undefined') return;
  storage.set(SETTINGS_KEY, settings);
}

type DualReadPluginSettingsState = {
  settings: DualReadPluginSettings;
  setSettings: (values: Record<string, unknown>) => void;
};

export const useDualReadPluginSettingsStore = create<DualReadPluginSettingsState>((set, get) => ({
  settings: loadSettings(),
  setSettings: (values) => {
    const prev = get().settings;
    const next: DualReadPluginSettings = {
      debugOverlay: typeof values.debugOverlay === 'boolean' ? values.debugOverlay : prev.debugOverlay,
    };
    set({ settings: next });
    persistSettings(next);
  },
}));


