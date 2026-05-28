"""Dify Workflow API Client — calls Dify extraction workflows via REST API.

Each KG construction stage maps to a dedicated Dify workflow identified by its
API key (each Dify App has its own API key in the Authorization header):
  - subject_extraction    → DIFY_SUBJECT_API_KEY
  - event_extraction      → DIFY_EVENT_API_KEY
  - feature_extraction    → DIFY_FEATURE_API_KEY
  - regulation_linking    → DIFY_REGULATION_API_KEY

All stages fall back to DIFY_API_KEY if a per-stage key is not set.

Each workflow accepts a text string input and returns a JSONL string of extracted
nodes and relationships via the 'output_triples' output.

Typical usage:
    from data_collection.dify import DifyClient
    client = DifyClient()
    results = client.run_workflow_for_stage(text, stage="subject_extraction")
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Defaults ──────────────────────────────────────────────────────────────

DEFAULT_BASE_URL = "https://api.dify.ai"
DEFAULT_TIMEOUT = 120.0
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2.0  # seconds

# Stage → per-stage API key env var mapping.
# Each Dify App/workflow has its own API key; falls back to DIFY_API_KEY.
_STAGE_API_KEY_ENV_MAP: dict[str, str] = {
    "subject_extraction": "DIFY_SUBJECT_API_KEY",
    "event_extraction": "DIFY_EVENT_API_KEY",
    "feature_extraction": "DIFY_FEATURE_API_KEY",
    "regulation_linking": "DIFY_REGULATION_API_KEY",
}


class DifyClient:
    """HTTP client for the Dify Workflow API.

    Can be instantiated with a specific api_key, or use
    run_workflow_for_stage() to auto-select the API key by stage name.
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key = api_key or os.getenv("DIFY_API_KEY", "")
        self.base_url = (base_url or os.getenv("DIFY_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
        self.timeout = timeout

    # ── Stage-aware API ─────────────────────────────────────────────────

    def run_workflow_for_stage(
        self, text: str, stage: str, source_name: str = "pipeline"
    ) -> list[dict[str, Any]]:
        """Run the Dify workflow for a specific KG construction stage.

        Args:
            text: Input text to extract entities from.
            stage: One of subject_extraction, event_extraction,
                   feature_extraction, regulation_linking.
            source_name: Identifier for the source (e.g. filename).

        Returns:
            List of parsed node/relationship dicts.
        """
        env_var = _STAGE_API_KEY_ENV_MAP.get(stage)
        if not env_var:
            logger.warning(f"Unknown stage '{stage}' — no API key mapping.")
            return []

        # Per-stage API key, fall back to default DIFY_API_KEY
        stage_api_key = os.getenv(env_var, "") or self.api_key
        if not stage_api_key:
            logger.warning(f"No API key for stage '{stage}' — set {env_var} or DIFY_API_KEY.")
            return []

        return self._run_workflow(text, stage_api_key, source_name)

    # ── Public API ──────────────────────────────────────────────────────

    def run_workflow_sync(self, text: str, source_name: str = "pipeline") -> list[dict[str, Any]]:
        """Run the regulation extraction workflow (backward-compatible).

        Delegates to _run_workflow with the instance's default api_key.
        """
        return self._run_workflow(text, self.api_key, source_name)

    # ── Internal ───────────────────────────────────────────────────────

    def _run_workflow(
        self, text: str, api_key: str, source_name: str = "pipeline"
    ) -> list[dict[str, Any]]:
        """Run a Dify workflow synchronously with retry logic.

        Args:
            text: The input text to extract entities from.
            api_key: The Dify App API key (identifies which workflow to run).
            source_name: Identifier for the source (e.g. filename), used in logs.

        Returns:
            List of parsed dicts — each a node {"type":"node", ...} or
            relationship {"type":"relationship", ...}.
        """
        if not api_key:
            logger.warning("No Dify API key provided — skipping extraction.")
            return []

        if not text or not text.strip():
            logger.warning(f"Empty text for source '{source_name}' — skipping.")
            return []

        url = f"{self.base_url}/v1/workflows/run"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "inputs": {"text": text[:15000]},  # Truncate to reasonable chunk size
            "response_mode": "blocking",
            "user": f"windeye-{source_name[:30]}",
        }

        last_error: str | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = httpx.post(url, headers=headers, json=payload, timeout=self.timeout)
                if resp.status_code == 200:
                    return self._parse_response(resp.json())
                last_error = f"HTTP {resp.status_code}: {resp.text[:300]}"
                logger.warning(
                    f"Dify API attempt {attempt}/{MAX_RETRIES} for '{source_name}': {last_error}"
                )
            except httpx.TimeoutException:
                last_error = f"Timeout after {self.timeout}s"
                logger.warning(
                    f"Dify API attempt {attempt}/{MAX_RETRIES} for '{source_name}': timeout"
                )
            except Exception as e:
                last_error = str(e)
                logger.warning(
                    f"Dify API attempt {attempt}/{MAX_RETRIES} for '{source_name}': {e}"
                )

            if attempt < MAX_RETRIES:
                delay = RETRY_BACKOFF_BASE ** attempt
                time.sleep(delay)

        logger.error(f"Dify extraction failed for '{source_name}': {last_error}")
        return []

    # ── Response parsing ─────────────────────────────────────────────────

    def _parse_response(self, resp: dict[str, Any]) -> list[dict[str, Any]]:
        """Parse the Dify workflow response into a list of node/relationship dicts.

        The workflow's End node outputs 'output_triples' — a JSONL string where
        each line is a JSON object with type "node" or "relationship".
        """
        data = resp.get("data", {})
        outputs = data.get("outputs", {})
        triples_str = outputs.get("output_triples", outputs.get("final_triples", ""))

        if not triples_str:
            logger.warning("Dify response contained no output_triples.")
            return []

        results: list[dict[str, Any]] = []
        for line in triples_str.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if isinstance(obj, dict) and "type" in obj:
                    results.append(obj)
            except json.JSONDecodeError:
                logger.debug(f"Skipping non-JSON line in Dify output: {line[:100]}")
                continue

        node_count = sum(1 for r in results if r.get("type") == "node")
        edge_count = sum(1 for r in results if r.get("type") == "relationship")
        logger.info(
            f"Dify extraction complete: {node_count} nodes, {edge_count} relationships"
        )
        return results


# ── Convenience functions ───────────────────────────────────────────────

def run_dify_extraction(text: str, source_name: str = "pipeline") -> list[dict[str, Any]]:
    """Run Dify regulation extraction with default client configuration."""
    client = DifyClient()
    return client.run_workflow_sync(text, source_name)


def run_dify_extraction_for_stage(
    text: str, stage: str, source_name: str = "pipeline"
) -> list[dict[str, Any]]:
    """Run Dify extraction for a specific KG construction stage.

    Args:
        text: Input text to extract entities from.
        stage: One of subject_extraction, event_extraction,
               feature_extraction, regulation_linking.
        source_name: Source identifier for logging.

    Returns:
        List of parsed node/relationship dicts (Dify JSONL format).
    """
    client = DifyClient()
    return client.run_workflow_for_stage(text, stage, source_name)
