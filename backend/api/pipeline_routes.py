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

The crawl endpoint always runs real scrapers with Chrome/Edge WebDriver.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import threading
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, Request, UploadFile
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

KG_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "kg_outputs"
KG_OUTPUT_STAGES = {
    "event_extraction": "risk_events",
    "feature_extraction": "risk_features",
    "regulation_linking": "regulations",
}


def _safe_name(name: str) -> str:
    stem = Path(name).stem or "artifact"
    return re.sub(r"[^0-9A-Za-z\u4e00-\u9fff._-]+", "_", stem).strip("._") or "artifact"


def _summarize_kg_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    node_type_counts: Counter[str] = Counter()
    edge_type_counts: Counter[str] = Counter()
    node_count = 0
    edge_count = 0
    fallback_count = 0
    event_title = ""
    event_category = ""
    risk_level = ""

    for item in results:
        item_type = item.get("type")
        props = item.get("properties") or {}
        if props.get("fallback_generated"):
            fallback_count += 1
        if item_type == "node":
            labels_for_meta = item.get("labels") or []
            if isinstance(labels_for_meta, str):
                labels_for_meta = [labels_for_meta]
            if not event_title and ("EVENT" in labels_for_meta or "Event" in labels_for_meta):
                event_title = str(props.get("title") or props.get("text") or "")
                event_category = str(props.get("event_category") or props.get("action_type") or "")
                risk_level = str(props.get("risk_level") or "")
        if item_type == "node":
            node_count += 1
            labels = item.get("labels") or item.get("label") or item.get("nodeLabels") or []
            if isinstance(labels, str):
                labels = [labels]
            for label in labels:
                if label:
                    node_type_counts[str(label)] += 1
        elif item_type == "relationship":
            edge_count += 1
            label = item.get("label") or item.get("relation") or item.get("relationshipType")
            if label:
                edge_type_counts[str(label)] += 1

    return {
        "nodeCount": node_count,
        "edgeCount": edge_count,
        "nodeTypeCounts": dict(node_type_counts),
        "edgeTypeCounts": dict(edge_type_counts),
        "extractionMode": "fallback" if fallback_count else "dify",
        "fallbackCount": fallback_count,
        "announcementType": event_category or ("普通公告" if fallback_count else "风险事件"),
        "eventTitle": event_title[:120],
        "riskLevel": risk_level or ("low" if fallback_count else ""),
    }


def _write_kg_json_artifact(stage: str, source: str, results: list[dict[str, Any]]) -> dict[str, Any]:
    """Persist Dify extraction output as project-local JSON and JSONL files."""
    stage_dir = KG_OUTPUT_DIR / KG_OUTPUT_STAGES.get(stage, stage)
    stage_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    base = f"{stamp}_{_safe_name(source)}"
    json_path = stage_dir / f"{base}.json"
    jsonl_path = stage_dir / f"{base}.jsonl"
    summary = _summarize_kg_results(results)

    payload = {
        "stage": stage,
        "source": source,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        **summary,
        "items": results,
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    jsonl_path.write_text(
        "\n".join(json.dumps(item, ensure_ascii=False) for item in results),
        encoding="utf-8",
    )
    return {
        "stage": stage,
        "source": source,
        "jsonPath": str(json_path),
        "jsonlPath": str(jsonl_path),
        "nodeCount": payload["nodeCount"],
        "edgeCount": payload["edgeCount"],
        "nodeTypeCounts": payload["nodeTypeCounts"],
        "edgeTypeCounts": payload["edgeTypeCounts"],
        "extractionMode": payload["extractionMode"],
        "fallbackCount": payload["fallbackCount"],
        "announcementType": payload["announcementType"],
        "eventTitle": payload["eventTitle"],
        "riskLevel": payload["riskLevel"],
        "createdAt": payload["createdAt"],
    }


def _extract_text_from_upload(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix == ".pdf":
        from data_collection.file_import.pdf_parser import parse_pdf_hybrid

        return parse_pdf_hybrid(path) or ""
    if suffix in {".txt", ".md"}:
        return Path(path).read_text(encoding="utf-8", errors="ignore")
    if suffix == ".docx":
        from docx import Document

        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs if p.text)
    return ""


def _stable_id(prefix: str, value: str) -> str:
    digest = hashlib.md5(value.encode("utf-8", errors="ignore")).hexdigest()[:10]
    return f"{prefix}_{digest}"


def _first_text_match(pattern: str, text: str, default: str = "") -> str:
    match = re.search(pattern, text, flags=re.MULTILINE)
    return match.group(1).strip() if match else default


def _normalize_zh_date(value: str) -> str:
    match = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日?", value or "")
    if not match:
        return ""
    year, month, day = match.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}"


