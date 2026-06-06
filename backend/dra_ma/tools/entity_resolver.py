"""Entity Resolution — resolve raw entity mentions to canonical KG node IDs.

Lightweight tool module (NOT an agent). Runs after IntentAgent, before DRAEngine.
Strategies tried in order, stopping on first match >= threshold:
  1. EXACT    — name = raw_entity
  2. ALIAS    — name_list / alias property contains raw_entity
  3. CONTAINS — canonical_name CONTAINS raw_entity or vice versa
  4. FUZZY    — multi-property OR search (name / COMPANY_NM / PERSON_NM / zh_name)
  5. LLM_FALLBACK — LLM inference (optional, disabled by default)
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from dra_ma.agents.layer3_execution.cypher_utils import db_client, call_llm
from dra_ma.utils.agent_trace import agent_trace

logger = logging.getLogger(__name__)

EXACT_THRESHOLD = 0.95
CONTAINS_THRESHOLD = 0.80
FUZZY_THRESHOLD = 0.60


@dataclass
class ResolvedEntity:
    raw: str
    canonical_name: str | None = None
    kg_node_id: str | None = None
    match_type: str = "unresolved"  # exact | alias | contains | fuzzy | llm_fallback | unresolved
    match_score: float = 0.0
    confidence: float = 0.0


@dataclass
class EntityCandidate:
    raw: str
    canonical_name: str
    kg_node_id: str
    entity_type: str = "UNKNOWN"
    labels: list[str] = field(default_factory=list)
    match_type: str = "candidate"
    match_score: float = 0.0
    confidence: float = 0.0
    reason: str = ""


class EntityResolver:
    """Resolve raw entity mentions to canonical KG node IDs.

    Usage:
        resolver = EntityResolver()
        results = await resolver.resolve(["鑫达投资", "张明远"])
    """

    def __init__(self, enable_llm_fallback: bool = False):
        self.enable_llm_fallback = enable_llm_fallback

    async def resolve(self, raw_entities: list[str]) -> list[ResolvedEntity]:
        """Resolve a list of raw entity strings to canonical KG nodes."""
        agent_trace("EntityResolver", "START", raw_entities=raw_entities)
        results: list[ResolvedEntity] = []
        for raw in raw_entities:
            if not raw or not raw.strip():
                results.append(ResolvedEntity(raw=raw))
                continue
            resolved = await self._resolve_one(raw.strip())
            results.append(resolved)
        resolved_count = sum(1 for r in results if r.kg_node_id)
        logger.info(
            "[EntityResolver] Resolved %d/%d entities", resolved_count, len(results)
        )
        agent_trace("EntityResolver", "DONE",
                    resolved=resolved_count,
                    total=len(results),
                    unresolved=[r.raw for r in results if not r.kg_node_id])
        return results

    async def search_candidates(
        self,
        raw: str,
        limit: int = 8,
        preferred_type: str | None = None,
    ) -> list[EntityCandidate]:
        """Return ranked KG candidates for user confirmation.

        This is intentionally non-terminal: normal resolution can keep its current
        behavior, while UI flows can use candidate lists for ambiguous short names.
        """
        raw = (raw or "").strip()
        if not raw:
            return []

        rows = await self._candidate_rows(raw, limit=max(limit * 4, 20))
        scored: list[EntityCandidate] = []
        seen: set[str] = set()

        for row in rows:
            candidate = self._score_candidate(raw, row, preferred_type=preferred_type)
            if not candidate or not candidate.kg_node_id:
                continue
            if candidate.kg_node_id in seen:
                continue
            seen.add(candidate.kg_node_id)
            scored.append(candidate)

        scored.sort(key=lambda item: (item.match_score, item.confidence), reverse=True)
        return scored[: max(1, limit)]

    async def save_alias(
        self,
        alias: str,
        canonical_name: str,
        kg_node_id: str | None = None,
        entity_type: str | None = None,
        source: str = "user_confirmed",
    ) -> dict[str, Any]:
        """Persist a user-confirmed alias and attach it to the canonical node."""
        alias = (alias or "").strip()
        canonical_name = (canonical_name or "").strip()
        if not alias or not canonical_name:
            raise ValueError("alias and canonical_name are required")

        normalized = self._normalize_alias(alias)
        cypher = """
        MERGE (a:EntityAlias {normalized_alias: $normalized_alias})
        SET a.alias = $alias,
            a.canonical_name = $canonical_name,
            a.kg_node_id = $kg_node_id,
            a.entity_type = $entity_type,
            a.source = $source,
            a.updated_at = datetime(),
            a.created_at = coalesce(a.created_at, datetime())
        WITH a
        OPTIONAL MATCH (n)
        WHERE ($kg_node_id <> '' AND elementId(n) = $kg_node_id)
           OR n.name = $canonical_name
           OR n.COMPANY_NM = $canonical_name
           OR n.PERSON_NM = $canonical_name
           OR n.title = $canonical_name
        WITH a, n
        FOREACH (_ IN CASE WHEN n IS NULL THEN [] ELSE [1] END |
          SET n.aliases = CASE
            WHEN n.aliases IS NULL THEN [$alias]
            WHEN $alias IN n.aliases THEN n.aliases
            ELSE n.aliases + $alias
          END
        )
        RETURN a.alias AS alias,
               a.canonical_name AS canonical_name,
               a.kg_node_id AS kg_node_id,
               a.entity_type AS entity_type
        LIMIT 1
        """
        rows = db_client.execute_read(
            cypher,
            {
                "alias": alias,
                "normalized_alias": normalized,
                "canonical_name": canonical_name,
                "kg_node_id": kg_node_id or "",
                "entity_type": entity_type or "",
                "source": source,
            },
            timeout_seconds=5.0,
        )
        return rows[0] if rows else {
            "alias": alias,
            "canonical_name": canonical_name,
            "kg_node_id": kg_node_id or "",
            "entity_type": entity_type or "",
        }

    async def _resolve_one(self, raw: str) -> ResolvedEntity:
        """Try resolution strategies in order for a single entity."""
        # Strategy 1: EXACT match
        agent_trace("EntityResolver", "TRY", entity=raw, strategy="exact")
        result = await self._try_exact(raw)
        if result.kg_node_id and result.match_score >= EXACT_THRESHOLD:
            agent_trace("EntityResolver", "HIT", entity=raw, strategy="exact",
                        canonical=result.canonical_name, kg_node_id=result.kg_node_id, confidence=result.confidence)
            return result

        # Strategy 2: ALIAS match
        agent_trace("EntityResolver", "TRY", entity=raw, strategy="alias")
        result = await self._try_alias(raw)
        if result.kg_node_id and result.match_score >= EXACT_THRESHOLD:
            agent_trace("EntityResolver", "HIT", entity=raw, strategy="alias",
                        canonical=result.canonical_name, kg_node_id=result.kg_node_id, confidence=result.confidence)
            return result

        # Strategy 3: CONTAINS match
        agent_trace("EntityResolver", "TRY", entity=raw, strategy="contains")
        result = await self._try_contains(raw)
        if result.kg_node_id and result.match_score >= CONTAINS_THRESHOLD:
            agent_trace("EntityResolver", "HIT", entity=raw, strategy="contains",
                        canonical=result.canonical_name, kg_node_id=result.kg_node_id, confidence=result.confidence)
            return result

        # Strategy 4: FUZZY multi-property OR search
        agent_trace("EntityResolver", "TRY", entity=raw, strategy="fuzzy")
        result = await self._try_fuzzy(raw)
        if result.kg_node_id and result.match_score >= FUZZY_THRESHOLD:
            agent_trace("EntityResolver", "HIT", entity=raw, strategy="fuzzy",
                        canonical=result.canonical_name, kg_node_id=result.kg_node_id, confidence=result.confidence)
            return result

        # Strategy 5: LLM fallback (optional)
        if self.enable_llm_fallback:
            agent_trace("EntityResolver", "TRY", entity=raw, strategy="llm_fallback")
            result = await self._try_llm(raw)
            if result.kg_node_id:
                agent_trace("EntityResolver", "HIT", entity=raw, strategy="llm_fallback",
                            canonical=result.canonical_name, kg_node_id=result.kg_node_id, confidence=result.confidence)
                return result

        return ResolvedEntity(raw=raw)

    # ── Strategy implementations ───────────────────────────────────

    async def _try_exact(self, raw: str) -> ResolvedEntity:
        """Exact match on name property."""
        escaped = raw.replace("'", "\\'")
        cypher = f"""
        MATCH (n)
        WHERE n.name = '{escaped}' OR n.COMPANY_NM = '{escaped}'
           OR n.PERSON_NM = '{escaped}' OR n.title = '{escaped}'
        RETURN n, labels(n) AS labels, elementId(n) AS elem_id LIMIT 1
        """
        try:
            rows = db_client.execute_read(cypher)
            if rows:
                return self._build_result(raw, rows[0], "exact", 1.0, 0.99)
        except Exception as exc:
            logger.debug("[EntityResolver] EXACT query failed: %s", exc)
        return ResolvedEntity(raw=raw)

    async def _try_alias(self, raw: str) -> ResolvedEntity:
        """Search name_list or alias properties."""
        escaped = raw.replace("'", "\\'")
        normalized = self._normalize_alias(raw).replace("'", "\\'")
        cypher = f"""
        OPTIONAL MATCH (a:EntityAlias)
        WHERE a.alias = '{escaped}' OR a.normalized_alias = '{normalized}'
        WITH a
        MATCH (n)
        WHERE '{escaped}' IN n.name_list OR '{escaped}' IN n.aliases
           OR n.alias = '{escaped}'
           OR (a IS NOT NULL AND (
                elementId(n) = a.kg_node_id
                OR n.name = a.canonical_name
                OR n.COMPANY_NM = a.canonical_name
                OR n.PERSON_NM = a.canonical_name
                OR n.title = a.canonical_name
           ))
        RETURN n, labels(n) AS labels, elementId(n) AS elem_id LIMIT 1
        """
        try:
            rows = db_client.execute_read(cypher)
            if rows:
                return self._build_result(raw, rows[0], "alias", 0.95, 0.93)
        except Exception as exc:
            logger.debug("[EntityResolver] ALIAS query failed: %s", exc)
        return ResolvedEntity(raw=raw)

    async def _try_contains(self, raw: str) -> ResolvedEntity:
        """Substring matching: canonical CONTAINS raw or raw CONTAINS canonical."""
        escaped = raw.replace("'", "\\'")
        cypher = f"""
        MATCH (n)
        WHERE n.name CONTAINS '{escaped}' OR n.COMPANY_NM CONTAINS '{escaped}'
           OR n.PERSON_NM CONTAINS '{escaped}' OR n.title CONTAINS '{escaped}'
           OR '{escaped}' CONTAINS n.name
        RETURN n, labels(n) AS labels, elementId(n) AS elem_id LIMIT 5
        """
        try:
            rows = db_client.execute_read(cypher)
            if rows:
                best = self._pick_best_contains(raw, rows)
                if best:
                    return best
        except Exception as exc:
            logger.debug("[EntityResolver] CONTAINS query failed: %s", exc)
        return ResolvedEntity(raw=raw)

    async def _try_fuzzy(self, raw: str) -> ResolvedEntity:
        """Multi-property OR search returning top candidates for scoring."""
        escaped = raw.replace("'", "\\'")
        keywords = self._candidate_keywords(raw)
        keyword_clause = ""
        if keywords:
            parts = []
            for keyword in keywords:
                kw = keyword.replace("'", "\\'")
                parts.append(
                    f"n.name CONTAINS '{kw}' OR n.COMPANY_NM CONTAINS '{kw}' "
                    f"OR n.PERSON_NM CONTAINS '{kw}' OR n.zh_name CONTAINS '{kw}' "
                    f"OR n.title CONTAINS '{kw}'"
                )
            keyword_clause = " OR " + " OR ".join(f"({part})" for part in parts)
        # Use CONTAINS as a broad pre-filter, then score locally
        cypher = f"""
        MATCH (n)
        WHERE n.name CONTAINS '{escaped}' OR n.COMPANY_NM CONTAINS '{escaped}'
           OR n.PERSON_NM CONTAINS '{escaped}' OR n.zh_name CONTAINS '{escaped}'
           OR n.title CONTAINS '{escaped}'
           {keyword_clause}
        RETURN n, labels(n) AS labels, elementId(n) AS elem_id LIMIT 20
        """
        try:
            rows = db_client.execute_read(cypher)
            if rows:
                best = self._pick_best_fuzzy(raw, rows)
                if best and best.match_score >= FUZZY_THRESHOLD:
                    return best
        except Exception as exc:
            logger.debug("[EntityResolver] FUZZY query failed: %s", exc)
        return ResolvedEntity(raw=raw)

    async def _try_llm(self, raw: str) -> ResolvedEntity:
        """LLM fallback for entity disambiguation."""
        try:
            prompt = (
                "你是一个知识图谱实体解析专家。给定一个原始实体名称，"
                "请推断它在金融监管知识图谱中最可能对应的规范实体名称。"
                "如果无法确定，返回 null。\n"
                "输出 JSON: {\"canonical_name\": \"规范名称\" or null, \"confidence\": 0.0-1.0}"
            )
            import json
            raw_text = await call_llm(
                system=prompt,
                user=f"原始实体: {raw}",
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            data = json.loads(raw_text)
            canonical = data.get("canonical_name")
            if canonical:
                # Verify the LLM-suggested name actually exists in KG
                escaped = str(canonical).replace("'", "\\'")
                cypher = f"""
                MATCH (n) WHERE n.name = '{escaped}' OR n.COMPANY_NM = '{escaped}'
                RETURN n, labels(n) AS labels, elementId(n) AS elem_id LIMIT 1
                """
                rows = db_client.execute_read(cypher)
                if rows:
                    llm_conf = float(data.get("confidence", 0.5))
                    return self._build_result(
                        raw, rows[0], "llm_fallback", llm_conf, llm_conf * 0.8
                    )
        except Exception as exc:
            logger.debug("[EntityResolver] LLM fallback failed: %s", exc)
        return ResolvedEntity(raw=raw)

    # ── Scoring helpers ────────────────────────────────────────────

    @staticmethod
    def _build_result(
        raw: str, row: dict, match_type: str, match_score: float, confidence: float,
    ) -> ResolvedEntity:
        """Build a ResolvedEntity from a Neo4j result row."""
        props = EntityResolver._node_props(row.get("n", {}))
        # record.data() strips element_id, so we extract it from the dedicated RETURN field
        node_id = str(row.get("elem_id") or props.get("id") or props.get("element_id") or "")
        canonical = (
            props.get("name")
            or props.get("COMPANY_NM")
            or props.get("PERSON_NM")
            or props.get("title")
            or raw
        )
        return ResolvedEntity(
            raw=raw,
            canonical_name=str(canonical),
            kg_node_id=str(node_id),
            match_type=match_type,
            match_score=match_score,
            confidence=confidence,
        )

    @staticmethod
    def _node_props(node: Any) -> dict:
        if isinstance(node, dict):
            nested = node.get("properties")
            return nested if isinstance(nested, dict) else node
        try:
            return dict(node)
        except Exception:
            return {}

    @staticmethod
    def _infer_entity_type(labels: list[str] | None, props: dict | None = None) -> str:
        labels = labels or []
        upper_labels = {str(label).upper() for label in labels}
        if "COMPANY" in upper_labels or "SUBJECT" in upper_labels:
            return "COMPANY"
        if "PERSON" in upper_labels:
            return "PERSON"
        if "EVENT" in upper_labels:
            return "EVENT"
        props = props or {}
        name = EntityResolver._extract_name(props)
        if EntityResolver._looks_like_company(name, labels):
            return "COMPANY"
        return str(labels[0]) if labels else "UNKNOWN"

    @staticmethod
    def _normalize_alias(value: str) -> str:
        return re.sub(r"\s+", "", str(value or "").strip().lower())

    async def _candidate_rows(self, raw: str, limit: int = 40) -> list[dict]:
        escaped = raw.replace("'", "\\'")
        normalized = self._normalize_alias(raw).replace("'", "\\'")
        keywords = self._candidate_keywords(raw)
        keyword_parts = []
        for keyword in keywords:
            kw = keyword.replace("'", "\\'")
            keyword_parts.append(
                f"n.name CONTAINS '{kw}' OR n.COMPANY_NM CONTAINS '{kw}' "
                f"OR n.PERSON_NM CONTAINS '{kw}' OR n.zh_name CONTAINS '{kw}' "
                f"OR n.title CONTAINS '{kw}'"
            )
        keyword_clause = ""
        if keyword_parts:
            keyword_clause = " OR " + " OR ".join(f"({part})" for part in keyword_parts)
        cypher = f"""
        OPTIONAL MATCH (a:EntityAlias)
        WHERE a.alias CONTAINS '{escaped}'
           OR a.normalized_alias CONTAINS '{normalized}'
           OR '{escaped}' CONTAINS a.alias
        WITH collect(a) AS aliases
        MATCH (n)
        WHERE n.name CONTAINS '{escaped}' OR n.COMPANY_NM CONTAINS '{escaped}'
           OR n.PERSON_NM CONTAINS '{escaped}' OR n.zh_name CONTAINS '{escaped}'
           OR n.title CONTAINS '{escaped}' OR '{escaped}' CONTAINS n.name
           OR '{escaped}' IN n.name_list OR '{escaped}' IN n.aliases OR n.alias = '{escaped}'
           {keyword_clause}
           OR any(a IN aliases WHERE elementId(n) = a.kg_node_id
                 OR n.name = a.canonical_name
                 OR n.COMPANY_NM = a.canonical_name
                 OR n.PERSON_NM = a.canonical_name
                 OR n.title = a.canonical_name)
        RETURN n, labels(n) AS labels, elementId(n) AS elem_id LIMIT {int(limit)}
        """
        try:
            return db_client.execute_read(cypher)
        except Exception as exc:
            logger.debug("[EntityResolver] candidate query failed: %s", exc)
            return []

    @classmethod
    def _score_candidate(
        cls,
        raw: str,
        row: dict,
        preferred_type: str | None = None,
    ) -> EntityCandidate | None:
        props = cls._node_props(row.get("n", {}))
        labels = row.get("labels", []) or []
        name = cls._extract_name(props)
        node_id = str(row.get("elem_id") or props.get("id") or props.get("element_id") or "")
        if not name or not node_id:
            return None

        raw_core = cls._normalize_company_name(raw)
        name_core = cls._normalize_company_name(name)
        raw_chars = set(raw_core or raw)
        name_chars = set(name_core or name)
        overlap = len(raw_chars & name_chars)
        char_score = overlap / max(len(raw_chars | name_chars), 1)

        prefix_score = 0.0
        for size in (6, 5, 4, 3, 2):
            if len(raw_core) >= size and len(name_core) >= size and raw_core[:size] == name_core[:size]:
                prefix_score = max(prefix_score, 0.48 + size * 0.08)
                break

        containment_score = 0.0
        if raw and name and (raw in name or name in raw):
            containment_score = min(len(raw), len(name)) / max(len(raw), len(name))
        if raw_core and name_core and (raw_core in name_core or name_core in raw_core):
            containment_score = max(
                containment_score,
                min(len(raw_core), len(name_core)) / max(len(raw_core), len(name_core)),
            )

        score = max(char_score, prefix_score, containment_score)
        entity_type = cls._infer_entity_type(labels, props)
        if cls._looks_like_company(raw) and entity_type == "COMPANY":
            score += 0.10
        if preferred_type and entity_type.upper() == preferred_type.upper():
            score += 0.08
        score = max(0.0, min(1.0, score))

        reason = "名称包含或前缀相近" if containment_score or prefix_score else "字符相似"
        return EntityCandidate(
            raw=raw,
            canonical_name=str(name),
            kg_node_id=node_id,
            entity_type=entity_type,
            labels=[str(label) for label in labels],
            match_type="candidate",
            match_score=round(score, 4),
            confidence=round(score * 0.9, 4),
            reason=reason,
        )

    @staticmethod
    def _extract_name(props: dict) -> str:
        return str(
            props.get("name")
            or props.get("COMPANY_NM")
            or props.get("PERSON_NM")
            or props.get("zh_name")
            or props.get("title")
            or ""
        )

    @staticmethod
    def _normalize_company_name(name: str) -> str:
        text = str(name or "").strip()
        text = re.sub(r"(股份有限公司|集团有限公司|控股集团有限公司|投资管理有限公司|贸易有限责任公司|金融服务有限公司|有限公司)$", "", text)
        text = re.sub(r"(公司|集团|股份|有限)$", "", text)
        return text

    @staticmethod
    def _looks_like_company(name: str, labels: list[str] | None = None) -> bool:
        label_text = " ".join(labels or []).upper()
        if "COMPANY" in label_text or "SUBJECT" in label_text:
            return True
        return bool(re.search(r"公司|集团|有限|股份|投资|控股|金融服务|证券|银行|基金|资本", str(name or "")))

    @classmethod
    def _candidate_keywords(cls, raw: str) -> list[str]:
        """Generate broad but meaningful candidate keywords for typo/suffix drift.

        Example: 海通金融投资管理有限公司 should still recall 海通金融服务有限公司.
        """
        core = cls._normalize_company_name(raw)
        candidates = []
        if len(core) >= 4:
            candidates.append(core[:4])
        if len(core) >= 3:
            candidates.append(core[:3])
        for match in re.findall(r"[\u4e00-\u9fff]{2,}", core):
            if len(match) >= 4:
                candidates.append(match[:4])
        seen = set()
        result = []
        for item in candidates:
            if item and item not in seen:
                seen.add(item)
                result.append(item)
        return result[:4]

    @classmethod
    def _pick_best_contains(cls, raw: str, rows: list[dict]) -> ResolvedEntity | None:
        """Pick the best CONTAINS match — shortest name that contains raw is best."""
        best = None
        best_len = float("inf")
        for row in rows:
            props = cls._node_props(row.get("n", {}))
            name = cls._extract_name(props)
            if not name:
                continue
            if raw in name or name in raw:
                score = len(raw) / max(len(name), 1)
                if len(name) < best_len and score >= CONTAINS_THRESHOLD:
                    best_len = len(name)
                    best = cls._build_result(raw, row, "contains", score, score * 0.95)
        return best

    @classmethod
    def _pick_best_fuzzy(cls, raw: str, rows: list[dict]) -> ResolvedEntity | None:
        """Score candidates by edit-distance-like character overlap."""
        best = None
        best_score = 0.0
        raw_chars = set(raw)
        raw_core = cls._normalize_company_name(raw)
        raw_is_company = cls._looks_like_company(raw)
        for row in rows:
            props = cls._node_props(row.get("n", {}))
            labels = row.get("labels", []) or []
            name = cls._extract_name(props)
            if not name:
                continue
            name_chars = set(name)
            overlap = len(raw_chars & name_chars)
            char_score = overlap / max(len(raw_chars | name_chars), 1)
            name_core = cls._normalize_company_name(name)
            prefix_score = 0.0
            for size in (6, 5, 4, 3):
                if len(raw_core) >= size and len(name_core) >= size and raw_core[:size] == name_core[:size]:
                    prefix_score = max(prefix_score, 0.50 + size * 0.08)
                    break
            containment_score = 0.0
            if raw_core and name_core and (raw_core in name_core or name_core in raw_core):
                containment_score = min(len(raw_core), len(name_core)) / max(len(raw_core), len(name_core))
            score = max(char_score, prefix_score, containment_score)
            candidate_is_company = cls._looks_like_company(name, labels)
            if raw_is_company and candidate_is_company:
                score += 0.10
            elif raw_is_company and not candidate_is_company:
                score -= 0.18
            score = max(0.0, min(score, 1.0))
            if score > best_score:
                best_score = score
                conf = score * 0.85
                best = cls._build_result(raw, row, "fuzzy", score, conf)
        return best
