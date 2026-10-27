import { describe, expect, test } from "bun:test";
import { createMobileDatabaseEarlyOpen } from "./mobileDataEarlyOpen";

type FakeDb = { databasePath: string; closeAsync: () => Promise<void>; id: string };

function harness(options?: { openFails?: boolean; migrateFailsFor?: string }) {
  const events: string[] = [];
  let nextId = 0;
  const makeDb = (name: string): FakeDb => {
    const id = `${name}#${nextId++}`;
    return {
      id,
      databasePath: `/db/${name}`,
      closeAsync: async () => {
        events.push(`close ${id}`);
      },
    };
  };
  const earlyOpen = createMobileDatabaseEarlyOpen<FakeDb>({
    open: async (name) => {
      events.push(`open ${name}`);
      if (options?.openFails) throw new Error("open failed");
      return makeDb(name);
    },
    migrate: async (db) => {
      events.push(`migrate ${db.id}`);
      if (options?.migrateFailsFor === db.id) throw new Error("migrate failed");
    },
    unclaimedCloseMs: 20,
  });
  return { earlyOpen, events, makeDb };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("mobile database early open", () => {
  test("provider onInit reuses the early migration for the same database", async () => {
    const { earlyOpen, events, makeDb } = harness();
    earlyOpen.start("a.db");
    await earlyOpen.onInit(makeDb("a.db"));
    await settle();
    expect(events).toEqual(["open a.db", "migrate a.db#0", "close a.db#0"]);
  });

  test("a different database migrates the provider handle and drops the early one", async () => {
    const { earlyOpen, events, makeDb } = harness();
    earlyOpen.start("a.db");
    const providerDb = makeDb("b.db");
    await earlyOpen.onInit(providerDb);
    await settle();
    expect(events).toContain(`migrate ${providerDb.id}`);
    expect(events).toContain("close a.db#0");
  });

  test("an early migration failure falls back to migrating the provider handle", async () => {
    const { earlyOpen, events, makeDb } = harness({ migrateFailsFor: "a.db#0" });
    earlyOpen.start("a.db");
    const providerDb = makeDb("a.db");
    await earlyOpen.onInit(providerDb);
    expect(events).toContain(`migrate ${providerDb.id}`);
  });

  test("an early open failure falls back to migrating the provider handle", async () => {
    const { earlyOpen, events, makeDb } = harness({ openFails: true });
    earlyOpen.start("a.db");
    const providerDb = makeDb("a.db");
    await earlyOpen.onInit(providerDb);
    expect(events).toEqual(["open a.db", `migrate ${providerDb.id}`]);
  });

  test("only the first provider mount consumes the early handle", async () => {
    const { earlyOpen, events, makeDb } = harness();
    earlyOpen.start("a.db");
    await earlyOpen.onInit(makeDb("a.db"));
    const second = makeDb("a.db");
    await earlyOpen.onInit(second);
    expect(events).toContain(`migrate ${second.id}`);
  });

  test("an unclaimed early handle is closed after the timeout", async () => {
    const { earlyOpen, events, makeDb } = harness();
    earlyOpen.start("a.db");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(events).toContain("close a.db#0");
    const providerDb = makeDb("a.db");
    await earlyOpen.onInit(providerDb);
    expect(events).toContain(`migrate ${providerDb.id}`);
  });
});
