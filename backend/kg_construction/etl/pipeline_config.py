"""Pipeline configuration — stage definitions and data source configs.

Data source directories: data_collection/scrapers/data/{risk_events,risk_sentiment}/
Files stay in place until a pipeline run successfully writes them to Neo4j.
"""

from __future__ import annotations

import os
from typing import Any

# ── Pipeline stages in execution order ────────────────────────────────

PIPELINE_STAGES = [
    "parse",        # Parse raw files → plain text + metadata
    "extract",      # NER + relation extraction → structured entities
    "link",         # Entity linking to existing KG nodes
    "resolve",      # Deduplication + entity resolution
    "import",       # Generate Cypher + write to Neo4j
    "index",        # Rebuild full-text indexes
]

# ── Data directory (where scrapers save their output) ─────────────────

SCRAPER_DATA_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "data_collection", "scrapers", "data"
)

# ── Data source definitions ───────────────────────────────────────────

DATA_SOURCE_CONFIGS: dict[str, dict[str, Any]] = {
    "uploaded_docs": {
        "name": "上传文件",
        "category": "用户上传",
        "data_subdir": "uploaded_docs",
        "input_glob": "*.*",
        "layer": "Event",
        "entity_types": ["COMPANY", "PERSON", "EVENT", "SECURITY"],
        "relation_types": ["MENTIONED_IN", "INVOLVED_IN", "REPORTS"],
    },
    "risk_event_sse": {
        "name": "上交所风险事件",
        "category": "风险事件",
        "data_subdir": "risk_events/sse",
        "input_glob": "*.pdf",
        "layer": "Event",
        "entity_types": ["COMPANY", "CASE_NUMBER", "INSTITUTION"],
        "relation_types": ["RECEIVES", "INVOLVED_IN"],
    },
    "risk_event_szse": {
        "name": "深交所风险事件",
        "category": "风险事件",
        "data_subdir": "risk_events/szse",
        "input_glob": "*.pdf",
        "layer": "Event",
        "entity_types": ["COMPANY", "CASE_NUMBER"],
        "relation_types": ["RECEIVES", "INVOLVED_IN"],
    },
    "risk_event_bse": {
        "name": "北交所风险事件",
        "category": "风险事件",
        "data_subdir": "risk_events/bse",
        "input_glob": "*.pdf",
        "layer": "Event",
        "entity_types": ["COMPANY", "CASE_NUMBER"],
        "relation_types": ["RECEIVES", "INVOLVED_IN"],
    },
    "risk_sentiment": {
        "name": "财经舆情",
        "category": "风险舆情",
        "data_subdir": "risk_sentiment",
        "input_glob": "*.txt",
        "layer": "Event",
        "entity_types": ["COMPANY", "PERSON", "EVENT"],
        "relation_types": ["MENTIONED_IN", "REPORTS"],
    },
    "regulation_docs": {
        "name": "监管法规文档",
        "category": "法规文件",
        "data_subdir": "regulations",
        "input_glob": "*.pdf",
        "layer": "Regulation",
        "extraction_method": "dify",
        "entity_types": [
            "PartyWithResponsibility", "Action", "Responsibility",
            "Restriction", "RegulatoryAuthority", "Law",
        ],
        "relation_types": [
            "CONTAINS", "HAS_RESPONSIBLE_PARTY", "HAS_REGULATOR",
            "BASED_ON", "FULFILLS", "EXECUTES", "SUBJECT_TO",
            "REGULATES", "IN_ACCORDANCE_WITH",
        ],
    },
}


def get_source_dir(source: str) -> str:
    """Resolve the absolute data directory for a given data source key."""
    cfg = DATA_SOURCE_CONFIGS.get(source, {})
    subdir = cfg.get("data_subdir", source)
    return os.path.join(SCRAPER_DATA_DIR, subdir)


def scan_source_files(source: str) -> list[dict[str, Any]]:
    """Scan a data source directory and return file info list.

    Returns list of {name, path, size, ext} for each file found.
    """
    src_dir = get_source_dir(source)
    cfg = DATA_SOURCE_CONFIGS.get(source, {})
    glob_ext = cfg.get("input_glob", "*.*").lstrip("*").lower()
    if not glob_ext.startswith("."):
        glob_ext = "." + glob_ext

    files = []
    if not os.path.isdir(src_dir):
        return files

    for fname in sorted(os.listdir(src_dir)):
        fpath = os.path.join(src_dir, fname)
        if not os.path.isfile(fpath):
            continue
        if glob_ext != ".*" and not fname.lower().endswith(glob_ext):
            continue
        files.append({
            "name": fname,
            "path": fpath,
            "size": os.path.getsize(fpath),
            "size_display": _format_size(os.path.getsize(fpath)),
        })
    return files


def _format_size(size: int) -> str:
    for unit in ("B", "KB", "MB"):
        if size < 1024:
            return f"{size}{unit}"
        size //= 1024
    return f"{size}GB"


def cleanup_source_files(source: str) -> int:
    """Delete all files in a data source directory. Returns count of deleted files."""
    src_dir = get_source_dir(source)
    if not os.path.isdir(src_dir):
        return 0
    count = 0
    for fname in os.listdir(src_dir):
        fpath = os.path.join(src_dir, fname)
        if os.path.isfile(fpath):
            try:
                os.remove(fpath)
                count += 1
            except OSError:
                pass
    return count


def get_pipeline_config() -> dict[str, Any]:
    """Return the active pipeline configuration."""
    return {
        "data_dir": SCRAPER_DATA_DIR,
        "stages": PIPELINE_STAGES,
        "sources": DATA_SOURCE_CONFIGS,
        "neo4j": {
            "uri": os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            "database": os.getenv("NEO4J_DATABASE", "neo4j"),
        },
        "batch_size": int(os.getenv("ETL_BATCH_SIZE", "100")),
        "max_retries_per_stage": int(os.getenv("ETL_MAX_RETRIES", "3")),
    }
