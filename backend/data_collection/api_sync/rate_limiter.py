"""Token bucket rate limiter for API/data-source throttling.

Provides a synchronous token-bucket implementation that callers await
before issuing HTTP requests.  Supports per-channel defaults so every
data source gets appropriate rate limits without manual configuration.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

# ── Per-channel default rate limits ──────────────────────────────────────
# (tokens_per_second, burst)
CHANNEL_RATE_LIMITS: dict[str, tuple[float, int]] = {
    "aiqicha":    (0.33, 1),   # ~1 request per 3 seconds (free tier)
    "gsxt":       (0.2,  1),   # ~1 request per 5 seconds (heavy anti-bot)
    "qcc":        (10.0, 5),   # 企查查 paid tier
    "tianyancha": (10.0, 5),   # 天眼查 paid tier
    "demo":       (999.0, 999), # unlimited for demo / dry-run
}


@dataclass
class TokenBucket:
    """Synchronous token bucket.

    Tokens refill at *rate* tokens/second up to *capacity*.
    Call ``wait()`` before each request — it blocks until a token
    is available.
    """

    rate: float       # tokens added per second
    capacity: float   # max tokens (burst)

    tokens: float = 0.0
    _last_refill: float = 0.0

    def __post_init__(self) -> None:
        self.tokens = float(self.capacity)
        self._last_refill = time.monotonic()

    # ------------------------------------------------------------------

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self._last_refill = now

    def wait(self) -> None:
        """Block until at least one token is available, then consume it."""
        self._refill()
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return
        # Calculate how long we need to wait for one token
        needed = 1.0 - self.tokens
        wait_seconds = needed / self.rate if self.rate > 0 else 0.0
        if wait_seconds > 0:
            time.sleep(wait_seconds)
        self.tokens = 0.0
        self._last_refill = time.monotonic()


def create_rate_limiter(channel_name: str) -> TokenBucket:
    """Build a TokenBucket from the pre-defined channel defaults.

    Falls back to (1.0, 1) for unknown channel names.
    """
    rate, burst = CHANNEL_RATE_LIMITS.get(
        channel_name.lower(), (1.0, 1)
    )
    return TokenBucket(rate=rate, capacity=float(burst))
