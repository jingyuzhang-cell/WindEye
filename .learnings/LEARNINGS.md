# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice


---

## [LRN-20260527-002] best_practice

**Logged**: 2026-05-27T14:00:00Z
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
`_build_community_list` only stored 10 `top_entities` IDs, making `get_community_subgraph` return incomplete subgraphs for communities > 10 nodes.

### Details
The `_build_community_list` method capped entity storage at 10 (`for m in members[:10]`), stored as `top_entities`. The `get_community_subgraph` endpoint used only `top_entities` IDs to fetch nodes, and when a community had more members, it re-ran WCC detection (expensive!) but still only got 10 IDs because `top_entities` was always limited. Communities with more than 10 members would always show incomplete subgraphs.

### Fix
Added a `member_ids` field to the community dict storing up to 500 member element IDs. Updated `get_community_subgraph` to use `member_ids` first, with `top_entities` as fallback. No longer re-runs WCC for the second attempt.

### Metadata
- Source: code_review
- Related Files: backend/kg_query/analytics/graph_analytics.py:516-534,556-637
- Tags: community-detection, subgraph, data-loss

### Resolution
- **Resolved**: 2026-05-27T14:00:00Z
- **Notes**: Added `member_ids` list (up to 500) to community output. `get_community_subgraph` now reads `member_ids` directly instead of re-running detection.

---

## [LRN-20260527-003] correction

**Logged**: 2026-05-27T14:00:00Z
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
RightPanel did not auto-switch to detail tab when a community was selected, requiring manual tab navigation.

### Details
After clicking a community in the list or graph, the right panel stayed on the "群体列表" tab instead of auto-switching to "群体详情" to show the selected community's information. The user had to manually click the detail tab to see stats, core nodes, and risk assessment.

### Fix
Added controlled `activeTab` / `onTabChange` props to RightPanel. The parent component now tracks `rightPanelTab` state. `handleSelectCommunity` sets tab to 'detail', `handleClearSelection` and `handleReset` reset to 'list'.

### Metadata
- Source: code_review
- Related Files: frontend/src/pages/CommunityDiscovery/components/RightPanel.tsx, frontend/src/pages/CommunityDiscovery/index.tsx
- Tags: ux, tab-navigation, community-detail

### Resolution
- **Resolved**: 2026-05-27T14:00:00Z
- **Notes**: RightPanel now accepts `activeTab` and `onTabChange` props. Selection auto-navigates to detail tab.

---

## [LRN-20260527-004] best_practice

**Logged**: 2026-05-27T14:00:00Z
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
`loadFullGraph` loaded community subgraphs sequentially, causing slow load times for the immersive graph view.

### Details
The function looped through up to 10 communities with `await getCommunityGraph(...)` one at a time (`for...of` + `await`). Each call is independent, so this serialized what could be parallel I/O. If each call took 200ms, the total load time was ~2s. With `Promise.all`, the total time is ~200ms (slowest call).

### Fix
Changed to `Promise.all(topCommunities.map(c => getCommunityGraph(...).catch(() => null)))` with per-community error handling. A single failing community no longer blocks the entire graph load.

### Metadata
- Source: code_review
- Related Files: frontend/src/pages/CommunityDiscovery/index.tsx:44-71
- Tags: performance, parallel-loading, graph-data

### Resolution
- **Resolved**: 2026-05-27T14:00:00Z
- **Notes**: Parallelized with Promise.all + per-request catch. Failed communities return null and are skipped.

## [LRN-20260527-001] correction

**Logged**: 2026-05-27T12:00:00Z
**Priority**: critical
**Status**: resolved
**Area**: backend

### Summary
EntityCleaner Layer 2 (`_clean_by_type`) removed all valid entities because IntentAgent's natural-language type names don't match Neo4j's concrete labels.

