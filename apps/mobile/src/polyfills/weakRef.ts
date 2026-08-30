type WeakRefGlobal = typeof globalThis & {
  WeakRef?: new <T extends object>(value: T) => { deref(): T | undefined };
  FinalizationRegistry?: new <T>(
    cleanupCallback: (heldValue: T) => void,
  ) => {
    register(target: object, heldValue: T, unregisterToken?: object): void;
    unregister(unregisterToken: object): boolean;
  };
  __NEMU_WEAKREF_SHIMMED__?: boolean;
};

class StrongWeakRef<T extends object> {
  private readonly value: T;

  constructor(value: T) {
    this.value = value;
  }

  deref(): T {
    return this.value;
  }
}

class NoopFinalizationRegistry<T> {
  constructor(cleanupCallback: (heldValue: T) => void) {
    void cleanupCallback;
  }

  register(target: object, heldValue: T, unregisterToken?: object): void {
    void target;
    void heldValue;
    void unregisterToken;
  }

  unregister(unregisterToken: object): boolean {
    void unregisterToken;
    return false;
  }
}

const weakRefGlobal = globalThis as WeakRefGlobal;

if (typeof weakRefGlobal.WeakRef !== "function") {
  Object.defineProperty(weakRefGlobal, "WeakRef", {
    configurable: true,
    enumerable: false,
    value: StrongWeakRef,
    writable: true,
  });
  Object.defineProperty(weakRefGlobal, "__NEMU_WEAKREF_SHIMMED__", {
    configurable: true,
    enumerable: false,
    value: true,
    writable: false,
  });
}

if (typeof weakRefGlobal.FinalizationRegistry !== "function") {
  Object.defineProperty(weakRefGlobal, "FinalizationRegistry", {
    configurable: true,
    enumerable: false,
    value: NoopFinalizationRegistry,
    writable: true,
  });
}
