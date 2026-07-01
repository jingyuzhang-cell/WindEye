"""Neo4j Index Manager — creates and manages full-text, B-tree, and vector indexes."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


# ── Recommended index / constraint definitions ───────────────────────────
# Each entry is a Cypher statement (idempotent — uses IF NOT EXISTS).

_RECOMMENDED_INDEXES: list[str] = [
    # -- B-tree indexes for MERGE performance --------------------------------
    "CREATE INDEX person_id_idx IF NOT EXISTS FOR (n:PERSON) ON (n.ID);",
    "CREATE INDEX company_orgnum_idx IF NOT EXISTS FOR (n:COMPANY) ON (n.ORGNUM);",
    "CREATE INDEX person_crawl_batch_idx IF NOT EXISTS FOR (n:PERSON) ON (n.crawl_batch);",
    "CREATE INDEX company_nm_idx IF NOT EXISTS FOR (n:COMPANY) ON (n.COMPANY_NM);",
    "CREATE INDEX person_nm_idx IF NOT EXISTS FOR (n:PERSON) ON (n.PERSON_NM);",
    # -- Relationship property indexes ---------------------------------------
    "CREATE INDEX executive_position_idx IF NOT EXISTS FOR ()-[r:EXECUTIVE]-() ON (r.position);",
    # -- Unique constraints --------------------------------------------------
    "CREATE CONSTRAINT company_name_unique IF NOT EXISTS FOR (n:COMPANY) REQUIRE n.name IS UNIQUE;",
    # -- Full-text indexes for keyword search --------------------------------
    (
        "CREATE FULLTEXT INDEX entity_ft_idx IF NOT EXISTS "
        "FOR (n:COMPANY|PERSON|EVENT|RiskFeature|Law|Regulation) "
        "ON EACH [n.name, n.COMPANY_NM, n.PERSON_NM, n.title];"
    ),
]

# Subset used by the executive crawler (fast path — no full-text overhead).
_CRAWLER_INDEXES: list[str] = [
    "CREATE INDEX person_id_idx IF NOT EXISTS FOR (n:PERSON) ON (n.ID);",
    "CREATE INDEX company_orgnum_idx IF NOT EXISTS FOR (n:COMPANY) ON (n.ORGNUM);",
    "CREATE INDEX person_crawl_batch_idx IF NOT EXISTS FOR (n:PERSON) ON (n.crawl_batch);",
    "CREATE INDEX company_nm_idx IF NOT EXISTS FOR (n:COMPANY) ON (n.COMPANY_NM);",
    "CREATE INDEX person_nm_idx IF NOT EXISTS FOR (n:PERSON) ON (n.PERSON_NM);",
    "CREATE INDEX executive_position_idx IF NOT EXISTS FOR ()-[r:EXECUTIVE]-() ON (r.position);",
    "CREATE CONSTRAINT company_name_unique IF NOT EXISTS FOR (n:COMPANY) REQUIRE n.name IS UNIQUE;",
]


class IndexManager:
    """Manages Neo4j database indexes for optimal query performance.

    Index types:
    - Full-text: For keyword search on entity names/descriptions
    - B-tree: For exact property lookups and sorting
    - Vector: For semantic similarity search on embeddings

    Usage::

        from core.database import Neo4jClient
        client = Neo4jClient.from_env()
        mgr = IndexManager(client)
        mgr.ensure_indexes()          # all recommended indexes
        mgr.ensure_crawler_indexes()  # subset needed by executive crawler
    """

    def __init__(self, db_client: Any = None) -> None:
        """*db_client* must have an ``execute_read(query, **params)`` method
        that accepts a Cypher string and returns a result (or None).
        """
        self._db = db_client

    # ------------------------------------------------------------------

    def ensure_indexes(self) -> dict[str, int]:
        """Create **all** recommended indexes and constraints.

        Returns a dict with ``created`` / ``skipped`` / ``errors`` counts.
        """
        return self._execute_index_list(_RECOMMENDED_INDEXES, label="all")

    def ensure_crawler_indexes(self) -> dict[str, int]:
        """Create only the indexes needed by the executive crawler.

        This is a fast subset of ``ensure_indexes()`` that skips
        full-text and vector indexes.
        """
        return self._execute_index_list(_CRAWLER_INDEXES, label="crawler")

    # ------------------------------------------------------------------

    def _execute_index_list(
        self, statements: list[str], label: str = ""
    ) -> dict[str, int]:
        counts = {"created": 0, "skipped": 0, "errors": 0}

        if self._db is None:
            logger.warning(
                "IndexManager: no db client — cannot execute %s indexes", label
            )
            return counts

        for stmt in statements:
            try:
                self._db.execute_read(stmt, timeout_seconds=10.0)
                counts["created"] += 1
                # Extract a short description for the log line
                desc = stmt.split("IF NOT EXISTS")[0].strip().rstrip(";")
                logger.info("IndexManager [%s]: %s", label, desc[:100])
            except Exception as exc:
                err_msg = str(exc).lower()
                # Neo4j "already exists" or "equivalent index" → not an error
                if any(kw in err_msg for kw in (
                    "already exists", "equivalent", "duplicate",
                    "index already", "constraint already",
                )):
                    counts["skipped"] += 1
                    logger.debug("IndexManager [%s]: skipped (exists)", label)
                else:
                    counts["errors"] += 1
                    logger.warning(
                        "IndexManager [%s]: error — %s", label, exc
                    )

        logger.info(
            "IndexManager [%s]: done — created=%d, skipped=%d, errors=%d",
            label, counts["created"], counts["skipped"], counts["errors"],
        )
        return counts
