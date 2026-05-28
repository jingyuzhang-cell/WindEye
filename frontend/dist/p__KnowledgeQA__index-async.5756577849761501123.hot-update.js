globalThis.makoModuleHotUpdate('p__KnowledgeQA__index', {
    modules: {
        "src/pages/KnowledgeQA/store/agentStore.ts": function(module, exports, __mako_require__) {
            "use strict";
            __mako_require__.d(exports, "__esModule", {
                value: true
            });
            __mako_require__.d(exports, "useAgentStore", {
                enumerable: true,
                get: function() {
                    return useAgentStore;
                }
            });
            var _interop_require_default = __mako_require__("@swc/helpers/_/_interop_require_default");
            var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
            var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
            var _zustand = __mako_require__("node_modules/zustand/esm/index.mjs");
            var _axios = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/axios/index.js"));
            var _agent = __mako_require__("src/pages/KnowledgeQA/api/agent.ts");
            var prevRefreshReg;
            var prevRefreshSig;
            prevRefreshReg = self.$RefreshReg$;
            prevRefreshSig = self.$RefreshSig$;
            self.$RefreshReg$ = (type, id)=>{
                _reactrefresh.register(type, module.id + id);
            };
            self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
            const generateSessionId = ()=>`sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const useAgentStore = (0, _zustand.create)((set, get)=>({
                    messages: [],
                    currentSubgraph: null,
                    rewriteResult: null,
                    alignmentFeatures: [],
                    isLoading: false,
                    sessionId: generateSessionId(),
                    roundId: 0,
                    error: null,
                    pendingRecommendations: null,
                    clarifyMessage: null,
                    currentRoute: null,
                    analysisQuery: null,
                    analysisResult: null,
                    activeRightPanel: 'graph',
                    riskReport: null,
                    riskStages: [],
                    riskCommunity: null,
                    sendMessage: async (query, rewrittenQuery)=>{
                        if (get().isLoading) return;
                        const { sessionId, roundId, messages } = get();
                        set({
                            roundId: roundId + 1
                        });
                        const backendQuery = rewrittenQuery || query;
                        const userMsg = {
                            id: `user_${Date.now()}`,
                            role: 'user',
                            content: query,
                            timestamp: Date.now()
                        };
                        const tempId = `asst_${Date.now()}`;
                        const initialThinkingProcess = [];
                        if (rewrittenQuery && rewrittenQuery !== query) initialThinkingProcess.push(`BFF intent recognition: optimized query to "${rewrittenQuery}"`);
                        const assistantMsg = {
                            id: tempId,
                            role: 'assistant',
                            content: '',
                            timestamp: Date.now(),
                            isLoading: true,
                            thinkingProcess: initialThinkingProcess
                        };
                        set((state)=>({
                                messages: [
                                    ...state.messages,
                                    userMsg,
                                    assistantMsg
                                ],
                                isLoading: true,
                                error: null,
                                pendingRecommendations: null,
                                clarifyMessage: null
                            }));
                        // Step 1: IntentRouter
                        let route = 'graph';
                        try {
                            const routeResp = await _axios.default.post('/api/v1/chat/route', {
                                query: backendQuery
                            });
                            route = routeResp.data.route;
                            if (route === 'clarify') {
                                set((state)=>({
                                        messages: state.messages.map((m)=>m.id === tempId ? {
                                                ...m,
                                                isLoading: false,
                                                content: routeResp.data.clarify_message ?? 'Sorry, I didn\'t fully understand. Could you provide more specific criteria?'
                                            } : m),
                                        clarifyMessage: routeResp.data.clarify_message ?? null,
                                        isLoading: false
                                    }));
                                return;
                            }
                        } catch (err) {
                            console.warn('[Store] /route failed, defaulting to graph:', err);
                        }
                        // Step 2: Risk Report pipeline
                        if (route === 'risk') {
                            set({
                                currentRoute: 'risk',
                                activeRightPanel: 'risk',
                                riskReport: null,
                                riskStages: [],
                                riskCommunity: null,
                                isLoading: true,
                                currentSubgraph: null,
                                analysisResult: null
                            });
                            await get().sendRiskQuery(backendQuery);
                            return;
                        }
                        // Step 3: Analysis pipeline
                        if (route === 'analysis') {
                            set({
                                currentRoute: 'analysis',
                                activeRightPanel: 'analysis',
                                analysisQuery: backendQuery,
                                isLoading: true,
                                currentSubgraph: null,
                                analysisResult: null
                            });
                            const maxRetries = 3;
                            let retryCount = 0;
                            let success = false;
                            while(retryCount < maxRetries && !success){
                                if (retryCount > 0) {
                                    const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 8000);
                                    set((state)=>({
                                            messages: state.messages.map((m)=>m.id === tempId ? {
                                                    ...m,
                                                    thinkingStatus: `连接中断，${delay / 1000}s 后重试 (${retryCount}/${maxRetries})...`
                                                } : m)
                                        }));
                                    await new Promise((r)=>setTimeout(r, delay));
                                }
                                try {
                                    var _resp_body;
                                    const resp = await fetch('/api/v1/chat/analyze', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({
                                            query: backendQuery
                                        })
                                    });
                                    if (!resp.ok) throw new Error(`Analysis failed: ${resp.status}`);
                                    const reader = (_resp_body = resp.body) === null || _resp_body === void 0 ? void 0 : _resp_body.getReader();
                                    if (!reader) throw new Error('No reader available');
                                    const decoder = new TextDecoder();
                                    let buffer = '';
                                    let pendingEvent = null;
                                    let accumulatedText = '';
                                    let finalConfig = null;
                                    let finalData = [];
                                    let rowCount = 0;
                                    success = true;
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
                                                        const { content } = JSON.parse(raw);
                                                        set((state)=>({
                                                                messages: state.messages.map((m)=>m.id === tempId ? {
                                                                        ...m,
                                                                        thinkingStatus: content,
                                                                        thinkingProcess: [
                                                                            ...m.thinkingProcess || [],
                                                                            content
                                                                        ]
                                                                    } : m)
                                                            }));
                                                    } else if (ev === 'analysis_text') {
                                                        const { chunk } = JSON.parse(raw);
                                                        accumulatedText += chunk;
                                                        set((state)=>({
                                                                messages: state.messages.map((m)=>m.id === tempId ? {
                                                                        ...m,
                                                                        content: accumulatedText
                                                                    } : m)
                                                            }));
                                                    } else if (ev === 'echarts_config') finalConfig = JSON.parse(raw);
                                                    else if (ev === 'raw_data') finalData = JSON.parse(raw);
                                                    else if (ev === 'done') {
                                                        const meta = JSON.parse(raw);
                                                        rowCount = meta.row_count || 0;
                                                    } else if (ev === 'error') {
                                                        const { error: errMsg } = JSON.parse(raw);
                                                        throw new Error(errMsg || 'Analysis error');
                                                    }
                                                } catch (e) {
                                                    console.error('[Store] Parse error in analysis stream:', e, raw);
                                                }
                                            }
                                        }
                                    }
                                    set((state)=>({
                                            analysisResult: {
                                                analysis_text: accumulatedText,
                                                echarts_config: finalConfig,
                                                raw_data: finalData,
                                                row_count: rowCount
                                            },
                                            messages: state.messages.map((m)=>m.id === tempId ? {
                                                    ...m,
                                                    isLoading: false,
                                                    thinkingStatus: undefined
                                                } : m),
                                            isLoading: false
                                        }));
                                } catch (err) {
                                    retryCount++;
                                    console.error(`[Store] Analysis attempt ${retryCount} failed:`, err);
                                    if (retryCount >= maxRetries) set((state)=>({
                                            isLoading: false,
                                            error: err.message,
                                            messages: state.messages.map((m)=>m.id === tempId ? {
                                                    ...m,
                                                    content: `Analysis failed after ${maxRetries} attempts: ${err.message}`
                                                } : m)
                                        }));
                                }
                            }
                            return;
                        }
                        // Step 4: Graph / recommend pipeline
                        set({
                            activeRightPanel: 'graph'
                        });
                        const history = messages.filter((m)=>m.role === 'user').map((m)=>m.content);
                        (0, _agent.sendChatStream)({
                            query: backendQuery,
                            history,
                            sessionId,
                            roundId: roundId + 1
                        }, {
                            onStage: (stage)=>{
                                set((state)=>{
                                    const isStructured = typeof stage !== 'string';
                                    const stageObj = isStructured ? stage : null;
                                    const contentStr = isStructured ? `[${stageObj.stage_name}] ${stageObj.agent_action}` : stage;
                                    return {
                                        messages: state.messages.map((m)=>m.id === tempId ? {
                                                ...m,
                                                thinkingStatus: contentStr,
                                                thinkingProcess: [
                                                    ...m.thinkingProcess || [],
                                                    contentStr
                                                ],
                                                pipelineStages: isStructured ? (()=>{
                                                    const prev = m.pipelineStages || [];
                                                    const idx = prev.findIndex((ps)=>ps.stage_id === stageObj.stage_id);
                                                    if (idx >= 0) {
                                                        const updated = [
                                                            ...prev
                                                        ];
                                                        updated[idx] = {
                                                            ...stageObj,
                                                            status: stageObj.progress >= 1.0 ? 'done' : 'running'
                                                        };
                                                        return updated;
                                                    }
                                                    return [
                                                        ...prev,
                                                        {
                                                            ...stageObj,
                                                            status: stageObj.progress >= 1.0 ? 'done' : 'running'
                                                        }
                                                    ];
                                                })() : m.pipelineStages
                                            } : m)
                                    };
                                });
                            },
                            onCards: (cards)=>{
                                set(()=>({
                                        pendingRecommendations: cards
                                    }));
                            },
                            onGraph: (graph)=>{
                                set(()=>({
                                        currentSubgraph: graph
                                    }));
                            },
                            onReview: ({ overall, highlights, explanation })=>{
                                const highlightMap = new Map(highlights.map((h)=>[
                                        h.itemId,
                                        h.highlight
                                    ]));
                                set((state)=>{
                                    const enrichedRecs = (state.pendingRecommendations ?? []).map((rec)=>({
                                            ...rec,
                                            highlight: highlightMap.get(rec.itemId) ?? rec.highlight ?? ''
                                        }));
                                    const finalOutput = {
                                        overallReasoning: explanation || overall,
                                        recommendations: enrichedRecs,
                                        explanations: highlights.map((h)=>({
                                                itemId: h.itemId,
                                                highlight: h.highlight,
                                                pathIds: []
                                            }))
                                    };
                                    return {
                                        messages: state.messages.map((m)=>m.id === tempId ? {
                                                ...m,
                                                content: overall,
                                                isLoading: false,
                                                thinkingStatus: undefined,
                                                data: {
                                                    output: finalOutput
                                                }
                                            } : m),
                                        pendingRecommendations: null,
                                        isLoading: false,
                                        currentRoute: 'graph'
                                    };
                                });
                            },
                            onDone: ()=>{
                                set((state)=>({
                                        pendingRecommendations: null,
                                        isLoading: false,
                                        currentRoute: 'graph',
                                        messages: state.messages.map((m)=>m.id === tempId ? {
                                                ...m,
                                                isLoading: false,
                                                thinkingStatus: undefined
                                            } : m)
                                    }));
                            },
                            onError: (msg)=>{
                                set((state)=>({
                                        isLoading: false,
                                        pendingRecommendations: null,
                                        error: msg,
                                        currentRoute: 'graph',
                                        messages: state.messages.map((m)=>m.id === tempId ? {
                                                ...m,
                                                content: `Error: ${msg}`
                                            } : m)
                                    }));
                            }
                        });
                    // cleanup is handled internally on done/error events
                    },
                    sendRiskQuery: async (query, communityId)=>{
                        const { sessionId, roundId } = get();
                        const tempId = `asst_${Date.now()}`;
                        const assistantMsg = {
                            id: tempId,
                            role: 'assistant',
                            content: '',
                            timestamp: Date.now(),
                            isLoading: true,
                            thinkingProcess: [
                                'Risk Report: starting 5-agent pipeline...'
                            ]
                        };
                        set((state)=>({
                                messages: [
                                    ...state.messages,
                                    assistantMsg
                                ],
                                isLoading: true,
                                error: null
                            }));
                        (0, _agent.sendRiskStream)({
                            query,
                            sessionId,
                            roundId,
                            communityId,
                            maxHop: 3
                        }, {
                            onStage: (stage, content)=>{
                                set((state)=>({
                                        riskStages: [
                                            ...state.riskStages.filter((s)=>s.stage !== stage),
                                            {
                                                stage: stage,
                                                content
                                            }
                                        ],
                                        messages: state.messages.map((m)=>m.id === tempId ? {
                                                ...m,
                                                thinkingStatus: content,
                                                thinkingProcess: [
                                                    ...m.thinkingProcess || [],
                                                    `[${stage}] ${content}`
                                                ]
                                            } : m)
                                    }));
                            },
                            onCommunity: (info)=>{
                                set({
                                    riskCommunity: info
                                });
                            },
                            onSubgraph: (graph)=>{
                                set({
                                    currentSubgraph: graph
                                });
                            },
                            onReport: (report)=>{
                                set((state)=>({
                                        riskReport: report,
                                        messages: state.messages.map((m)=>{
                                            var _report_markdown_report;
                                            return m.id === tempId ? {
                                                ...m,
                                                content: report.executive_summary || ((_report_markdown_report = report.markdown_report) === null || _report_markdown_report === void 0 ? void 0 : _report_markdown_report.slice(0, 300)) || '',
                                                isLoading: false,
                                                thinkingStatus: undefined,
                                                data: {
                                                    echartsConfig: report.echarts_config
                                                }
                                            } : m;
                                        }),
                                        isLoading: false,
                                        currentRoute: 'risk',
                                        activeRightPanel: 'risk'
                                    }));
                            },
                            onDone: ()=>{
                                set((state)=>({
                                        isLoading: false,
                                        currentRoute: 'risk',
                                        messages: state.messages.map((m)=>m.id === tempId ? {
                                                ...m,
                                                isLoading: false,
                                                thinkingStatus: undefined
                                            } : m)
                                    }));
                            },
                            onError: (msg)=>{
                                set((state)=>({
                                        isLoading: false,
                                        error: msg,
                                        currentRoute: 'risk',
                                        messages: state.messages.map((m)=>m.id === tempId ? {
                                                ...m,
                                                content: `Risk analysis failed: ${msg}`
                                            } : m)
                                    }));
                            }
                        });
                    },
                    clearHistory: ()=>{
                        set({
                            messages: [],
                            currentSubgraph: null,
                            rewriteResult: null,
                            alignmentFeatures: [],
                            roundId: 0,
                            sessionId: generateSessionId(),
                            error: null,
                            pendingRecommendations: null,
                            clarifyMessage: null,
                            currentRoute: null,
                            analysisQuery: null,
                            analysisResult: null,
                            riskReport: null,
                            riskStages: [],
                            riskCommunity: null,
                            activeRightPanel: 'graph'
                        });
                    },
                    setError: (error)=>set({
                            error
                        }),
                    clearRoute: ()=>set({
                            currentRoute: null,
                            currentSubgraph: null,
                            analysisQuery: null
                        })
                }));
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
    runtime._h = '9300845881509817604';
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

//# sourceMappingURL=p__KnowledgeQA__index-async.5756577849761501123.hot-update.js.map