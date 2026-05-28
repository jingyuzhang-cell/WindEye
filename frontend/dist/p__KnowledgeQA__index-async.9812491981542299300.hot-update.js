globalThis.makoModuleHotUpdate('p__KnowledgeQA__index', {
    modules: {
        "src/pages/KnowledgeQA/index.tsx": function(module, exports, __mako_require__) {
            "use strict";
            var interop = __mako_require__("@swc/helpers/_/_interop_require_wildcard")._;
            __mako_require__.d(exports, "__esModule", {
                value: true
            });
            __mako_require__.d(exports, "default", {
                enumerable: true,
                get: function() {
                    return _default;
                }
            });
            var _interop_require_default = __mako_require__("@swc/helpers/_/_interop_require_default");
            var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
            var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
            var _jsxdevruntime = __mako_require__("node_modules/react/jsx-dev-runtime.js");
            var _react = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react/index.js"));
            var _procomponents = __mako_require__("node_modules/@ant-design/pro-components/es/index.js");
            var _antd = __mako_require__("node_modules/antd/es/index.js");
            var _WorkspaceContainer = __mako_require__("src/pages/KnowledgeQA/components/WorkspaceContainer.tsx");
            var _EnhancedGraphPanel = __mako_require__("src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx");
            var _AnalysisPanel = __mako_require__("src/pages/KnowledgeQA/components/AnalysisPanel.tsx");
            var _RiskReportPanel = /*#__PURE__*/ _interop_require_default._(__mako_require__("src/pages/KnowledgeQA/components/RiskReportPanel.tsx"));
            var _ChatSidebar = __mako_require__("src/pages/KnowledgeQA/components/ChatSidebar.tsx");
            var _agentStore = __mako_require__("src/pages/KnowledgeQA/store/agentStore.ts");
            var _chatStore = __mako_require__("src/pages/KnowledgeQA/store/chatStore.ts");
            var _constants = __mako_require__("src/pages/KnowledgeQA/styles/constants.ts");
            var prevRefreshReg;
            var prevRefreshSig;
            prevRefreshReg = self.$RefreshReg$;
            prevRefreshSig = self.$RefreshSig$;
            self.$RefreshReg$ = (type, id)=>{
                _reactrefresh.register(type, module.id + id);
            };
            self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
            var _s = $RefreshSig$();
            // Extract entity names from query text and match against graph nodes
            function extractSubjectEntityIds(query, nodes) {
                if (!query || nodes.length === 0) return [];
                const matched = [];
                for (const node of nodes){
                    const nodeId = String(node.id);
                    const names = [
                        node.title,
                        node.name,
                        node.zh_name,
                        node.zhTitle
                    ].filter(Boolean);
                    for (const name of names)if (name.length >= 2 && query.includes(name)) {
                        matched.push(nodeId);
                        break;
                    }
                }
                // If no direct match, try extracting entities from query with common patterns
                if (matched.length === 0) {
                    // Match《书名号》patterns
                    const bookMatches = query.match(/《([^》]{2,30})》/g);
                    if (bookMatches) for (const m of bookMatches){
                        const name = m.replace(/[《》]/g, '');
                        for (const node of nodes){
                            const nodeId = String(node.id);
                            const nodeNames = [
                                node.title,
                                node.name,
                                node.zh_name,
                                node.zhTitle
                            ].filter(Boolean);
                            if (nodeNames.some((n)=>n.includes(name) || name.includes(n))) {
                                if (!matched.includes(nodeId)) matched.push(nodeId);
                            }
                        }
                    }
                    // Match company name patterns (ending with 公司/集团/有限 etc)
                    if (matched.length === 0) {
                        const companyMatches = query.match(/([一-龥]{2,15}(?:有限|股份|集团|科技|实业|投资|控股)?(?:公司|企业|集团|中心|所))/g);
                        if (companyMatches) {
                            for (const name of companyMatches)for (const node of nodes){
                                const nodeId = String(node.id);
                                const nodeNames = [
                                    node.title,
                                    node.name,
                                    node.zh_name,
                                    node.zhTitle
                                ].filter(Boolean);
                                if (nodeNames.some((n)=>n.includes(name) || name.includes(n.slice(0, 10)))) {
                                    if (!matched.includes(nodeId)) matched.push(nodeId);
                                }
                            }
                        }
                    }
                }
                return matched;
            }
            // Find 1-hop neighbor IDs for given node IDs
            function findNeighborIds(nodeIds, edges) {
                if (nodeIds.length === 0 || edges.length === 0) return [];
                const idSet = new Set(nodeIds.map(String));
                const neighbors = new Set();
                for (const e of edges){
                    const src = String(e.source);
                    const tgt = String(e.target);
                    if (idSet.has(src) && !idSet.has(tgt)) neighbors.add(tgt);
                    if (idSet.has(tgt) && !idSet.has(src)) neighbors.add(src);
                }
                return Array.from(neighbors);
            }
            const KnowledgeQA = ()=>{
                _s();
                const { message } = _antd.App.useApp();
                const { messages, currentSubgraph, alignmentFeatures, isLoading, sendMessage, clearHistory, pendingRecommendations, clarifyMessage, activeRightPanel, analysisResult, riskReport, riskStages, riskCommunity, error } = (0, _agentStore.useAgentStore)();
                const { activeSessionId, updateCurrentSession, getActiveSession, createNewSession } = (0, _chatStore.useChatStore)();
                const graphRef = (0, _react.useRef)(null);
                const [highlightedEntity, setHighlightedEntity] = (0, _react.useState)(null);
                const [graphInjectedEntity, setGraphInjectedEntity] = (0, _react.useState)(null);
                const [sidebarCollapsed, setSidebarCollapsed] = (0, _react.useState)(false);
                // Auto-save logic
                (0, _react.useEffect)(()=>{
                    if (_agentStore.useAgentStore.getState().isLoading) return;
                    if (!activeSessionId) {
                        if (_chatStore.useChatStore.getState().sessions.length === 0) createNewSession();
                        return;
                    }
                    const timer = setTimeout(()=>{
                        const activeSession = getActiveSession();
                        if (!activeSession) return;
                        if (messages.length > 0 || currentSubgraph || analysisResult || riskReport) {
                            let newTitle = activeSession.title;
                            if ((!newTitle || newTitle === '新会话') && messages.length > 0) {
                                const firstUserMsg = messages.find((m)=>m.role === 'user');
                                if (firstUserMsg) newTitle = firstUserMsg.content.slice(0, 20) + (firstUserMsg.content.length > 20 ? '...' : '');
                            }
                            updateCurrentSession({
                                messages,
                                title: newTitle,
                                workspaceState: {
                                    graphData: currentSubgraph,
                                    chartOptions: analysisResult === null || analysisResult === void 0 ? void 0 : analysisResult.echarts_config,
                                    stats: {
                                        rawData: analysisResult === null || analysisResult === void 0 ? void 0 : analysisResult.raw_data,
                                        rowCount: analysisResult === null || analysisResult === void 0 ? void 0 : analysisResult.row_count
                                    },
                                    riskReport,
                                    riskStages,
                                    riskCommunity
                                }
                            });
                        }
                    }, 1000);
                    return ()=>clearTimeout(timer);
                }, [
                    messages,
                    currentSubgraph,
                    analysisResult,
                    riskReport,
                    activeSessionId,
                    updateCurrentSession,
                    getActiveSession,
                    createNewSession
                ]);
                // Session restoration
                (0, _react.useEffect)(()=>{
                    var _session_messages_find;
                    if (_agentStore.useAgentStore.getState().isLoading) return;
                    const session = getActiveSession();
                    if (!session) return;
                    _agentStore.useAgentStore.setState({
                        messages: session.messages,
                        currentSubgraph: session.workspaceState.graphData,
                        analysisResult: session.workspaceState.graphData ? null : {
                            analysis_text: ((_session_messages_find = session.messages.find((m)=>m.role === 'assistant' && m.content)) === null || _session_messages_find === void 0 ? void 0 : _session_messages_find.content) || '',
                            echarts_config: session.workspaceState.chartOptions,
                            raw_data: session.workspaceState.stats.rawData || [],
                            row_count: session.workspaceState.stats.rowCount || 0
                        },
                        riskReport: session.workspaceState.riskReport || null,
                        riskStages: session.workspaceState.riskStages || [],
                        riskCommunity: session.workspaceState.riskCommunity || null,
                        activeRightPanel: session.workspaceState.riskReport ? 'risk' : session.workspaceState.graphData ? 'graph' : 'analysis'
                    });
                    if (session.workspaceState.graphData && graphRef.current) {
                        graphRef.current.refresh(session.workspaceState.graphData, []);
                        setTimeout(()=>{
                            var _graphRef_current;
                            return (_graphRef_current = graphRef.current) === null || _graphRef_current === void 0 ? void 0 : _graphRef_current.fitView();
                        }, 300);
                    }
                }, [
                    activeSessionId
                ]);
                // Update graph when subgraph changes
                (0, _react.useEffect)(()=>{
                    if (currentSubgraph && graphRef.current) {
                        const lastUserMsg = [
                            ...messages
                        ].reverse().find((m)=>m.role === 'user');
                        const query = (lastUserMsg === null || lastUserMsg === void 0 ? void 0 : lastUserMsg.content) || '';
                        // Extract subject entity names from query and match against graph nodes
                        const subjectIds = extractSubjectEntityIds(query, currentSubgraph.nodes);
                        const neighborIds = findNeighborIds(subjectIds, currentSubgraph.edges);
                        graphRef.current.refresh(currentSubgraph, alignmentFeatures, subjectIds, neighborIds);
                        if (subjectIds.length > 0) {
                            const t = setTimeout(()=>{
                                var _graphRef_current, _graphRef_current1;
                                (_graphRef_current = graphRef.current) === null || _graphRef_current === void 0 || _graphRef_current.focusNode(subjectIds[0]);
                                (_graphRef_current1 = graphRef.current) === null || _graphRef_current1 === void 0 || _graphRef_current1.dimNonFocused(subjectIds, neighborIds);
                            }, 600);
                            return ()=>clearTimeout(t);
                        } else {
                            const t = setTimeout(()=>{
                                var _graphRef_current;
                                return (_graphRef_current = graphRef.current) === null || _graphRef_current === void 0 ? void 0 : _graphRef_current.fitView();
                            }, 500);
                            return ()=>clearTimeout(t);
                        }
                    }
                }, [
                    currentSubgraph,
                    alignmentFeatures
                ]);
                const handleEntityHover = (0, _react.useCallback)((entityId)=>{
                    setHighlightedEntity(entityId);
                    if (entityId && graphRef.current) graphRef.current.focusNode(entityId);
                    else if (!entityId && graphRef.current) graphRef.current.resetHighlight();
                }, []);
                const handleNodeDoubleClick = (0, _react.useCallback)((nodeId, nodeName, nodeType)=>{
                    setGraphInjectedEntity({
                        id: nodeId,
                        name: nodeName,
                        type: nodeType
                    });
                }, []);
                const handleEntityClick = (0, _react.useCallback)((entityId, entityType)=>{
                    _agentStore.useAgentStore.setState({
                        activeRightPanel: 'graph'
                    });
                    if (graphRef.current) graphRef.current.searchAndExpand(entityId, entityType);
                }, []);
                const handleJumpToGraph = (0, _react.useCallback)((entityId, entityName, entityType)=>{
                    _agentStore.useAgentStore.setState({
                        activeRightPanel: 'graph'
                    });
                    if (graphRef.current) graphRef.current.searchAndExpand(entityId, entityType);
                }, []);
                const handleAddMonitor = (0, _react.useCallback)(async (entityName, entityType)=>{
                    try {
                        const resp = await fetch('/api/v1/risk/tickets', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                reportId: `watch-${entityName}`,
                                assignedDept: '风控部',
                                entityType
                            })
                        });
                        if (resp.ok) {
                            var _data_data;
                            const data = await resp.json();
                            message.success(`Monitor created: ${(data === null || data === void 0 ? void 0 : (_data_data = data.data) === null || _data_data === void 0 ? void 0 : _data_data.ticket_id) || 'OK'}`);
                        } else message.error('Failed to create monitor ticket');
                    } catch  {
                        message.error('Failed to create monitor ticket');
                    }
                }, [
                    message
                ]);
                const handleGenerateTicket = (0, _react.useCallback)(async (recommendation)=>{
                    try {
                        var _useAgentStore_getState_riskReport;
                        const reportId = ((_useAgentStore_getState_riskReport = _agentStore.useAgentStore.getState().riskReport) === null || _useAgentStore_getState_riskReport === void 0 ? void 0 : _useAgentStore_getState_riskReport.report_id) || 'risk-report';
                        const resp = await fetch('/api/v1/risk/tickets', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                reportId,
                                assignedDept: recommendation.department
                            })
                        });
                        if (resp.ok) {
                            var _data_data;
                            const data = await resp.json();
                            message.success(`Ticket created: ${(data === null || data === void 0 ? void 0 : (_data_data = data.data) === null || _data_data === void 0 ? void 0 : _data_data.ticket_id) || 'OK'}`);
                        } else message.error('Failed to create ticket');
                    } catch  {
                        message.error('Failed to create ticket');
                    }
                }, [
                    message
                ]);
                const lastQueryText = (0, _react.useMemo)(()=>{
                    const lastUserMsg = [
                        ...messages
                    ].reverse().find((m)=>m.role === 'user');
                    return (lastUserMsg === null || lastUserMsg === void 0 ? void 0 : lastUserMsg.content) || '';
                }, [
                    messages
                ]);
                const handleBFFSend = (0, _react.useCallback)(async (query)=>{
                    const history = _agentStore.useAgentStore.getState().messages.filter((m)=>m.role === 'user' || m.role === 'assistant').slice(-4).map((m)=>`${m.role === 'user' ? 'User' : 'System'}: ${m.content.slice(0, 100)}`);
                    try {
                        const params = new URLSearchParams({
                            query,
                            history: JSON.stringify(history)
                        });
                        const res = await fetch(`/api/rewrite?${params.toString()}`);
                        if (res.ok) {
                            const { rewrittenQuery } = await res.json();
                            await sendMessage(query, rewrittenQuery);
                        } else throw new Error('BFF unreachable');
                    } catch (e) {
                        console.warn('BFF unavailable, sending original query directly.', e);
                        await sendMessage(query);
                    }
                }, [
                    sendMessage
                ]);
                // Header component with API health indicator
                const [apiHealthy, setApiHealthy] = (0, _react.useState)(null);
                const intervalRef = (0, _react.useRef)();
                (0, _react.useEffect)(()=>{
                    __mako_require__.ensure2("src/pages/KnowledgeQA/api/agent.ts").then(__mako_require__.dr(interop, __mako_require__.bind(__mako_require__, "src/pages/KnowledgeQA/api/agent.ts"))).then(({ healthCheck })=>{
                        healthCheck().then(setApiHealthy).catch(()=>setApiHealthy(false));
                        intervalRef.current = setInterval(()=>{
                            healthCheck().then(setApiHealthy).catch(()=>setApiHealthy(false));
                        }, 15000);
                    });
                    return ()=>{
                        if (intervalRef.current) clearInterval(intervalRef.current);
                    };
                }, []);
                return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_procomponents.PageContainer, {
                    header: {
                        title: 'Knowledge Graph Q&A',
                        subTitle: 'Knowledge graph recommendation engine'
                    },
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                            style: {
                                display: 'flex',
                                height: 'calc(100vh - 120px)',
                                overflow: 'hidden',
                                background: _constants.DESIGN_TOKENS.BG_CANVAS,
                                margin: '-24px',
                                borderRadius: 0
                            },
                            children: [
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_ChatSidebar.ChatSidebar, {
                                    collapsed: sidebarCollapsed,
                                    onToggle: ()=>setSidebarCollapsed(!sidebarCollapsed)
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                    lineNumber: 368,
                                    columnNumber: 9
                                }, this),
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                    style: {
                                        display: 'flex',
                                        flexDirection: 'column',
                                        flex: 1,
                                        overflow: 'hidden'
                                    },
                                    children: [
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("header", {
                                            style: {
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '12px 24px',
                                                background: 'rgba(255, 255, 255, 0.85)',
                                                backdropFilter: 'blur(20px)',
                                                borderBottom: `1px solid ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`,
                                                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 16
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                            style: {
                                                                width: 40,
                                                                height: 40,
                                                                borderRadius: 12,
                                                                background: 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                boxShadow: '0 4px 12px rgba(40, 85, 209, 0.3)'
                                                            },
                                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("svg", {
                                                                width: "24",
                                                                height: "24",
                                                                viewBox: "0 0 32 32",
                                                                fill: "none",
                                                                children: [
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("circle", {
                                                                        cx: "16",
                                                                        cy: "16",
                                                                        r: "12",
                                                                        stroke: "#ffffff",
                                                                        strokeWidth: "2",
                                                                        opacity: "0.3"
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                        lineNumber: 402,
                                                                        columnNumber: 19
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("circle", {
                                                                        cx: "16",
                                                                        cy: "10",
                                                                        r: "3",
                                                                        fill: "#ffffff"
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                        lineNumber: 403,
                                                                        columnNumber: 19
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("circle", {
                                                                        cx: "10",
                                                                        cy: "20",
                                                                        r: "2.5",
                                                                        fill: "#10B981"
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                        lineNumber: 404,
                                                                        columnNumber: 19
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("circle", {
                                                                        cx: "22",
                                                                        cy: "20",
                                                                        r: "2.5",
                                                                        fill: "#F59E0B"
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                        lineNumber: 405,
                                                                        columnNumber: 19
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("line", {
                                                                        x1: "16",
                                                                        y1: "13",
                                                                        x2: "11",
                                                                        y2: "18",
                                                                        stroke: "#ffffff",
                                                                        strokeWidth: "1.5"
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                        lineNumber: 406,
                                                                        columnNumber: 19
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("line", {
                                                                        x1: "16",
                                                                        y1: "13",
                                                                        x2: "21",
                                                                        y2: "18",
                                                                        stroke: "#ffffff",
                                                                        strokeWidth: "1.5"
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                        lineNumber: 407,
                                                                        columnNumber: 19
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("line", {
                                                                        x1: "12",
                                                                        y1: "20",
                                                                        x2: "20",
                                                                        y2: "20",
                                                                        stroke: "#ffffff",
                                                                        strokeWidth: "1.5"
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                        lineNumber: 408,
                                                                        columnNumber: 19
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                lineNumber: 401,
                                                                columnNumber: 17
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 389,
                                                            columnNumber: 15
                                                        }, this),
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                            children: [
                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("h1", {
                                                                    style: {
                                                                        margin: 0,
                                                                        fontSize: 18,
                                                                        fontWeight: 700,
                                                                        color: '#0F172A',
                                                                        letterSpacing: '-0.02em'
                                                                    },
                                                                    children: "WindEye"
                                                                }, void 0, false, {
                                                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                    lineNumber: 412,
                                                                    columnNumber: 17
                                                                }, this),
                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("p", {
                                                                    style: {
                                                                        margin: 0,
                                                                        fontSize: 12,
                                                                        color: '#94A3B8'
                                                                    },
                                                                    children: "Knowledge Graph Recommendation Engine"
                                                                }, void 0, false, {
                                                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                    lineNumber: 423,
                                                                    columnNumber: 17
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 411,
                                                            columnNumber: 15
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                                    lineNumber: 388,
                                                    columnNumber: 13
                                                }, this),
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 16
                                                    },
                                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                        style: {
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 8
                                                        },
                                                        children: [
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                                                style: {
                                                                    width: 8,
                                                                    height: 8,
                                                                    borderRadius: '50%',
                                                                    backgroundColor: apiHealthy === null ? '#94A3B8' : apiHealthy ? '#10B981' : '#EF4444',
                                                                    boxShadow: apiHealthy ? '0 0 8px rgba(16, 185, 129, 0.5)' : 'none',
                                                                    animation: apiHealthy ? 'pulse 2s infinite' : 'none'
                                                                }
                                                            }, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                lineNumber: 431,
                                                                columnNumber: 17
                                                            }, this),
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                                                style: {
                                                                    fontSize: 12,
                                                                    color: '#64748B'
                                                                },
                                                                children: apiHealthy === null ? 'Checking' : apiHealthy ? 'API Online' : 'API Offline'
                                                            }, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                lineNumber: 442,
                                                                columnNumber: 17
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                                        lineNumber: 430,
                                                        columnNumber: 15
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                                    lineNumber: 429,
                                                    columnNumber: 13
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                            lineNumber: 376,
                                            columnNumber: 11
                                        }, this),
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                            style: {
                                                display: 'flex',
                                                flex: 1,
                                                overflow: 'hidden',
                                                padding: '16px',
                                                gap: '16px'
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        width: 'clamp(320px, 32vw, 520px)',
                                                        flexShrink: 0,
                                                        borderRadius: 20,
                                                        overflow: 'hidden',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        background: '#fff',
                                                        boxShadow: _constants.DESIGN_TOKENS.SHADOW_MD,
                                                        border: `1px solid ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_WorkspaceContainer.WorkspaceContainer, {
                                                            messages: messages,
                                                            isLoading: isLoading,
                                                            pendingRecommendations: pendingRecommendations,
                                                            onSendMessage: handleBFFSend,
                                                            onClearHistory: clearHistory,
                                                            onEntityHover: handleEntityHover,
                                                            onEntityClick: handleEntityClick,
                                                            highlightedEntity: highlightedEntity,
                                                            graphInjectedEntity: graphInjectedEntity,
                                                            onClearGraphInject: ()=>setGraphInjectedEntity(null)
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 473,
                                                            columnNumber: 15
                                                        }, this),
                                                        clarifyMessage && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                            style: {
                                                                margin: '0 16px 16px',
                                                                padding: '10px 14px',
                                                                background: 'rgba(245,169,66,0.12)',
                                                                border: '1px solid rgba(245,169,66,0.3)',
                                                                borderRadius: 10,
                                                                fontSize: 13,
                                                                color: '#92400e',
                                                                lineHeight: 1.6
                                                            },
                                                            children: [
                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("strong", {
                                                                    style: {
                                                                        fontSize: 12,
                                                                        textTransform: 'uppercase',
                                                                        letterSpacing: 0.5
                                                                    },
                                                                    children: "Needs Clarification"
                                                                }, void 0, false, {
                                                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                    lineNumber: 499,
                                                                    columnNumber: 19
                                                                }, this),
                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                    style: {
                                                                        marginTop: 6
                                                                    },
                                                                    children: clarifyMessage
                                                                }, void 0, false, {
                                                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                    lineNumber: 508,
                                                                    columnNumber: 19
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 487,
                                                            columnNumber: 17
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                                    lineNumber: 460,
                                                    columnNumber: 13
                                                }, this),
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        flex: 1,
                                                        borderRadius: 20,
                                                        overflow: 'hidden',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        background: '#fff',
                                                        boxShadow: _constants.DESIGN_TOKENS.SHADOW_MD,
                                                        border: `1px solid ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                            style: {
                                                                padding: '10px 16px',
                                                                borderBottom: '1px solid #f1f5f9',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                background: 'rgba(255, 255, 255, 0.5)',
                                                                backdropFilter: 'blur(10px)'
                                                            },
                                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Segmented, {
                                                                options: [
                                                                    {
                                                                        label: 'Knowledge Graph',
                                                                        value: 'graph'
                                                                    },
                                                                    {
                                                                        label: 'Data Analysis',
                                                                        value: 'analysis'
                                                                    },
                                                                    {
                                                                        label: 'Risk Report',
                                                                        value: 'risk'
                                                                    }
                                                                ],
                                                                value: activeRightPanel,
                                                                onChange: (val)=>_agentStore.useAgentStore.setState({
                                                                        activeRightPanel: val
                                                                    }),
                                                                size: "middle",
                                                                style: {
                                                                    background: '#f1f5f9',
                                                                    padding: '2px',
                                                                    borderRadius: '10px'
                                                                }
                                                            }, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                lineNumber: 537,
                                                                columnNumber: 17
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 526,
                                                            columnNumber: 15
                                                        }, this),
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                            style: {
                                                                flex: 1,
                                                                position: 'relative',
                                                                overflow: 'hidden'
                                                            },
                                                            children: activeRightPanel === 'risk' ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_RiskReportPanel.default, {
                                                                report: riskReport,
                                                                stages: riskStages,
                                                                community: riskCommunity,
                                                                isLoading: isLoading,
                                                                error: error,
                                                                onJumpToGraph: handleJumpToGraph,
                                                                onAddMonitor: handleAddMonitor,
                                                                onGenerateTicket: handleGenerateTicket,
                                                                queryText: lastQueryText
                                                            }, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                lineNumber: 558,
                                                                columnNumber: 19
                                                            }, this) : activeRightPanel === 'analysis' ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_AnalysisPanel.AnalysisPanel, {
                                                                onClose: ()=>_agentStore.useAgentStore.setState({
                                                                        activeRightPanel: 'graph'
                                                                    })
                                                            }, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                lineNumber: 570,
                                                                columnNumber: 19
                                                            }, this) : /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_EnhancedGraphPanel.EnhancedGraphPanel, {
                                                                ref: graphRef,
                                                                subgraph: currentSubgraph,
                                                                alignmentFeatures: alignmentFeatures,
                                                                onNodeDoubleClick: handleNodeDoubleClick,
                                                                onNodeHover: (nodeId)=>setHighlightedEntity(nodeId),
                                                                highlightedEntity: highlightedEntity
                                                            }, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                                                lineNumber: 572,
                                                                columnNumber: 19
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 556,
                                                            columnNumber: 15
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                                    lineNumber: 514,
                                                    columnNumber: 13
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                            lineNumber: 450,
                                            columnNumber: 11
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                    lineNumber: 374,
                                    columnNumber: 9
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "src/pages/KnowledgeQA/index.tsx",
                            lineNumber: 357,
                            columnNumber: 7
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("style", {
                            children: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/index.tsx",
                            lineNumber: 587,
                            columnNumber: 7
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "src/pages/KnowledgeQA/index.tsx",
                    lineNumber: 351,
                    columnNumber: 5
                }, this);
            };
            _s(KnowledgeQA, "mNaiLQ+Di9HjzVe+QkHYDKUBXD8=", false, function() {
                return [
                    _antd.App.useApp,
                    _agentStore.useAgentStore,
                    _chatStore.useChatStore
                ];
            });
            _c = KnowledgeQA;
            var _default = KnowledgeQA;
            var _c;
            $RefreshReg$(_c, "KnowledgeQA");
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
    runtime._h = '13315655448679034427';
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

//# sourceMappingURL=p__KnowledgeQA__index-async.9812491981542299300.hot-update.js.map