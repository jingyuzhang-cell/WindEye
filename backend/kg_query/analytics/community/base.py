"""Abstract base class for community detection algorithms."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseCommunityAlgorithm(ABC):
    """Interface for community detection algorithms.

    Each algorithm receives a Neo4j database client and detection parameters,
    and returns a list of community dicts plus a modularity score.
    """

    name: str = ""
    label: str = ""  # Chinese-friendly display name
    description: str = ""
    complexity: str = ""  # e.g. "O(n log n)"
    params: dict[str, Any] = {}  # configurable parameter schema

    @abstractmethod
    def detect(
        self,
        db: Any,
        labels: list[str],
        max_nodes: int,
        min_size: int,
    ) -> tuple[list[dict], float]:
        """Run community detection.

        Args:
            db: Neo4jClient instance.
            labels: Neo4j label filter list.
            max_nodes: Maximum nodes to process.
            min_size: Minimum community size.

        Returns:
            (communities_list, modularity)
        """
        ...