### Details
IntentAgent outputs `Expected_Answer_Type` values like "organization", "person", "event" — natural language types. The original `_clean_by_type` checked `expected_lower in lbl` (e.g., `"organization" in "company"`), which always failed because Neo4j labels use technical names like "COMPANY", "Subject", "PFUND". This caused all valid entities to be removed (3→0 in the user's test case for "鑫达投资管理有限公司").

### Fix
Added a two-level mapping:
1. `INTENT_TYPE_TO_LAYER`: maps natural-language types (e.g. "organization") to ontology layer keys (e.g. "Subject")
2. `layer_labels` from `ontology_finance.json`: maps layer keys to concrete Neo4j labels (e.g. "Subject" → ["COMPANY", "PERSON", "PFCOMPANY", ...])
3. Type check uses set intersection: `if labels & allowed_labels` — any overlap passes

### Metadata
- Source: user_feedback
- Related Files: backend/dra_ma/skills/consensus/entity_cleaner.py
- Tags: entity-cleaning, type-mapping, ontology

### Resolution
- **Resolved**: 2026-05-27T12:00:00Z
- **Notes**: Changed from substring matching to semantic type mapping with set intersection. Unknown types are now skipped gracefully (keep all) instead of removing all.

## [LRN-20260527-004] best_practice

**Logged**: 2026-05-27T14:00:00Z
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
`loadFullGraph` loaded community subgraphs sequentially, causing slow load times for the immersive graph view.

### Details
The function looped through up to 10 communities with `await getCommunityGraph(...)` one at a time (`for...of` + `await`). Each call is independent, so this serialized what could be parallel I/O. If each call took 200ms, the total load time was ~2s. With `Promise.all`, the total time is ~200ms (slowest call).

### Fix
Changed to `Promise.all(topCommunities.map(c => getCommunityGraph(...).catch(() => null)))` with per-community error handling. A single failing community no longer blocks the entire graph load.

### Metadata
- Source: code_review
- Related Files: frontend/src/pages/CommunityDiscovery/index.tsx:44-71
- Tags: performance, parallel-loading, graph-data

### Resolution
- **Resolved**: 2026-05-27T14:00:00Z
- **Notes**: Parallelized with Promise.all + per-request catch. Failed communities return null and are skipped.

---

## [LRN-20260529-001] insight

**Logged**: 2026-05-29T10:00:00Z
**Priority**: critical
**Status**: pending
**Area**: config

### Summary
WindEye project fails to run on any machine other than the original developer's due to 15 portability issues. Root cause: implicit environment, hardcoded paths, missing documentation.

### Details
A comprehensive portability diagnostic revealed 15 issues blocking new developers:

**Blocker (2):**
1. No `.env.example` — `.env` is gitignored, environment variables are implicit. `Neo4jClient.from_env()` throws `RuntimeError("NEO4J_PASSWORD is required")` on first run.
2. README is unmodified Ant Design Pro template — no WindEye-specific setup instructions.

**Critical (4):**
3. Chromedriver paths hardcoded to `D:\chromedriver-win64\` in 5+ files (utils.py, conftest.py, 3 test files). Fails on any other drive or OS.
4. `requirements.txt` missing `PyMuPDF`, `pdfplumber`, `sentence-transformers`. These are imported at runtime with `try/except SystemExit`.
5. `import_sample_data.py` hardcodes Neo4j password `221221221` in plain text (also a security leak).
6. spaCy model `zh_core_web_sm` requires manual `python -m spacy download` — undocumented, silent fallback to empty results.

**Major (5):**
7. No `docker-compose.yml` for Neo4j infrastructure.
8. `start.ps1` is Windows-only PowerShell, no bash alternative.
9. Inconsistent Neo4j env var naming (`NEO4J_USER` vs `NEO4J_USERNAME`).
10. `KG_DATA_DIR` default resolves to gitignored `data/` directory that doesn't exist.
11. No Node.js version pinning (`.nvmrc` / `.node-version`).

**Minor (4):**
12. Project docs locked inside `.claude/skills/windeye.md` — not human-discoverable.
13. Test proxy still points to Ant Design Pro demo server.
14. `package.json` retains Ant Design Pro metadata.
15. Python deps use only lower bounds (`>=`) with no lock file.

### Suggested Action
Priority order:
1. Create `backend/.env.example` with all required vars + placeholder values, remove from `.gitignore` for `.example` files
2. Rewrite `README.md` with project name, architecture, prerequisites, and step-by-step setup
3. Replace all hardcoded chromedriver paths with `CHROMEDRIVER_PATH` env var only (already partially supported)
4. Create `docker-compose.yml` with Neo4j service
5. Complete `requirements.txt` with all runtime dependencies
6. Add `python -m spacy download zh_core_web_sm` to setup docs

### Metadata
- Source: conversation
- Related Files: backend/.env, backend/config/settings.py, backend/data_collection/scrapers/utils.py, backend/scripts/import_sample_data.py, README.md
- Tags: portability, onboarding, environment, documentation, dev-experience

---

## [LRN-20260527-005] best_practice

**Logged**: 2026-05-27T15:00:00Z
**Priority**: medium
**Status**: resolved
**Area**: frontend

### Summary
Force layout without pre-positioning caused all communities to collapse into a single undifferentiated mass, making it impossible to visually distinguish communities.

### Details
The G6 force layout was initialized with all nodes at (0,0), causing the force simulation to pull everything into one central cluster before slowly separating. This resulted in:
- Communities visually indistinguishable from each other
- Convex hulls overlapping heavily
- Poor visual communication of community structure
- Users couldn't tell which nodes belonged to which community

### Fix
Added community-aware pre-layout before force simulation:
1. Compute community centers arranged in a circle (radius = 32% of viewport)
2. Place each community's nodes in a local circle around their center (radius proportional to community size)
3. Add subtle random jitter to prevent perfect grid alignment
4. Force layout refines from these good initial positions rather than starting from scratch
5. Tuned force parameters: higher gravity (12), lower linkDistance (55), slower alphaDecay (0.006) for gentler convergence

### Metadata
- Source: user_feedback
- Related Files: frontend/src/pages/CommunityDiscovery/hooks/useCommunityGraph.ts:129-143
- Tags: force-layout, community-visualization, pre-layout, g6

### Resolution
- **Resolved**: 2026-05-27T15:00:00Z
- **Notes**: Pre-layout arranges communities in a circle with local node distribution. Force layout gently refines rather than fighting against random initialization.
