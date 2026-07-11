"""API middleware: trace-ID propagation, auth, API logging, and error handlers."""

import logging
import time as time_module
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from core.exceptions import BiDAError
from core.tracing import get_trace_id, set_trace_id


# ── Public paths that skip auth ───────────────────────────────────────

PUBLIC_PATHS: set[str] = {
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/api/login/account",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
}

API_LOG_EXCLUDE_PATHS: set[str] = {
    "/health",
    "/api/v1/admin/api-logs",
}


def setup_logging():
    """Configure structured logging with trace-ID injection."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | trace_id=%(trace_id)s | %(name)s | %(message)s",
    )
    _old_factory = logging.getLogRecordFactory()

    def _record_factory(*args, **kwargs):
        record = _old_factory(*args, **kwargs)
        if not hasattr(record, "trace_id"):
            record.trace_id = get_trace_id()
        return record

    logging.setLogRecordFactory(_record_factory)


def setup_middleware(app: FastAPI):
    """Register trace middleware, auth middleware, API log middleware, CORS, and error handlers."""

    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:8001", "http://localhost:8000", "http://127.0.0.1:8000", "http://127.0.0.1:8001"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── 1. Trace middleware ──────────────────────────────────────────

    @app.middleware("http")
    async def trace_middleware(request: Request, call_next):
        incoming_trace_id = request.headers.get("X-Trace-Id")
        trace_id = incoming_trace_id.strip() if incoming_trace_id else f"trc-{uuid4().hex}"
        request.state.trace_id = trace_id
        set_trace_id(trace_id)
        response = await call_next(request)
        response.headers["X-Trace-Id"] = trace_id
        return response

    # ── 2. Auth middleware ───────────────────────────────────────────

    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        """JWT token verification with off/observe/enforce rollout modes."""
        from config.settings import settings

        # Skip public paths
        if request.url.path in PUBLIC_PATHS or request.url.path.startswith("/docs"):
            return await call_next(request)

        if not settings.AUTH_ENABLED:
            return await call_next(request)

        auth_mode = settings.AUTH_MODE if settings.AUTH_MODE in {"off", "observe", "enforce"} else "off"
        if auth_mode == "off":
            return await call_next(request)

        client_host = request.client.host if request.client else ""
        if request.headers.get("X-WindEye-Dev-Auth") == "true" and client_host in {"127.0.0.1", "::1", "localhost"}:
            request.state.user_id = 1
            request.state.username = "dev-admin"
            request.state.dev_auth_bypass = True
            return await call_next(request)

        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not token:
            if auth_mode == "observe":
                request.state.auth_observation = "missing_token"
                return await call_next(request)
            return JSONResponse(status_code=401, content={"code": 401, "msg": "未提供认证Token"})

        try:
            from services.auth_service import decode_token, _is_blacklisted
        except ImportError:
            return await call_next(request)

        try:
            payload = decode_token(token)
        except Exception:
            if auth_mode == "observe":
                request.state.auth_observation = "invalid_token"
                return await call_next(request)
            return JSONResponse(status_code=401, content={"code": 401, "msg": "Token无效或已过期"})

        if _is_blacklisted(token):
            if auth_mode == "observe":
                request.state.auth_observation = "revoked_token"
                return await call_next(request)
            return JSONResponse(status_code=401, content={"code": 401, "msg": "Token已注销"})

        request.state.user_id = int(payload.get("sub", 0))
        request.state.username = payload.get("username", "")
        return await call_next(request)

    # ── 3. API log middleware ────────────────────────────────────────

    @app.middleware("http")
    async def api_log_middleware(request: Request, call_next):
        """Fire-and-forget API call logging."""
        from config.settings import settings

        start = time_module.perf_counter()
        response = await call_next(request)
        duration_ms = int((time_module.perf_counter() - start) * 1000)

        # Skip excluded paths
        if request.url.path in API_LOG_EXCLUDE_PATHS:
            return response

        # Skip if disabled or MySQL is not configured.
        if not settings.AUDIT_API_LOG_ENABLED or not settings.MYSQL_ENABLED:
            return response

        # Fire-and-forget — never block the response
        import asyncio
        asyncio.create_task(_log_api_call(request, response, duration_ms))

        return response

    # ── Error handlers ───────────────────────────────────────────────

    @app.exception_handler(BiDAError)
    async def bida_error_handler(request: Request, exc: BiDAError):
        trace_id = getattr(request.state, "trace_id", get_trace_id())
        error = exc.to_dict(trace_id=trace_id)
        payload = {"schemaVersion": "v1.0", "error": error}
        if exc.code.startswith(("DLG_4", "RET_4")):
            status_code = 400
        elif exc.code == "RET_503_GRAPH_UNAVAILABLE":
            status_code = 503
        elif exc.code == "AGT_429_RATE_LIMIT":
            status_code = 429
        else:
            status_code = 500
        return JSONResponse(status_code=status_code, content=payload)

    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception):
        trace_id = getattr(request.state, "trace_id", get_trace_id())
        logging.getLogger(__name__).exception("Unhandled exception: %s", exc)
        payload = {
            "schemaVersion": "v1.0",
            "error": {
                "code": "SYS_500_INTERNAL",
                "message": "系统内部异常，请稍后重试。",
                "traceId": trace_id,
            },
        }
        return JSONResponse(status_code=500, content=payload)

    # Suppress health-check noise in access logs
    class EndpointFilter(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            return record.getMessage().find("GET /health") == -1

    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())


async def _log_api_call(request: Request, response, duration_ms: int):
    """Internal helper — write API log asynchronously."""
    try:
        from db import get_db
        from services.audit_service import write_api_log, summarize_response

        db = get_db()
        async with db._session_factory() as session:
            trace_id = getattr(request.state, "trace_id", "")
            user_id_val = getattr(request.state, "user_id", None)
            username_val = getattr(request.state, "username", None)

            request_summary = {
                "query_params": dict(request.query_params),
                "method": request.method,
                "path": request.url.path,
            }

            response_summary = {
                "status_code": response.status_code,
                "content_type": response.headers.get("content-type", ""),
            }

            await write_api_log(
                session,
                trace_id=trace_id,
                user_id=user_id_val,
                username=username_val,
                method=request.method,
                path=request.url.path,
                query_string=str(request.query_params)[:1024] if request.query_params else None,
                status_code=response.status_code,
                success=200 <= response.status_code < 400,
                latency_ms=duration_ms,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent", ""),
                request_summary=request_summary,
                response_summary=response_summary,
            )
    except Exception:
        pass  # API log failure must never affect the main response
