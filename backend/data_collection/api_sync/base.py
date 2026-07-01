"""Abstract base classes and channel manager for executive data sources.

Defines the ``ExecutiveDataSource`` ABC that every channel (free / paid /
demo) implements, plus a ``ChannelManager`` that orchestrates fallback
across multiple channels.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Optional

from .rate_limiter import TokenBucket, create_rate_limiter

logger = logging.getLogger(__name__)


# ── Shared result types ──────────────────────────────────────────────────

class LegalPersonResult:
    """Normalised legal-representative record from any channel."""

    __slots__ = ("name", "id_card", "position")

    def __init__(
        self,
        name: str,
        id_card: str | None = None,
        position: str = "法定代表人",
    ) -> None:
        self.name = name.strip() if name else ""
        self.id_card = (id_card.strip() if id_card else None) if id_card else None
        self.position = position or "法定代表人"

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "id_card": self.id_card,
            "position": self.position,
        }

    def is_valid(self) -> bool:
        return bool(self.name)

    def __repr__(self) -> str:
        return f"LegalPerson({self.name!r})"


class ExecutiveResult:
    """Normalised executive record from any channel."""

    __slots__ = ("name", "id_card", "position")

    def __init__(
        self,
        name: str,
        id_card: str | None = None,
        position: str = "",
    ) -> None:
        self.name = name.strip() if name else ""
        self.id_card = (id_card.strip() if id_card else None) if id_card else None
        self.position = position.strip() if position else ""

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "id_card": self.id_card,
            "position": self.position,
        }

    def is_valid(self) -> bool:
        return bool(self.name)

    def __repr__(self) -> str:
        return f"Executive({self.name!r}, {self.position!r})"


class CompanyFetchResult:
    """Aggregated result of fetching personnel for a single company."""

    __slots__ = ("company_name", "credit_code", "legal_rep", "executives",
                 "source_name", "error")

    def __init__(
        self,
        company_name: str,
        credit_code: str | None = None,
        legal_rep: LegalPersonResult | None = None,
        executives: list[ExecutiveResult] | None = None,
        source_name: str = "",
        error: str | None = None,
    ) -> None:
        self.company_name = company_name
        self.credit_code = credit_code
        self.legal_rep = legal_rep
        self.executives = executives or []
        self.source_name = source_name
        self.error = error

    @property
    def success(self) -> bool:
        return self.error is None and (
            (self.legal_rep is not None and self.legal_rep.is_valid())
            or len(self.executives) > 0
        )

    def __repr__(self) -> str:
        status = "OK" if self.success else f"ERR({self.error})"
        return (f"CompanyFetchResult({self.company_name!r}, "
                f"legal={self.legal_rep}, execs={len(self.executives)}, "
                f"src={self.source_name}, {status})")


# ── Abstract base class ──────────────────────────────────────────────────

class ExecutiveDataSource(ABC):
    """Abstract base for a channel that fetches legal reps and executives.

    Subclasses implement ``_fetch_legal_representative()`` and
    ``_fetch_executives()``.  The public ``fetch_all()`` method
    respects the rate limiter and normalises results.
    """

    # Set by subclasses
    source_name: str = "base"
    priority: int = 999       # lower = tried first
    channel_type: str = "free"  # "free" | "paid" | "demo"

    def __init__(self) -> None:
        self._rate_limiter: TokenBucket = create_rate_limiter(self.source_name)

    # -- sub-class interface -----------------------------------------------

    @abstractmethod
    def _fetch_legal_representative(
        self, company_name: str, credit_code: str | None
    ) -> LegalPersonResult | None:
        """Raw fetch — subclasses implement the HTTP / parse logic."""
        ...

    @abstractmethod
    def _fetch_executives(
        self, company_name: str, credit_code: str | None
    ) -> list[ExecutiveResult]:
        """Raw fetch — subclasses implement the HTTP / parse logic."""
        ...

    # -- public API ---------------------------------------------------------

    def fetch_legal_representative(
        self, company_name: str, credit_code: str | None
    ) -> LegalPersonResult | None:
        """Rate-limited, normalised legal-person fetch."""
        self._rate_limiter.wait()
        try:
            result = self._fetch_legal_representative(company_name, credit_code)
            if result and result.is_valid():
                logger.debug(
                    "%s: legal rep for %s -> %s",
                    self.source_name, company_name, result.name,
                )
                return result
            return None
        except Exception:
            logger.exception(
                "%s: error fetching legal rep for %s", self.source_name, company_name
            )
            return None

    def fetch_executives(
        self, company_name: str, credit_code: str | None
    ) -> list[ExecutiveResult]:
        """Rate-limited, normalised executives fetch."""
        self._rate_limiter.wait()
        try:
            results = self._fetch_executives(company_name, credit_code)
            valid = [r for r in results if r.is_valid()]
            if valid:
                logger.debug(
                    "%s: %d executives for %s",
                    self.source_name, len(valid), company_name,
                )
            return valid
        except Exception:
            logger.exception(
                "%s: error fetching executives for %s", self.source_name, company_name
            )
            return []

    def fetch_all(
        self, company_name: str, credit_code: str | None
    ) -> CompanyFetchResult:
        """Convenience: fetch both legal rep and executives in one call.

        Only consumes one rate-limit token for the legal rep fetch;
        executives are fetched on a separate token.
        """
        error: str | None = None
        legal_rep: LegalPersonResult | None = None
        executives: list[ExecutiveResult] = []

        # Legal rep
        try:
            legal_rep = self.fetch_legal_representative(company_name, credit_code)
        except Exception as exc:
            error = f"legal_rep: {exc}"

        # Executives (separate token)
        try:
            executives = self.fetch_executives(company_name, credit_code)
        except Exception as exc:
            if error:
                error += f"; executives: {exc}"
            else:
                error = f"executives: {exc}"

        return CompanyFetchResult(
            company_name=company_name,
            credit_code=credit_code,
            legal_rep=legal_rep,
            executives=executives,
            source_name=self.source_name,
            error=error,
        )


# ── Channel Manager ──────────────────────────────────────────────────────

class ChannelManager:
    """Orchestrates fallback across multiple ``ExecutiveDataSource`` instances.

    Channels are tried in *priority* order (lowest first).  For legal reps
    and executives, the first channel that returns a valid result wins.

    Typical setup::

        manager = ChannelManager()
        manager.add(AiqichaSource())
        manager.add(QccSource())           # only if QCC_API_KEY is set
        manager.add(DemoSource(companies)) # fallback for dev / dry-run
    """

    def __init__(self) -> None:
        self._channels: list[ExecutiveDataSource] = []

    # ------------------------------------------------------------------

    def add(self, channel: ExecutiveDataSource) -> None:
        """Register a channel.  Channels are kept sorted by priority."""
        self._channels.append(channel)
        self._channels.sort(key=lambda c: c.priority)

    @property
    def channels(self) -> list[ExecutiveDataSource]:
        return list(self._channels)

    @property
    def active_count(self) -> int:
        return len(self._channels)

    # ------------------------------------------------------------------

    def fetch_legal_rep(
        self, company_name: str, credit_code: str | None
    ) -> tuple[LegalPersonResult | None, str]:
        """Try every channel in priority order; return (result, source_name).

        Returns (None, "") if no channel returns a valid result.
        """
        for ch in self._channels:
            result = ch.fetch_legal_representative(company_name, credit_code)
            if result and result.is_valid():
                return result, ch.source_name
        return None, ""

    def fetch_executives(
        self, company_name: str, credit_code: str | None
    ) -> tuple[list[ExecutiveResult], str]:
        """Try every channel in priority order; return (list, source_name).

        Returns ([], "") if no channel returns executives.
        """
        for ch in self._channels:
            results = ch.fetch_executives(company_name, credit_code)
            if results:
                return results, ch.source_name
        return [], ""

    def fetch_all(
        self, company_name: str, credit_code: str | None
    ) -> CompanyFetchResult:
        """Fetch legal rep + executives, falling back across channels.

        The legal rep and executives may come from **different** channels
        if the primary channel returns one but not the other.
        """
        legal_rep, legal_src = self.fetch_legal_rep(company_name, credit_code)
        executives, exec_src = self.fetch_executives(company_name, credit_code)

        source_name = legal_src or exec_src or "none"
        return CompanyFetchResult(
            company_name=company_name,
            credit_code=credit_code,
            legal_rep=legal_rep,
            executives=executives,
            source_name=source_name,
        )
