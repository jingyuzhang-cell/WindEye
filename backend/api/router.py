"""API route definitions for BiDA-KG backend."""

import json as _json
import logging
from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Literal

from core.exceptions import BiDAError
from core.models import ApiSuccessResponse, TraceContext
from core.tracing import get_trace_id

router = APIRouter()
_logger = logging.getLogger("api.router")


# ── Risk Analysis request models ──────────────────────────────────

class RiskAnalyzeRequest(BaseModel):
    query: str = Field(..., description="User query or trigger description.")
    focus_entities: list[str] = Field(default_factory=list, description="Entity names to focus on.")
    max_hop: int = Field(default=3, ge=1, le=5, description="Max analysis hop count.")
    trigger_event: str | None = Field(default=None, description="Trigger event type.")


class RiskContinueRequest(BaseModel):
    session_id: str = Field(..., alias="sessionId")
    approved: bool = Field(default=True)
    feedback: str | None = Field(default=None)


class CreateTicketRequest(BaseModel):
    report_id: str = Field(..., alias="reportId")
    assigned_dept: str = Field(default="风控部", alias="assignedDept")


class UpdateTicketRequest(BaseModel):
    status: str | None = None
    action: dict | None = None


class ChatRecommendRequest(BaseModel):
    query: str = Field(..., description="Current user query.")
    history: list[str] = Field(default_factory=list, description="Conversation history.")
    session_id: str = Field(default_factory=lambda: f"sess-{uuid4().hex[:10]}", alias="sessionId")
    round_id: int = Field(default=1, alias="roundId")


class RouteRequest(BaseModel):
    query: str = Field(..., description="User query to route.")


class RouteResponse(BaseModel):
    route: Literal["graph", "analysis", "clarify", "risk"]
    clarify_message: str | None = Field(default=None, description="Clarification question when route=clarify")


class AnalyzeRequest(BaseModel):
    query: str = Field(..., description="Analysis request query.")


