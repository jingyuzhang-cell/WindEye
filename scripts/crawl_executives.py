#!/usr/bin/env python3
"""Crawl company executives and legal representatives from business
registry APIs and write them into the Neo4j knowledge graph.

Usage::

    # Incremental — only companies missing legal-person data
    python scripts/crawl_executives.py --incremental --limit 50

    # Full re-crawl of all COMPANY nodes (with a cap)
    python scripts/crawl_executives.py --limit 20 --batch-size 5

    # Dry-run: generate Cypher file without touching Neo4j
    python scripts/crawl_executives.py --dry-run --output scripts/output/

    # Retry failed companies from a previous run
    python scripts/crawl_executives.py --retry scripts/failures/batch_xxx.json

    # Ensure Neo4j indexes exist before crawling
    python scripts/crawl_executives.py --ensure-indexes --incremental

    # Use specific channels only
    python scripts/crawl_executives.py --channels demo --limit 10

Channels
--------
============ ======= ====================================================
Name         Type    Notes
============ ======= ====================================================
aiqicha      free    百度爱企查 — HTML scraping, ~1 req / 3 s
gsxt         free    国家企业信用信息公示系统 — stub (needs cookies)
qcc          paid    企查查 Open API — needs QCC_API_KEY
tianyancha   paid    天眼查 API — needs TIANYANCHA_API_KEY
demo         demo    In-memory data for 13 sample companies
============ ======= ====================================================

Environment
-----------
NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE
QCC_API_KEY, TIANYANCHA_API_KEY (optional — for paid channels)
GSXT_COOKIES (optional — JSON cookies string for GSXT channel)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Path setup: allow importing from backend/ ────────────────────────────
_SCRIPT_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _SCRIPT_DIR.parent / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

# Load .env before any project imports
try:
    from dotenv import load_dotenv

    _ENV_PATH = _BACKEND_DIR / ".env"
    if _ENV_PATH.exists():
        load_dotenv(_ENV_PATH)
except ImportError:
    pass  # python-dotenv not installed; env vars must be set manually

from core.database import Neo4jClient
from data_collection.api_sync.base import ChannelManager
from data_collection.api_sync.person_dedup import deduplicate_persons
from data_collection.api_sync.cypher_writer import (
    build_all_statements,
    execute_batch,
    generate_index_statements,
)

# ── Logging ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("crawl_executives")


# ── Helpers ──────────────────────────────────────────────────────────────

def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _build_channel_manager(channel_names: list[str] | None = None) -> ChannelManager:
    """Build a ``ChannelManager`` with the requested (or all available) channels.

    Channel resolution:
    1. If *channel_names* is given, instantiate only those.
    2. Otherwise, instantiate all channels (free + paid that have keys + demo).
    """
    from data_collection.api_sync.free_sources import AiqichaSource, GsxtSource
    from data_collection.api_sync.paid_sources import (
        DemoSource,
        QccSource,
        TianyanchaSource,
    )

    # Map of all available channels
    all_channels: dict[str, Any] = {
        "aiqicha": AiqichaSource,
        "gsxt": GsxtSource,
        "qcc": QccSource,
        "tianyancha": TianyanchaSource,
        "demo": DemoSource,
    }

    manager = ChannelManager()

    if channel_names:
        selected = [n.strip().lower() for n in channel_names]
        for name in selected:
            if name in all_channels:
                manager.add(all_channels[name]())
                logger.info("Channel '%s' activated", name)
            else:
                logger.warning("Unknown channel '%s' — skipped. Available: %s",
                               name, sorted(all_channels))
    else:
        # Default: all channels (paid ones auto-skip when no key)
        for name, cls in all_channels.items():
            manager.add(cls())

    return manager


def _read_companies(
    client: Neo4jClient,
    incremental: bool = True,
    limit: int = 0,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Read COMPANY nodes from Neo4j.

    When *incremental* is True, only returns companies that have no
    incoming ``LEGAL_PERSON`` relationship.
    """
    if incremental:
        query = """
            MATCH (c:COMPANY)
            WHERE NOT (()-[:LEGAL_PERSON]->(c))
            RETURN c.COMPANY_NM AS name, c.ORGNUM AS credit_code
            ORDER BY c.COMPANY_NM
        """
    else:
        query = """
            MATCH (c:COMPANY)
            RETURN c.COMPANY_NM AS name, c.ORGNUM AS credit_code
            ORDER BY c.COMPANY_NM
        """

    if offset > 0:
        query += f"\nSKIP {offset}"
    if limit > 0:
        query += f"\nLIMIT {limit}"

    logger.info("Querying Neo4j: incremental=%s, limit=%d, offset=%d",
                incremental, limit, offset)
    records = client.execute_read(query, timeout_seconds=30.0)
    companies = [
        {"company_name": r.get("name", ""), "credit_code": r.get("credit_code")}
        for r in records
        if r.get("name")
    ]
    logger.info("Found %d companies to process", len(companies))
    return companies


