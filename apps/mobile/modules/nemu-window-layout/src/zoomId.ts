/**
 * One spelling per cover-zoom id, on both sides of the bridge.
 *
 * The router hands a pushed route its `zoom` param decoded, while sources
 * build ids from library item ids that are still URL-encoded for sources
 * whose ids carry `/` (Jump+: `…:%2Fepisode%2F…`). A source registered under
 * one spelling and a target asking for the other never meet: UIKit finds no
 * view to zoom from. `ZoomSource` and `ZoomTarget` (and the reader's cover
 * handoff) take this spelling, and the native registry applies the same rule
 * (`NemuZoomId.canonical`, ios/NemuZoomId.swift) to every id it is given.
 * Both are checked against `zoomIdVectors.json`.
 *
 * The rule: percent-decode while the id still holds a `%XX` escape and
 * decodes cleanly (each round shortens it, so this ends); an id that does
 * not decode (a lone `%`, invalid UTF-8) is kept as it is. Idempotent, so a
 * source, a target and the native registry canonicalising one id again
 * still agree.
 */
export function canonicalZoomId(zoomId: string): string;
export function canonicalZoomId(zoomId: string | null | undefined): string | null;
export function canonicalZoomId(zoomId: string | null | undefined): string | null {
  if (!zoomId) return null;
  let value = zoomId;
  while (/%[0-9a-fA-F]{2}/.test(value)) {
    try {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    } catch {
      break;
    }
  }
  return value;
}
