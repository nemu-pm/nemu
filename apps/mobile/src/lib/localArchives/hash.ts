import { sha256Bytes } from "@nemu/core";

export const LOCAL_ARCHIVE_HASH_BLOCK_BYTES = 1024 * 1024;

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Blocked SHA-256: SHA-256 over the concatenation of the SHA-256 of every
 * 1 MiB block. Identical files give identical hashes on every device while only
 * one block is ever held in memory (the empty file hashes one empty block).
 */
export class BlockedSha256 {
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private digests: Uint8Array[] = [];
  private bytes = 0;

  update(chunk: Uint8Array): void {
    this.bytes += chunk.length;
    let offset = 0;
    while (offset < chunk.length) {
      const take = Math.min(LOCAL_ARCHIVE_HASH_BLOCK_BYTES - this.pendingBytes, chunk.length - offset);
      this.pending.push(chunk.subarray(offset, offset + take));
      this.pendingBytes += take;
      offset += take;
      if (this.pendingBytes === LOCAL_ARCHIVE_HASH_BLOCK_BYTES) this.flush();
    }
  }

  get byteLength(): number {
    return this.bytes;
  }

  private flush(): void {
    const block = new Uint8Array(this.pendingBytes);
    let at = 0;
    for (const part of this.pending) {
      block.set(part, at);
      at += part.length;
    }
    this.digests.push(sha256Bytes(block));
    this.pending = [];
    this.pendingBytes = 0;
  }

  digestHex(): string {
    if (this.pendingBytes > 0 || this.digests.length === 0) this.flush();
    const all = new Uint8Array(this.digests.length * 32);
    this.digests.forEach((digest, i) => all.set(digest, i * 32));
    return hex(sha256Bytes(all));
  }
}

export function volumeIdForContentHash(contentHash: string): string {
  return `v-${contentHash.slice(0, 32)}`;
}