def _run_verification_queries(client: Neo4jClient, batch_id: str = "") -> dict:
    """Run a set of verification queries and return stats."""
    queries: dict[str, str] = {
        "legal_person_count":
            "MATCH ()-[r:LEGAL_PERSON]->() RETURN count(r) AS cnt",
        "executive_count":
            "MATCH ()-[r:EXECUTIVE]->() RETURN count(r) AS cnt",
        "persons_this_batch":
            f"MATCH (p:PERSON) WHERE p.crawl_batch = '{batch_id}' RETURN count(p) AS cnt",
        "companies_without_legal":
            "MATCH (c:COMPANY:Subject) WHERE NOT (()-[:LEGAL_PERSON]->(c)) "
            "RETURN c.name AS name, c.ORGNUM AS code ORDER BY c.name LIMIT 20",
        "multi_company_persons":
            "MATCH (p:PERSON)-[:LEGAL_PERSON|EXECUTIVE]->(c:COMPANY) "
            "WITH p, collect(DISTINCT c.name) AS companies, count(DISTINCT c) AS cnt "
            "WHERE cnt > 1 RETURN p.name AS name, companies, cnt ORDER BY cnt DESC LIMIT 20",
        "persons_without_id":
            f"MATCH (p:PERSON) WHERE p.crawl_batch = '{batch_id}' AND (p.ID IS NULL OR p.ID = '') "
            "RETURN count(p) AS cnt",
        "source_distribution":
            "MATCH ()-[r:LEGAL_PERSON|EXECUTIVE]->() "
            "RETURN r.source AS source, type(r) AS rel_type, count(r) AS cnt "
            "ORDER BY cnt DESC",
    }

    results: dict[str, Any] = {}
    for name, query in queries.items():
        try:
            records = client.execute_read(query, timeout_seconds=15.0)
            results[name] = [r for r in records]
        except Exception:
            logger.exception("Verification query '%s' failed", name)
            results[name] = []
    return results


def _print_report(stats: dict, verification: dict, duration: float) -> None:
    """Print a human-readable summary to stdout."""
    print("\n" + "=" * 62)
    print("  CRAWL REPORT")
    print("=" * 62)
    print(f"  Duration:              {duration:.1f}s")
    print(f"  Companies processed:   {stats.get('companies_processed', 0)}")
    print(f"  Companies succeeded:   {stats.get('companies_succeeded', 0)}")
    print(f"  Companies failed:      {stats.get('companies_failed', 0)}")
    print(f"  Legal reps found:      {stats.get('legal_reps_found', 0)}")
    print(f"  Executives found:      {stats.get('executives_found', 0)}")
    print(f"  Unique persons:        {stats.get('unique_persons', 0)}")
    print(f"  Cypher executed:       {stats.get('cypher_executed', 0)}")
    print(f"  Cypher errors:         {stats.get('cypher_errors', 0)}")
    print(f"  Batch ID:              {stats.get('batch_id', 'N/A')}")
    print("-" * 62)

    # Verification highlights
    for v_name, v_data in verification.items():
        if not v_data:
            continue
        if v_name == "legal_person_count":
            print(f"  Total LEGAL_PERSON:    {v_data[0].get('cnt', '?')}")
        elif v_name == "executive_count":
            print(f"  Total EXECUTIVE:       {v_data[0].get('cnt', '?')}")
        elif v_name == "persons_without_id":
            print(f"  Persons without ID:    {v_data[0].get('cnt', '?')}")
        elif v_name == "multi_company_persons":
            if v_data:
                print(f"  Multi-company persons: {len(v_data)} (showing ≤20)")

    print("=" * 62 + "\n")