def create_routes(app, kg_system, risk_engine=None):
    """Register all API routes on the FastAPI application."""

    # ═══════════════════════════════════════════════════════════════
    # Module B: 知识图谱展示 — Graph visualization routes
    # ═══════════════════════════════════════════════════════════════
    from api.graph_routes import router as graph_router
    app.include_router(graph_router)

    # ═══════════════════════════════════════════════════════════════
    # Module A: 知识图谱构建 — Pipeline management routes
    # ═══════════════════════════════════════════════════════════════
    from api.pipeline_routes import router as pipeline_router
    app.include_router(pipeline_router)

    # ═══════════════════════════════════════════════════════════════
    # Module C: 风险问答 — Chat / Risk analysis / Ticket routes
    # ═══════════════════════════════════════════════════════════════

    @app.get("/health")
    def health(request: Request) -> dict[str, str]:
        return {"status": "ok", "traceId": getattr(request.state, "trace_id", get_trace_id())}

    # ── Auth endpoints (mock) for Ant Design Pro login flow ──────

    class LoginRequest(BaseModel):
        username: str | None = None
        password: str | None = None
        type: str | None = None
        autoLogin: bool | None = None

    @app.post("/api/login/account")
    async def login_account(req: LoginRequest):
        """Mock login — accept any credentials for development."""
        if not req.username or not req.password:
            return {"status": "error", "type": req.type or "account", "currentAuthority": "guest"}
        return {"status": "ok", "type": req.type or "account", "currentAuthority": "admin"}

    @app.get("/api/currentUser")
    async def current_user():
        return {
            "data": {
                "name": "Admin",
                "avatar": "https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png",
                "userid": "00000001",
                "email": "admin@ant.design",
                "signature": "Risk Management Platform Admin",
                "title": "风控分析师",
                "group": "风控平台",
                "notifyCount": 12,
                "unreadCount": 3,
                "country": "China",
                "access": "admin",
                "phone": "138****8888",
            },
            "success": True,
        }

    @app.post("/api/login/outLogin")
    async def out_login():
        return {"data": {}, "success": True}

    # ── DRA-MA KG Q&A routes ──────────────────────────────────────

    @app.post("/api/v1/chat/recommend", response_model=ApiSuccessResponse)
    async def recommend(payload: ChatRecommendRequest, request: Request) -> ApiSuccessResponse:
        trace = TraceContext(
            sessionId=payload.session_id,
            roundId=payload.round_id,
            traceId=getattr(request.state, "trace_id", get_trace_id()),
        )
        result = await kg_system.handle_request(query=payload.query, history=payload.history, trace=trace)
        return ApiSuccessResponse(**result)

    @app.get("/api/v1/graph/expand")
    def expand_graph(id: str, type: str):
        return kg_system.expand_node(node_id=id, node_type=type)

    @app.get("/api/v1/chat/recommend-stream")
    async def recommend_stream(request: Request, query: str = "", history: str = "{}"):
        _logger_sse = logging.getLogger("api.router.sse")

        session_id = request.query_params.get("sessionId", f"sess-{uuid4().hex[:10]}")
        round_id_str = request.query_params.get("roundId", "1")
        try:
            round_id = int(round_id_str)
        except ValueError:
            round_id = 1

        parsed_history: list[str] = []
        try:
            parsed_history = _json.loads(history) or []
        except Exception:
            pass

        async def event_generator():
            trace = TraceContext(
                sessionId=session_id,
                roundId=round_id,
                traceId=getattr(request.state, "trace_id", get_trace_id()),
            )

            try:
                result = None
                async for update in kg_system.handle_request(query=query, history=parsed_history, trace=trace):
                    if "stage" in update:
                        stage_data = update["stage"]
                        if isinstance(stage_data, str):
                            # Backward-compat: old string-format stages
                            yield f"event: stage\ndata: {_json.dumps({'content': stage_data}, ensure_ascii=False)}\n\n"
                        else:
                            # New structured stage format with machine-readable fields
                            yield f"event: stage\ndata: {_json.dumps(stage_data, ensure_ascii=False)}\n\n"
                    elif "output" in update:
                        result = update["output"]

                if not result:
                    raise BiDAError("Recommendation pipeline failed", code="AGT_500_REC_FAILED")

                cards = result.get("data", {}).get("output", {}).get("recommendations", [])
                graph = result.get("data", {}).get("subgraph", {}) or {}
                explanation = result.get("data", {}).get("output", {}).get("overallReasoning", "")

                yield f"event: cards\ndata: {_json.dumps(cards, ensure_ascii=False)}\n\n"
                yield f"event: graph\ndata: {_json.dumps(graph, ensure_ascii=False)}\n\n"

                highlights = [
                    {"itemId": str(card.get("itemId", "")), "highlight": card.get("highlight", "")}
                    for card in cards
                ]

                yield f"event: review\ndata: {_json.dumps({'overall': explanation, 'highlights': highlights, 'explanation': explanation}, ensure_ascii=False)}\n\n"
                yield f"event: done\ndata: {{}}\n\n"

            except Exception as exc:
                _logger_sse.exception("[SSE] Stream error: %s", exc)
                yield f"event: error\ndata: {_json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
                yield f"event: done\ndata: {{}}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Access-Control-Allow-Origin": "*",
            },
        )

    @app.post("/api/v1/chat/route", response_model=RouteResponse)
    async def route_intent(req: RouteRequest) -> RouteResponse:
        query = req.query
        risk_keywords = ["风险", "异常", "传导", "暴雷", "合规", "违规", "监管", "处罚", "事故", "损失"]
        graph_keywords = ["图谱", "查询", "关系", "关联", "路径", "公司", "企业", "人物", "事件", "节点"]
        risk_report_keywords = ["风险报告", "风险分析", "社区风险", "风险社区", "群体风险", "传导分析", "合规报告"]

        has_risk = any(kw in query for kw in risk_keywords)
        has_graph = any(kw in query for kw in graph_keywords)
        has_risk_report = any(kw in query for kw in risk_report_keywords)

        # Risk report queries: explicit risk analysis / community risk intent
        if has_risk_report or (has_risk and not has_graph):
            return RouteResponse(route="risk", clarify_message=None)
        if has_graph or (has_risk and has_graph):
            return RouteResponse(route="graph", clarify_message=None)
        return RouteResponse(
            route="clarify",
            clarify_message="请问您是想查询知识图谱中的实体关系，还是进行风险传导分析？",
        )

    @app.post("/api/v1/chat/analyze", response_class=StreamingResponse)
    async def analyze_risk(req: AnalyzeRequest):
        async def generate():
            try:
                engine = risk_engine
                if engine is None:
                    yield f"event: stage\ndata: {_json.dumps({'content': '风险分析引擎未初始化'}, ensure_ascii=False)}\n\n"
                    yield f"event: done\ndata: {{}}\n\n"
                    return

                async for update in engine.analyze_stream(query=req.query):
                    if "stage" in update:
                        stage_name = update["stage"]
                        content = update.get("content", "")
                        yield f"event: stage\ndata: {_json.dumps({'stage': stage_name, 'content': content}, ensure_ascii=False)}\n\n"
                    elif "output" in update:
                        output = update['output']
                        yield f"event: analysis_text\ndata: {_json.dumps({'chunk': output.get('markdown_report', '')}, ensure_ascii=False)}\n\n"
                        ec = output.get('echarts_config')
                        rd = output.get('raw_data', [])
                        yield f"event: echarts_config\ndata: {_json.dumps(ec, ensure_ascii=False) if ec else 'null'}\n\n"
                        yield f"event: raw_data\ndata: {_json.dumps(rd, ensure_ascii=False)}\n\n"
                        yield f"event: done\ndata: {_json.dumps({'row_count': output.get('subtasks_completed', 0)}, ensure_ascii=False)}\n\n"

            except Exception as exc:
                _logger.exception("[AnalyzeSSE] Stream error: %s", exc)
                yield f"event: error\ndata: {_json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
                yield f"event: done\ndata: {{}}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*"}
        )

    # ── Community-aware Risk Analysis SSE (for KnowledgeQA chat) ──

    async def _match_community_to_query(db, query: str, layer: str | None = None) -> dict | None:
        """Detect communities and return the one most relevant to the query."""
        try:
            from kg_query.analytics.graph_analytics import GraphAnalytics
            analytics = GraphAnalytics(db)
            result = analytics.detect_communities(
                layer=layer, method="louvain", min_community_size=3
            )
            communities = result.get("communities", [])
            if not communities:
                return None

            # Extract keywords from query (simple character-level segmentation)
            query_chars = set(query.replace(" ", ""))
            # Score each community by how many top-entity names overlap with query
            best = None
            best_score = 0
            for comm in communities:
                score = 0
                for ent in comm.get("top_entities", []):
                    name = ent.get("name", "")
                    # Count overlapping characters
                    name_chars = set(name)
                    overlap = len(query_chars & name_chars)
                    score += overlap
                if score > best_score:
                    best_score = score
                    best = comm

            if best and best_score > 0:
                return {
                    "community_id": best["community_id"],
                    "size": best["size"],
                    "top_entities": best["top_entities"],
                }
            return None
        except Exception as exc:
            _logger.warning("[RiskStream] Community matching failed: %s", exc)
            return None

    @app.get("/api/v1/chat/risk-stream")
    async def chat_risk_stream(
        request: Request,
        query: str = "",
        sessionId: str = "",
        roundId: str = "1",
        communityId: str = "",
        maxHop: str = "3",
    ):
        _logger_sse = logging.getLogger("api.router.risk_chat")
        _, _r = sessionId, roundId  # kept for API contract consistency

        try:
            parsed_max_hop = int(maxHop)
        except ValueError:
            parsed_max_hop = 3

        parsed_community_id: int | None = None
        if communityId:
            try:
                parsed_community_id = int(communityId)
            except ValueError:
                pass

        async def event_generator():
            engine = risk_engine
            if engine is None:
                yield f"event: stage\ndata: {_json.dumps({'stage': 'planning', 'content': '风险分析引擎未初始化'}, ensure_ascii=False)}\n\n"
                yield f"event: done\ndata: {{}}\n\n"
                return

            try:
                # Phase A: Community detection & selection (if no explicit community_id)
                focus_entities: list[str] = []
                matched_community: dict | None = None

                if parsed_community_id is not None and hasattr(engine, "_db"):
                    yield f"event: stage\ndata: {_json.dumps({'stage': 'retrieving', 'content': f'获取社区 #{parsed_community_id} 子图...'}, ensure_ascii=False)}\n\n"
                    try:
                        from kg_query.analytics.graph_analytics import GraphAnalytics
                        analytics = GraphAnalytics(engine._db)
                        sub = analytics.get_community_subgraph(parsed_community_id, limit=200)
                        nodes = sub.get("nodes", [])
                        focus_entities = [
                            n.get("name") or n.get("properties", {}).get("name", "")
                            for n in nodes
                            if (n.get("name") or n.get("properties", {}).get("name", ""))
                        ][:20]
                        if nodes:
                            yield f"event: subgraph\ndata: {_json.dumps({'nodes': nodes, 'edges': sub.get('edges', [])}, ensure_ascii=False)}\n\n"
                        yield f"event: community\ndata: {_json.dumps({'community_id': parsed_community_id, 'size': len(nodes), 'top_entities': [{'id': n.get('id',''), 'name': n.get('name','') or n.get('properties',{}).get('name',''), 'label': (n.get('labels') or [''])[0]} for n in nodes[:5]]}, ensure_ascii=False)}\n\n"
                    except Exception as exc:
                        _logger_sse.warning("[RiskStream] Community subgraph fetch failed: %s", exc)

                elif hasattr(engine, "_db"):
                    yield f"event: stage\ndata: {_json.dumps({'stage': 'retrieving', 'content': '检测图谱社区结构...'}, ensure_ascii=False)}\n\n"
                    matched_community = await _match_community_to_query(engine._db, query)
                    if matched_community:
                        yield f"event: community\ndata: {_json.dumps(matched_community, ensure_ascii=False)}\n\n"
                        # Extract focus entities from the matched community's top entities
                        focus_entities = [
                            ent.get("name", "") for ent in matched_community.get("top_entities", [])
                        ]
                        yield f"event: stage\ndata: {_json.dumps({'stage': 'retrieving', 'content': f'匹配到社区 #{matched_community["community_id"]} ({matched_community["size"]} 个节点)，开始风险分析...'}, ensure_ascii=False)}\n\n"

                # Phase B: Run the risk analysis pipeline
                async for update in engine.analyze_stream(
                    query=query,
                    focus_entities=focus_entities,
                    max_hop=parsed_max_hop,
                ):
                    if "stage" in update:
                        stage_name = update["stage"]
                        if stage_name == "subgraph":
                            sub_data = {
                                "nodes": update.get("nodes", []),
                                "edges": update.get("edges", []),
                            }
                            yield f"event: subgraph\ndata: {_json.dumps(sub_data, ensure_ascii=False)}\n\n"
                        else:
                            yield f"event: stage\ndata: {_json.dumps({'stage': stage_name, 'content': update.get('content', '')}, ensure_ascii=False)}\n\n"
                    elif "entity_stats" in update:
                        yield f"event: entity_stats\ndata: {_json.dumps(update['entity_stats'], ensure_ascii=False)}\n\n"
                    elif "community" in update:
                        yield f"event: community\ndata: {_json.dumps(update['community'], ensure_ascii=False)}\n\n"
                    elif "risk_paths" in update:
                        yield f"event: risk_paths\ndata: {_json.dumps(update['risk_paths'], ensure_ascii=False)}\n\n"
                    elif "output" in update:
                        output = update["output"]
                        report_id = _save_report(output, query) or f"RPT-{uuid4().hex[:8].upper()}"
                        output.setdefault("report_id", report_id)
                        output.setdefault("generated_at", __import__("datetime").datetime.now().isoformat())
                        output.setdefault("query_summary", query[:200] if query else "")
                        output.setdefault("legal_basis", [])
                        output.setdefault("penalty_cases", [])
                        yield f"event: report\ndata: {_json.dumps(output, ensure_ascii=False)}\n\n"
                        yield f"event: done\ndata: {{}}\n\n"

            except Exception as exc:
                _logger_sse.exception("[RiskStream] Stream error: %s", exc)
                yield f"event: error\ndata: {_json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
                yield f"event: done\ndata: {{}}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*"},
        )

    # ── Chat history persistence ───────────────────────────────────

    class ChatHistoryRecord(BaseModel):
        session_id: str = Field(..., alias="sessionId")
        role: str = Field(default="user")
        content: str = Field(default="")
        message_id: str = Field(default_factory=lambda: f"msg-{uuid4().hex[:10]}", alias="messageId")

    @app.get("/api/v1/chat/history/{session_id}")
    async def get_chat_history(session_id: str):
        """Retrieve chat history for a session from Neo4j."""
        if risk_engine is None or not hasattr(risk_engine, "_db"):
            return {"success": True, "data": {"messages": [], "session_id": session_id}}
        try:
            db = risk_engine._db
            cypher = """
            MATCH (s:ChatSession {session_id: $sid})-[:CONTAINS]->(m:ChatMessage)
            RETURN m ORDER BY m.timestamp ASC
            """
            rows, _ = db.execute_read_with_summary(cypher, {"sid": session_id})
            messages = []
            for row in rows:
                msg = row.get("m", {})
                props = msg.get("properties", msg) if isinstance(msg, dict) else {}
                messages.append({
                    "id": props.get("message_id", ""),
                    "role": props.get("role", "user"),
                    "content": props.get("content", ""),
                    "timestamp": str(props.get("timestamp", "")),
                })
            return {"success": True, "data": {"messages": messages, "session_id": session_id}}
        except Exception as exc:
            _logger.warning("[ChatHistory] GET failed: %s", exc)
            return {"success": True, "data": {"messages": [], "session_id": session_id}}

    @app.post("/api/v1/chat/history")
    async def save_chat_history(records: list[ChatHistoryRecord]):
        """Store chat messages in Neo4j for server-side session persistence."""
        if risk_engine is None or not hasattr(risk_engine, "_db"):
            return {"success": False, "message": "引擎未初始化"}
        try:
            db = risk_engine._db
            for rec in records:
                cypher = """
                MERGE (s:ChatSession {session_id: $sid})
                CREATE (m:ChatMessage {
                    message_id: $mid,
                    role: $role,
                    content: $content,
                    timestamp: datetime()
                })
                CREATE (s)-[:CONTAINS]->(m)
                """
                db.execute_read(cypher, {
                    "sid": rec.session_id,
                    "mid": rec.message_id,
                    "role": rec.role,
                    "content": rec.content[:2000],
                })
            return {"success": True, "message": f"已保存 {len(records)} 条消息"}
        except Exception as exc:
            _logger.exception("[ChatHistory] POST failed: %s", exc)
            return {"success": False, "message": str(exc)}

    # ── Risk Analysis routes ──────────────────────────────────────

    @app.get("/api/v1/risk/analyze-stream")
    async def risk_analyze_stream(request: Request, query: str = "", focus_entities: str = "[]"):
        _logger_sse = logging.getLogger("api.router.risk")

        try:
            parsed_entities: list[str] = _json.loads(focus_entities) or []
        except Exception:
            parsed_entities = []

        async def event_generator():
            try:
                engine = risk_engine
                if engine is None:
                    yield f"event: stage\ndata: {_json.dumps({'content': '风险分析引擎未初始化'}, ensure_ascii=False)}\n\n"
                    yield f"event: done\ndata: {{}}\n\n"
                    return

                async for update in engine.analyze_stream(
                    query=query,
                    focus_entities=parsed_entities,
                ):
                    if "stage" in update:
                        stage_name = update["stage"]
                        if stage_name == "subgraph":
                            # Emit subgraph data for frontend visualization
                            sub_data = {
                                "nodes": update.get("nodes", []),
                                "edges": update.get("edges", []),
                            }
                            yield f"event: subgraph\ndata: {_json.dumps(sub_data, ensure_ascii=False)}\n\n"
                        else:
                            yield f"event: stage\ndata: {_json.dumps({'stage': stage_name, 'content': update.get('content', '')}, ensure_ascii=False)}\n\n"
                    elif "output" in update:
                        output = update["output"]
                        report_id = _save_report(output, query) or f"RPT-{uuid4().hex[:8].upper()}"
                        output.setdefault("report_id", report_id)
                        output.setdefault("generated_at", __import__("datetime").datetime.now().isoformat())
                        output.setdefault("query_summary", query[:200] if query else "")
                        output.setdefault("legal_basis", [])
                        output.setdefault("penalty_cases", [])
                        yield f"event: report\ndata: {_json.dumps(output, ensure_ascii=False)}\n\n"
                        yield f"event: done\ndata: {{}}\n\n"

            except Exception as exc:
                _logger_sse.exception("[RiskSSE] Stream error: %s", exc)
                yield f"event: error\ndata: {_json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
                yield f"event: done\ndata: {{}}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*"},
        )

    @app.post("/api/v1/risk/analyze")
    async def risk_analyze(req: RiskAnalyzeRequest):
        if risk_engine is None:
            return {"success": False, "message": "风险分析引擎未初始化"}
        result = await risk_engine.analyze(
            query=req.query,
            focus_entities=req.focus_entities,
            max_hop=req.max_hop,
            trigger_event=req.trigger_event,
        )
        return {"success": True, "data": result}

    @app.post("/api/v1/risk/continue")
    async def risk_continue(req: RiskContinueRequest):
        """Store human feedback on a risk report and create an audit log entry."""
        if risk_engine is None or not hasattr(risk_engine, "_db"):
            return {"success": False, "message": "引擎未初始化"}
        try:
            db = risk_engine._db
            log_id = f"LOG-{uuid4().hex[:10].upper()}"
            cypher = """
            MATCH (r:RiskReport {report_id: $session_id})
            SET r.approved = $approved,
                r.feedback = $feedback,
                r.status = $status,
                r.updated_at = datetime()
            WITH r
            CREATE (a:AuditLog {
                log_id: $log_id,
                action_type: 'human_review',
                note: $note,
                created_at: datetime()
            })
            CREATE (a)-[:AUDITS]->(r)
            RETURN r.report_id AS report_id, r.status AS status
            """
            status_str = "approved" if req.approved else "rejected"
            note = f"人工审核: {'通过' if req.approved else '驳回'}。反馈: {req.feedback or '无'}"
            rows, _ = db.execute_read_with_summary(cypher, {
                "session_id": req.session_id,
                "approved": req.approved,
                "feedback": req.feedback or "",
                "status": status_str,
                "log_id": log_id,
                "note": note[:500],
            })
            updated = rows[0] if rows else {}
            return {
                "success": True,
                "message": f"审核{'通过' if req.approved else '驳回'}已记录",
                "sessionId": req.session_id,
                "approved": req.approved,
                "status": updated.get("status", status_str),
            }
        except Exception as exc:
            _logger.exception("[RiskContinue] Failed: %s", exc)
            return {"success": False, "message": str(exc)}

    # ── Ticket CRUD (Neo4j WorkflowTicket nodes) ──────────────────

    @app.post("/api/v1/risk/tickets")
    async def create_ticket(req: CreateTicketRequest):
        """Create a WorkflowTicket node linked to a RiskReport."""
        if risk_engine is None:
            return {"success": False, "message": "引擎未初始化"}
        try:
            ticket_id = f"TKT-{uuid4().hex[:8].upper()}"
            db = risk_engine._db
            cypher = """
            CREATE (t:WorkflowTicket {
                ticket_id: $ticket_id,
                status: 'pending',
                assigned_dept: $dept,
                created_at: datetime(),
                updated_at: datetime()
            })
            WITH t
            OPTIONAL MATCH (r:RiskReport {report_id: $report_id})
            WHERE r IS NOT NULL
            CREATE (t)-[:REFERENCES]->(r)
            RETURN t
            """
            db.execute_read(cypher, {"ticket_id": ticket_id, "dept": req.assigned_dept, "report_id": req.report_id})
            return {"success": True, "data": {"ticket_id": ticket_id, "status": "pending", "assigned_dept": req.assigned_dept}}
        except Exception as exc:
            return {"success": False, "message": str(exc)}

    @app.get("/api/v1/risk/tickets")
    async def list_tickets(status: str = "", page: int = 1, limit: int = 20):
        """List WorkflowTicket nodes with optional status filter."""
        if risk_engine is None:
            return {"success": True, "data": {"tickets": [], "total": 0, "page": page}}
        try:
            db = risk_engine._db
            level_filter = "WHERE t.status = $status" if status else ""
            skip = (page - 1) * limit
            cypher = f"""
            MATCH (t:WorkflowTicket) {level_filter}
            OPTIONAL MATCH (t)-[:REFERENCES]->(r:RiskReport)
            RETURN t, r.report_id AS report_id, r.executive_summary AS report_summary
            ORDER BY t.created_at DESC SKIP $skip LIMIT $limit
            """
            count_cypher = "MATCH (t:WorkflowTicket) RETURN count(t) AS total"
            rows, _ = db.execute_read_with_summary(cypher, {"status": status, "skip": skip, "limit": limit})
            count_rows, _ = db.execute_read_with_summary(count_cypher)
            total = count_rows[0].get("total", 0) if count_rows else 0

            tickets = []
            for row in rows:
                t = row.get("t", {})
                props = t.get("properties", t) if isinstance(t, dict) else {}
                tickets.append({
                    "ticket_id": props.get("ticket_id", ""),
                    "status": props.get("status", "pending"),
                    "assigned_dept": props.get("assigned_dept", ""),
                    "report_id": row.get("report_id", ""),
                    "report_summary": (row.get("report_summary") or "")[:100],
                    "created_at": str(props.get("created_at", "")),
                    "updated_at": str(props.get("updated_at", "")),
                })
            return {"success": True, "data": {"tickets": tickets, "total": total, "page": page}}
        except Exception as exc:
            return {"success": False, "message": str(exc), "data": {"tickets": [], "total": 0, "page": page}}

    @app.patch("/api/v1/risk/tickets/{ticket_id}")
    async def update_ticket(ticket_id: str, req: UpdateTicketRequest):
        """Update WorkflowTicket status and log the action as AuditLog."""
        if risk_engine is None:
            return {"success": False, "message": "引擎未初始化"}
        try:
            db = risk_engine._db
            new_status = req.status or "pending"
            action = req.action or {}
            action_type = action.get("type", "status_change")
            action_note = action.get("note", f"状态更新为 {new_status}")

            cypher = """
            MATCH (t:WorkflowTicket {ticket_id: $ticket_id})
            SET t.status = $status, t.updated_at = datetime()
            WITH t
            CREATE (a:AuditLog {
                log_id: $log_id,
                action_type: $action_type,
                note: $note,
                created_at: datetime()
            })
            CREATE (a)-[:LOGGED_BY]->(t)
            RETURN t
            """
            db.execute_read(cypher, {
                "ticket_id": ticket_id,
                "status": new_status,
                "log_id": f"LOG-{uuid4().hex[:10].upper()}",
                "action_type": action_type,
                "note": action_note,
            })
            return {"success": True, "data": {"ticket_id": ticket_id, "status": new_status}}
        except Exception as exc:
            return {"success": False, "message": str(exc)}

    # ── Report persistence (Neo4j RiskReport nodes) ─────────────────

    def _save_report(output: dict, query: str) -> str | None:
        """Persist analysis result as a RiskReport node in Neo4j. Returns report_id."""
        if risk_engine is None or not hasattr(risk_engine, "_db"):
            return None
        try:
            report_id = f"RPT-{uuid4().hex[:8].upper()}"
            db = risk_engine._db
            cypher = """
            CREATE (r:RiskReport {
                report_id: $report_id,
                query: $query,
                executive_summary: $summary,
                overall_risk_level: $risk_level,
                risk_path_count: $path_count,
                anomaly_count: $anomaly_count,
                compliance_count: $compliance_count,
                node_count: $node_count,
                edge_count: $edge_count,
                created_at: datetime()
            })
            """
            sub = output.get("subgraph_summary", {}) or {}
            db.execute_read(
                cypher,
                {
                    "report_id": report_id,
                    "query": query[:500],
                    "summary": output.get("executive_summary", "")[:500],
                    "risk_level": output.get("overall_risk_level", "medium"),
                    "path_count": len(output.get("risk_paths", [])),
                    "anomaly_count": len(output.get("anomaly_findings", [])),
                    "compliance_count": len(output.get("compliance_matches", [])),
                    "node_count": sub.get("node_count", 0),
                    "edge_count": sub.get("edge_count", 0),
                },
            )
            logger_save = logging.getLogger("api.router.report")
            logger_save.info("Saved report %s to Neo4j", report_id)
            return report_id
        except Exception as exc:
            logger_save = logging.getLogger("api.router.report")
            logger_save.warning("Failed to save report: %s", exc)
            return None

    @app.get("/api/v1/risk/reports")
    async def list_reports(page: int = 1, risk_level: str = "", limit: int = 20):
        """List saved risk reports from Neo4j."""
        if risk_engine is None:
            return {"success": True, "data": {"reports": [], "total": 0, "page": page}}
        try:
            db = risk_engine._db
            level_filter = "WHERE r.overall_risk_level = $risk_level" if risk_level else ""
            skip = (page - 1) * limit
            cypher = f"""
            MATCH (r:RiskReport) {level_filter}
            RETURN r ORDER BY r.created_at DESC SKIP $skip LIMIT $limit
            """
            count_cypher = "MATCH (r:RiskReport) RETURN count(r) AS total"
            rows, _ = db.execute_read_with_summary(cypher, {"risk_level": risk_level, "skip": skip, "limit": limit})
            count_rows, _ = db.execute_read_with_summary(count_cypher)
            total = count_rows[0].get("total", 0) if count_rows else 0

            reports = []
            for row in rows:
                data = row.get("r", {})
                props = data.get("properties", data) if isinstance(data, dict) else {}
                reports.append({
                    "report_id": props.get("report_id", ""),
                    "query": props.get("query", ""),
                    "executive_summary": props.get("executive_summary", "")[:200],
                    "overall_risk_level": props.get("overall_risk_level", "medium"),
                    "risk_path_count": props.get("risk_path_count", 0),
                    "anomaly_count": props.get("anomaly_count", 0),
                    "compliance_count": props.get("compliance_count", 0),
                    "created_at": str(props.get("created_at", "")),
                })
            return {"success": True, "data": {"reports": reports, "total": total, "page": page}}
        except Exception as exc:
            return {"success": False, "message": f"Failed to list reports: {exc}", "data": {"reports": [], "total": 0, "page": page}}

    @app.get("/api/v1/risk/reports/{report_id}")
    async def get_report(report_id: str):
        """Get a single saved report by ID."""
        if risk_engine is None:
            return {"success": False, "message": "引擎未初始化"}
        try:
            db = risk_engine._db
            cypher = "MATCH (r:RiskReport {report_id: $id}) RETURN r"
            rows, _ = db.execute_read_with_summary(cypher, {"id": report_id})
            if not rows:
                return {"success": False, "message": "Report not found"}
            props = rows[0].get("r", {})
            props = props.get("properties", props) if isinstance(props, dict) else {}
            return {"success": True, "data": {
                "report_id": props.get("report_id", ""),
                "query": props.get("query", ""),
                "executive_summary": props.get("executive_summary", ""),
                "overall_risk_level": props.get("overall_risk_level", "medium"),
                "risk_path_count": props.get("risk_path_count", 0),
                "anomaly_count": props.get("anomaly_count", 0),
                "compliance_count": props.get("compliance_count", 0),
                "node_count": props.get("node_count", 0),
                "edge_count": props.get("edge_count", 0),
                "created_at": str(props.get("created_at", "")),
            }}
        except Exception as exc:
            return {"success": False, "message": str(exc)}

    # ── File Upload ───────────────────────────────────────────

    @app.post("/api/v1/chat/upload")
    async def upload_file(request: Request):
        """Upload a text file (.txt/.md/.docx/.pdf) and return extracted text."""
        import os
        import tempfile

        ALLOWED_EXTENSIONS = {'.txt', '.md', '.docx', '.pdf'}
        BLOCKED_EXTENSIONS = {'.exe', '.bat', '.sh', '.com', '.dll', '.js', '.vbs', '.ps1', '.scr', '.msi', '.pif', '.cmd', '.cpl'}
        MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
        MAX_TEXT_LENGTH = 50000

        content_type = request.headers.get("content-type", "")
        if "multipart/form-data" not in content_type:
            return {"success": False, "message": "请求格式错误，需要 multipart/form-data"}

        form = await request.form()
        file = form.get("file")
        if file is None:
            return {"success": False, "message": "未找到上传文件"}

        filename = getattr(file, 'filename', 'unknown')
        ext = os.path.splitext(filename)[1].lower()

        if ext in BLOCKED_EXTENSIONS:
            return {"success": False, "message": f"不支持的文件类型: {ext}"}

        if ext not in ALLOWED_EXTENSIONS:
            return {"success": False, "message": f"不支持的文件格式: {ext}，仅支持 .txt .md .docx .pdf"}

        content = await file.read()

        if len(content) > MAX_FILE_SIZE:
            return {"success": False, "message": "文件过大（最大 10MB），请拆分后重试"}

        # Magic number validation
        if ext == '.pdf' and content[:4] != b'%PDF':
            return {"success": False, "message": "文件内容与扩展名不匹配（非有效 PDF 文件）"}
        if ext == '.docx' and content[:4] != b'PK\x03\x04':
            return {"success": False, "message": "文件内容与扩展名不匹配（非有效 DOCX 文件）"}

        text = ""
        try:
            if ext in ('.txt', '.md'):
                try:
                    text = content.decode('utf-8')
                except UnicodeDecodeError:
                    try:
                        text = content.decode('gbk')
                    except Exception:
                        return {"success": False, "message": "文件编码不支持，请使用 UTF-8 或 GBK 编码"}
            elif ext == '.pdf':
                with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
                    tmp.write(content)
                    tmp_path = tmp.name
                try:
                    from data_collection.file_import.pdf_parser import parse_pdf_hybrid
                    text = parse_pdf_hybrid(tmp_path) or ""
                finally:
                    try:
                        os.unlink(tmp_path)
                    except Exception:
                        pass
            elif ext == '.docx':
                try:
                    from docx import Document
                    import io
                    doc = Document(io.BytesIO(content))
                    text = "\n".join(p.text for p in doc.paragraphs if p.text)
                except ImportError:
                    return {"success": False, "message": "python-docx 未安装，无法解析 .docx 文件"}
                except Exception as e:
                    return {"success": False, "message": f"DOCX 解析失败: {str(e)}"}
        except Exception as e:
            return {"success": False, "message": f"文件解析失败: {str(e)}"}

        if not text or not text.strip():
            return {"success": False, "message": "文件内容为空或无法提取文本"}

        truncated = len(text) > MAX_TEXT_LENGTH
        if truncated:
            text = text[:MAX_TEXT_LENGTH]

        return {
            "success": True,
            "data": {
                "filename": filename,
                "text": text,
                "char_count": len(text),
                "truncated": truncated,
            },
        }

    # ═══════════════════════════════════════════════════════════════
    # End Module C routes
    # ═══════════════════════════════════════════════════════════════
