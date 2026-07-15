"""Shared settings for offline report pipelines."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

CODE_DIR = Path(__file__).resolve().parent
NEW_REPORT_DIR = CODE_DIR.parent
BACKEND_DIR = NEW_REPORT_DIR.parent

load_dotenv(BACKEND_DIR / ".env")
load_dotenv()

REPORT_OUTPUT_ROOT = (BACKEND_DIR / "report_outputs").resolve()
GRAPH_DATA_FILE = (CODE_DIR / "data" / "merged_regulatory_unified.txt").resolve()
POLICY_DOC_DIR = (CODE_DIR / "policy_docs").resolve()

CLUSTERING_OUTPUT_DIR = REPORT_OUTPUT_ROOT / "gnn_leiden_results"
COMMUNITY_REPORTS_DIR = REPORT_OUTPUT_ROOT / "community_reports"
HIERARCHY_OUTPUT_DIR = REPORT_OUTPUT_ROOT / "build_hierarchy_links_output"

DEEPSEEK_API_BASE = os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com/v1").rstrip("/")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY") or os.getenv("LLM_API_KEY", "")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL") or os.getenv("LLM_MODEL", "deepseek-chat")


def ensure_output_dirs() -> None:
    """Create standard output directories if they do not exist yet."""

    REPORT_OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    CLUSTERING_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    COMMUNITY_REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    HIERARCHY_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
