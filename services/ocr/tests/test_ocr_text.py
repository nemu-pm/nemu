import asyncio

import ocr_text as ot


# --- restore_symbols ---------------------------------------------------------

def test_restore_symbols_benchmark_cases():
    # PaddleOCR-VL output -> ground truth, from the v2 benchmark error list.
    assert ot.restore_symbols("金...金...金...") == "金…金…金…"
    assert ot.restore_symbols("まさか......") == "まさか……"
    assert ot.restore_symbols("・・・なるほど") == "…なるほど"
    assert ot.restore_symbols("･･･はい") == "…はい"
    assert ot.restore_symbols("ポチタ～") == "ポチタ〜"
    assert ot.restore_symbols("えっ~") == "えっ〜"
    assert ot.restore_symbols("末――") == "末──"
    assert ot.restore_symbols("鋼の塊は——") == "鋼の塊は──"


def test_restore_symbols_keeps_single_marks_and_long_vowels():
    for text in ("2018.W杯", "元・殺し屋", "スタートー", "ラーメン", "A-B", "!!", "!?", "…", "──"):
        assert ot.restore_symbols(text) == text


def test_restore_symbols_rounds_dot_runs_and_is_idempotent():
    assert ot.restore_symbols("..") == "…"
    assert ot.restore_symbols("....") == "…"
    assert ot.restore_symbols(".....") == "……"
    for text in ("はい...", "え......！？", "末――", "ポチタ～"):
        once = ot.restore_symbols(text)
        assert ot.restore_symbols(once) == once


# --- call_with_retry -----------------------------------------------------------

def run(coro):
    return asyncio.run(coro)


def flaky(failures, value="ok", error=RuntimeError("vLLM 503")):
    calls = {"n": 0}

    async def call():
        calls["n"] += 1
        if calls["n"] <= failures:
            raise error
        return value

    return call, calls


def test_retry_succeeds_first_time():
    call, calls = flaky(0)
    out = run(ot.call_with_retry(call, attempts=2, delay_s=0))
    assert (out.value, out.error, out.attempts, calls["n"]) == ("ok", None, 1, 1)


def test_retry_recovers_from_one_transient_failure():
    call, calls = flaky(1)
    out = run(ot.call_with_retry(call, attempts=2, delay_s=0))
    assert (out.value, out.error, out.attempts, calls["n"]) == ("ok", None, 2, 2)


def test_retry_reports_the_last_error_instead_of_raising():
    call, calls = flaky(5)
    out = run(ot.call_with_retry(call, attempts=2, delay_s=0))
    assert out.value is None
    assert out.error == "RuntimeError: vLLM 503"
    assert (out.attempts, calls["n"]) == (2, 2)


def test_retry_always_tries_at_least_once():
    call, calls = flaky(5)
    out = run(ot.call_with_retry(call, attempts=0, delay_s=0))
    assert (out.attempts, calls["n"]) == (1, 1)


def test_retry_does_not_swallow_cancellation():
    async def cancelled():
        raise asyncio.CancelledError()

    try:
        run(ot.call_with_retry(cancelled, attempts=3, delay_s=0))
    except asyncio.CancelledError:
        pass
    else:
        raise AssertionError("CancelledError was swallowed")


def test_error_descriptions_hide_backend_urls():
    class Response:
        status_code = 500

    class HTTPStatusError(Exception):
        response = Response()

    err = HTTPStatusError("Server error '500' for url 'http://10.0.0.5:8000/v1/chat/completions'\nMore info: https://x")
    assert ot.describe_error(err) == "HTTPStatusError: HTTP 500"
    assert ot.describe_error(ConnectionError("connect to http://10.0.0.5:8000/v1 failed")) == (
        "ConnectionError: connect to <url> failed"
    )
    assert ot.describe_error(TimeoutError()) == "TimeoutError"


def test_failed_regions_are_reported_alongside_successes():
    # The server gathers one outcome per region; a failure must not hide the others.
    async def region(order):
        async def call():
            if order == 1:
                raise TimeoutError("read timeout")
            return f"text{order}"

        return order, await ot.call_with_retry(call, attempts=2, delay_s=0)

    async def gather():
        return [await c for c in asyncio.as_completed([region(i) for i in range(3)])]

    outcomes = dict(run(gather()))
    assert [outcomes[i].value for i in (0, 2)] == ["text0", "text2"]
    assert outcomes[1].value is None and outcomes[1].error == "TimeoutError: read timeout"
