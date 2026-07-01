#!/usr/bin/env python3
"""Verify the integrity of executive / legal-person data in Neo4j.

Run independently from the crawler to check the current state of the
knowledge graph.  Useful after a crawl, after a data import, or
as a periodic health check.

Usage::

    python scripts/verify_executives.py              # Run all checks
    python scripts/verify_executives.py --batch exec_20260624_120000
    python scripts/verify_executives.py --report      # Generate markdown report
    python scripts/verify_executives.py --check V1 V3 V5  # Specific checks only
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any  # noqa: F401  # used in OrderedDict value type

# ── Path setup ───────────────────────────────────────────────────────────
_SCRIPT_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _SCRIPT_DIR.parent / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

try:
    from dotenv import load_dotenv
    _ENV_PATH = _BACKEND_DIR / ".env"
    if _ENV_PATH.exists():
        load_dotenv(_ENV_PATH)
except ImportError:
    pass

from core.database import Neo4jClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("verify_executives")


# ── Verification checks ──────────────────────────────────────────────────

def _define_checks(batch_id: str = "") -> OrderedDict:
    """Return an ordered dict of {check_id: {title, query, params}}."""
    checks: OrderedDict = OrderedDict()

    # V1 — Total legal person relationships
    checks["V1"] = {
        "title": "Total LEGAL_PERSON relationships",
        "query": "MATCH ()-[r:LEGAL_PERSON]->() RETURN count(r) AS cnt",
        "params": {},
    }

    # V2 — Total executive relationships
    checks["V2"] = {
        "title": "Total EXECUTIVE relationships",
        "query": "MATCH ()-[r:EXECUTIVE]->() RETURN count(r) AS cnt",
        "params": {},
    }

    # V3 — New PERSON nodes in a specific batch
    if batch_id:
        checks["V3"] = {
            "title": f"PERSON nodes in batch '{batch_id}'",
            "query": (
                "MATCH (p:PERSON) WHERE p.crawl_batch = $batch_id "
                "RETURN count(p) AS cnt"
            ),
            "params": {"batch_id": batch_id},
        }
    else:
        checks["V3"] = {
            "title": "Total PERSON nodes",
            "query": "MATCH (p:PERSON) RETURN count(p) AS cnt",
            "params": {},
        }

    # V4 — Companies still missing legal representative
    checks["V4"] = {
        "title": "Companies WITHOUT legal representative",
        "query": (
            "MATCH (c:COMPANY) "
            "WHERE NOT (()-[:LEGAL_PERSON]->(c)) "
            "RETURN c.COMPANY_NM AS name, c.ORGNUM AS code, c.STATUS AS status "
            "ORDER BY c.COMPANY_NM LIMIT 50"
        ),
        "params": {},
    }

    # V5 — Persons associated with multiple companies
    checks["V5"] = {
        "title": "Persons across multiple companies (one-person-multi-firm)",
        "query": (
            "MATCH (p:PERSON)-[:LEGAL_PERSON|EXECUTIVE]->(c:COMPANY) "
            "WITH p, collect(DISTINCT c.COMPANY_NM) AS companies, count(DISTINCT c) AS cnt "
            "WHERE cnt > 1 "
            "RETURN coalesce(p.name, p.PERSON_NM) AS person, companies, cnt "
            "ORDER BY cnt DESC LIMIT 30"
        ),
        "params": {},
    }

    # V6 — Persons missing ID card
    checks["V6"] = {
        "title": "Persons without ID card (data quality)",
        "query": (
            "MATCH (p:PERSON) "
            "WHERE p.ID IS NULL OR p.ID = '' "
            "RETURN count(p) AS total, "
            "collect(coalesce(p.name, p.PERSON_NM))[0..20] AS sample_names"
        ),
        "params": {},
    }

    # V7 — Potential duplicate persons (same name, different ID)
    checks["V7"] = {
        "title": "Potential homonym collisions (same name, different ID)",
        "query": (
            "MATCH (p1:PERSON), (p2:PERSON) "
            "WHERE coalesce(p1.name, p1.PERSON_NM) = coalesce(p2.name, p2.PERSON_NM) "
            "  AND p1.ID IS NOT NULL AND p2.ID IS NOT NULL "
            "  AND p1.ID <> p2.ID "
            "  AND id(p1) < id(p2) "
            "RETURN coalesce(p1.name, p1.PERSON_NM) AS name, p1.ID AS id1, p2.ID AS id2 "
            "LIMIT 20"
        ),
        "params": {},
    }

    # V8 — Relationship coverage per company
    checks["V8"] = {
        "title": "Company relationship coverage",
        "query": (
            "MATCH (c:COMPANY) "
            "OPTIONAL MATCH (lp)-[:LEGAL_PERSON]->(c) "
            "OPTIONAL MATCH (ex)-[:EXECUTIVE]->(c) "
            "RETURN c.COMPANY_NM AS company, "
            "CASE WHEN lp IS NOT NULL THEN 'YES' ELSE 'NO' END AS has_legal_rep, "
            "count(DISTINCT ex) AS executive_count "
            "ORDER BY has_legal_rep DESC, executive_count DESC LIMIT 30"
        ),
        "params": {},
    }

    # V9 — Source distribution of relationships
    checks["V9"] = {
        "title": "Data source distribution",
        "query": (
            "MATCH ()-[r:LEGAL_PERSON|EXECUTIVE]->() "
            "RETURN r.source AS source, type(r) AS rel_type, count(r) AS cnt "
            "ORDER BY cnt DESC"
        ),
        "params": {},
    }

    # V10 — Persons without any relationships (orphans)
    checks["V10"] = {
        "title": "Orphan PERSON nodes (no relationships)",
        "query": (
            "MATCH (p:PERSON) "
            "WHERE NOT (p)--() "
            "RETURN coalesce(p.name, p.PERSON_NM) AS name, "
            "p.POSITION AS position, p.source AS source "
            "LIMIT 20"
        ),
        "params": {},
    }

    return checks


# ── Output formatters ────────────────────────────────────────────────────

def _print_check_result(
    check_id: str, title: str, records: list[dict], status: str
) -> None:
    """Print a single check result to stdout."""
    decorator = "[OK]" if status == "ok" else "[ERR]" if status == "error" else "[--]"
    print(f"\n{'─' * 62}")
    print(f"  {decorator} {check_id}: {title}")
    print(f"{'─' * 62}")

    if status == "error":
        print(f"  ERROR: {records[0] if records else 'unknown'}")
        return

    if not records:
        print("  (no results)")
        return

    count = len(records)

    # Single-row aggregate results
    if count == 1 and isinstance(records[0], dict):
        row = records[0]
        for key, value in row.items():
            if isinstance(value, list):
                print(f"  {key}: [{len(value)} items]")
                if value and len(value) <= 10:
                    for item in value:
                        print(f"    - {item}")
            else:
                print(f"  {key}: {value}")
        return

    # Multi-row results
    if count <= 20:
        for i, row in enumerate(records, 1):
            items = [f"{k}={v}" for k, v in row.items()]
            print(f"  {i}. {', '.join(items)}")
    else:
        for i, row in enumerate(records[:10], 1):
            items = [f"{k}={v}" for k, v in row.items()]
            print(f"  {i}. {', '.join(items)}")
        print(f"  ... and {count - 10} more rows")


def _generate_markdown_report(
    results: OrderedDict, batch_id: str
) -> str:
    """Generate a markdown-format verification report."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines = [
        f"# Executive Data Verification Report",
        f"",
        f"**Generated:** {now}  ",
        f"**Batch ID:** {batch_id or 'N/A'}  ",
        f"",
        "---",
        "",
        "## Summary",
        "",
    ]

    for check_id, (title, records, status) in results.items():
        if status == "error":
            lines.append(f"- **{check_id}** {title}: ❌ ERROR")
        elif not records:
            lines.append(f"- **{check_id}** {title}: ✅ (no results)")
        else:
            lines.append(f"- **{check_id}** {title}: {len(records)} rows")

    lines.append("")
    lines.append("---")
    lines.append("")

    for check_id, (title, records, status) in results.items():
        lines.append(f"## {check_id}: {title}")
        lines.append("")

        if status == "error":
            lines.append(f"**ERROR:** {records[0] if records else 'unknown'}")
            lines.append("")
            continue

        if not records:
            lines.append("*(no results)*")
            lines.append("")
            continue

        # Single aggregate row
        if len(records) == 1 and isinstance(records[0], dict):
            lines.append("| Key | Value |")
            lines.append("|-----|-------|")
            for k, v in records[0].items():
                if isinstance(v, list):
                    v = f"[{len(v)} items]"
                lines.append(f"| {k} | {v} |")
            lines.append("")
            continue

        # Table for multi-row
        if records:
            headers = list(records[0].keys())
            lines.append("| " + " | ".join(headers) + " |")
            lines.append("|" + "|".join(["---"] * len(headers)) + "|")
            for row in records[:30]:
                vals = [str(row.get(h, "")) for h in headers]
                lines.append("| " + " | ".join(vals) + " |")
            if len(records) > 30:
                lines.append(f"*(... and {len(records) - 30} more rows)*")
            lines.append("")

    return "\n".join(lines)