def _extract_title(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for line in lines:
        if re.search(r"(证券代码|证券简称|公告编号|本公司董事会|特此公告)", line):
            continue
        if re.search(r"(公告|决议|通知|议案|报告)", line) and 6 <= len(line) <= 120:
            return line
    for line in lines:
        if re.search(r"(证券代码|证券简称|公告编号|本公司董事会|特此公告)", line):
            continue
        if 6 <= len(line) <= 120:
            return line
    return lines[0] if lines else "上传文件事件"


def _extract_company_name(text: str) -> str:
    return _first_text_match(
        r"([\u4e00-\u9fffA-Za-z0-9（）()]{2,80}(?:股份有限公司|有限责任公司|有限公司))",
        text,
        "",
    ) or _first_text_match(r"证券简称[:：]\s*([^\n\r]+)", text, "未知主体")


def _node_display_name(props: dict[str, Any], fallback: str = "") -> str:
    for key in (
        "name", "title", "text", "COMPANY_NM", "PERSON_NM", "REGULATOR_NM",
        "factor_nm", "feature_type", "content",
    ):
        value = props.get(key)
        if isinstance(value, (str, int, float)) and str(value).strip():
            return str(value)
    for key, value in props.items():
        if key.endswith("_NM") and isinstance(value, (str, int, float)) and str(value).strip():
            return str(value)
    return fallback


def _classify_event(text: str) -> tuple[str, str, bool]:
    if re.search(r"辞职|离任|代为履行|总裁|董事|监事|高级管理人员", text):
        return "公司治理变动", "管理层变动公告", False
    risk_patterns = [
        ("处罚处分", r"处罚|纪律处分|公开谴责|监管措施|警示函|立案调查"),
        ("信息披露违规", r"虚假记载|重大遗漏|信息披露|未按规定披露|违规"),
        ("资金占用担保", r"资金占用|违规担保|非经营性占用"),
        ("诉讼仲裁", r"诉讼|仲裁|判决|裁定"),
        ("退市风险", r"退市|风险警示|暂停上市|终止上市"),
    ]
    for category, pattern in risk_patterns:
        if re.search(pattern, text):
            return category, category, True
    return "普通公告", "公告披露", False


def _build_event_fallback_results(text: str, source_name: str) -> list[dict[str, Any]]:
    title = _extract_title(text)
    company = _extract_company_name(text)
    date_text = _first_text_match(r"(\d{4}年\d{1,2}月\d{1,2}日?)", text, "")
    event_category, action_type, is_risk = _classify_event(text)
    event_id = _stable_id("e", f"{source_name}:{title}:{text[:120]}")
    company_id = _stable_id("c", company)
    results: list[dict[str, Any]] = [
        {
            "type": "node",
            "id": company_id,
            "labels": ["COMPANY"],
            "properties": {"COMPANY_NM": company, "fallback_generated": True},
        },
        {
            "type": "node",
            "id": event_id,
            "labels": ["EVENT"],
            "properties": {
                "title": title,
                "text": text[:1200],
                "event_category": event_category,
                "action_type": action_type,
                "risk_level": "medium" if is_risk else "low",
                "fallback_generated": True,
                "fallback_reason": "Dify 未返回可解析节点，已按公告文本生成基础事件",
            },
        },
        {
            "id": _stable_id("r", f"{company_id}:{event_id}:PARTICIPATE_IN"),
            "type": "relationship",
            "label": "PARTICIPATE_IN",
            "start": {"id": company_id, "labels": ["COMPANY"]},
            "end": {"id": event_id, "labels": ["EVENT"]},
            "properties": {"fallback_generated": True},
        },
    ]
    if date_text:
        time_id = _stable_id("t", date_text)
        results.extend([
            {
                "type": "node",
                "id": time_id,
                "labels": ["TIME"],
                "properties": {
                    "text": date_text,
                    "标准化时间": _normalize_zh_date(date_text),
                    "TIME_TYPE": "absolute",
                    "fallback_generated": True,
                },
            },
            {
                "id": _stable_id("r", f"{event_id}:{time_id}:发生于"),
                "type": "relationship",
                "label": "发生于",
                "start": {"id": event_id, "labels": ["EVENT"]},
                "end": {"id": time_id, "labels": ["TIME"]},
                "properties": {"fallback_generated": True},
            },
        ])
    return results


def _build_feature_fallback_results(event_jsonl: str, source_name: str) -> list[dict[str, Any]]:
    event_nodes: list[dict[str, Any]] = []
    for line in event_jsonl.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        labels = item.get("labels") or []
        if item.get("type") == "node" and ("EVENT" in labels or "Event" in labels):
            event_nodes.append(item)

    if not event_nodes:
        return []

    results: list[dict[str, Any]] = []
    for event in event_nodes[:3]:
        event_id = str(event.get("id") or _stable_id("e", source_name))
        props = event.get("properties") or {}
        title = props.get("title") or props.get("text") or event_id
        category = props.get("event_category") or "普通公告"
        action_type = props.get("action_type") or category
        is_fallback = bool(props.get("fallback_generated"))
        feature_name = f"{action_type}关注项"
        feature_type = "公司治理关注" if is_fallback else str(category)
        risk_domain = "公司治理" if is_fallback else "重大舆情"

        factor_id = _stable_id("rf", f"{event_id}:{feature_name}")
        feature_id = _stable_id("rft", feature_type)
        results.extend([
            {
                "type": "node",
                "id": factor_id,
                "labels": ["RiskFactor"],
                "properties": {
                    "factor_nm": feature_name,
                    "risk_domain": risk_domain,
                    "violation_type": feature_type,
                    "definition": str(title)[:500],
                    "keywords": [str(category), str(action_type)],
                    "compliance_tag": "兜底识别",
                    "fallback_generated": True,
                    "fallback_reason": "特征层 Dify 未返回可解析节点，已按事件层 JSON 生成基础特征",
                },
            },
            {
                "type": "node",
                "id": feature_id,
                "labels": ["RiskFeature"],
                "properties": {
                    "feature_type": feature_type,
                    "risk_domain": risk_domain,
                    "keywords": [str(category), str(action_type)],
                    "compliance_tag": "兜底识别",
                    "fallback_generated": True,
                },
            },
            {
                "id": _stable_id("r", f"{factor_id}:{event_id}:触发"),
                "type": "relationship",
                "label": "触发",
                "start": {"id": factor_id, "labels": ["RiskFactor"]},
                "end": {"id": event_id, "labels": ["EVENT"]},
                "properties": {"e_id": event_id, "factor_nm": feature_name, "fallback_generated": True},
            },
            {
                "id": _stable_id("r", f"{factor_id}:{feature_id}:构成"),
                "type": "relationship",
                "label": "构成",
                "start": {"id": factor_id, "labels": ["RiskFactor"]},
                "end": {"id": feature_id, "labels": ["RiskFeature"]},
                "properties": {"factor_nm": feature_name, "feature_type": feature_type, "fallback_generated": True},
            },
        ])
    return results


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


def _source_import_succeeded(runs: list[Any]) -> bool:
    """Return true only when the import stage really wrote to Neo4j cleanly."""
    import_run = next((r for r in runs if getattr(r, "stage", "") == "import"), None)
    if not import_run:
        return False
    if getattr(import_run, "status", "") != "completed":
        return False
    if getattr(import_run, "records_created", 0) <= 0:
        return False

    stats = getattr(import_run, "stats", {}) or {}
    errors = getattr(import_run, "errors", []) or []
    if stats.get("import_errors"):
        return False
    if stats.get("cypher_file"):
        return False
    if errors:
        return False
    return True


def _cleanup_source_after_confirmed_import(source: str, runs: list[Any], confirmed_import: bool) -> int:
    """Clean crawler cache only after an explicit user-confirmed import."""
    if not confirmed_import:
        return 0
    if not _source_import_succeeded(runs):
        return 0

    from kg_construction.etl.pipeline_config import cleanup_source_files

    return cleanup_source_files(source)


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
    source: str = Query(..., description="Data source key (e.g. 'risk_event_bse')"),
    start_stage: str | None = Query(default=None, description="Stage to start from"),
    end_stage: str | None = Query(default=None, description="Stage to end at"),
    confirmed_import: bool = Query(default=False, description="Allow Neo4j import and source cleanup only after user confirmation"),
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

    if not confirmed_import and end_stage in {"import", "index"}:
        raise HTTPException(
            status_code=400,
            detail="Neo4j import requires explicit confirmed_import=true.",
        )

    effective_end_stage = end_stage
    if not confirmed_import and effective_end_stage is None:
        effective_end_stage = "resolve"

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
            "end_stage": effective_end_stage,
            "confirmed_import": confirmed_import,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "status": "running",
        }

    async def _run_pipeline():
        global _current_run
        try:
            runs = runner.run(source, start_stage=start_stage, end_stage=effective_end_stage)
            cleaned_count = _cleanup_source_after_confirmed_import(source, runs, confirmed_import)
            if cleaned_count:
                import_run = next((r for r in runs if getattr(r, "stage", "") == "import"), None)
                if import_run:
                    import_run.stats["files_cleaned_after_import"] = cleaned_count
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


