import {
  dhashWordFromHex,
  dhashWordToHex,
  type Dhash,
  type MultiDhash,
} from './hash';

export const DUAL_READER_DHASH_CACHE_VERSION = 3;

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
  return { h: dhashWordToHex(hash.h), v: dhashWordToHex(hash.v) };
}

export function deserializeDhash(hash: SerializedDhash): Dhash {
  return { h: dhashWordFromHex(hash.h), v: dhashWordFromHex(hash.v) };
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
