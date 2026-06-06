"""Neo4j database client with pooling, timeout, retry, and serialization.

Unified connection layer — the single entry point for all Neo4j access
across both the DRA-MA pipeline and the graph visualization API.
"""

from __future__ import annotations

import os
import logging
from typing import Any

from neo4j import GraphDatabase
from neo4j.exceptions import (
    Neo4jError,
    ServiceUnavailable,
    SessionExpired,
    TransientError,
)
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger(__name__)


class Neo4jClient:
    """Unified Neo4j driver wrapper with pooling, retry, and serialization."""

    def __init__(self, uri: str, username: str, password: str, database: str) -> None:
        self._uri = uri
        self._username = username
        self._password = password
        self._database = database
        self._driver = GraphDatabase.driver(uri, auth=(username, password))

    # ── Factory ──────────────────────────────────────────────────────

    @classmethod
    def from_env(cls) -> "Neo4jClient":
        uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        username = os.getenv("NEO4J_USERNAME") or os.getenv("NEO4J_USER", "neo4j")
        password = os.getenv("NEO4J_PASSWORD", "")
        database = os.getenv("NEO4J_DATABASE", "neo4j")
        if not password:
            raise RuntimeError("NEO4J_PASSWORD is required for graph retrieval.")
        return cls(uri=uri, username=username, password=password, database=database)

    # ── Lifecycle ────────────────────────────────────────────────────

    def close(self) -> None:
        self._driver.close()

    def verify_connectivity(self) -> None:
        self._driver.verify_connectivity()

    # ── Read query (DRA-MA pipeline) ─────────────────────────────────

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.3, min=0.3, max=2),
        retry=retry_if_exception_type((ServiceUnavailable, SessionExpired, TransientError)),
    )
    def execute_read(
        self,
        query: str,
        parameters: dict[str, Any] | None = None,
        timeout_seconds: float = 5.0,
    ) -> list[dict[str, Any]]:
        with self._driver.session(database=self._database) as session:
            result = session.run(query, parameters or {}, timeout=timeout_seconds)
            return [record.data() for record in result]

    # ── Read query with summary (graph visualization API) ────────────

    def execute_read_with_summary(
        self,
        query: str,
        parameters: dict[str, Any] | None = None,
        timeout_seconds: float = 10.0,
    ) -> tuple[list[Any], dict[str, Any]]:
        """Execute a read query and return (Record objects, summary).

        Records are kept as neo4j.Record objects so that callers can access
        Node/Relationship objects via record.get("n") rather than stripped
        property dicts from record.data().

        Summary includes: result_count, query_type, available_after_ms,
        consumed_after_ms, and any notifications/warnings from the server.
        """
        with self._driver.session(database=self._database) as session:
            result = session.run(query, parameters or {}, timeout=timeout_seconds)
            records = list(result)
            summary = result.consume()

            def _prop(obj, name, default=0):
                """Read attribute or dict key, handling both object and dict types."""
                if isinstance(obj, dict):
                    return obj.get(name, default)
                return getattr(obj, name, default)

            def _safe_notification(n):
                if isinstance(n, dict):
                    return {
                        "code": n.get("code", ""),
                        "title": n.get("title", ""),
                        "description": n.get("description", ""),
                        "severity": n.get("severity", ""),
                    }
                return {
                    "code": getattr(n, "code", ""),
                    "title": getattr(n, "title", ""),
                    "description": getattr(n, "description", ""),
                    "severity": getattr(n, "severity", ""),
                }

            return records, {
                "result_count": len(records),
                "available_after_ms": _prop(summary, "result_available_after"),
                "consumed_after_ms": _prop(summary, "result_consumed_after"),
                "query_type": str(_prop(summary, "query_type", "")),
                "notifications": [
                    _safe_notification(n)
                    for n in (_prop(summary, "notifications") or [])
                ],
            }

    # ── Serialization helpers ────────────────────────────────────────

    @staticmethod
    def serialize_props(props: dict[str, Any] | None) -> dict[str, Any]:
        """Convert Neo4j node/relationship properties to JSON-serializable types.

        Handles: Neo4j temporal types (Date, DateTime, Duration), Int64
        large integers, and nested lists of the same.
        """
        if not props:
            return {}

        clean: dict[str, Any] = {}
        for key, value in dict(props).items():
            if hasattr(value, "isoformat"):
                clean[key] = value.isoformat()
            elif hasattr(value, "__int__") and not isinstance(value, (int, float, str)):
                clean[key] = int(value)
            elif isinstance(value, list):
                clean[key] = [
                    item.isoformat() if hasattr(item, "isoformat") else item
                    for item in value
                ]
            else:
                clean[key] = value
        return clean

    @staticmethod
    def serialize_node(node: Any) -> dict[str, Any]:
        """Convert a Neo4j Node object to a frontend-ready dict.

        Returns: {"id": element_id, "labels": [...], "properties": {...}}
        """
        return {
            "id": node.element_id,
            "labels": list(node.labels),
            "properties": Neo4jClient.serialize_props(dict(node)),
        }

    @staticmethod
    def serialize_relationship(rel: Any) -> dict[str, Any]:
        """Convert a Neo4j Relationship object to a frontend-ready dict.

        Returns: {"id": element_id, "source": ..., "target": ..., "label": ...,
                  "relation": ..., "type": ..., "raw_type": ..., "properties": {...}}
        """
        rel_type = rel.type
        return {
            "id": rel.element_id,
            "source": rel.start_node.element_id,
            "target": rel.end_node.element_id,
            "label": rel_type,
            "relation": rel_type,
            "type": rel_type,
            "raw_type": rel_type,
            "properties": Neo4jClient.serialize_props(dict(rel)),
        }

    # ── Error classification ─────────────────────────────────────────

    @staticmethod
    def is_transient_error(exc: Exception) -> bool:
        return isinstance(
            exc,
            (ServiceUnavailable, SessionExpired, TransientError, Neo4jError),
        )