@router.post("/process-file")
async def process_single_file(
    filePath: str = Query(..., description="Absolute path of the file to process"),
    source: str = Query(..., description="Data source key (e.g. risk_event_bse)"),
    dry_run: bool = Query(default=False, description="If true, stop after generating Cypher"),
):
    """Process a single file through the ETL pipeline and delete it on success.

    Flow: parse → extract (event + feature + regulation via Dify) → import to Neo4j.
    On successful import, the source file is deleted.
    """
    import os as _os

    if not _os.path.isfile(filePath):
        raise HTTPException(status_code=404, detail=f"File not found: {filePath}")

    from kg_construction.etl.pipeline_config import DATA_SOURCE_CONFIGS, get_pipeline_config

    if source not in DATA_SOURCE_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Unknown source: {source}")

    config = get_pipeline_config()
    result = {
        "filePath": filePath,
        "source": source,
        "status": "processed",
        "stages": {},
    }

    try:
        from data_collection.file_import.pdf_parser import parse_pdf_hybrid
        from data_collection.dify.dify_client import DifyClient
        from data_collection.dify.dify_pdf_bridge import dify_results_to_jsonl, _deduplicate_results
        from kg_construction.etl.cypher_generator import generate_cypher_from_dify_jsonl

        # Stage 1: Parse
        text = parse_pdf_hybrid(filePath) or ""
        if not text:
            result["status"] = "failed"
            result["error"] = "Parse returned empty text"
            return {"success": False, "data": result}

        result["stages"]["parse"] = {"status": "completed", "char_count": len(text)}

        # Stage 2: Extract (event + feature + regulation via Dify)
        dify = DifyClient()
        all_results = []
        for stage in ["event_extraction", "feature_extraction", "regulation_linking"]:
            stage_results = dify.run_workflow_for_stage(text[:15000], stage, _os.path.basename(filePath))
            all_results.extend(stage_results)
            result["stages"][stage] = {
                "status": "completed",
                "item_count": len(stage_results),
            }

        deduped = _deduplicate_results(all_results)
        jsonl = dify_results_to_jsonl(deduped)
        result["stages"]["extract"] = {"status": "completed", "total_items": len(deduped)}

        if dry_run:
            statements = generate_cypher_from_dify_jsonl(jsonl, _os.path.basename(filePath), layer="all")
            result["cypher_preview"] = statements[:10]
            result["cypher_total"] = len(statements)
            return {"success": True, "data": result}

        # Stage 3: Import to Neo4j
        statements = generate_cypher_from_dify_jsonl(jsonl, _os.path.basename(filePath), layer="all")
        if statements:
            from core.database import Neo4jClient
            neo4j = Neo4jClient.from_env()
            imported = 0
            import_errors = 0
            for stmt in statements:
                if not stmt or not stmt.strip():
                    continue
                try:
                    neo4j.execute_read(stmt, timeout_seconds=10.0)
                    imported += 1
                except Exception as e:
                    import_errors += 1
                    if import_errors <= 2:
                        logger.warning("process-file import error: %s", e)
            result["stages"]["import"] = {"status": "completed", "imported": imported, "errors": import_errors}

        # Stage 4: Delete source file on success
        if result["stages"].get("import", {}).get("errors", 0) == 0:
            try:
                _os.remove(filePath)
                result["file_deleted"] = True
            except OSError as e:
                result["file_deleted"] = False
                result["delete_error"] = str(e)
        else:
            result["file_deleted"] = False

        result["status"] = "completed"
        return {"success": True, "data": result}
    except Exception as e:
        logger.exception("process-file failed: %s", e)
        result["status"] = "failed"
        result["error"] = str(e)
        return {"success": False, "data": result}


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

    logger.info("Crawl endpoint: REAL (WebDriver) mode")

    async def event_generator():
        orchestrator = CrawlOrchestrator()
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
            # Force development proxies and reverse proxies to flush the SSE
            # response immediately instead of buffering until the first large chunk.
            yield ": connected " + (" " * 2048) + "\n\n"
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
                    yield ": heartbeat\n\n"
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
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
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


