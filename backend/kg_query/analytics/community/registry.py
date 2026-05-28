"""Algorithm registry for community detection methods."""

from __future__ import annotations

from typing import Any

from .base import BaseCommunityAlgorithm


class AlgorithmRegistry:
    """Manages registered community detection algorithms."""

    def __init__(self) -> None:
        self._algorithms: dict[str, BaseCommunityAlgorithm] = {}

    def register(self, algorithm: BaseCommunityAlgorithm) -> None:
        """Register an algorithm instance."""
        self._algorithms[algorithm.name] = algorithm

    def get(self, name: str) -> BaseCommunityAlgorithm | None:
        """Get an algorithm by name."""
        return self._algorithms.get(name)

    def list_all(self) -> list[BaseCommunityAlgorithm]:
        """List all registered algorithms."""
        return list(self._algorithms.values())

    def get_algorithms_info(self) -> list[dict[str, Any]]:
        """Return algorithm metadata for API responses."""
        return [
            {
                "name": alg.name,
                "label": alg.label,
                "description": alg.description,
                "complexity": alg.complexity,
                "params": alg.params,
            }
            for alg in self._algorithms.values()
        ]

    def names(self) -> list[str]:
        """Return list of registered algorithm names."""
        return list(self._algorithms.keys())


# Module-level singleton
registry = AlgorithmRegistry()
