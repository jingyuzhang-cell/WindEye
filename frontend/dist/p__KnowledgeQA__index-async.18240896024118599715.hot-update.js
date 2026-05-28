globalThis.makoModuleHotUpdate('p__KnowledgeQA__index', {
    modules: {
        "src/pages/KnowledgeQA/api/agent.ts": function(module, exports, __mako_require__) {
            "use strict";
            __mako_require__.d(exports, "__esModule", {
                value: true
            });
            function _export(target, all) {
                for(var name in all)Object.defineProperty(target, name, {
                    enumerable: true,
                    get: all[name]
                });
            }
            __mako_require__.e(exports, {
                healthCheck: function() {
                    return healthCheck;
                },
                sendChat: function() {
                    return sendChat;
                },
                sendChatStream: function() {
                    return sendChatStream;
                },
                sendRiskStream: function() {
                    return sendRiskStream;
                }
            });
            var _interop_require_default = __mako_require__("@swc/helpers/_/_interop_require_default");
            var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
            var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
            var _axios = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/axios/index.js"));
            var prevRefreshReg;
            var prevRefreshSig;
            prevRefreshReg = self.$RefreshReg$;
            prevRefreshSig = self.$RefreshSig$;
            self.$RefreshReg$ = (type, id)=>{
                _reactrefresh.register(type, module.id + id);
            };
            self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
            const client = _axios.default.create({
                baseURL: '/api/v1',
                timeout: 120000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const sendChat = async (req)=>{
                const resp = await client.post('/chat/recommend', req);
                return resp.data;
            };
            const sendChatStream = (req, callbacks)=>{
                const params = new URLSearchParams({
                    query: req.query,
                    history: JSON.stringify(req.history),
                    sessionId: req.sessionId,
                    roundId: String(req.roundId)
                });
                let retryCount = 0;
                const maxRetries = 3;
                let es = null;
                let doneFired = false;
                let aborted = false;
                const connect = ()=>{
                    if (aborted) return;
                    es = new EventSource(`/api/v1/chat/recommend-stream?${params.toString()}`);
                    es.addEventListener('stage', (e)=>{
                        try {
                            const data = JSON.parse(e.data);
                            if (callbacks.onStage) {
                                // New structured format with machine-readable stage_id
                                if (data.stage_id) callbacks.onStage({
                                    stage_id: data.stage_id,
                                    stage_name: data.stage_name || '',
                                    stage_index: data.stage_index ?? 0,
                                    total_stages: data.total_stages ?? 5,
                                    agent: data.agent || '',
                                    agent_action: data.agent_action || '',
                                    progress: data.progress ?? 0,
                                    timestamp: data.timestamp || Date.now(),
                                    status: data.progress !== undefined && data.progress >= 1.0 ? 'done' : 'running',
                                    trace: data.trace
                                });
                                else if (data.content) // Backward-compat: old string-format stages
                                callbacks.onStage(data.content);
                            }
                        } catch (err) {
                            console.error('[SSE] stage parse error:', err);
                        }
                    });
                    es.addEventListener('cards', (e)=>{
                        try {
                            callbacks.onCards(JSON.parse(e.data));
                        } catch (err) {
                            console.error('[SSE] cards parse error:', err);
                            callbacks.onError('Failed to parse cards event');
                        }
                    });
                    es.addEventListener('graph', (e)=>{
                        try {
                            callbacks.onGraph(JSON.parse(e.data));
                        } catch (err) {
                            console.error('[SSE] graph parse error:', err);
                            callbacks.onError('Failed to parse graph event');
                        }
                    });
                    es.addEventListener('review', (e)=>{
                        try {
                            callbacks.onReview(JSON.parse(e.data));
                        } catch (err) {
                            console.error('[SSE] review parse error:', err);
                            callbacks.onError('Failed to parse review event');
                        }
                    });
                    es.addEventListener('done', ()=>{
                        doneFired = true;
                        callbacks.onDone();
                        es === null || es === void 0 || es.close();
                    });
                    es.addEventListener('error', (e)=>{
                        try {
                            const data = JSON.parse(e.data);
                            callbacks.onError(data.error || 'Server analysis error');
                        } catch  {
                            callbacks.onError('Server analysis error');
                        }
                        doneFired = true;
                        es === null || es === void 0 || es.close();
                    });
                    es.onerror = ()=>{
                        if (doneFired || aborted) {
                            es === null || es === void 0 || es.close();
                            return;
                        }
                        retryCount++;
                        es === null || es === void 0 || es.close();
                        if (retryCount < maxRetries) {
                            const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 8000);
                            console.warn(`[SSE] Connection lost, retrying in ${delay}ms (${retryCount}/${maxRetries})...`);
                            setTimeout(connect, delay);
                        } else {
                            console.error(`[SSE] Max retries (${maxRetries}) reached`);
                            callbacks.onError('连接失败，请重试');
                        }
                    };
                };
                connect();
                return ()=>{
                    aborted = true;
                    es === null || es === void 0 || es.close();
                };
            };
            const sendRiskStream = (req, callbacks)=>{
                const params = new URLSearchParams({
                    query: req.query,
                    sessionId: req.sessionId,
                    roundId: String(req.roundId)
                });
                if (req.communityId !== undefined) params.set('communityId', String(req.communityId));
                if (req.maxHop !== undefined) params.set('maxHop', String(req.maxHop));
                let retryCount = 0;
                const maxRetries = 3;
                let aborted = false;
                let doneFired = false;
                let abortController = null;
                const connect = async ()=>{
                    if (aborted) return;
                    abortController = new AbortController();
                    try {
                        var _resp_body;
                        const resp = await fetch(`/api/v1/chat/risk-stream?${params.toString()}`, {
                            signal: abortController.signal
                        });
                        if (!resp.ok) throw new Error(`Risk stream failed: ${resp.status}`);
                        const reader = (_resp_body = resp.body) === null || _resp_body === void 0 ? void 0 : _resp_body.getReader();
                        if (!reader) throw new Error('No reader available');
                        const decoder = new TextDecoder();
                        let buffer = '';
                        let pendingEvent = null;
                        while(true){
                            const { done, value } = await reader.read();
                            if (done) break;
                            buffer += decoder.decode(value, {
                                stream: true
                            });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() ?? '';
                            for (const line of lines){
                                const trimmed = line.trim();
                                if (!trimmed) continue;
                                if (trimmed.startsWith('event:')) pendingEvent = trimmed.slice(6).trim();
                                else if (trimmed.startsWith('data:')) {
                                    const raw = trimmed.slice(5).trim();
                                    const ev = pendingEvent;
                                    pendingEvent = null;
                                    if (!ev || !raw) continue;
                                    try {
                                        if (ev === 'stage') {
                                            var _callbacks_onStage;
                                            const { stage, content } = JSON.parse(raw);
                                            (_callbacks_onStage = callbacks.onStage) === null || _callbacks_onStage === void 0 || _callbacks_onStage.call(callbacks, stage, content);
                                        } else if (ev === 'entity_stats') {
                                            var _callbacks_onEntityStats;
                                            (_callbacks_onEntityStats = callbacks.onEntityStats) === null || _callbacks_onEntityStats === void 0 || _callbacks_onEntityStats.call(callbacks, JSON.parse(raw));
                                        } else if (ev === 'community') {
                                            var _callbacks_onCommunity;
                                            (_callbacks_onCommunity = callbacks.onCommunity) === null || _callbacks_onCommunity === void 0 || _callbacks_onCommunity.call(callbacks, JSON.parse(raw));
                                        } else if (ev === 'risk_paths') {
                                            var _callbacks_onRiskPaths;
                                            (_callbacks_onRiskPaths = callbacks.onRiskPaths) === null || _callbacks_onRiskPaths === void 0 || _callbacks_onRiskPaths.call(callbacks, JSON.parse(raw));
                                        } else if (ev === 'subgraph') {
                                            var _callbacks_onSubgraph;
                                            (_callbacks_onSubgraph = callbacks.onSubgraph) === null || _callbacks_onSubgraph === void 0 || _callbacks_onSubgraph.call(callbacks, JSON.parse(raw));
                                        } else if (ev === 'report') {
                                            var _callbacks_onReport;
                                            doneFired = true;
                                            (_callbacks_onReport = callbacks.onReport) === null || _callbacks_onReport === void 0 || _callbacks_onReport.call(callbacks, JSON.parse(raw));
                                        } else if (ev === 'done') {
                                            var _callbacks_onDone;
                                            if (!doneFired) (_callbacks_onDone = callbacks.onDone) === null || _callbacks_onDone === void 0 || _callbacks_onDone.call(callbacks);
                                        } else if (ev === 'error') {
                                            var _callbacks_onError;
                                            const { error } = JSON.parse(raw);
                                            (_callbacks_onError = callbacks.onError) === null || _callbacks_onError === void 0 || _callbacks_onError.call(callbacks, error || 'Risk analysis error');
                                        }
                                    } catch (parseErr) {
                                        console.error('[RiskSSE] parse error:', parseErr, raw);
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        if (err.name === 'AbortError') return;
                        retryCount++;
                        if (retryCount < maxRetries && !aborted) {
                            const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 8000);
                            console.warn(`[RiskSSE] Retrying in ${delay}ms (${retryCount}/${maxRetries})...`);
                            await new Promise((r)=>setTimeout(r, delay));
                            connect();
                        } else {
                            var _callbacks_onError1;
                            (_callbacks_onError1 = callbacks.onError) === null || _callbacks_onError1 === void 0 || _callbacks_onError1.call(callbacks, err.message || 'Risk analysis connection failed');
                        }
                    }
                };
                connect();
                return ()=>{
                    aborted = true;
                    abortController === null || abortController === void 0 || abortController.abort();
                };
            };
            const healthCheck = async ()=>{
                try {
                    const resp = await _axios.default.get('/health', {
                        timeout: 5000
                    });
                    return resp.status === 200;
                } catch  {
                    return false;
                }
            };
            if (prevRefreshReg) self.$RefreshReg$ = prevRefreshReg;
            if (prevRefreshSig) self.$RefreshSig$ = prevRefreshSig;
            function registerClassComponent(filename, moduleExports) {
                for(const key in moduleExports)try {
                    if (key === "__esModule") continue;
                    const exportValue = moduleExports[key];
                    if (_reactrefresh.isLikelyComponentType(exportValue) && exportValue.prototype && exportValue.prototype.isReactComponent) _reactrefresh.register(exportValue, filename + " " + key);
                } catch (e) {}
            }
            function $RefreshIsReactComponentLike$(moduleExports) {
                if (_reactrefresh.isLikelyComponentType(moduleExports || moduleExports.default)) return true;
                for(var key in moduleExports)try {
                    if (_reactrefresh.isLikelyComponentType(moduleExports[key])) return true;
                } catch (e) {}
                return false;
            }
            registerClassComponent(module.id, module.exports);
            if ($RefreshIsReactComponentLike$(module.exports)) {
                module.meta.hot.accept();
                _reactrefresh.performReactRefresh();
            }
        }
    }
}, function(runtime) {
    runtime._h = '4261748073140381259';
    runtime.updateEnsure2Map({
        "node_modules/@antv/g6/es/index.js": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__CommunityDiscovery__index"
        ],
        "src/.umi/core/EmptyRoute.tsx": [
            "src/.umi/core/EmptyRoute.tsx"
        ],
        "src/.umi/plugin-layout/Layout.tsx": [
            "vendors_2",
            "src/.umi/plugin-layout/Layout.tsx"
        ],
        "src/.umi/plugin-openapi/openapi.tsx": [
            "vendors_2",
            "vendors_0",
            "src/.umi/plugin-openapi/openapi.tsx"
        ],
        "src/pages/404.tsx": [
            "p__404"
        ],
        "src/pages/CommunityDiscovery/index.tsx": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__CommunityDiscovery__index"
        ],
        "src/pages/EventPage.tsx": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__EventPage"
        ],
        "src/pages/FeaturePage.tsx": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__FeaturePage"
        ],
        "src/pages/GeneralPage.tsx": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__GeneralPage"
        ],
        "src/pages/KnowledgeBuild/index.tsx": [
            "common",
            "vendors_0",
            "p__KnowledgeBuild__index"
        ],
        "src/pages/KnowledgeQA/api/agent.ts": [
            "vendors_2",
            "vendors_0",
            "vendors_1",
            "p__KnowledgeQA__index"
        ],
        "src/pages/KnowledgeQA/index.tsx": [
            "vendors_2",
            "vendors_0",
            "vendors_1",
            "p__KnowledgeQA__index"
        ],
        "src/pages/RegulationPage.tsx": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__RegulationPage"
        ],
        "src/pages/SubjectPage.tsx": [
            "vendors_2",
            "common",
            "vendors_1",
            "p__SubjectPage"
        ],
        "src/pages/Welcome.tsx": [
            "vendors_0",
            "vendors_1",
            "p__Welcome"
        ],
        "src/pages/user/login/index.tsx": [
            "p__user__login__index"
        ]
    });
    ;
});

//# sourceMappingURL=p__KnowledgeQA__index-async.18240896024118599715.hot-update.js.map