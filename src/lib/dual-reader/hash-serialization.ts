import type { Dhash, MultiDhash } from './hash';

export type SerializedDhash = { h: string; v: string };
export type SerializedMultiDhash = {
  full: SerializedDhash;
  left?: SerializedDhash;
  right?: SerializedDhash;
  top?: SerializedDhash;
  bottom?: SerializedDhash;
  center?: SerializedDhash;
  trimmed?: SerializedDhash;
};

export function serializeDhash(hash: Dhash): SerializedDhash {
  return { h: hash.h.toString(16), v: hash.v.toString(16) };
}

export function deserializeDhash(hash: SerializedDhash): Dhash {
  return { h: BigInt(`0x${hash.h}`), v: BigInt(`0x${hash.v}`) };
}

function serializeMaybe(hash?: Dhash): SerializedDhash | undefined {
  return hash ? serializeDhash(hash) : undefined;
}

function deserializeMaybe(hash?: SerializedDhash): Dhash | undefined {
  return hash ? deserializeDhash(hash) : undefined;
}

export function serializeMultiDhash(hash: MultiDhash): SerializedMultiDhash {
  return {
    full: serializeDhash(hash.full),
    left: serializeMaybe(hash.left),
    right: serializeMaybe(hash.right),
    top: serializeMaybe(hash.top),
    bottom: serializeMaybe(hash.bottom),
    center: serializeMaybe(hash.center),
    trimmed: serializeMaybe(hash.trimmed),
  };
}

export function deserializeMultiDhash(hash: SerializedMultiDhash): MultiDhash {
  return {
    full: deserializeDhash(hash.full),
    left: deserializeMaybe(hash.left),
    right: deserializeMaybe(hash.right),
    top: deserializeMaybe(hash.top),
    bottom: deserializeMaybe(hash.bottom),
    center: deserializeMaybe(hash.center),
    trimmed: deserializeMaybe(hash.trimmed),
  };
}
