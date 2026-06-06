"""Pipeline Management API — trigger and monitor ETL pipeline runs.

Endpoints:
    GET  /api/v1/pipeline/status          — current pipeline status
    POST /api/v1/pipeline/run             — trigger a pipeline run
    GET  /api/v1/pipeline/runs            — history of pipeline runs
    GET  /api/v1/pipeline/sources         — list available data sources
    GET  /api/v1/pipeline/crawl/templates — list crawl templates
    POST /api/v1/pipeline/crawl/run       — trigger crawl (SSE)
    POST /api/v1/pipeline/crawl/parse-nl  — parse NL query for crawl
    GET  /api/v1/pipeline/crawl/sources   — list crawl source capabilities
    GET  /api/v1/pipeline/crawl/tasks     — crawl task history

Env vars:
    CRAWL_DEMO_MODE=true   demo mode (default) — no Selenium/WebDriver needed
    CRAWL_DEMO_MODE=false  real scraping with Chrome/Edge WebDriver
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from api.crawl_schemas import CrawlTaskRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/pipeline", tags=["pipeline"])

# ── In-memory state (replace with DB in production) ───────────────────

_pipeline_runs: list[dict[str, Any]] = []
_current_run: dict[str, Any] | None = None
_run_lock = threading.Lock()

# Crawl task storage
_crawl_tasks: list[dict[str, Any]] = []


def _serialize_run(run: dict[str, Any], include_data: bool = False) -> dict[str, Any]:
    """Convert a pipeline run dict to a JSON-safe response.

    When include_data=True, retains _records and _entities for frontend rendering.
    """
    safe = dict(run)
    if not include_data:
        safe.pop("_records", None)
        safe.pop("_entities", None)
    if "stats" in safe and isinstance(safe["stats"], dict):
        if include_data:
            safe["stats"] = dict(safe["stats"])
        else:
            safe["stats"] = {k: v for k, v in safe["stats"].items() if not k.startswith("_")}
    return safe


# ── Endpoints ─────────────────────────────────────────────────────────

@router.get("/status")
async def get_pipeline_status():
    """Get the current pipeline run status."""
    if _current_run is None:
        return {"status": "idle", "message": "No pipeline run in progress."}
    return {
        "status": "running",
        "current_run": _serialize_run(_current_run),
    }


@router.get("/sources")
async def list_sources():
    """List all available data sources and their configurations."""
    try:
        from kg_construction.etl.pipeline_config import DATA_SOURCE_CONFIGS
    except ImportError as e:
        return {"sources": [], "error": f"Pipeline config not available: {e}"}

    sources = []
    for key, cfg in DATA_SOURCE_CONFIGS.items():
        sources.append({
            "key": key,
            "name": cfg.get("name", key),
            "category": cfg.get("category", ""),
            "layer": cfg.get("layer", ""),
            "entity_types": cfg.get("entity_types", []),
            "relation_types": cfg.get("relation_types", []),
        })
    return {"sources": sources, "count": len(sources)}


@router.get("/runs")
async def list_runs(
    limit: int = Query(default=20, ge=1, le=100),
    include_data: bool = Query(default=False, description="Include entity/record data in response"),
):
    """Get the history of pipeline runs (most recent first)."""
    runs = [_serialize_run(r, include_data=include_data) for r in _pipeline_runs[:limit]]
    return {"runs": runs, "total": len(_pipeline_runs)}


@router.get("/entities/{source}")
async def get_pipeline_entities(source: str):
    """Get extracted entities from the latest completed pipeline run for a source.

    Returns entities grouped by stage: parse records, extract entities, import summary.
    """
    matching = [r for r in _pipeline_runs if r.get("source") == source]
    if not matching:
        raise HTTPException(status_code=404, detail=f"No runs found for source '{source}'")

    latest = matching[0]
    if latest.get("error"):
        raise HTTPException(status_code=500, detail=f"Pipeline run failed: {latest['error']}")

    stages = latest.get("stages", [])
    result: dict[str, Any] = {
        "source": source,
        "completed_at": latest.get("completed_at"),
        "stages": {},
    }

    for stage_run in stages:
        stage_name = stage_run.get("stage", "")
        stats = stage_run.get("stats", {})
        stage_data: dict[str, Any] = {
            "status": stage_run.get("status"),
            "records_processed": stage_run.get("records_processed", 0),
            "stats": stats,
        }

        # Include entity data if present
        entities = stats.get("_entities", [])
        if entities:
            stage_data["entities"] = entities
        records = stats.get("_records", [])
        if records:
            stage_data["records"] = records

        result["stages"][stage_name] = stage_data

    return {"success": True, "data": result}


@router.post("/run")
async def trigger_pipeline_run(
    source: str = Query(..., description="Data source key (e.g. 'sse_risk')"),
    start_stage: str | None = Query(default=None, description="Stage to start from"),
    end_stage: str | None = Query(default=None, description="Stage to end at"),
    background_tasks: BackgroundTasks = None,
):
    """Trigger a pipeline run for the specified data source.

    Stages: crawl → parse → extract → link → resolve → import → index
    """
    global _current_run

    try:
        from kg_construction.etl.pipeline_config import get_pipeline_config, DATA_SOURCE_CONFIGS
        from kg_construction.etl.pipeline_runner import PipelineRunner, PipelineRun
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Pipeline module not available: {e}")

    if source not in DATA_SOURCE_CONFIGS:
        available = list(DATA_SOURCE_CONFIGS.keys())
        raise HTTPException(status_code=404, detail=f"Unknown source '{source}'. Available: {available}")

    config = get_pipeline_config()
    runner = PipelineRunner(config)
    source_config = DATA_SOURCE_CONFIGS.get(source, {})
    extraction_method = source_config.get("extraction_method", "ner")

    # Register stage handlers — use Dify variants for extraction_method="dify"
    runner.register_handler("parse", runner.make_parse_handler())
    if extraction_method == "dify":
        runner.register_handler("extract", runner.make_dify_extract_handler())
        runner.register_handler("import", runner.make_dify_import_handler())
    else:
        runner.register_handler("extract", runner.make_extract_handler())
        runner.register_handler("import", runner.make_import_handler())
    runner.register_handler("index", runner.make_index_handler())

    # For 'crawl', only if explicitly requested (it's slow and external)
    runner.register_handler("crawl", runner.make_crawl_handler())

    # Register pass-through handlers for link and resolve
    def link_handler(source: str, run: PipelineRun) -> PipelineRun:
        entities = run.stats.pop("_entities", [])
        try:
            from kg_construction.extraction.kg_linker import link_entities
            mentions = [e.get("mention", e.get("name", "")) for e in entities]
            linked = link_entities(mentions)
            run.records_processed = len(linked)
            run.stats["linked_count"] = sum(1 for l in linked if l.get("kgNodeId"))
            run.stats["_entities"] = linked
        except Exception:
            run.stats["_entities"] = entities
        return run

    def resolve_handler(source: str, run: PipelineRun) -> PipelineRun:
        entities = run.stats.pop("_entities", [])
        try:
            from kg_construction.fusion.entity_resolver import EntityResolver
            resolver = EntityResolver()
            resolved = resolver.resolve(entities)
            run.records_processed = len(resolved)
            run.stats["_entities"] = resolved
        except Exception:
            run.stats["_entities"] = entities
        return run

    runner.register_handler("link", link_handler)
    runner.register_handler("resolve", resolve_handler)

    # Mark as running
    with _run_lock:
        _current_run = {
            "source": source,
            "start_stage": start_stage,
            "end_stage": end_stage,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "status": "running",
        }

    async def _run_pipeline():
        global _current_run
        try:
            runs = runner.run(source, start_stage=start_stage, end_stage=end_stage)
            serialized = [_serialize_run(r.__dict__, include_data=True) for r in runs]
            _pipeline_runs.insert(0, {"source": source, "stages": serialized, "completed_at": datetime.now(timezone.utc).isoformat()})
        except Exception as e:
            logger.exception(f"Pipeline run failed for {source}")
            _pipeline_runs.insert(0, {"source": source, "error": str(e), "completed_at": datetime.now(timezone.utc).isoformat()})
        finally:
            with _run_lock:
                _current_run = None

    if background_tasks:
        background_tasks.add_task(_run_pipeline)
    else:
        await _run_pipeline()

    return {
        "message": f"Pipeline run triggered for source '{source}'",
        "source": source,
        "start_stage": start_stage or "crawl",
        "end_stage": end_stage or "index",
    }


# ── Crawl Endpoints ─────────────────────────────────────────────────────


@router.get("/crawl/templates")
async def list_crawl_templates():
    """List available crawl templates for one-click crawling."""
    try:
        from data_collection.orchestrator import CrawlOrchestrator

        templates = CrawlOrchestrator.get_templates()
        return {"templates": templates, "total": len(templates)}
    except ImportError as e:
        return {"templates": [], "error": str(e)}


@router.post("/crawl/run")
async def trigger_crawl(payload: CrawlTaskRequest, request: Request):
    """Trigger a crawl task with SSE streaming progress.

    Request body: CrawlTaskRequest JSON
    Response: SSE stream with events: start, stage, source_result, complete, error

    Three modes:
    - quick: Dropdown params only, no LLM cost
    - complex: Natural language query, LLM parses intent
    - template: Preset template, one-click crawl

    Detects client disconnect and cancels the in-flight orchestrator to prevent
    orphan ChromeDriver processes.
    """
    try:
        from data_collection.orchestrator import CrawlOrchestrator
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Crawl module not available: {e}")

    demo_mode = os.getenv("CRAWL_DEMO_MODE", "true").lower() == "true"
    mode_label = "DEMO (mock)" if demo_mode else "REAL (WebDriver)"
    logger.info("Crawl endpoint: CRAWL_DEMO_MODE=%s → %s mode", os.getenv("CRAWL_DEMO_MODE", "true"), mode_label)

    async def event_generator():
        orchestrator = CrawlOrchestrator(demo_mode=demo_mode)
        execute_task: asyncio.Task | None = None
        event_queue: asyncio.Queue = asyncio.Queue()

        async def _run_orchestrator():
            """Run orchestrator in a task so we can cancel on disconnect."""
            try:
                async for event in orchestrator.execute(payload):
                    await event_queue.put(("event", event))
                await event_queue.put(("done", None))
            except Exception as exc:
                logger.exception("Crawl orchestrator failed")
                await event_queue.put(("error", str(exc)))

        execute_task = asyncio.create_task(_run_orchestrator())
        last_event = None

        try:
            while True:
                # Check for client disconnect every 1s while waiting for events
                try:
                    kind, data = await asyncio.wait_for(event_queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    if await request.is_disconnected():
                        logger.warning("Crawl SSE client disconnected, cancelling orchestrator")
                        execute_task.cancel()
                        try:
                            await execute_task
                        except asyncio.CancelledError:
                            pass
                        return
                    continue

                if kind == "done":
                    last_event = data
                    # Store completed task
                    _crawl_tasks.insert(0, {
                        "type": "crawl",
                        "task_id": last_event.get("data", {}).get("task_id", "") if last_event else "",
                        "mode": payload.mode.value,
                        "data_type": payload.data_type.value,
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                    })
                    return
                elif kind == "error":
                    yield f"event: error\ndata: {json.dumps({'error': data}, ensure_ascii=False)}\n\n"
                    return
                elif kind == "event":
                    last_event = data
                    event_name = data.get("event", "message")
                    event_data = json.dumps(data.get("data", {}), ensure_ascii=False)
                    yield f"event: {event_name}\ndata: {event_data}\n\n"
        finally:
            if execute_task and not execute_task.done():
                execute_task.cancel()
                try:
                    await execute_task
                except asyncio.CancelledError:
                    pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.post("/crawl/parse-nl")
async def parse_natural_language(query: str = Query(..., description="Natural language crawl request")):
    """Parse a natural language query to confirm intent before crawling (COMPLEX mode).

    Returns structured params for user confirmation.
    """
    try:
        from data_collection.agents.requirement_agent import RequirementParser
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Requirement parser not available: {e}")

    parser = RequirementParser()
    parsed = parser.parse_complex_mode(query)
    return {"success": True, "data": parsed}


@router.get("/crawl/sources")
async def list_crawl_sources():
    """List available scraper sources with their capabilities (keywords, date_range, max_pages)."""
    try:
        from data_collection.agents.source_matching_agent import SourceMatcher
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Source matcher not available: {e}")

    matcher = SourceMatcher()
    return {"sources": matcher.SOURCE_CAPABILITIES}


@router.get("/crawl/tasks")
async def list_crawl_tasks(limit: int = Query(default=20, ge=1, le=100)):
    """Get history of crawl tasks (most recent first)."""
    crawl_only = [t for t in _crawl_tasks if t.get("type") == "crawl"]
    return {"tasks": crawl_only[:limit], "total": len(crawl_only)}


# ── Data Source File Scanning ────────────────────────────────────────────


@router.get("/data-sources")
async def list_data_sources():
    """List all available data sources (from pipeline config) with file counts."""
    try:
        from kg_construction.etl.pipeline_config import DATA_SOURCE_CONFIGS, scan_source_files

        sources = []
        for key, cfg in DATA_SOURCE_CONFIGS.items():
            files = scan_source_files(key)
            sources.append({
                "key": key,
                "name": cfg.get("name", key),
                "category": cfg.get("category", ""),
                "layer": cfg.get("layer", ""),
                "input_glob": cfg.get("input_glob", "*.*"),
                "file_count": len(files),
                "entity_types": cfg.get("entity_types", []),
                "relation_types": cfg.get("relation_types", []),
            })
        return {"sources": sources, "total": len(sources)}
    except ImportError as e:
        return {"sources": [], "error": str(e)}


@router.get("/files/{source}")
async def list_source_files(source: str):
    """Scan a data source directory and return file list."""
    try:
        from kg_construction.etl.pipeline_config import DATA_SOURCE_CONFIGS, scan_source_files

        if source not in DATA_SOURCE_CONFIGS:
            available = list(DATA_SOURCE_CONFIGS.keys())
            raise HTTPException(status_code=404, detail=f"Unknown source '{source}'. Available: {available}")

        cfg = DATA_SOURCE_CONFIGS[source]
        files = scan_source_files(source)
        return {
            "source": source,
            "name": cfg.get("name", source),
            "category": cfg.get("category", ""),
            "layer": cfg.get("layer", ""),
            "input_glob": cfg.get("input_glob", "*.*"),
            "files": files,
            "total": len(files),
        }
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/files/{source}")
async def cleanup_source_files(source: str):
    """Delete all files in a data source directory (after processing)."""
    try:
        from kg_construction.etl.pipeline_config import DATA_SOURCE_CONFIGS, cleanup_source_files as _cleanup

        if source not in DATA_SOURCE_CONFIGS:
            available = list(DATA_SOURCE_CONFIGS.keys())
            raise HTTPException(status_code=404, detail=f"Unknown source '{source}'. Available: {available}")

        count = _cleanup(source)
        return {"source": source, "deleted": count, "message": f"Cleaned up {count} files"}
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Stage-based Dify Extraction ──────────────────────────────────────────

_VALID_EXTRACT_STAGES = {
    "subject_extraction",
    "event_extraction",
    "feature_extraction",
    "regulation_linking",
}


@router.post("/extract/{stage}")
async def extract_stage(
    stage: str,
    source: str = Query(..., description="Data source key (e.g. 'risk_event_sse')"),
):
    """Run Dify extraction for a single KG construction stage.

    Reads parsed text from the latest pipeline run for the given source,
    calls the appropriate Dify workflow, and returns nodes/edges for
    frontend rendering. Does NOT write to Neo4j (that happens in Stage 6).

    Stages: subject_extraction | event_extraction | feature_extraction | regulation_linking
    """
    if stage not in _VALID_EXTRACT_STAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown stage '{stage}'. Valid: {list(_VALID_EXTRACT_STAGES)}",
        )

    try:
        from data_collection.dify.dify_client import DifyClient
        from data_collection.dify.dify_pdf_bridge import chunk_regulation_text
        from kg_construction.etl.pipeline_config import DATA_SOURCE_CONFIGS
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Required module not available: {e}")

    if source not in DATA_SOURCE_CONFIGS:
        available = list(DATA_SOURCE_CONFIGS.keys())
        raise HTTPException(
            status_code=404, detail=f"Unknown source '{source}'. Available: {available}"
        )

    source_config = DATA_SOURCE_CONFIGS[source]

    # Gather text from pipeline runs or scanned files
    texts: list[dict[str, str]] = []
    matching = [r for r in _pipeline_runs if r.get("source") == source]

    if matching:
        # Use parsed records from the latest successful pipeline run
        stages_data = matching[0].get("stages", [])
        for stage_run in stages_data:
            records = stage_run.get("stats", {}).get("_records", [])
            for rec in records:
                file_name = rec.get("file", rec.get("file_name", "unknown"))
                file_text = rec.get("text", rec.get("body", ""))
                if file_text:
                    texts.append({"file": file_name, "text": file_text})
    else:
        # Fallback: scan and parse files directly from source directory
        import os as _os
        from kg_construction.etl.pipeline_config import get_source_dir
        from data_collection.file_import.pdf_parser import parse_pdf_hybrid

        src_dir = get_source_dir(source)
        if _os.path.isdir(src_dir):
            for fname in sorted(_os.listdir(src_dir)):
                fpath = _os.path.join(src_dir, fname)
                if not _os.path.isfile(fpath):
                    continue
                if fname.lower().endswith(".pdf"):
                    parsed_text = parse_pdf_hybrid(fpath)
                elif fname.lower().endswith(".txt"):
                    with open(fpath, "r", encoding="utf-8") as fh:
                        parsed_text = fh.read()
                else:
                    continue
                if parsed_text:
                    texts.append({"file": fname, "text": parsed_text})

    if not texts:
        return {
            "success": True,
            "stage": stage,
            "message": "No text data available. Run Stage 1 (data import) first.",
            "nodes": [],
            "edges": [],
        }

    # Run Dify extraction for this stage
    client = DifyClient()
    all_results: list[dict[str, Any]] = []

    for item in texts:
        file_name = item["file"]
        file_text = item["text"]

        # Chunk text for regulation stage; use raw text for others
        if stage == "regulation_linking":
            chunks = chunk_regulation_text(file_text)
            if not chunks:
                chunks = [file_text[:15000]]
        else:
            chunks = [file_text[:15000]]

        for i, chunk in enumerate(chunks):
            source_label = f"{file_name}_chunk{i}" if len(chunks) > 1 else file_name
            logger.info(
                "Extract stage=%s source=%s chunk=%s/%s chars=%s",
                stage, source_label, i + 1, len(chunks), len(chunk),
            )
            results = client.run_workflow_for_stage(chunk, stage, source_label)
            if results:
                all_results.extend(results)

    # Deduplicate
    from data_collection.dify.dify_pdf_bridge import _deduplicate_results
    deduped = _deduplicate_results(all_results)

    # Convert Dify JSONL to frontend nodes/edges format
    from data_collection.dify.dify_pdf_bridge import dify_results_to_jsonl
    from kg_construction.etl.cypher_generator import generate_cypher_from_dify_jsonl

    jsonl_str = dify_results_to_jsonl(deduped)
    layer = source_config.get("layer", "Subject")
    cypher_statements = generate_cypher_from_dify_jsonl(jsonl_str, source, layer)

    # Build response nodes/edges for frontend rendering
    response_nodes: list[dict[str, Any]] = []
    response_edges: list[dict[str, Any]] = []
    node_ids: dict[str, dict[str, str]] = {}

    for item in deduped:
        if item.get("type") == "node":
            labels = item.get("labels", [])
            props = item.get("properties", {})
            node_label = labels[0] if labels else "Unknown"
            name = props.get("name", "") or props.get("title", "")
            nid = item.get("id", name)
            node_ids[nid] = {"label": node_label, "name": name}
            response_nodes.append({
                "id": nid,
                "label": name,
                "type": node_label,
                "properties": props,
            })
        elif item.get("type") == "relationship":
            rel_label = item.get("label", "")
            start_info = item.get("start", {})
            end_info = item.get("end", {})
            start_id = start_info.get("id", "")
            end_id = end_info.get("id", "")
            src_name = start_info.get("properties", {}).get("name", "") if isinstance(start_info, dict) else ""
            tgt_name = end_info.get("properties", {}).get("name", "") if isinstance(end_info, dict) else ""
            response_edges.append({
                "id": item.get("id", f"{start_id}_{end_id}_{rel_label}"),
                "source": start_id,
                "target": end_id,
                "label": rel_label,
                "sourceName": src_name,
                "targetName": tgt_name,
            })

    node_count = len(response_nodes)
    edge_count = len(response_edges)
    logger.info(
        "Extract stage=%s complete: %s nodes, %s edges, %s cypher statements",
        stage, node_count, edge_count, len(cypher_statements),
    )

    return {
        "success": True,
        "stage": stage,
        "source": source,
        "nodes": response_nodes,
        "edges": response_edges,
        "node_count": node_count,
        "edge_count": edge_count,
        "cypher_statements": len(cypher_statements),
        "cypher_preview": cypher_statements[:3],
    }


@router.post("/dify/import")
async def dify_direct_import(
    source: str = Query(default="regulation_docs", description="Data source key"),
    file_path: str | None = Query(default=None, description="Single PDF file path (optional)"),
    dry_run: bool = Query(default=False, description="If true, return Cypher without writing to Neo4j"),
):
    """Direct Dify extraction + Neo4j import for regulation documents.

    Skips the crawl/parse stages and feeds text directly to the Dify workflow,
    then imports the extracted triples into Neo4j.

    If file_path is provided, processes a single file.
    Otherwise scans the configured source directory for matching files.
    """
    try:
        from data_collection.dify.dify_pdf_bridge import (
            process_pdf_with_dify,
            batch_process_with_dify,
            dify_results_to_jsonl,
        )
        from kg_construction.etl.cypher_generator import generate_cypher_from_dify_jsonl
        from kg_construction.etl.pipeline_config import DATA_SOURCE_CONFIGS, get_source_dir
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Required module not available: {e}")

    if source not in DATA_SOURCE_CONFIGS:
        available = list(DATA_SOURCE_CONFIGS.keys())
        raise HTTPException(status_code=404, detail=f"Unknown source '{source}'. Available: {available}")

    source_config = DATA_SOURCE_CONFIGS[source]

    if file_path:
        import os as _os
        if not _os.path.isfile(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")
        results = process_pdf_with_dify(file_path)
    else:
        source_dir = get_source_dir(source)
        import os as _os
        if not _os.path.isdir(source_dir):
            raise HTTPException(status_code=404, detail=f"Source directory not found: {source_dir}")
        results = batch_process_with_dify(source_dir, source_config.get("input_glob", "*.pdf"))

    if not results:
        return {"success": True, "message": "No entities extracted", "nodes": 0, "edges": 0}

    node_count = sum(1 for r in results if r.get("type") == "node")
    edge_count = sum(1 for r in results if r.get("type") == "relationship")

    jsonl_str = dify_results_to_jsonl(results)
    layer = source_config.get("layer", "Regulation")
    statements = generate_cypher_from_dify_jsonl(jsonl_str, file_path or source, layer)

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "nodes": node_count,
            "edges": edge_count,
            "cypher_statements": len(statements),
            "cypher_preview": statements[:5],
        }

    try:
        from core.database import Neo4jClient
        client = Neo4jClient.from_env()
        executed = 0
        errors = []
        for stmt in statements:
            if not stmt or not stmt.strip():
                continue
            try:
                client.execute_read(stmt, timeout_seconds=10.0)
                executed += 1
            except Exception as e:
                errors.append(str(e)[:200])
        return {
            "success": True,
            "nodes": node_count,
            "edges": edge_count,
            "cypher_executed": executed,
            "cypher_errors": len(errors),
            "errors_preview": errors[:5],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Neo4j import failed: {e}")