# ── Main ─────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Crawl company executives and legal reps → Neo4j",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--incremental", action="store_true",
        help="Only process companies without LEGAL_PERSON data",
    )
    parser.add_argument(
        "--limit", type=int, default=0,
        help="Max companies to process (0 = unlimited)",
    )
    parser.add_argument(
        "--offset", type=int, default=0,
        help="Skip first N companies",
    )
    parser.add_argument(
        "--batch-size", type=int, default=50,
        help="Cypher statements per Neo4j transaction batch (default: 50)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Generate Cypher file only — do not write to Neo4j",
    )
    parser.add_argument(
        "--output", type=str, default="scripts/output/",
        help="Output directory for dry-run Cypher files",
    )
    parser.add_argument(
        "--retry", type=str, default="",
        help="Path to a failure JSON file from a previous run",
    )
    parser.add_argument(
        "--ensure-indexes", action="store_true",
        help="Create recommended Neo4j indexes before crawling",
    )
    parser.add_argument(
        "--channels", type=str, default="",
        help="Comma-separated channel names (default: all available)",
    )
    parser.add_argument(
        "--no-verify", action="store_true",
        help="Skip post-crawl verification queries",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Enable DEBUG-level logging",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    t0 = time.monotonic()
    batch_id = f"exec_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
    stats: dict[str, Any] = {
        "batch_id": batch_id,
        "companies_processed": 0,
        "companies_succeeded": 0,
        "companies_failed": 0,
        "legal_reps_found": 0,
        "executives_found": 0,
        "unique_persons": 0,
        "cypher_executed": 0,
        "cypher_errors": 0,
    }
    failures: list[dict] = []

    # ── 1. Connect ───────────────────────────────────────────────────
    logger.info("Connecting to Neo4j...")
    try:
        client = Neo4jClient.from_env()
        client.verify_connectivity()
        logger.info("Neo4j: OK (%s)", os.getenv("NEO4J_URI", "bolt://localhost:7687"))
    except Exception as e:
        logger.error("Neo4j connection failed: %s", e)
        sys.exit(1)

    # ── 2. Indexes ───────────────────────────────────────────────────
    if args.ensure_indexes:
        logger.info("Creating recommended indexes...")
        index_stmts = generate_index_statements()
        for stmt in index_stmts:
            try:
                client.execute_read(stmt, timeout_seconds=10.0)
                logger.info("  Index: %s", stmt.split("FOR")[1].split("ON")[0].strip() if "FOR" in stmt else stmt[:60])
            except Exception as exc:
                logger.warning("  Index skipped (may already exist): %s", exc)

    # ── 3. Channels ──────────────────────────────────────────────────
    channel_names = (
        [n.strip() for n in args.channels.split(",") if n.strip()]
        if args.channels else None
    )
    manager = _build_channel_manager(channel_names)
    logger.info("Active channels (%d): %s",
                manager.active_count,
                [c.source_name for c in manager.channels])

    # ── 4. Read companies ────────────────────────────────────────────
    if args.retry:
        logger.info("Retry mode: loading failures from %s", args.retry)
        with open(args.retry, "r", encoding="utf-8") as f:
            retry_data = json.load(f)
        companies = retry_data.get("failed_companies", [])
        logger.info("Loaded %d companies for retry", len(companies))
    else:
        companies = _read_companies(
            client,
            incremental=not args.incremental if args.incremental else args.incremental,
            limit=args.limit,
            offset=args.offset,
        )
        # Default to incremental if not explicitly told otherwise
        if not args.incremental and not args.limit and not args.offset:
            companies = _read_companies(client, incremental=True, limit=args.limit, offset=args.offset)

    if not companies:
        logger.info("No companies to process. Exiting.")
        client.close()
        return

    stats["companies_processed"] = len(companies)

    # ── 5. Crawl ─────────────────────────────────────────────────────
    all_legal_reps: list[dict[str, Any]] = []
    all_executives: list[dict[str, Any]] = []

    for i, comp in enumerate(companies, 1):
        cname = comp.get("company_name", "")
        ccode = comp.get("credit_code")
        logger.info("[%d/%d] %s", i, len(companies), cname)

        try:
            result = manager.fetch_all(cname, ccode)
        except Exception:
            logger.exception("Unexpected error crawling '%s'", cname)
            failures.append({
                "company_name": cname,
                "credit_code": ccode,
                "error": "channel_manager_exception",
            })
            continue

        if result.success:
            stats["companies_succeeded"] += 1
        else:
            stats["companies_failed"] += 1
            failures.append({
                "company_name": cname,
                "credit_code": ccode,
                "error": result.error or "no_data",
            })

        # Collect legal rep
        if result.legal_rep and result.legal_rep.is_valid():
            all_legal_reps.append({
                **result.legal_rep.to_dict(),
                "source": result.source_name,
                "company_name": cname,
                "credit_code": ccode,
            })
            stats["legal_reps_found"] += 1

        # Collect executives
        for ex in result.executives:
            if ex.is_valid():
                all_executives.append({
                    **ex.to_dict(),
                    "source": result.source_name,
                    "company_name": cname,
                    "credit_code": ccode,
                })
        stats["executives_found"] += len(result.executives)

    # ── 6. Dedup ─────────────────────────────────────────────────────
    logger.info("Deduplicating persons...")
    unique_persons = deduplicate_persons(all_legal_reps, all_executives)
    stats["unique_persons"] = len(unique_persons)

    # ── 7. Write Cypher ──────────────────────────────────────────────
    logger.info("Building Cypher statements...")
    statements = build_all_statements(unique_persons, batch_id=batch_id)
    logger.info("Generated %d Cypher statements", len(statements))

    dry_run = args.dry_run
    output_file = None
    if dry_run:
        _ensure_dir(args.output)
        output_file = os.path.join(args.output, f"{batch_id}.cypher")

    write_stats = execute_batch(
        client,
        statements,
        batch_size=args.batch_size,
        dry_run=dry_run,
        output_file=output_file,
    )
    stats["cypher_executed"] = write_stats["executed"]
    stats["cypher_errors"] = write_stats["errors"]

    # ── 8. Save failures ─────────────────────────────────────────────
    if failures:
        fail_dir = os.path.join(_SCRIPT_DIR, "failures")
        _ensure_dir(fail_dir)
        fail_path = os.path.join(fail_dir, f"{batch_id}.json")
        fail_payload = {
            "batch_id": batch_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "failed_companies": failures,
        }
        with open(fail_path, "w", encoding="utf-8") as f:
            json.dump(fail_payload, f, ensure_ascii=False, indent=2)
        logger.info("Failures written to %s (%d companies)", fail_path, len(failures))

    # ── 9. Verify ────────────────────────────────────────────────────
    verification: dict = {}
    if not args.no_verify and not dry_run:
        logger.info("Running verification queries...")
        verification = _run_verification_queries(client, batch_id)

    # ── 10. Report ───────────────────────────────────────────────────
    duration = time.monotonic() - t0
    _print_report(stats, verification, duration)

    # Detailed verification output
    if verification:
        print("VERIFICATION DETAILS")
        print("-" * 62)
        for name, data in verification.items():
            if name == "companies_without_legal" and data:
                print(f"\n[{name}] Companies still missing legal rep:")
                for row in data[:10]:
                    print(f"  - {row.get('name', '?')}")
            elif name == "multi_company_persons" and data:
                print(f"\n[{name}] Persons across multiple companies:")
                for row in data[:10]:
                    print(f"  - {row.get('name', '?')}: {row.get('companies', [])}")
            elif name == "source_distribution" and data:
                print(f"\n[{name}]")
                for row in data:
                    print(f"  - {row.get('source', '?')} / {row.get('rel_type', '?')}: {row.get('cnt', 0)}")
            elif name in ("legal_person_count", "executive_count",
                          "persons_this_batch", "persons_without_id"):
                if data:
                    val = data[0].get("cnt", data[0]) if data else "?"
                    print(f"  {name}: {val}")
        print("-" * 62)

    # ── Cleanup ───────────────────────────────────────────────────────
    client.close()
    logger.info("Done. Batch ID: %s", batch_id)


if __name__ == "__main__":
    main()
