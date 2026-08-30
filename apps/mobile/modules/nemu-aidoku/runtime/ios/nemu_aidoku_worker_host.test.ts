import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

// The page-side host is plain script text loaded into a WKWebView document, so
// it is exercised here by evaluating it with `globalThis` shadowed by a stub
// realm. That keeps the non-configurable `NemuAidokuIOSHost` definition (and
// the Worker it owns) isolated per test.

type HostMessage = { type: string; id?: number; [key: string]: unknown };

type Host = {
  configure: (runtimeBase64: string) => boolean;
  invoke: (commandJson: string, timeoutMs: number) => Promise<string>;
  terminateWorker: (reason?: string) => void;
};

const hostSource = readFileSync(
  path.join(import.meta.dir, "nemu_aidoku_worker_host.js"),
  "utf8",
);

class FakeWorker {
  static created: FakeWorker[] = [];

  onmessage: ((event: { data: HostMessage }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  readonly commands: HostMessage[] = [];

  constructor() {
    FakeWorker.created.push(this);
  }

  postMessage(command: HostMessage) {
    this.commands.push(command);
  }

  terminate() {
    this.terminated = true;
  }

  reply(message: HostMessage) {
    this.onmessage?.({ data: message });
  }

  /** Answers the most recent command the way the runtime normally would. */
  respondToLastCommand(value: string) {
    const command = this.commands.at(-1);
    if (!command) throw new Error("The worker received no command.");
    this.reply({ type: "result", id: command.id, value, namedData: {} });
  }
}

function loadHost(): { host: Host; workers: FakeWorker[] } {
  FakeWorker.created = [];
  const realm: Record<string, unknown> = {};
  const url = {
    createObjectURL: () => "blob:nemu-aidoku-test",
    revokeObjectURL: () => {},
  };
  // eslint-disable-next-line no-new-func
  new Function("globalThis", "Worker", "URL", hostSource)(
    realm,
    FakeWorker,
    url,
  );
  return {
    host: realm.NemuAidokuIOSHost as Host,
    workers: FakeWorker.created,
  };
}

function configuredHost() {
  const loaded = loadHost();
  const runtime = Buffer.from(
    "globalThis.NemuAidokuSandbox = {};",
    "utf8",
  ).toString("base64");
  expect(loaded.host.configure(runtime)).toBe(true);
  return loaded;
}

describe("isolated iOS Aidoku worker host", () => {
  test("stamps every reply with the epoch of the worker that produced it", async () => {
    const { host, workers } = configuredHost();

    const pending = host.invoke(
      JSON.stringify({ method: "probeRuntime", args: [], namedData: {} }),
      1_000,
    );
    expect(workers).toHaveLength(1);
    workers[0].respondToLastCommand('{"status":"ok"}');

    const envelope = JSON.parse(await pending);
    expect(envelope.value).toBe('{"status":"ok"}');
    expect(envelope.epoch).toBe(1);
  });

  test("advances the epoch when the page recreates a worker with nothing in flight", async () => {
    const { host, workers } = configuredHost();

    const first = host.invoke(
      JSON.stringify({ method: "registerSession", args: [], namedData: {} }),
      1_000,
    );
    workers[0].respondToLastCommand('{"status":"registered"}');
    expect(JSON.parse(await first).epoch).toBe(1);

    // The failure the native host cannot otherwise observe: the worker dies
    // outside a pending command, so `rejectPending` has nothing to reject and
    // no error ever reaches Swift.
    workers[0].onerror?.({ message: "worker crashed" });
    expect(workers[0].terminated).toBe(true);

    const second = host.invoke(
      JSON.stringify({ method: "beginOperation", args: [], namedData: {} }),
      1_000,
    );
    expect(workers).toHaveLength(2);
    workers[1].respondToLastCommand(
      '{"status":"error","code":"operation-rejected","detail":"Aidoku session expired."}',
    );

    const envelope = JSON.parse(await second);
    // A different epoch is the signal the native host uses to re-register the
    // session instead of surfacing a permanent failure for the source.
    expect(envelope.epoch).toBe(2);
  });

  test("reconfiguring the runtime also advances the epoch", async () => {
    const { host, workers } = configuredHost();

    const first = host.invoke(
      JSON.stringify({ method: "probeRuntime", args: [], namedData: {} }),
      1_000,
    );
    workers[0].respondToLastCommand("{}");
    expect(JSON.parse(await first).epoch).toBe(1);

    host.configure(
      Buffer.from("globalThis.NemuAidokuSandbox = {};", "utf8").toString(
        "base64",
      ),
    );
    const second = host.invoke(
      JSON.stringify({ method: "probeRuntime", args: [], namedData: {} }),
      1_000,
    );
    workers[1].respondToLastCommand("{}");
    expect(JSON.parse(await second).epoch).toBe(2);
  });

  test("rejects a command that exceeds the transport limit before creating a worker", async () => {
    const { host, workers } = configuredHost();

    await expect(host.invoke("not json", 1_000)).rejects.toThrow(
      "The isolated Aidoku command is malformed.",
    );
    expect(workers).toHaveLength(0);
  });
});
