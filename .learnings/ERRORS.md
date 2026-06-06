# Errors

Command failures and integration errors.

---

## Backend plugin unit tests can fail on import when Neo4j env is missing

### Error
```text
RuntimeError: NEO4J_PASSWORD is required for graph retrieval.
```

### Context
- Importing `dra_ma.tools.graph_analytics_tools` pulls `dra_ma.tools.__init__`, which imports entity resolver and initializes `Neo4jClient.from_env()`.
- This can happen even for pure plugin tests that do not actually query Neo4j.

### Suggested Fix
Set temporary test-only Neo4j environment variables before importing these modules, or refactor package imports to avoid eager database initialization.

### Metadata
- Reproducible: yes
- Related Files: `backend/dra_ma/tools/__init__.py`, `backend/core/database.py`

---
## [ERR-20260604-001] resolver_direct_script_missing_neo4j_env

**Logged**: 2026-06-04T18:30:00+08:00
**Priority**: low
**Status**: resolved
**Area**: backend-test

### Summary
Running `dra_ma.tools.entity_resolver.EntityResolver` directly with ad hoc Python can fail outside the backend service process because Neo4j connection environment variables are not loaded in that shell.

### Error
```text
RuntimeError: NEO4J_PASSWORD is required for graph retrieval.
```

### Context
- API tests against the running service can pass because the service process already has the required graph database environment.
- Direct resolver smoke tests should either load the same backend environment or use REST endpoints such as `/api/v1/entities/search` and `/api/v1/entities/aliases`.

### Metadata
- Reproducible: yes
- Related Files: backend/dra_ma/tools/entity_resolver.py, backend/api/router.py

---

## [ERR-20260529-001] portability — hardcoded chromedriver paths

**Logged**: 2026-05-29T10:00:00Z
**Priority**: critical
**Status**: pending
**Area**: backend

### Summary
Chromedriver paths are hardcoded to `D:\chromedriver-win64\` in 5+ files, causing immediate crash on any machine other than the original developer's Windows workstation.

### Error
```
File "backend/data_collection/scrapers/utils.py", line 37
    exe_path = os.path.join("D:", os.sep, "chromedriver-win64-148", "chromedriver.exe")
```
And:
- `utils.py:38`: `D:\chromedriver-win64\chromedriver.exe`
- `utils.py:39`: `D:\chromedriver-win64\chromedriver-win64\chromedriver.exe`
- `utils.py:115-116`: Same paths repeated in error message helper
- `test_sse_live.py:11,13,15`: Three hardcoded test paths
- `test_szse_download.py:10`, `test_download.py:10`: Hardcoded test paths

Note: `_chrome_driver_path()` does check `CHROMEDRIVER_PATH` env var first (line 32), which is correct — but the fallback chains to these hardcoded paths instead of raising a clear error.

### Context
- All paths assume Windows with D: drive
- All paths assume specific chromedriver version directories
- Non-Windows developers (macOS/Linux) have zero chance of these paths working
- Setting `CRAWL_DEMO_MODE=true` is a workaround but undocumented

### Suggested Fix
1. Remove all hardcoded fallback paths
2. Check `CHROMEDRIVER_PATH` env var only — raise clear error if unset
3. Document `CRAWL_DEMO_MODE=true` as a no-WebDriver alternative
4. Fix test files to use env var or `conftest.py` fixture

### Metadata
- Reproducible: yes
- Related Files: backend/data_collection/scrapers/utils.py:37-39,115-116, backend/tests/test_sse_live.py:11-15, backend/tests/test_szse_download.py:10, backend/tests/test_download.py:10
- See Also: LRN-20260529-001
- Tags: hardcoded-path, windows-only, chromedriver, portability

---

## [ERR-20260527-001] Community subgraph — edges silently truncated

**Logged**: 2026-05-27T15:00:00Z
**Priority**: critical
**Status**: resolved
**Area**: backend

### Summary
The edges query in `get_community_subgraph` used the same `$limit` parameter as the nodes query, silently dropping edges when a community had more internal edges than the limit.

### Error
- `loadFullGraph` called `getCommunityGraph(id, layer, 100)` 
- Nodes were capped at 100 (from up to 500 member_ids)
- Edges were ALSO capped at 100 by `LIMIT $limit`
- Communities with dense internal connections (e.g., 50 nodes, 200+ edges) lost ~50% of edges
- No warning or error surfaced to the user

### Context
- The `limit` parameter was reused for both nodes and edges queries
- Frontend passed `limit=100` for full graph loading
- `member_ids` stores up to 500 IDs but nodes were capped at the frontend limit

### Fix
1. Removed `LIMIT` from edges query — edges are naturally bounded by `|nodes|²`
2. Increased `loadFullGraph` limit from 100 → 500 to match `member_ids` capacity
3. Removed unnecessary `src`/`tgt` projections from edge query

### Metadata
- Reproducible: yes
- Related Files: backend/kg_query/analytics/graph_analytics.py:612-625, frontend/src/pages/CommunityDiscovery/index.tsx:50-53
- See Also: LRN-20260527-002

### Resolution
- **Resolved**: 2026-05-27T15:00:00Z
- **Notes**: Edge query now has no LIMIT. Node limit raised to 500 to match member_ids size. Frontend passes limit=500.
## [ERR-20260603-001] skillhub_windows_encoding

**Logged**: 2026-06-03T14:05:00+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
`skillhub install` on Windows can successfully install a skill but still exit non-zero when printing the success checkmark under GBK console encoding.

### Error
```text
UnicodeEncodeError: 'gbk' codec can't encode character '\u2713'
```

### Context
- Command attempted: batch `skillhub --skip-self-upgrade install --dir backend\dra_ma\skills <slug>`.
- Most skills were downloaded and extracted despite the non-zero exit.
- One later install also failed due remote SSL EOF, so verify target directories after batch installs.

### Suggested Fix
Set `$env:PYTHONIOENCODING='utf-8'` before SkillHub commands and verify installed directories with `Get-ChildItem backend\dra_ma\skills`.

### Metadata
- Reproducible: yes
- Related Files: backend/dra_ma/skills

---
