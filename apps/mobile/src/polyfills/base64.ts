import { Buffer } from "buffer";

if (typeof globalThis.atob !== "function") {
  globalThis.atob = (input: string) =>
    Buffer.from(input, "base64").toString("latin1");
}

if (typeof globalThis.btoa !== "function") {
  globalThis.btoa = (input: string) =>
    Buffer.from(input, "latin1").toString("base64");
}