# ── Main ─────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verify executive/legal-person data integrity in Neo4j",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--batch", type=str, default="",
        help="Filter checks by crawl batch ID",
    )
    parser.add_argument(
        "--check", type=str, nargs="*", default=[],
        help="Specific check IDs to run (e.g. V1 V3 V5). Default: all.",
    )
    parser.add_argument(
        "--report", action="store_true",
        help="Generate a markdown report file in scripts/output/",
    )
    parser.add_argument(
        "--output-dir", type=str, default="scripts/output/",
        help="Output directory for the report (default: scripts/output/)",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Enable DEBUG logging",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # ── Connect ───────────────────────────────────────────────────────
    logger.info("Connecting to Neo4j...")
    try:
        client = Neo4jClient.from_env()
        client.verify_connectivity()
        logger.info("Neo4j: OK")
    except Exception as e:
        logger.error("Neo4j connection failed: %s", e)
        sys.exit(1)

    # ── Run checks ────────────────────────────────────────────────────
    all_checks = _define_checks(args.batch)
    selected_ids = args.check if args.check else list(all_checks.keys())

    results: OrderedDict = OrderedDict()
    ok_count = 0
    warn_count = 0
    error_count = 0

    for check_id in selected_ids:
        if check_id not in all_checks:
            logger.warning("Unknown check '%s' — skipped", check_id)
            continue

        check = all_checks[check_id]
        title = check["title"]
        query = check["query"]
        params = check["params"]

        try:
            records = client.execute_read(query, parameters=params, timeout_seconds=20.0)
            status = "ok"
            ok_count += 1
        except Exception as exc:
            records = [{"error": str(exc)}]
            status = "error"
            error_count += 1

        # Warnings for specific checks
        if status == "ok" and check_id == "V4" and records:
            if len(records) > 10:
                logger.warning(
                    "V4: %d companies still without legal representative", len(records)
                )
                warn_count += 1

        results[check_id] = (title, records, status)
        _print_check_result(check_id, title, records, status)

    # ── Summary ───────────────────────────────────────────────────────
    print(f"\n{'=' * 62}")
    print(f"  VERIFICATION SUMMARY")
    print(f"{'=' * 62}")
    print(f"  Total checks:  {len(selected_ids)}")
    print(f"  Passed:        {ok_count}")
    print(f"  Warnings:      {warn_count}")
    print(f"  Errors:        {error_count}")
    print(f"{'=' * 62}\n")

    # ── Report ────────────────────────────────────────────────────────
    if args.report:
        report_content = _generate_markdown_report(results, args.batch)
        report_dir = os.path.join(_SCRIPT_DIR, "..", args.output_dir)
        os.makedirs(report_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_path = os.path.join(
            report_dir, f"verify_executives_{timestamp}.md"
        )
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report_content)
        logger.info("Report written to %s", report_path)

    client.close()


if __name__ == "__main__":
    main()
