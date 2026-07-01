"""Cypher statement generation and batch Neo4j write for executive crawler.

Reuses ``_escape_cypher_string`` from the existing ``cypher_generator``
module and the ``Neo4jClient`` from ``core.database``.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from kg_construction.etl.cypher_generator import _escape_cypher_string

logger = logging.getLogger(__name__)


# ── Cypher generators ────────────────────────────────────────────────────

def generate_person_merge(
    person: dict[str, Any],
    batch_id: str = "",
) -> str:
    """Generate a MERGE statement for a single PERSON node.

    Uses ``name`` as the primary merge key and ``ID`` (id_card) as an
    optional secondary key for disambiguation.

    Parameters
    ----------
    person:
        Dict with keys: name, PERSON_NM, POSITION, source, confidence,
        ID (optional), aliases (optional), company_count.
    batch_id:
        Identifier for this crawl run (stored as crawl_batch property).

    Returns
    -------
    str
        A complete Cypher MERGE statement.
    """
    name = person.get("name", "")
    if not name:
        raise ValueError("person dict must contain 'name'")

    safe_name = _escape_cypher_string(name)
    id_card = person.get("ID") or person.get("id_card")
    person_nm = person.get("PERSON_NM", name)
    safe_person_nm = _escape_cypher_string(person_nm)
    position = person.get("POSITION", "")
    safe_position = _escape_cypher_string(position)
    source = person.get("source", "crawler")
    safe_source = _escape_cypher_string(source)
    confidence = person.get("confidence", 0.5)

    # Aliases as JSON string
    aliases = person.get("aliases", [])
    aliases_str = json.dumps(aliases, ensure_ascii=False) if aliases else "[]"
    safe_aliases = _escape_cypher_string(aliases_str)

    company_count = person.get("company_count", 0)

    # Build merge key — with or without ID
    if id_card:
        safe_id = _escape_cypher_string(str(id_card))
        merge_clause = f'MERGE (p:PERSON:Subject {{name: "{safe_name}", ID: "{safe_id}"}})'
    else:
        merge_clause = f'MERGE (p:PERSON:Subject {{name: "{safe_name}"}})'

    stmt = f"""{merge_clause}
ON CREATE SET
  p.PERSON_NM = "{safe_person_nm}",
  p.POSITION = "{safe_position}",
  p.source = "{safe_source}",
  p.confidence = {confidence},
  p.aliases = "{safe_aliases}",
  p.company_count = {company_count},
  p.crawl_batch = "{batch_id}",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "{safe_person_nm}",
  p.source = CASE
    WHEN p.source CONTAINS "{safe_source}" THEN p.source
    WHEN p.source IS NULL THEN "{safe_source}"
    ELSE p.source + ",{safe_source}"
  END,
  p.confidence = CASE WHEN p.confidence < {confidence} THEN {confidence} ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < {company_count} THEN {company_count} ELSE p.company_count END,
  p.crawl_batch = "{batch_id}",
  p.last_seen = datetime();"""

    return stmt


def generate_legal_person_relationship(
    person_name: str,
    company_name: str,
    person_id_card: str | None = None,
    source: str = "crawler",
    batch_id: str = "",
) -> str:
    """Generate Cypher for (PERSON)-[:LEGAL_PERSON]->(COMPANY)."""
    safe_pname = _escape_cypher_string(person_name)
    safe_cname = _escape_cypher_string(company_name)
    safe_source = _escape_cypher_string(source)

    if person_id_card:
        safe_id = _escape_cypher_string(str(person_id_card))
        person_match = (f'MATCH (p:PERSON:Subject {{name: "{safe_pname}", '
                        f'ID: "{safe_id}"}})')
    else:
        person_match = f'MATCH (p:PERSON:Subject {{name: "{safe_pname}"}})'

    return f"""{person_match}
MATCH (c:COMPANY {{COMPANY_NM: "{safe_cname}"}})
MERGE (p)-[r:LEGAL_PERSON]->(c)
ON CREATE SET
  r.source = "{safe_source}",
  r.crawl_batch = "{batch_id}",
  r.created_at = datetime()
ON MATCH SET
  r.last_seen = datetime(),
  r.crawl_batch = "{batch_id}";"""


def generate_executive_relationship(
    person_name: str,
    company_name: str,
    position: str = "",
    person_id_card: str | None = None,
    source: str = "crawler",
    batch_id: str = "",
) -> str:
    """Generate Cypher for (PERSON)-[:EXECUTIVE {position}]->(COMPANY)."""
    safe_pname = _escape_cypher_string(person_name)
    safe_cname = _escape_cypher_string(company_name)
    safe_position = _escape_cypher_string(position)
    safe_source = _escape_cypher_string(source)

    if person_id_card:
        safe_id = _escape_cypher_string(str(person_id_card))
        person_match = (f'MATCH (p:PERSON:Subject {{name: "{safe_pname}", '
                        f'ID: "{safe_id}"}})')
    else:
        person_match = f'MATCH (p:PERSON:Subject {{name: "{safe_pname}"}})'

    return f"""{person_match}