@router.get("/files")
async def list_all_files():
    """List all crawled files across all data sources.

    Returns files grouped by source, with name, size, and modification time.
    Does NOT include file content.
    """
    import os as _os
    try:
        from kg_construction.etl.pipeline_config import DATA_SOURCE_CONFIGS, scan_source_files
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))

    all_files: list[dict[str, Any]] = []
    for key, cfg in DATA_SOURCE_CONFIGS.items():
        files = scan_source_files(key)
        for f in files:
            fpath = f.get("path", "")
            mtime = ""
            if fpath and _os.path.isfile(fpath):
                mtime = _os.path.getmtime(fpath)
                from datetime import datetime
                mtime = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")
            all_files.append({
                "name": f.get("name", ""),
                "size": f.get("size", 0),
                "size_display": f.get("size_display", ""),
                "source": key,
                "source_name": cfg.get("name", key),
                "category": cfg.get("category", ""),
                "modified": mtime,
            })

    # Sort by modification time descending (newest first)
    all_files.sort(key=lambda x: x.get("modified", ""), reverse=True)

    return {
        "files": all_files,
        "total": len(all_files),
        "sources": [
            {
                "key": key,
                "name": cfg.get("name", key),
                "file_count": len(scan_source_files(key)),
            }
            for key, cfg in DATA_SOURCE_CONFIGS.items()
        ],
    }


