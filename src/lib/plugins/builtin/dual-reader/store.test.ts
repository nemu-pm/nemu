import { describe, it, expect, beforeEach } from 'bun:test';
import { useDualReadStore } from './store';

type StoredValue = string | null;

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string): StoredValue {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }
}

describe('dual-reader store', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    // @ts-expect-error test harness mock
    globalThis.localStorage = storage;
    useDualReadStore.getState().resetSession();
  });

  it('rehydrates persisted config for a session', () => {
    const sessionKey = 'reg:primary:123';
    const payload = {
      enabled: true,
      secondarySource: {
        id: 'link-2',
        registryId: 'reg',
        sourceId: 'secondary',
        sourceMangaId: '456',
      },
      seedPair: {
        primaryId: 'p1',
        secondaryId: 's1',
      },
      activeSide: 'secondary',
      fabPosition: {
        x: 12,
        y: 200,
        side: 'left',
      },
    };

    storage.setItem(`nemu:plugin:dual-reader:config:${sessionKey}`, JSON.stringify(payload));

    useDualReadStore.getState().startSession(sessionKey);
    const state = useDualReadStore.getState();

    expect(state.enabled).toBe(true);
    expect(state.secondarySource?.sourceId).toBe('secondary');
    expect(state.seedPair?.secondaryId).toBe('s1');
    expect(state.activeSide).toBe('secondary');
    expect(state.fabPosition).toEqual({ x: 12, y: 200, side: 'left' });
  });
});