MATCH (c:COMPANY {{COMPANY_NM: "{safe_cname}"}})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "{safe_position}",
  r.source = "{safe_source}",
  r.crawl_batch = "{batch_id}",
  r.created_at = datetime()
ON MATCH SET
  r.position = "{safe_position}",
  r.last_seen = datetime(),
  r.crawl_batch = "{batch_id}";"""


# ── Batch writer ─────────────────────────────────────────────────────────

def build_all_statements(
    unique_persons: list[dict[str, Any]],
    batch_id: str = "",
) -> list[str]:
    """Build the complete list of Cypher statements for a crawl run.

    Order: PERSON nodes first, then relationships.  This ensures
    the PERSON nodes exist before relationships reference them.
    """
    statements: list[str] = []

    # 1. Person node MERGEs
    for person in unique_persons:
        try:
            stmt = generate_person_merge(person, batch_id=batch_id)
            statements.append(stmt)
        except Exception:
            logger.exception("Failed to generate PERSON merge for %s", person.get("name"))

    # 2. Relationship MERGEs (from each person's roles list)
    for person in unique_persons:
        person_name = person.get("name", "")
        person_id_card = person.get("ID") or person.get("id_card")
        source = person.get("source", "crawler")

        for role in person.get("roles", []):
            company_name = role.get("company_name", "")
            rel_type = role.get("relationship_type", "")
            position = role.get("position", "")

            if not company_name:
                continue

            try:
                if rel_type == "LEGAL_PERSON":
                    stmt = generate_legal_person_relationship(
                        person_name=person_name,
                        company_name=company_name,
                        person_id_card=person_id_card,
                        source=source,
                        batch_id=batch_id,
                    )
                else:
                    stmt = generate_executive_relationship(
                        person_name=person_name,
                        company_name=company_name,
                        position=position,
                        person_id_card=person_id_card,
                        source=source,
                        batch_id=batch_id,
                    )
                statements.append(stmt)
            except Exception:
                logger.exception(
                    "Failed to generate %s relationship: %s -> %s",
                    rel_type, person_name, company_name,
                )

    return statements


def execute_batch(
    client: Any,  # Neo4jClient (lazy import to avoid coupling)
    statements: list[str],
    batch_size: int = 50,
    dry_run: bool = False,
    output_file: str | None = None,
) -> dict[str, int]:
    """Execute Cypher statements in batches against Neo4j.

    Parameters
    ----------
    client:
        ``Neo4jClient`` instance.
    statements:
        Ordered list of Cypher statements.
    batch_size:
        Statements per transaction batch.
    dry_run:
        If True, write statements to *output_file* instead of executing.
    output_file:
        Path for dry-run output (default: stdout log).

    Returns
    -------
    dict
        ``{executed, errors, nodes_created, rels_created}``.
    """
    if dry_run:
        output_path = output_file or "crawl_executives_output.cypher"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("// Auto-generated by crawl_executives (dry-run)\n")
            f.write(f"// Generated at: {datetime.now(timezone.utc).isoformat()}\n")
            f.write(f"// Total statements: {len(statements)}\n\n")
            for i, stmt in enumerate(statements, 1):
                f.write(f"// --- Statement {i} ---\n")
                f.write(stmt)
                f.write("\n\n")
        logger.info("Dry-run: wrote %d statements to %s", len(statements), output_path)
        return {"executed": len(statements), "errors": 0,
                "nodes_created": 0, "rels_created": 0}

    stats = {"executed": 0, "errors": 0, "nodes_created": 0, "rels_created": 0}

    total = len(statements)
    for i in range(0, total, batch_size):
        batch = statements[i : i + batch_size]
        batch_start = i + 1
        batch_end = min(i + batch_size, total)

        for stmt in batch:
            try:
                client.execute_read(stmt)
                stats["executed"] += 1
            except Exception:
                logger.exception(
                    "Cypher execution failed [%d/%d]", stats["executed"] + 1, total
                )
                stats["errors"] += 1

        logger.info(
            "Batch %d-%d/%d: %d executed, %d errors",
            batch_start, batch_end, total,
            len(batch) - stats["errors"] % max(1, (stats["errors"] or 1)),
            0 if stats["errors"] == 0 else stats["errors"],
        )

    return stats


def generate_index_statements() -> list[str]:
    """Return the list of index/constraint Cypher statements needed."""
    return [
        # B-tree indexes for merge performance
        "CREATE INDEX person_id_idx IF NOT EXISTS FOR (n:PERSON) ON (n.ID);",
        "CREATE INDEX company_orgnum_idx IF NOT EXISTS FOR (n:COMPANY) ON (n.ORGNUM);",
        "CREATE INDEX person_crawl_batch_idx IF NOT EXISTS FOR (n:PERSON) ON (n.crawl_batch);",
        # Existing recommended indexes (idempotent)
        "CREATE INDEX company_nm_idx IF NOT EXISTS FOR (n:COMPANY) ON (n.COMPANY_NM);",
        "CREATE INDEX person_nm_idx IF NOT EXISTS FOR (n:PERSON) ON (n.PERSON_NM);",
    ]
