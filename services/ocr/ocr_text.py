"""Post-processing and error handling for per-region OCR results.

See README "Region OCR results". Evidence: the 2026-09-30 benchmark,
`artifacts/mobile-review-20260926/ocr-benchmark/v3-opt/`.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Awaitable, Callable, Generic, TypeVar

T = TypeVar("T")

DEFAULT_REGION_ATTEMPTS = 2
DEFAULT_RETRY_DELAY_S = 0.5

_ELLIPSIS_RUN = re.compile(r"[．.・･]{2,}")
_URL = re.compile(r"https?://\S+")
_DASH_RUN = re.compile(r"[―—－‐─]{2,}")


def restore_symbols(text: str) -> str:
    """Writes PaddleOCR-VL's ASCII-style punctuation the way the page typesets it.

    1. Runs of two or more of `．` `.` `・` `･` become `…`, one per three dots
       (at least one): `...` → `…`, `......` → `……`, `・・・` → `…`.
    2. `～` and `~` become the wave dash `〜`.
    3. Runs of two or more of `―` `—` `－` `‐` `─` become the same number of `─`
       (the two-em dash `──`).

    A single `.`/`・`, a single dash, `ー` (long vowel) and full/half width are
    left alone. Idempotent.
    """
    text = _ELLIPSIS_RUN.sub(lambda m: "…" * max(1, int(len(m.group()) / 3 + 0.5)), text)
    text = text.replace("～", "〜").replace("~", "〜")
    return _DASH_RUN.sub(lambda m: "─" * len(m.group()), text)


def describe_error(error: BaseException) -> str:
    """A short, client-safe description: the exception type, the HTTP status when there is
    one, else the first line of the message with URLs (internal backend addresses) removed."""
    name = type(error).__name__
    status = getattr(getattr(error, "response", None), "status_code", None)
    if isinstance(status, int):
        return f"{name}: HTTP {status}"
    first = str(error).strip().splitlines()[0] if str(error).strip() else ""
    first = _URL.sub("<url>", first)[:160]
    return f"{name}: {first}" if first else name


@dataclass
class Attempted(Generic[T]):
    """What `call_with_retry` produced: a value, or the last error after every attempt."""

    value: T | None
    error: str | None
    attempts: int


async def call_with_retry(
    call: Callable[[], Awaitable[T]],
    attempts: int = DEFAULT_REGION_ATTEMPTS,
    delay_s: float = DEFAULT_RETRY_DELAY_S,
) -> Attempted[T]:
    """Awaits `call()` up to `attempts` times (at least once), sleeping `delay_s` between tries.

    Never raises for a failed call (cancellation still propagates): the caller reports
    the region as failed instead of silently dropping it.
    """
    attempts = max(1, attempts)
    last = ""
    for attempt in range(1, attempts + 1):
        try:
            return Attempted(await call(), None, attempt)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001 - any transport/model failure fails the region
            last = describe_error(e)
            if attempt < attempts and delay_s > 0:
                await asyncio.sleep(delay_s)
    return Attempted(None, last or "OCR failed", attempts)
