import React from "react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Window } from "happy-dom";

const windowInstance = new Window({ url: "https://nemu.pm/settings" });
const globalDescriptors = new Map(
  ["window", "document", "HTMLElement", "Node", "navigator"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);

const checkStatus = mock(async () => {});
let agentState = {
  status: { available: false, version: undefined as string | undefined },
  checking: false,
  checkStatus,
};

mock.module("@/stores/agent", () => ({
  useAgentStore: () => agentState,
}));

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { version?: string }) =>
      ({
        "settings.agent": "Nemu Agent",
        "settings.agentConnected": "Connected",
        "settings.agentNotRunning": "Not running",
        "settings.agentDescription": "Desktop compatibility agent",
        "settings.agentDownload": "Download",
        "settings.agentRefresh": "Refresh",
        "settings.agentVersion": `v${values?.version ?? ""}`,
      })[key] ?? key,
  }),
}));

mock.module("@/lib/haptics", () => {
  const haptic = mock(() => {});
  return {
    haptic,
    hapticConfirm: mock(() => {}),
    hapticError: mock(() => {}),
    hapticSelection: haptic,
    hapticPress: haptic,
  };
});

mock.module("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

mock.module("@/components/ui/button", () => ({
  buttonVariants: () => "button",
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: React.ReactNode;
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
}));

beforeEach(() => {
  Object.defineProperties(globalThis, {
    window: {
      configurable: true,
      value: windowInstance as unknown as typeof globalThis.window,
    },
    document: {
      configurable: true,
      value: windowInstance.document as unknown as typeof globalThis.document,
    },
    HTMLElement: {
      configurable: true,
      value: windowInstance.HTMLElement as unknown as typeof globalThis.HTMLElement,
    },
    Node: {
      configurable: true,
      value: windowInstance.Node as unknown as typeof globalThis.Node,
    },
    navigator: {
      configurable: true,
      value: windowInstance.navigator as unknown as typeof globalThis.navigator,
    },
  });
});

afterEach(() => {
  cleanup();
  checkStatus.mockClear();
  agentState = {
    status: { available: false, version: undefined },
    checking: false,
    checkStatus,
  };
  for (const [key, descriptor] of globalDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

describe("AgentStatusCard", () => {
  test("uses the canonical external download link and names its refresh control", async () => {
    const { AgentStatusCard } = await import("./agent-status-card");
    const view = render(<AgentStatusCard />);

    const download = view.getByRole("link", { name: /download/i });
    expect(download.getAttribute("href")).toBe(
      "https://github.com/nemu-pm/nemu-agent/releases",
    );
    expect(download.getAttribute("target")).toBe("_blank");
    expect(download.getAttribute("rel")).toContain("noopener");
    expect(download.getAttribute("rel")).toContain("noreferrer");

    const refresh = view.getByRole("button", { name: "Refresh" });
    fireEvent.click(refresh);
    expect(checkStatus).toHaveBeenCalledTimes(1);
  });

  test("announces connected status without showing an irrelevant download action", async () => {
    agentState = {
      status: { available: true, version: "1.2.3" },
      checking: true,
      checkStatus,
    };
    const { AgentStatusCard } = await import("./agent-status-card");
    const view = render(<AgentStatusCard />);

    expect(view.queryByRole("link", { name: /download/i })).toBeNull();
    expect(view.getByText("Connected").parentElement?.textContent).toContain(
      "v1.2.3",
    );
    expect(
      view.getByRole("button", { name: "Refresh" }).getAttribute("aria-busy"),
    ).toBe("true");
  });
});
