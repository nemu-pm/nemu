import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock XMLHttpRequest for tests
class MockXMLHttpRequest {
  static UNSENT = 0;
  static OPENED = 1;
  static HEADERS_RECEIVED = 2;
  static LOADING = 3;
  static DONE = 4;

  readyState = 0;
  status = 0;
  statusText = "";
  responseText = "";
  responseType = "";
  response: unknown = null;
  private _headers: Record<string, string> = {};

  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onreadystatechange: (() => void) | null = null;

  open(_method: string, _url: string, _async = true) {
    this.readyState = 1;
  }

  setRequestHeader(name: string, value: string) {
    this._headers[name] = value;
  }

  overrideMimeType(_mimeType: string) {
    // No-op for tests
  }

  getAllResponseHeaders(): string {
    return "";
  }

  send(_body?: Document | XMLHttpRequestBodyInit | null) {
    this.readyState = 4;
    this.status = 200;
    this.responseText = "";
    this.onreadystatechange?.();
    this.onload?.();
  }

  abort() {
    // No-op
  }
}

// @ts-expect-error - Mock global XMLHttpRequest
globalThis.XMLHttpRequest = MockXMLHttpRequest;