@router.post("/uploads")
async def upload_source_files(
    files: list[UploadFile] = File(...),
    source: str = Query(default="uploaded_docs", description="Target source key for uploaded files"),
    clear_existing: bool = Query(default=True, description="Clear old uploaded files before saving new ones"),
):
    """Upload and directly parse files for Stage 1 data import.

    This route is intentionally independent from the crawler pipeline. The
    parsed records are registered as a completed Stage 1 run so Stage 2 Dify
    extraction can read the uploaded files directly.
    """
    try:
        from kg_construction.etl.pipeline_config import DATA_SOURCE_CONFIGS, get_source_dir
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))

    if source not in DATA_SOURCE_CONFIGS:
        available = list(DATA_SOURCE_CONFIGS.keys())
        raise HTTPException(status_code=404, detail=f"Unknown source '{source}'. Available: {available}")

    allowed_suffixes = {".pdf", ".docx", ".txt", ".md"}
    source_dir = Path(get_source_dir(source))
    source_dir.mkdir(parents=True, exist_ok=True)

    if clear_existing:
        for existing in source_dir.iterdir():
            if existing.is_file():
                try:
                    existing.unlink()
                except OSError:
                    logger.warning("Failed to remove old upload: %s", existing)

    saved_files: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    for file in files:
        filename = file.filename or "upload.txt"
        suffix = Path(filename).suffix.lower()
        if suffix not in allowed_suffixes:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {filename}")

        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        saved_path = source_dir / f"{stamp}_{_safe_name(filename)}{suffix}"
        content = await file.read()
        saved_path.write_bytes(content)
        parsed_text = _extract_text_from_upload(str(saved_path))
        saved_files.append({
            "name": filename,
            "savedName": saved_path.name,
            "savedPath": str(saved_path),
            "size": len(content),
            "chars": len(parsed_text or ""),
            "status": "done" if parsed_text else "error",
        })
        if parsed_text:
            records.append({
                "file": saved_path.name,
                "file_name": filename,
                "path": str(saved_path),
                "text": parsed_text,
            })

    if not records:
        raise HTTPException(status_code=400, detail="Uploaded files were saved, but no extractable text was found.")

    run_record = {
        "source": source,
        "stages": [
            {
                "stage": "parse",
                "status": "completed",
                "records_processed": len(records),
                "stats": {
                    "parsed_files": len(records),
                    "processed_files": [item["savedPath"] for item in saved_files],
                    "_records": records,
                },
            }
        ],
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    _pipeline_runs.insert(0, run_record)

    return {
        "success": True,
        "source": source,
        "saved": saved_files,
        "count": len(saved_files),
        "records": len(records),
        "totalChars": sum(len(record.get("text") or "") for record in records),
    }


@router.delete("/files/{source}")
async def cleanup_source_files(
    source: str,
    confirmed_import: bool = Query(default=False, description="Must be true after user-confirmed Neo4j import"),
):
    """Delete source files only after an explicit user-confirmed Neo4j import."""
    if not confirmed_import:
        raise HTTPException(
            status_code=400,
            detail="Refusing to delete source files before explicit user-confirmed Neo4j import.",
        )
    try:
        from kg_construction.etl.pipeline_config import DATA_SOURCE_CONFIGS, cleanup_source_files as _cleanup

        if source not in DATA_SOURCE_CONFIGS:
            available = list(DATA_SOURCE_CONFIGS.keys())
            raise HTTPException(status_code=404, detail=f"Unknown source '{source}'. Available: {available}")

        count = _cleanup(source)
        return {"source": source, "deleted": count, "message": f"Cleaned up {count} files"}
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 企查查 (Qichacha) Subject Lookup ──────────────────────────────────────

@router.get("/qcc/lookup")
async def qcc_lookup_subject(
    subject: str = Query(..., description="Subject name to look up in Qichacha"),
):
    """Look up a company/person in Qichacha (企查查) when the subject is not
    found in the existing knowledge graph.

    Calls the QCC Open API to retrieve basic enterprise info including
    legal representative, executives, and registration details.
    """
    try:
        from config.settings import settings
        from data_collection.api_sync.paid_sources import QccSource
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Required module not available: {e}")

    if not settings.QCC_API_KEY:
        return {
            "success": False,
            "message": "QCC_API_KEY 未配置，请在 .env 中设置 QCC_API_KEY 后重试",
            "subject": subject,
            "data": None,
        }

    try:
        source = QccSource()
        if not source._enabled:
            return {
                "success": False,
                "message": "企查查数据源未启用（检查 API Key 配置）",
                "subject": subject,
                "data": None,
            }

        # Fetch legal representative from QCC
        legal_person = source.fetch_legal_representative(subject, None)
        # Fetch executives from QCC
        executives = source.fetch_executives(subject, None)

        if legal_person or executives:
            return {
                "success": True,
                "subject": subject,
                "data": {
                    "name": subject,
                    "legal_person": legal_person.to_dict() if legal_person else None,
                    "executives": [e.to_dict() for e in executives] if executives else [],
                    "source": "qichacha",
                },
            }
        else:
            return {
                "success": False,
                "message": f"企查查中未找到主体信息: {subject}",
                "subject": subject,
                "data": None,
            }
    except Exception as e:
        logger.exception(f"QCC lookup failed for '{subject}'")
        return {
            "success": False,
            "message": f"企查查查询失败: {str(e)}",
            "subject": subject,
            "data": None,
        }


# ── Build Log ─────────────────────────────────────────────────────────────

_build_logs: list[dict[str, Any]] = []


@router.get("/build-log")
async def get_build_logs(
    limit: int = Query(default=20, ge=1, le=100),
):
    """Get history of knowledge graph build logs.

    Each log records how many nodes/edges were added, which regulations
    were not found, and Qichacha lookup statistics for a build run.
    """
    return {"logs": _build_logs[:limit], "total": len(_build_logs)}


@router.post("/build-log")
async def save_build_log(payload: dict[str, Any]):
    """Save a build log entry after a KG construction run completes.

    Expected payload fields:
        - dataSource: str
        - status: str (completed/failed)
        - entityCount: int
        - edgeCount: int
        - duration: float
        - subjectCount: int (optional)
        - eventCount: int (optional)
        - featureCount: int (optional)
        - regulationCount: int (optional)
        - missingRegulations: list[str] (optional)
        - qccLookups: int (optional)
    """
    log_entry = {
        "buildId": payload.get("buildId", f"build_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "dataSource": payload.get("dataSource", ""),
        "status": payload.get("status", "completed"),
        "entityCount": payload.get("entityCount", 0),
        "edgeCount": payload.get("edgeCount", 0),
        "duration": payload.get("duration", 0),
        "subjectCount": payload.get("subjectCount", 0),
        "eventCount": payload.get("eventCount", 0),
        "featureCount": payload.get("featureCount", 0),
        "regulationCount": payload.get("regulationCount", 0),
        "missingRegulations": payload.get("missingRegulations", []),
        "qccLookups": payload.get("qccLookups", 0),
    }
    _build_logs.insert(0, log_entry)
    # Keep max 100 entries in memory
    while len(_build_logs) > 100:
        _build_logs.pop()
    logger.info(
        "Build log saved: %s | %s nodes, %s edges, %s missing regs",
        log_entry["buildId"],
        log_entry["entityCount"],
        log_entry["edgeCount"],
        len(log_entry.get("missingRegulations") or []),
    )
    return {"success": True, "buildId": log_entry["buildId"]}


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
    source: str = Query(..., description="Data source key (e.g. 'risk_event_bse')"),
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
    if stage == "feature_extraction":
        event_dir = KG_OUTPUT_DIR / KG_OUTPUT_STAGES["event_extraction"]
        event_files = sorted(
            event_dir.glob("*.jsonl"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        ) if event_dir.is_dir() else []
        matching_event_file = None
        for path in event_files:
            if _safe_name(source) in path.stem:
                matching_event_file = path
                break
        if matching_event_file is None and event_files:
            matching_event_file = event_files[0]
        if matching_event_file and matching_event_file.is_file():
            risk_event_text = matching_event_file.read_text(encoding="utf-8")
            if risk_event_text.strip():
                texts.append({"file": matching_event_file.name, "text": risk_event_text})
        if not texts:
            return {
                "success": False,
                "stage": stage,
                "source": source,
                "message": "Feature extraction requires a saved risk event JSONL artifact. Run event_extraction first.",
                "nodes": [],
                "edges": [],
            }

    matching = [r for r in _pipeline_runs if r.get("source") == source]

    if texts:
        pass
    elif matching:
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

        src_dir = get_source_dir(source)
        if _os.path.isdir(src_dir):
            for fname in sorted(_os.listdir(src_dir)):
                fpath = _os.path.join(src_dir, fname)
                if not _os.path.isfile(fpath):
                    continue
                if not fname.lower().endswith((".pdf", ".docx", ".txt", ".md")):
                    continue
                parsed_text = _extract_text_from_upload(fpath)
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

    if stage == "subject_extraction":
        from kg_construction.extraction.subject_extractor import (
            extract_and_align_subjects,
            subjects_to_frontend_nodes,
        )

        result = extract_and_align_subjects(texts)
        subjects = result["subjects"]
        response_nodes = subjects_to_frontend_nodes(subjects)
        stats = result["stats"]
        logger.info(
            "Local subject extraction complete: %s subjects (%s resolved, %s unresolved)",
            stats.get("total", 0),
            stats.get("resolved", 0),
            stats.get("unresolved", 0),
        )
        return {
            "success": True,
            "stage": stage,
            "source": source,
            "extractor": "local",
            "nodes": response_nodes,
            "edges": [],
            "node_count": len(response_nodes),
            "edge_count": 0,
            "stats": stats,
            "subjects": subjects,
        }

    all_results: list[dict[str, Any]] = []
    fallback_used = False
    merged_text = "\n\n".join(item.get("text", "") for item in texts)
    client = None

    # Run Dify extraction for this stage.
    if not all_results:
        from data_collection.dify.dify_client import DifyClient

        client = DifyClient()

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
    if not deduped:
        dify_reason = getattr(client, "last_error", "") if client else ""
        dify_reason = dify_reason or "Dify 未返回可解析的节点或关系"
        if stage == "event_extraction":
            fallback_results: list[dict[str, Any]] = []
            for item in texts:
                source_label = item.get("file") or source
                fallback_results.extend(_build_event_fallback_results(item.get("text", ""), source_label))
            deduped = _deduplicate_results(fallback_results)
            fallback_used = True
            logger.warning(
                "Dify returned no event results; using local fallback for source=%s. reason=%s",
                source,
                dify_reason,
            )
        elif stage == "feature_extraction":
            fallback_results = _build_feature_fallback_results(merged_text, source)
            deduped = _deduplicate_results(fallback_results)
            fallback_used = True
            logger.warning(
                "Dify returned no feature results; using local fallback for source=%s. reason=%s",
                source,
                dify_reason,
            )
        if not deduped:
            return {
                "success": True,
                "stage": stage,
                "source": source,
                "message": f"Dify 无结果（普通文件）。原因：{dify_reason}",
                "nodes": [],
                "edges": [],
                "node_count": 0,
                "edge_count": 0,
                "cypher_statements": 0,
                "json_artifact": None,
                "output_dir": str(KG_OUTPUT_DIR / KG_OUTPUT_STAGES.get(stage, stage)),
                "dify_error": dify_reason,
            }
    json_artifact = _write_kg_json_artifact(stage, source, deduped) if deduped else None

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
            name = _node_display_name(props, str(item.get("id", "")))
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
        "json_artifact": json_artifact,
        "fallback": fallback_used,
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
    json_artifact = _write_kg_json_artifact("regulation_linking", file_path or source, results)

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
            "json_artifact": json_artifact,
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
            "json_artifact": json_artifact,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Neo4j import failed: {e}")


@router.post("/regulations/upload")
async def upload_regulation_file(
    file: UploadFile = File(...),
    import_to_neo4j: bool = Query(default=False, description="If true, also import generated Cypher to Neo4j"),
):
    """Upload a regulation document, run the regulation Dify workflow, and save JSON output.

    This is intentionally independent from the main event/feature construction
    flow. The generated JSON is stored under backend/kg_outputs/regulations/.
    """
    try:
        from data_collection.dify.dify_pdf_bridge import (
            _deduplicate_results,
            chunk_regulation_text,
            dify_results_to_jsonl,
        )
        from data_collection.dify.dify_client import DifyClient
        from kg_construction.etl.cypher_generator import generate_cypher_from_dify_jsonl
        from kg_construction.etl.pipeline_config import DATA_SOURCE_CONFIGS, get_source_dir
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Required module not available: {e}")

    filename = file.filename or "regulation.txt"
    suffix = Path(filename).suffix.lower()
    if suffix not in {".pdf", ".txt", ".md", ".docx"}:
        raise HTTPException(status_code=400, detail="Only PDF, TXT, MD, and DOCX regulation files are supported.")

    source_dir = Path(get_source_dir("regulation_docs"))
    source_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    saved_path = source_dir / f"{stamp}_{_safe_name(filename)}{suffix}"
    content = await file.read()
    saved_path.write_bytes(content)

    text = _extract_text_from_upload(str(saved_path))
    if not text.strip():
        raise HTTPException(status_code=400, detail="Uploaded file did not contain extractable text.")

    chunks = chunk_regulation_text(text)
    if not chunks:
        chunks = [text[:15000]]

    client = DifyClient()
    all_results: list[dict[str, Any]] = []
    for i, chunk in enumerate(chunks):
        source_label = f"{saved_path.name}_chunk{i}" if len(chunks) > 1 else saved_path.name
        chunk_results = client.run_workflow_for_stage(chunk, "regulation_linking", source_label)
        if chunk_results:
            all_results.extend(chunk_results)

    results = _deduplicate_results(all_results)
    json_artifact = _write_kg_json_artifact("regulation_linking", saved_path.name, results)

    node_count = json_artifact["nodeCount"]
    edge_count = json_artifact["edgeCount"]
    jsonl_str = dify_results_to_jsonl(results)
    layer = DATA_SOURCE_CONFIGS.get("regulation_docs", {}).get("layer", "Regulation")
    statements = generate_cypher_from_dify_jsonl(jsonl_str, str(saved_path), layer) if results else []

    import_result: dict[str, Any] | None = None
    if import_to_neo4j and statements:
        try:
            from core.database import Neo4jClient

            client_db = Neo4jClient.from_env()
            executed = 0
            errors: list[str] = []
            for stmt in statements:
                if not stmt or not stmt.strip():
                    continue
                try:
                    client_db.execute_read(stmt, timeout_seconds=10.0)
                    executed += 1
                except Exception as exc:
                    errors.append(str(exc)[:200])
            import_result = {
                "cypherExecuted": executed,
                "cypherErrors": len(errors),
                "errorsPreview": errors[:5],
            }
        except Exception as exc:
            import_result = {
                "cypherExecuted": 0,
                "cypherErrors": 1,
                "errorsPreview": [str(exc)[:200]],
            }

    return {
        "success": True,
        "file": {
            "name": filename,
            "savedPath": str(saved_path),
            "size": len(content),
        },
        "nodes": node_count,
        "edges": edge_count,
        "chunks": len(chunks),
        "cypherStatements": len(statements),
        "json_artifact": json_artifact,
        "importResult": import_result,
    }


@router.get("/json-artifacts")
async def list_kg_json_artifacts(
    stage: str | None = Query(default=None, description="Optional stage key"),
    limit: int = Query(default=50, ge=1, le=200),
):
    """List saved Dify JSON artifacts for event, feature, and regulation layers."""
    search_dirs: list[tuple[str, Path]] = []
    if stage:
        search_dirs.append((stage, KG_OUTPUT_DIR / KG_OUTPUT_STAGES.get(stage, stage)))
    else:
        search_dirs = [
            (stage_key, KG_OUTPUT_DIR / subdir)
            for stage_key, subdir in KG_OUTPUT_STAGES.items()
        ]

    artifacts: list[dict[str, Any]] = []
    for stage_key, directory in search_dirs:
        if not directory.is_dir():
            continue
        for path in directory.glob("*.json"):
            try:
                stat = path.stat()
                payload: dict[str, Any] = {}
                try:
                    payload = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    payload = {}
                summary = _summarize_kg_results(payload.get("items") or [])
                artifacts.append({
                    "stage": stage_key,
                    "source": payload.get("source"),
                    "fileName": path.name,
                    "jsonPath": str(path),
                    "jsonlPath": str(path.with_suffix(".jsonl")),
                    "nodeCount": payload.get("nodeCount", summary["nodeCount"]),
                    "edgeCount": payload.get("edgeCount", summary["edgeCount"]),
                    "nodeTypeCounts": payload.get("nodeTypeCounts") or summary["nodeTypeCounts"],
                    "edgeTypeCounts": payload.get("edgeTypeCounts") or summary["edgeTypeCounts"],
                    "extractionMode": payload.get("extractionMode") or summary["extractionMode"],
                    "fallbackCount": payload.get("fallbackCount", summary["fallbackCount"]),
                    "announcementType": payload.get("announcementType") or summary["announcementType"],
                    "eventTitle": payload.get("eventTitle") or summary["eventTitle"],
                    "riskLevel": payload.get("riskLevel") or summary["riskLevel"],
                    "size": stat.st_size,
                    "createdAt": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                })
            except OSError:
                continue

    artifacts.sort(key=lambda item: item["createdAt"], reverse=True)
    return {"success": True, "artifacts": artifacts[:limit], "total": len(artifacts)}


@router.post("/json-artifacts/import")
async def import_kg_json_artifact(
    stage: str = Query(default="feature_extraction", description="Stage key to import"),
    artifact_path: str | None = Query(default=None, description="Optional JSON or JSONL artifact path"),
):
    """Import a saved Dify JSON/JSONL artifact into Neo4j without rerunning Dify."""
    try:
        from core.database import Neo4jClient
        from kg_construction.etl.cypher_generator import generate_cypher_from_dify_jsonl
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Required module not available: {e}")

    def resolve_jsonl_path(stage_key: str, explicit_path: str | None = None) -> Path:
        stage_dir = KG_OUTPUT_DIR / KG_OUTPUT_STAGES.get(stage_key, stage_key)
        if not stage_dir.is_dir():
            raise HTTPException(status_code=404, detail=f"No JSON artifact directory found for stage '{stage_key}'")

        if explicit_path:
            candidate = Path(explicit_path)
            if candidate.suffix.lower() == ".json":
                candidate = candidate.with_suffix(".jsonl")
            jsonl_path = candidate.resolve()
            try:
                jsonl_path.relative_to(KG_OUTPUT_DIR.resolve())
            except ValueError:
                raise HTTPException(status_code=400, detail="Artifact path is outside kg_outputs")
            if not jsonl_path.is_file():
                raise HTTPException(status_code=404, detail=f"JSONL artifact not found: {jsonl_path}")
            return jsonl_path

        jsonl_files = sorted(stage_dir.glob("*.jsonl"), key=lambda path: path.stat().st_mtime, reverse=True)
        if not jsonl_files:
            raise HTTPException(status_code=404, detail=f"No JSONL artifacts found for stage '{stage_key}'")
        return jsonl_files[0]

    layer_map = {
        "event_extraction": "Event",
        "feature_extraction": "Feature",
        "regulation_linking": "Regulation",
    }

    import_targets: list[tuple[str, Path]] = []
    if artifact_path:
        import_targets.append((stage, resolve_jsonl_path(stage, artifact_path)))
    elif stage == "feature_extraction":
        import_targets.append(("event_extraction", resolve_jsonl_path("event_extraction")))
        import_targets.append(("feature_extraction", resolve_jsonl_path("feature_extraction")))
    else:
        import_targets.append((stage, resolve_jsonl_path(stage)))

    prepared: list[dict[str, Any]] = []
    for stage_key, jsonl_path in import_targets:
        jsonl_str = jsonl_path.read_text(encoding="utf-8")
        if not jsonl_str.strip():
            raise HTTPException(status_code=400, detail=f"JSONL artifact is empty: {jsonl_path}")
        statements = generate_cypher_from_dify_jsonl(jsonl_str, str(jsonl_path), layer_map.get(stage_key, "Feature"))
        if not statements:
            raise HTTPException(status_code=400, detail=f"No Cypher statements generated from artifact: {jsonl_path}")

        node_count = 0
        edge_count = 0
        for line in jsonl_str.splitlines():
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if item.get("type") == "node":
                node_count += 1
            elif item.get("type") == "relationship":
                edge_count += 1

        prepared.append({
            "stage": stage_key,
            "jsonlPath": str(jsonl_path),
            "nodes": node_count,
            "edges": edge_count,
            "statements": statements,
        })

    client = Neo4jClient.from_env()
    executed = 0
    errors: list[str] = []
    for target in prepared:
        target_executed = 0
        target_errors: list[str] = []
        for stmt in target["statements"]:
            if not stmt or not stmt.strip():
                continue
            try:
                client.execute_read(stmt, timeout_seconds=10.0)
                executed += 1
                target_executed += 1
            except Exception as exc:
                message = str(exc)[:300]
                errors.append(message)
                target_errors.append(message)
        target["cypherStatements"] = len(target["statements"])
        target["cypherExecuted"] = target_executed
        target["cypherErrors"] = len(target_errors)
        target["errorsPreview"] = target_errors[:3]
        target.pop("statements", None)

    if executed == 0 and errors:
        raise HTTPException(status_code=400, detail=f"Neo4j import failed: {errors[0]}")

    total_nodes = sum(item["nodes"] for item in prepared)
    total_edges = sum(item["edges"] for item in prepared)
    total_statements = sum(item["cypherStatements"] for item in prepared)

    return {
        "success": True,
        "stage": stage,
        "jsonlPath": prepared[-1]["jsonlPath"] if prepared else "",
        "importedArtifacts": prepared,
        "nodes": total_nodes,
        "edges": total_edges,
        "cypherStatements": total_statements,
        "cypherExecuted": executed,
        "cypherErrors": len(errors),
        "errorsPreview": errors[:5],
    }
