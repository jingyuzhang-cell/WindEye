((typeof globalThis !== 'undefined' ? globalThis : self)["makoChunk_ant-design-pro"] = (typeof globalThis !== 'undefined' ? globalThis : self)["makoChunk_ant-design-pro"] || []).push([
        ['p__KnowledgeQA__index'],
{ "node_modules/@antv/g6/es/index.js": function (module, exports, __mako_require__){
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
    default: function() {
        return _default;
    },
    version: function() {
        return version;
    }
});
var _export_star = __mako_require__("@swc/helpers/_/_export_star");
var _interop_require_default = __mako_require__("@swc/helpers/_/_interop_require_default");
var _g6pc = /*#__PURE__*/ _interop_require_default._(_export_star._(__mako_require__("node_modules/@antv/g6-pc/es/index.js"), exports));
_g6pc.default.version = '4.8.23';
var _default = _g6pc.default;
var version = '4.8.23';

},
"src/pages/KnowledgeQA/api/agent.ts": function (module, exports, __mako_require__){
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
var _reactrefresh = _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var _axios = _interop_require_default._(__mako_require__("node_modules/axios/index.js"));
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
                    else if (data.content) callbacks.onStage(data.content);
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

},
"src/pages/KnowledgeQA/components/ChatSidebar.tsx": function (module, exports, __mako_require__){
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
    ChatSidebar: function() {
        return ChatSidebar;
    },
    default: function() {
        return _default;
    }
});
var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var _jsxdevruntime = __mako_require__("node_modules/react/jsx-dev-runtime.js");
var _react = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react/index.js"));
var _antd = __mako_require__("node_modules/antd/es/index.js");
var _icons = __mako_require__("node_modules/@ant-design/icons/es/index.js");
var _chatStore = __mako_require__("src/pages/KnowledgeQA/store/chatStore.ts");
var _agentStore = __mako_require__("src/pages/KnowledgeQA/store/agentStore.ts");
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
var _s = $RefreshSig$();
const { Text } = _antd.Typography;
const ChatSidebar = ({ collapsed, onToggle })=>{
    _s();
    const { sessions, activeSessionId, createNewSession, switchSession, deleteSession, renameSession } = (0, _chatStore.useChatStore)();
    const clearHistory = (0, _agentStore.useAgentStore)((state)=>state.clearHistory);
    const [editingId, setEditingId] = (0, _react.useState)(null);
    const [editTitle, setEditTitle] = (0, _react.useState)('');
    const handleNewChat = ()=>{
        createNewSession();
        clearHistory();
    };
    const handleStartRename = (e, id, currentTitle)=>{
        e.stopPropagation();
        setEditingId(id);
        setEditTitle(currentTitle || 'New Session');
    };
    const handleConfirmRename = ()=>{
        if (editingId && editTitle.trim()) renameSession(editingId, editTitle.trim());
        setEditingId(null);
    };
    const handleCancelRename = ()=>{
        setEditingId(null);
    };
    const sortedSessions = [
        ...sessions
    ].sort((a, b)=>b.updatedAt - a.updatedAt);
    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
        style: {
            width: collapsed ? 64 : 260,
            height: '100%',
            background: '#f8fafc',
            borderRight: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            padding: collapsed ? '16px 8px' : '16px 12px',
            transition: 'all 0.3s cubic-bezier(0.2, 0, 0, 1)',
            overflow: 'hidden',
            position: 'relative'
        },
        children: [
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    display: 'flex',
                    justifyContent: collapsed ? 'center' : 'flex-end',
                    marginBottom: 12
                },
                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                    type: "text",
                    icon: collapsed ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.MenuUnfoldOutlined, {}, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                        lineNumber: 77,
                        columnNumber: 29
                    }, void 0) : /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.MenuFoldOutlined, {}, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                        lineNumber: 77,
                        columnNumber: 54
                    }, void 0),
                    onClick: onToggle,
                    style: {
                        color: '#64748b'
                    }
                }, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                    lineNumber: 75,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                lineNumber: 68,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    marginBottom: 20
                },
                children: collapsed ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                    title: "New Session",
                    placement: "right",
                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                        type: "primary",
                        icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.PlusOutlined, {}, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                            lineNumber: 88,
                            columnNumber: 21
                        }, void 0),
                        onClick: handleNewChat,
                        style: {
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto',
                            background: 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)'
                        }
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                        lineNumber: 86,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                    lineNumber: 85,
                    columnNumber: 11
                }, this) : /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                    type: "primary",
                    icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.PlusOutlined, {}, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                        lineNumber: 105,
                        columnNumber: 19
                    }, void 0),
                    size: "large",
                    onClick: handleNewChat,
                    style: {
                        width: '100%',
                        height: 48,
                        borderRadius: 12,
                        fontWeight: 600,
                        background: 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)',
                        boxShadow: '0 4px 12px rgba(40, 85, 209, 0.2)'
                    },
                    children: "New Session"
                }, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                    lineNumber: 103,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                lineNumber: 83,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    flex: 1,
                    overflowY: 'auto',
                    margin: '0 -4px',
                    padding: '0 4px'
                },
                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.List, {
                    dataSource: sortedSessions,
                    renderItem: (session)=>{
                        const isActive = session.id === activeSessionId;
                        const isEditing = session.id === editingId;
                        return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                            onClick: ()=>!isEditing && switchSession(session.id),
                            style: {
                                padding: collapsed ? '12px 0' : '10px 12px',
                                borderRadius: 10,
                                marginBottom: 4,
                                cursor: isEditing ? 'default' : 'pointer',
                                transition: 'all 0.2s ease',
                                background: isActive ? 'rgba(40, 85, 209, 0.08)' : 'transparent',
                                border: isActive ? '1px solid rgba(40, 85, 209, 0.2)' : '1px solid transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: collapsed ? 'center' : 'flex-start',
                                gap: collapsed ? 0 : 12,
                                position: 'relative'
                            },
                            className: "session-item",
                            children: [
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                    title: collapsed ? session.title || 'New Session' : '',
                                    placement: "right",
                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.MessageOutlined, {
                                        style: {
                                            color: isActive ? '#2855D1' : '#94a3b8',
                                            fontSize: 18
                                        }
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                                        lineNumber: 149,
                                        columnNumber: 19
                                    }, void 0)
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                                    lineNumber: 148,
                                    columnNumber: 17
                                }, void 0),
                                !collapsed && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                    children: [
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                            style: {
                                                flex: 1,
                                                overflow: 'hidden'
                                            },
                                            children: isEditing ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Input, {
                                                autoFocus: true,
                                                size: "small",
                                                value: editTitle,
                                                onChange: (e)=>setEditTitle(e.target.value),
                                                onPressEnter: handleConfirmRename,
                                                onBlur: handleConfirmRename,
                                                onKeyDown: (e)=>e.key === 'Escape' && handleCancelRename(),
                                                onClick: (e)=>e.stopPropagation(),
                                                style: {
                                                    fontSize: 13,
                                                    padding: '1px 4px',
                                                    borderRadius: 4
                                                }
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                                                lineNumber: 161,
                                                columnNumber: 25
                                            }, void 0) : /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                                children: [
                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
                                                        strong: isActive,
                                                        style: {
                                                            display: 'block',
                                                            fontSize: 14,
                                                            color: isActive ? '#1e293b' : '#475569',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        },
                                                        children: session.title || 'New Session'
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                                                        lineNumber: 174,
                                                        columnNumber: 27
                                                    }, void 0),
                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
                                                        type: "secondary",
                                                        style: {
                                                            fontSize: 11,
                                                            color: isActive ? '#64748b' : '#94a3b8'
                                                        },
                                                        children: new Date(session.updatedAt).toLocaleTimeString([], {
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                                                        lineNumber: 187,
                                                        columnNumber: 27
                                                    }, void 0)
                                                ]
                                            }, void 0, true)
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                                            lineNumber: 159,
                                            columnNumber: 21
                                        }, void 0),
                                        !isEditing && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                            className: "action-icons",
                                            style: {
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 4,
                                                opacity: 0,
                                                transition: 'opacity 0.2s ease'
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                    title: "Rename",
                                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.EditOutlined, {
                                                        onClick: (e)=>handleStartRename(e, session.id, session.title),
                                                        style: {
                                                            color: '#64748b',
                                                            fontSize: 14,
                                                            padding: 4
                                                        }
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                                                        lineNumber: 215,
                                                        columnNumber: 27
                                                    }, void 0)
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                                                    lineNumber: 214,
                                                    columnNumber: 25
                                                }, void 0),
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Popconfirm, {
                                                    title: "Confirm delete?",
                                                    onConfirm: (e)=>{
                                                        e === null || e === void 0 || e.stopPropagation();
                                                        deleteSession(session.id);
                                                    },
                                                    onCancel: (e)=>e === null || e === void 0 ? void 0 : e.stopPropagation(),
                                                    okText: "Delete",
                                                    cancelText: "Cancel",
                                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.DeleteOutlined, {
                                                        onClick: (e)=>e.stopPropagation(),
                                                        style: {
                                                            color: '#ef4444',
                                                            fontSize: 14,
                                                            padding: 4
                                                        }
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                                                        lineNumber: 231,
                                                        columnNumber: 27
                                                    }, void 0)
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                                                    lineNumber: 221,
                                                    columnNumber: 25
                                                }, void 0)
                                            ]
                                        }, void 0, true, {
                                            fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                                            lineNumber: 204,
                                            columnNumber: 23
                                        }, void 0)
                                    ]
                                }, void 0, true)
                            ]
                        }, void 0, true, {
                            fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                            lineNumber: 130,
                            columnNumber: 15
                        }, void 0);
                    }
                }, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                    lineNumber: 123,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                lineNumber: 122,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("style", {
                children: `
        .session-item:hover { background: #f1f5f9; }
        .session-item:hover .action-icons { opacity: 1 !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
                lineNumber: 246,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/ChatSidebar.tsx",
        lineNumber: 54,
        columnNumber: 5
    }, this);
};
_s(ChatSidebar, "iqJnf6hAWD7wjdY7Rmq/1Jet4u8=", false, function() {
    return [
        _chatStore.useChatStore,
        _agentStore.useAgentStore
    ];
});
_c = ChatSidebar;
var _default = ChatSidebar;
var _c;
$RefreshReg$(_c, "ChatSidebar");
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

},
"src/pages/KnowledgeQA/components/ContextTagBar.tsx": function (module, exports, __mako_require__){
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
    ContextTagBar: function() {
        return ContextTagBar;
    },
    default: function() {
        return _default;
    }
});
var _interop_require_default = __mako_require__("@swc/helpers/_/_interop_require_default");
var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var _jsxdevruntime = __mako_require__("node_modules/react/jsx-dev-runtime.js");
var _react = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/react/index.js"));
var _antd = __mako_require__("node_modules/antd/es/index.js");
var _icons = __mako_require__("node_modules/@ant-design/icons/es/index.js");
var _constants = __mako_require__("src/pages/KnowledgeQA/styles/constants.ts");
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
const TYPE_COLORS = {
    COMPANY: {
        bg: 'rgba(255, 193, 1, 0.08)',
        border: 'rgba(255, 193, 1, 0.25)',
        text: '#CC9900'
    },
    PERSON: {
        bg: 'rgba(24, 144, 255, 0.08)',
        border: 'rgba(24, 144, 255, 0.25)',
        text: '#1890FF'
    },
    EVENT: {
        bg: 'rgba(255, 107, 107, 0.08)',
        border: 'rgba(255, 107, 107, 0.25)',
        text: '#FF6B6B'
    },
    SUB_EVENT: {
        bg: 'rgba(255, 153, 153, 0.08)',
        border: 'rgba(255, 153, 153, 0.25)',
        text: '#FF9999'
    },
    TIME: {
        bg: 'rgba(255, 140, 0, 0.08)',
        border: 'rgba(255, 140, 0, 0.25)',
        text: '#FF8C00'
    },
    RiskFeature: {
        bg: 'rgba(76, 175, 80, 0.08)',
        border: 'rgba(76, 175, 80, 0.25)',
        text: '#4CAF50'
    },
    RiskFactor: {
        bg: 'rgba(156, 39, 176, 0.08)',
        border: 'rgba(156, 39, 176, 0.25)',
        text: '#9C27B0'
    },
    Action: {
        bg: 'rgba(69, 183, 209, 0.08)',
        border: 'rgba(69, 183, 209, 0.25)',
        text: '#45B7D1'
    },
    Regulation: {
        bg: 'rgba(255, 193, 1, 0.08)',
        border: 'rgba(255, 193, 1, 0.25)',
        text: '#CC9900'
    },
    Law: {
        bg: 'rgba(24, 144, 255, 0.08)',
        border: 'rgba(24, 144, 255, 0.25)',
        text: '#1890FF'
    },
    default: {
        bg: 'rgba(148, 163, 184, 0.1)',
        border: 'rgba(148, 163, 184, 0.3)',
        text: '#64748B'
    }
};
const ContextTagBar = ({ tags, onRemove, onClearAll, onTagClick })=>{
    if (tags.length === 0) return null;
    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
        style: {
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(247, 249, 252, 0.8)',
            borderRadius: 10,
            border: `1px dashed ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`,
            marginBottom: 8
        },
        children: [
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                style: {
                    fontSize: 11,
                    color: _constants.DESIGN_TOKENS.TEXT_MUTED,
                    fontWeight: 500,
                    marginRight: 4
                },
                children: "上下文约束:"
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/ContextTagBar.tsx",
                lineNumber: 99,
                columnNumber: 7
            }, this),
            tags.map((tag, index)=>{
                const colors = TYPE_COLORS[tag.type] || TYPE_COLORS.default;
                return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                    style: {
                        background: colors.bg,
                        border: `1px solid ${colors.border}`,
                        color: colors.text,
                        fontSize: 12,
                        fontWeight: 500,
                        padding: '2px 8px',
                        borderRadius: 14,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: onTagClick ? 'pointer' : 'default',
                        transition: 'all 0.2s ease',
                        animation: 'tagFlyIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        animationFillMode: 'backwards',
                        animationDelay: `${index * 0.05}s`
                    },
                    onClick: ()=>onTagClick === null || onTagClick === void 0 ? void 0 : onTagClick(tag),
                    onMouseEnter: (e)=>{
                        if (onTagClick) {
                            e.currentTarget.style.transform = 'scale(1.02)';
                            e.currentTarget.style.boxShadow = `0 2px 8px ${colors.border}`;
                        }
                    },
                    onMouseLeave: (e)=>{
                        if (onTagClick) {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = 'none';
                        }
                    },
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                            style: {
                                fontSize: 10,
                                opacity: 0.7,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                            },
                            children: tag.type
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/ContextTagBar.tsx",
                            lineNumber: 146,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                            children: tag.label || tag.id
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/ContextTagBar.tsx",
                            lineNumber: 156,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.CloseOutlined, {
                            style: {
                                fontSize: 10,
                                marginLeft: 2,
                                opacity: 0.6,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            },
                            onClick: (e)=>{
                                e.stopPropagation();
                                onRemove(tag.id);
                            },
                            onMouseEnter: (e)=>{
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.color = '#EF4444';
                            },
                            onMouseLeave: (e)=>{
                                e.currentTarget.style.opacity = '0.6';
                                e.currentTarget.style.color = 'inherit';
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/ContextTagBar.tsx",
                            lineNumber: 157,
                            columnNumber: 13
                        }, this)
                    ]
                }, `${tag.id}-${index}`, true, {
                    fileName: "src/pages/KnowledgeQA/components/ContextTagBar.tsx",
                    lineNumber: 113,
                    columnNumber: 11
                }, this);
            }),
            tags.length > 1 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("button", {
                onClick: onClearAll,
                style: {
                    fontSize: 11,
                    color: _constants.DESIGN_TOKENS.TEXT_MUTED,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: 4,
                    transition: 'all 0.15s ease'
                },
                onMouseEnter: (e)=>{
                    e.currentTarget.style.color = _constants.DESIGN_TOKENS.COLOR_ERROR;
                    e.currentTarget.style.background = _constants.DESIGN_TOKENS.ERROR_LIGHT;
                },
                onMouseLeave: (e)=>{
                    e.currentTarget.style.color = _constants.DESIGN_TOKENS.TEXT_MUTED;
                    e.currentTarget.style.background = 'none';
                },
                children: "清空"
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/ContextTagBar.tsx",
                lineNumber: 183,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("style", {
                children: `
        @keyframes tagFlyIn {
          0% { opacity: 0; transform: translateX(40px) translateY(-10px) scale(0.5); }
          60% { opacity: 1; transform: translateX(-3px) translateY(0) scale(1.03); }
          100% { opacity: 1; transform: translateX(0) translateY(0) scale(1); }
        }
      `
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/ContextTagBar.tsx",
                lineNumber: 208,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/ContextTagBar.tsx",
        lineNumber: 86,
        columnNumber: 5
    }, this);
};
_c = ContextTagBar;
var _default = ContextTagBar;
var _c;
$RefreshReg$(_c, "ContextTagBar");
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

},
"src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx": function (module, exports, __mako_require__){
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
    EnhancedGraphPanel: function() {
        return EnhancedGraphPanel;
    },
    default: function() {
        return _default;
    }
});
var _interop_require_default = __mako_require__("@swc/helpers/_/_interop_require_default");
var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
var _reactrefresh = _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var _jsxdevruntime = __mako_require__("node_modules/react/jsx-dev-runtime.js");
var _react = _interop_require_wildcard._(__mako_require__("node_modules/react/index.js"));
var _antd = __mako_require__("node_modules/antd/es/index.js");
var _g6 = _interop_require_default._(__mako_require__("node_modules/@antv/g6/es/index.js"));
var _axios = _interop_require_default._(__mako_require__("node_modules/axios/index.js"));
var _LegendPanel = _interop_require_default._(__mako_require__("src/pages/KnowledgeQA/components/LegendPanel.tsx"));
var _NodeContextMenu = _interop_require_default._(__mako_require__("src/pages/KnowledgeQA/components/NodeContextMenu.tsx"));
var _GraphToolbar = _interop_require_default._(__mako_require__("src/pages/KnowledgeQA/components/GraphToolbar.tsx"));
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
var _s = $RefreshSig$();
const { Text } = _antd.Typography;
const VALID_NODE_TYPES = new Set([
    'COMPANY',
    'PERSON',
    'EVENT',
    'SUB_EVENT',
    'TIME',
    'RiskFeature',
    'RiskFactor',
    'Action',
    'Regulation',
    'Law'
]);
const NODE_VISUAL = {
    COMPANY: {
        color: '#FFC101',
        size: 34,
        labelOffset: 10
    },
    PERSON: {
        color: '#1890FF',
        size: 26,
        labelOffset: 8
    },
    EVENT: {
        color: '#FF6B6B',
        size: 30,
        labelOffset: 10
    },
    SUB_EVENT: {
        color: '#FF9999',
        size: 20,
        labelOffset: 6
    },
    TIME: {
        color: '#FF8C00',
        size: 16,
        labelOffset: 5
    },
    RiskFeature: {
        color: '#4CAF50',
        size: 24,
        labelOffset: 8
    },
    RiskFactor: {
        color: '#9C27B0',
        size: 22,
        labelOffset: 7
    },
    Action: {
        color: '#45B7D1',
        size: 22,
        labelOffset: 7
    },
    Regulation: {
        color: '#FFC101',
        size: 20,
        labelOffset: 6
    },
    Law: {
        color: '#1890FF',
        size: 18,
        labelOffset: 6
    }
};
const normalizeNeo4jNode = (raw)=>{
    const props = raw.properties || {};
    const labels = raw.labels || [];
    return {
        id: String(raw.id),
        type: labels[0] || 'Unknown',
        score: props.score ?? 1,
        title: props.title || props.name || props.COMPANY_NM || raw.id,
        name: props.name || props.COMPANY_NM || props.title || raw.id,
        zh_name: props.zh_name || props.name,
        overview: props.overview || props.RISK_INFO || '',
        popularity: props.popularity,
        rating: props.rating,
        year: props.year
    };
};
const normalizeNeo4jEdge = (raw)=>({
        source: String(raw.source || raw.start),
        target: String(raw.target || raw.end),
        relation: raw.label || raw.relation || raw.type || 'RELATED'
    });
const EDGE_STYLE_MAP = {
    TRIGGERS: {
        stroke: '#f5222d',
        lineDash: [],
        lineWidth: 2,
        opacity: 0.8
    },
    REFLECTS: {
        stroke: '#fa8c16',
        lineDash: [],
        lineWidth: 1.5,
        opacity: 0.7
    },
    COMPLIES_WITH: {
        stroke: '#722ed1',
        lineDash: [
            4,
            4
        ],
        lineWidth: 1.5,
        opacity: 0.7
    },
    MENTION: {
        stroke: '#45B7D1',
        lineDash: [
            2,
            3
        ],
        lineWidth: 1,
        opacity: 0.5
    },
    CAUSE: {
        stroke: '#fa541c',
        lineDash: [],
        lineWidth: 1.5,
        opacity: 0.7
    },
    BELONG: {
        stroke: '#52c41a',
        lineDash: [
            2,
            3
        ],
        lineWidth: 1,
        opacity: 0.5
    }
};
const EDGE_DEFAULT_STYLE = {
    stroke: '#cbd5e1',
    lineDash: [],
    lineWidth: 0.8,
    opacity: 0.4
};
const buildG6Data = (subgraph, subjectIds, neighborIds)=>{
    if (!subgraph) return {
        nodes: [],
        edges: []
    };
    const subjectIdSet = new Set((subjectIds || []).map(String));
    const neighborIdSet = new Set((neighborIds || []).map(String));
    const degreeMap = new Map();
    for (const e of subgraph.edges || []){
        const src = String(e.source);
        const tgt = String(e.target);
        degreeMap.set(src, (degreeMap.get(src) || 0) + 1);
        degreeMap.set(tgt, (degreeMap.get(tgt) || 0) + 1);
    }
    const maxDegree = Math.max(1, ...Array.from(degreeMap.values()));
    const scaleSize = (degree)=>{
        const minSize = 18;
        const maxSize = 50;
        return minSize + degree / maxDegree * (maxSize - minSize);
    };
    const pathNodeIds = new Set();
    const pathEdgeKeys = new Set();
    for (const path of subgraph.paths || []){
        for (const nid of path.nodeIds || [])pathNodeIds.add(String(nid));
        const nids = path.nodeIds || [];
        for(let i = 0; i < nids.length - 1; i++){
            pathEdgeKeys.add(`${nids[i]}→${nids[i + 1]}`);
            pathEdgeKeys.add(`${nids[i + 1]}→${nids[i]}`);
        }
    }
    const validNodeIds = new Set();
    const nodes = subgraph.nodes.filter((n)=>VALID_NODE_TYPES.has(n.type)).map((node)=>{
        const nodeIdStr = String(node.id);
        validNodeIds.add(nodeIdStr);
        const visual = NODE_VISUAL[node.type] ?? {
            color: '#a1a1aa',
            size: 14,
            labelOffset: 5
        };
        let label = String(node.title || node.zh_name || node.name || node.id);
        if (label.length > 15) label = label.slice(0, 12) + '...';
        const riskLevel = node.risk_level || node.riskLevel;
        const riskColor = riskLevel === 'high' ? '#f5222d' : riskLevel === 'medium' ? '#fa8c16' : riskLevel === 'low' ? '#52c41a' : null;
        const fillColor = riskColor || visual.color;
        const deg = degreeMap.get(nodeIdStr) || 1;
        const nodeSize = scaleSize(deg);
        const isPathNode = pathNodeIds.has(nodeIdStr);
        const isSubject = subjectIdSet.has(nodeIdStr);
        const isNeighbor = neighborIdSet.has(nodeIdStr);
        const borderColor = isSubject ? '#2855D1' : isNeighbor ? '#1890FF' : isPathNode ? '#2855D1' : node.type === 'COMPANY' ? fillColor : 'transparent';
        const borderWidth = isSubject ? 4 : isNeighbor ? 2 : isPathNode ? 3 : node.type === 'COMPANY' ? 2 : 0;
        const finalSize = isSubject ? nodeSize * 1.3 : isNeighbor ? nodeSize * 1.1 : nodeSize;
        return {
            id: nodeIdStr,
            label,
            _type: node.type,
            type: 'circle',
            size: finalSize,
            _riskLevel: riskLevel || null,
            _isPathNode: isPathNode,
            _isSubject: isSubject,
            _isNeighbor: isNeighbor,
            _degree: deg,
            style: {
                fill: fillColor,
                stroke: borderColor,
                lineWidth: borderWidth,
                cursor: 'pointer',
                shadowColor: isSubject ? 'rgba(40, 85, 209, 0.4)' : undefined,
                shadowBlur: isSubject ? 12 : 0
            },
            labelCfg: {
                position: 'bottom',
                offset: visual.labelOffset + Math.max(0, (finalSize - 20) * 0.3),
                style: {
                    fill: '#1e293b',
                    fontSize: isSubject ? 13 : node.type === 'COMPANY' ? 12 : 10,
                    fontWeight: isSubject ? 800 : isNeighbor || isPathNode ? 700 : node.type === 'COMPANY' ? 600 : 500,
                    background: {
                        fill: 'rgba(255, 255, 255, 0.85)',
                        padding: [
                            2,
                            4,
                            2,
                            4
                        ],
                        radius: 4
                    }
                }
            }
        };
    });
    const edges = subgraph.edges.filter((e)=>validNodeIds.has(String(e.source)) && validNodeIds.has(String(e.target))).map((edge, idx)=>{
        const relStyle = EDGE_STYLE_MAP[edge.relation] ?? EDGE_DEFAULT_STYLE;
        const edgeKey = `${edge.source}→${edge.target}`;
        const isPathEdge = pathEdgeKeys.has(edgeKey);
        return {
            id: `edge-${idx}`,
            source: String(edge.source),
            target: String(edge.target),
            relation: edge.relation,
            type: 'quadratic',
            _isPathEdge: isPathEdge,
            label: edge.relation,
            labelCfg: {
                autoRotate: true,
                refX: 0,
                refY: 2,
                style: {
                    fontSize: 9,
                    fill: '#475569',
                    fontWeight: 500,
                    background: {
                        fill: 'rgba(255, 255, 255, 0.88)',
                        padding: [
                            1,
                            4,
                            1,
                            4
                        ],
                        radius: 3
                    }
                }
            },
            style: {
                ...relStyle,
                endArrow: true,
                curvature: 0.15,
                lineWidth: isPathEdge ? (relStyle.lineWidth || 1) * 2.5 : relStyle.lineWidth,
                stroke: isPathEdge ? '#2855D1' : relStyle.stroke,
                lineDash: isPathEdge ? [
                    8,
                    4
                ] : relStyle.lineDash,
                opacity: isPathEdge ? 1 : relStyle.opacity
            }
        };
    });
    return {
        nodes,
        edges,
        pathNodeIds,
        pathEdgeKeys
    };
};
const EnhancedGraphPanel = _s((0, _react.forwardRef)(_c = _s(({ subgraph, alignmentFeatures, onNodeDoubleClick, highlightedEntity }, ref)=>{
    var _subgraph_paths;
    _s();
    const containerRef = (0, _react.useRef)(null);
    const graphRef = (0, _react.useRef)(null);
    const subgraphRef = (0, _react.useRef)(subgraph);
    subgraphRef.current = subgraph;
    const [loading, setLoading] = (0, _react.useState)(false);
    const [selectedNode, setSelectedNode] = (0, _react.useState)(null);
    const [liveStats, setLiveStats] = (0, _react.useState)(null);
    const [visibleCategories, setVisibleCategories] = (0, _react.useState)(new Set(VALID_NODE_TYPES));
    const [contextMenu, setContextMenu] = (0, _react.useState)({
        visible: false,
        x: 0,
        y: 0,
        nodeId: '',
        nodeName: '',
        nodeType: ''
    });
    const [isFullscreen, setIsFullscreen] = (0, _react.useState)(false);
    const [layoutMode, setLayoutMode] = (0, _react.useState)('force');
    const [pathOnly, setPathOnly] = (0, _react.useState)(false);
    const pathNodeIdsRef = (0, _react.useRef)(new Set());
    const syncGraphStats = (0, _react.useCallback)(()=>{
        const g = graphRef.current;
        if (!g) return;
        const gNodes = g.getNodes();
        const gEdges = g.getEdges();
        const nodeCounts = {};
        const edgeCounts = {};
        for (const n of gNodes){
            const model = n.getModel();
            const t = (model === null || model === void 0 ? void 0 : model._type) ?? '';
            if (VALID_NODE_TYPES.has(t)) nodeCounts[t] = (nodeCounts[t] ?? 0) + 1;
        }
        for (const e of gEdges){
            const model = e.getModel();
            const rel = (model === null || model === void 0 ? void 0 : model.relation) ?? 'UNKNOWN';
            edgeCounts[rel] = (edgeCounts[rel] ?? 0) + 1;
        }
        setLiveStats({
            totalNodes: gNodes.length,
            totalEdges: gEdges.length,
            nodeCounts,
            edgeCounts
        });
    }, []);
    const applyHighlight = (0, _react.useCallback)((cat)=>{
        const g = graphRef.current;
        if (!g) return;
        g.getNodes().forEach((n)=>g.setItemState(n, 'dimmed', cat ? n.getModel()._type !== cat : false));
        g.getEdges().forEach((e)=>g.setItemState(e, 'dimmed', cat ? e.getModel().relation !== cat : false));
    }, []);
    const toggleCategory = (0, _react.useCallback)((cat)=>{
        const g = graphRef.current;
        if (!g) return;
        setVisibleCategories((prev)=>{
            const next = new Set(prev);
            const hide = next.has(cat);
            hide ? next.delete(cat) : next.add(cat);
            g.getNodes().forEach((n)=>{
                if (n.getModel()._type === cat) hide ? g.hideItem(n) : g.showItem(n);
            });
            g.getEdges().forEach((e)=>{
                if (e.getModel().relation === cat) hide ? g.hideItem(e) : g.showItem(e);
            });
            return next;
        });
    }, []);
    const searchAndExpand = (0, _react.useCallback)(async (nodeId, nodeType)=>{
        const graph = graphRef.current;
        if (!graph) {
            console.warn('Graph instance not ready for expansion');
            return;
        }
        _antd.message.loading({
            content: 'Exploring connections...',
            key: 'expand'
        });
        try {
            const url = `/api/v1/graph/expand?id=${encodeURIComponent(nodeId)}&type=${encodeURIComponent(nodeType)}`;
            const res = await _axios.default.get(url);
            const data = res.data;
            if (!data || !Array.isArray(data.nodes)) throw new Error('Invalid response format from server');
            const { nodes: rawNodes, edges: rawEdges } = data;
            const nN = (rawNodes || []).map(normalizeNeo4jNode);
            const nE = (rawEdges || []).map(normalizeNeo4jEdge);
            const addedNodeIds = new Set();
            nN.forEach((n)=>{
                const idStr = String(n.id);
                if (!graph.findById(idStr)) {
                    const v = NODE_VISUAL[n.type] || {
                        color: '#94a3b8',
                        size: 14,
                        labelOffset: 5
                    };
                    let label = String(n.title || n.zh_name || n.name || n.id);
                    if (label.length > 15) label = label.slice(0, 12) + '...';
                    try {
                        graph.addItem('node', {
                            id: idStr,
                            label,
                            type: 'circle',
                            _type: n.type,
                            size: v.size,
                            style: {
                                fill: v.color,
                                stroke: n.type === 'COMPANY' ? v.color : 'transparent',
                                lineWidth: n.type === 'COMPANY' ? 2 : 0,
                                cursor: 'pointer'
                            },
                            labelCfg: {
                                position: 'bottom',
                                offset: v.labelOffset,
                                style: {
                                    fill: '#1e293b',
                                    fontSize: n.type === 'COMPANY' ? 12 : 10,
                                    fontWeight: n.type === 'COMPANY' ? 600 : 500,
                                    background: {
                                        fill: 'rgba(255,255,255,0.85)',
                                        padding: [
                                            2,
                                            4,
                                            2,
                                            4
                                        ],
                                        radius: 4
                                    }
                                }
                            }
                        });
                        addedNodeIds.add(idStr);
                    } catch (e) {}
                } else addedNodeIds.add(idStr);
            });
            const seenEdges = new Set();
            nE.forEach((e, idx)=>{
                const src = String(e.source);
                const tgt = String(e.target);
                const edgeKey = `${src}→${tgt}→${e.relation}`;
                if (seenEdges.has(edgeKey)) return;
                seenEdges.add(edgeKey);
                if (!graph.findById(src) || !graph.findById(tgt)) return;
                const relStyle = EDGE_STYLE_MAP[e.relation] ?? EDGE_DEFAULT_STYLE;
                const edgeId = `edge-exp-${nodeId}-${idx}-${Date.now()}`;
                try {
                    graph.addItem('edge', {
                        id: edgeId,
                        source: src,
                        target: tgt,
                        relation: e.relation,
                        type: 'quadratic',
                        style: {
                            ...relStyle,
                            endArrow: true,
                            curvature: 0.15
                        }
                    });
                } catch (err) {}
            });
            graph.layout();
            syncGraphStats();
            graph.focusItem(String(nodeId), true);
            _antd.message.success({
                content: 'Exploration complete',
                key: 'expand'
            });
        } catch (err) {
            console.error('Expand failed:', err);
            _antd.message.error({
                content: 'Exploration failed',
                key: 'expand'
            });
        }
    }, [
        syncGraphStats
    ]);
    const handleZoomIn = (0, _react.useCallback)(()=>{
        const g = graphRef.current;
        if (!g) return;
        const current = g.getZoom();
        g.zoomTo(current * 1.2);
    }, []);
    const handleZoomOut = (0, _react.useCallback)(()=>{
        const g = graphRef.current;
        if (!g) return;
        const current = g.getZoom();
        g.zoomTo(current * 0.8);
    }, []);
    const handleFitView = (0, _react.useCallback)(()=>{
        var _graphRef_current;
        (_graphRef_current = graphRef.current) === null || _graphRef_current === void 0 || _graphRef_current.fitView(30);
    }, []);
    const handleToggleFullscreen = (0, _react.useCallback)(()=>{
        const container = containerRef.current;
        if (!container) return;
        if (!isFullscreen) {
            var _container_requestFullscreen;
            (_container_requestFullscreen = container.requestFullscreen) === null || _container_requestFullscreen === void 0 || _container_requestFullscreen.call(container).catch(()=>{});
        } else {
            var _document_exitFullscreen, _document;
            (_document_exitFullscreen = (_document = document).exitFullscreen) === null || _document_exitFullscreen === void 0 || _document_exitFullscreen.call(_document).catch(()=>{});
        }
        setIsFullscreen(!isFullscreen);
    }, [
        isFullscreen
    ]);
    const handleExportImage = (0, _react.useCallback)((format)=>{
        const g = graphRef.current;
        if (!g) return;
        const mime = format === 'svg' ? 'image/svg+xml' : 'image/png';
        g.downloadFullImage(`windeye-graph-${Date.now()}`, mime, {
            backgroundColor: '#ffffff',
            padding: 20
        });
    }, []);
    const handleChangeLayout = (0, _react.useCallback)((mode)=>{
        const g = graphRef.current;
        if (!g) return;
        setLayoutMode(mode);
        switch(mode){
            case 'force':
                g.updateLayout({
                    type: 'force',
                    preventOverlap: true,
                    nodeSize: 40,
                    nodeSpacing: 40,
                    linkDistance: 150,
                    nodeStrength: -200
                });
                break;
            case 'dagre':
                g.updateLayout({
                    type: 'dagre',
                    rankdir: 'TB',
                    nodesep: 20,
                    ranksep: 60
                });
                break;
            case 'circular':
                g.updateLayout({
                    type: 'circular',
                    radius: 250,
                    ordering: 'degree'
                });
                break;
        }
        setTimeout(()=>g.fitView(30), 400);
    }, []);
    const applyPathOnlyFilter = (0, _react.useCallback)((showPathOnly)=>{
        const g = graphRef.current;
        if (!g) return;
        const pathIds = pathNodeIdsRef.current;
        if (pathIds.size === 0) return;
        if (showPathOnly) {
            g.getNodes().forEach((n)=>{
                const id = n.getID();
                if (!pathIds.has(id)) g.hideItem(n);
                else g.showItem(n);
            });
            g.getEdges().forEach((e)=>{
                const model = e.getModel();
                if (!model._isPathEdge) g.hideItem(e);
                else g.showItem(e);
            });
        } else {
            g.getNodes().forEach((n)=>g.showItem(n));
            g.getEdges().forEach((e)=>g.showItem(e));
        }
        g.fitView(30);
    }, []);
    const handleTogglePathOnly = (0, _react.useCallback)(()=>{
        setPathOnly((prev)=>{
            const next = !prev;
            applyPathOnlyFilter(next);
            return next;
        });
    }, [
        applyPathOnlyFilter
    ]);
    const handleContextViewDetail = (0, _react.useCallback)(()=>{
        var _subgraphRef_current;
        const raw = (_subgraphRef_current = subgraphRef.current) === null || _subgraphRef_current === void 0 ? void 0 : _subgraphRef_current.nodes.find((n)=>String(n.id) === contextMenu.nodeId);
        if (raw) setSelectedNode(raw);
        setContextMenu((prev)=>({
                ...prev,
                visible: false
            }));
    }, [
        contextMenu.nodeId
    ]);
    const handleContextAddMonitor = (0, _react.useCallback)(()=>{
        _antd.message.success(`Monitoring added for: ${contextMenu.nodeName}`);
        setContextMenu((prev)=>({
                ...prev,
                visible: false
            }));
    }, [
        contextMenu.nodeName
    ]);
    const handleContextExpand = (0, _react.useCallback)(()=>{
        searchAndExpand(contextMenu.nodeId, contextMenu.nodeType);
        setContextMenu((prev)=>({
                ...prev,
                visible: false
            }));
    }, [
        contextMenu.nodeId,
        contextMenu.nodeType,
        searchAndExpand
    ]);
    const handleContextGenerateReport = (0, _react.useCallback)(()=>{
        window.dispatchEvent(new CustomEvent('generateRiskForEntity', {
            detail: {
                entityId: contextMenu.nodeId,
                entityName: contextMenu.nodeName,
                entityType: contextMenu.nodeType
            }
        }));
        _antd.message.info(`Generating risk report for: ${contextMenu.nodeName}`);
        setContextMenu((prev)=>({
                ...prev,
                visible: false
            }));
    }, [
        contextMenu.nodeId,
        contextMenu.nodeName,
        contextMenu.nodeType
    ]);
    const hasPaths = ((subgraph === null || subgraph === void 0 ? void 0 : (_subgraph_paths = subgraph.paths) === null || _subgraph_paths === void 0 ? void 0 : _subgraph_paths.length) || 0) > 0;
    (0, _react.useImperativeHandle)(ref, ()=>({
            refresh: (sg, _alignedFeatures, subjectIds, neighborIds)=>{
                if (!graphRef.current) return;
                const g6Data = buildG6Data(sg, subjectIds, neighborIds);
                pathNodeIdsRef.current = g6Data.pathNodeIds || new Set();
                graphRef.current.changeData(g6Data);
                graphRef.current.fitView(30);
                syncGraphStats();
                if (pathOnly) applyPathOnlyFilter(true);
            },
            fitView: ()=>{
                var _graphRef_current;
                return (_graphRef_current = graphRef.current) === null || _graphRef_current === void 0 ? void 0 : _graphRef_current.fitView(30);
            },
            resetHighlight: ()=>{
                if (!graphRef.current) return;
                graphRef.current.getNodes().forEach((n)=>{
                    var _graphRef_current;
                    return (_graphRef_current = graphRef.current) === null || _graphRef_current === void 0 ? void 0 : _graphRef_current.clearItemStates(n);
                });
                graphRef.current.getEdges().forEach((e)=>{
                    var _graphRef_current;
                    return (_graphRef_current = graphRef.current) === null || _graphRef_current === void 0 ? void 0 : _graphRef_current.clearItemStates(e);
                });
            },
            focusNode: (nodeId)=>{
                var _subgraphRef_current;
                if (!graphRef.current) return;
                graphRef.current.focusItem(nodeId, true);
                const raw = (_subgraphRef_current = subgraphRef.current) === null || _subgraphRef_current === void 0 ? void 0 : _subgraphRef_current.nodes.find((n)=>String(n.id) === nodeId);
                if (raw) setSelectedNode(raw);
            },
            searchAndExpand,
            dimNonFocused: (subjectIds, neighborIds)=>{
                const g = graphRef.current;
                if (!g) return;
                if (subjectIds.length === 0) {
                    g.getNodes().forEach((n)=>g.clearItemStates(n));
                    g.getEdges().forEach((e)=>g.clearItemStates(e));
                    return;
                }
                const subjectSet = new Set(subjectIds.map(String));
                const neighborSet = new Set(neighborIds.map(String));
                g.getNodes().forEach((n)=>{
                    const id = n.getID();
                    if (!subjectSet.has(id) && !neighborSet.has(id)) g.setItemState(n, 'dimmed', true);
                });
                g.getEdges().forEach((e)=>{
                    const model = e.getModel();
                    const src = String(model.source);
                    const tgt = String(model.target);
                    const isRelevant = subjectSet.has(src) || subjectSet.has(tgt) || neighborSet.has(src) || neighborSet.has(tgt);
                    if (!isRelevant) g.setItemState(e, 'dimmed', true);
                });
            },
            clear: ()=>{
                if (!graphRef.current) return;
                graphRef.current.changeData({
                    nodes: [],
                    edges: []
                });
                setLiveStats(null);
                setSelectedNode(null);
            }
        }));
    (0, _react.useEffect)(()=>{
        let mounted = true;
        let graph = null;
        const init = ()=>{
            if (!containerRef.current) return;
            setLoading(true);
            try {
                graph = new _g6.default.Graph({
                    container: containerRef.current,
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                    layout: {
                        type: 'force',
                        preventOverlap: true,
                        nodeSize: 40,
                        nodeSpacing: 40,
                        linkDistance: 150,
                        nodeStrength: -200
                    },
                    defaultNode: {
                        type: 'circle',
                        size: 20
                    },
                    defaultEdge: {
                        type: 'quadratic',
                        style: {
                            endArrow: true
                        }
                    },
                    modes: {
                        default: [
                            'drag-canvas',
                            'zoom-canvas',
                            'drag-node'
                        ]
                    },
                    nodeStateStyles: {
                        dimmed: {
                            opacity: 0.15
                        }
                    },
                    edgeStateStyles: {
                        dimmed: {
                            opacity: 0.08
                        }
                    }
                });
                graphRef.current = graph;
                graph.render();
                syncGraphStats();
                const resizeObserver = new ResizeObserver(()=>{
                    if (containerRef.current && graphRef.current) {
                        graphRef.current.changeSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
                        graphRef.current.fitView(30);
                    }
                });
                resizeObserver.observe(containerRef.current);
                graph.on('node:click', (e)=>{
                    var _subgraphRef_current;
                    const raw = (_subgraphRef_current = subgraphRef.current) === null || _subgraphRef_current === void 0 ? void 0 : _subgraphRef_current.nodes.find((n)=>{
                        var _e_item;
                        return String(n.id) === ((_e_item = e.item) === null || _e_item === void 0 ? void 0 : _e_item.getID());
                    });
                    if (raw) setSelectedNode(raw);
                });
                graph.on('node:dblclick', (e)=>{
                    var _e_item, _e_item1, _e_item2;
                    const nodeId = (_e_item = e.item) === null || _e_item === void 0 ? void 0 : _e_item.getID();
                    const nodeType = ((_e_item1 = e.item) === null || _e_item1 === void 0 ? void 0 : _e_item1.getModel()._type) || 'COMPANY';
                    const nodeName = ((_e_item2 = e.item) === null || _e_item2 === void 0 ? void 0 : _e_item2.getModel().label) || nodeId;
                    onNodeDoubleClick === null || onNodeDoubleClick === void 0 || onNodeDoubleClick(nodeId, nodeName, nodeType);
                    searchAndExpand(nodeId, nodeType);
                });
                graph.on('node:contextmenu', (e)=>{
                    var _e_originalEvent_preventDefault, _e_originalEvent, _e_item, _e_item1, _e_originalEvent1, _e_originalEvent2;
                    (_e_originalEvent = e.originalEvent) === null || _e_originalEvent === void 0 || (_e_originalEvent_preventDefault = _e_originalEvent.preventDefault) === null || _e_originalEvent_preventDefault === void 0 || _e_originalEvent_preventDefault.call(_e_originalEvent);
                    const model = (_e_item = e.item) === null || _e_item === void 0 ? void 0 : _e_item.getModel();
                    const nodeId = (model === null || model === void 0 ? void 0 : model.id) || ((_e_item1 = e.item) === null || _e_item1 === void 0 ? void 0 : _e_item1.getID());
                    const nodeName = (model === null || model === void 0 ? void 0 : model.label) || nodeId;
                    const nodeType = (model === null || model === void 0 ? void 0 : model._type) || 'Unknown';
                    setContextMenu({
                        visible: true,
                        x: ((_e_originalEvent1 = e.originalEvent) === null || _e_originalEvent1 === void 0 ? void 0 : _e_originalEvent1.clientX) || e.clientX || 0,
                        y: ((_e_originalEvent2 = e.originalEvent) === null || _e_originalEvent2 === void 0 ? void 0 : _e_originalEvent2.clientY) || e.clientY || 0,
                        nodeId,
                        nodeName,
                        nodeType
                    });
                });
                graph.on('canvas:click', ()=>{
                    setContextMenu((prev)=>prev.visible ? {
                            ...prev,
                            visible: false
                        } : prev);
                    setSelectedNode(null);
                });
                let pulseFrame = 0;
                const pulseHighRiskNodes = ()=>{
                    if (!graph || graph.destroyed) return;
                    pulseFrame++;
                    const opacity = 0.5 + 0.5 * Math.sin(pulseFrame * 0.08);
                    graph.getNodes().forEach((n)=>{
                        const model = n.getModel();
                        if (model._riskLevel === 'high') {
                            var _n_getContainer;
                            const container = (_n_getContainer = n.getContainer) === null || _n_getContainer === void 0 ? void 0 : _n_getContainer.call(n);
                            if (container) {
                                var _container_getChildByIndex;
                                const circle = (_container_getChildByIndex = container.getChildByIndex) === null || _container_getChildByIndex === void 0 ? void 0 : _container_getChildByIndex.call(container, 0);
                                if (circle && typeof circle.attr === 'function') circle.attr('opacity', opacity);
                            }
                        }
                    });
                    graph.__pulseTimer = requestAnimationFrame(pulseHighRiskNodes);
                };
                graph.__pulseTimer = requestAnimationFrame(pulseHighRiskNodes);
                let dashOffset = 0;
                const animatePathEdges = ()=>{
                    if (!graph || graph.destroyed) return;
                    dashOffset = (dashOffset + 0.3) % 16;
                    graph.getEdges().forEach((edge)=>{
                        const model = edge.getModel();
                        if (model._isPathEdge) {
                            var _edge_getKeyShape;
                            const keyShape = (_edge_getKeyShape = edge.getKeyShape) === null || _edge_getKeyShape === void 0 ? void 0 : _edge_getKeyShape.call(edge);
                            if (keyShape && typeof keyShape.attr === 'function') keyShape.attr('lineDashOffset', -dashOffset);
                        }
                    });
                    graph.__pathFlowTimer = requestAnimationFrame(animatePathEdges);
                };
                graph.__pathFlowTimer = requestAnimationFrame(animatePathEdges);
                setLoading(false);
                return ()=>resizeObserver.disconnect();
            } finally{
                if (mounted) setLoading(false);
            }
        };
        init();
        return ()=>{
            mounted = false;
            if (graph.__pulseTimer) cancelAnimationFrame(graph.__pulseTimer);
            if (graph.__pathFlowTimer) cancelAnimationFrame(graph.__pathFlowTimer);
            graph === null || graph === void 0 || graph.destroy();
        };
    }, [
        syncGraphStats,
        searchAndExpand
    ]);
    return (0, _jsxdevruntime.jsxDEV)("div", {
        style: styles.root,
        children: [
            (0, _jsxdevruntime.jsxDEV)(_LegendPanel.default, {
                stats: liveStats,
                visibleCategories: visibleCategories,
                onToggle: toggleCategory,
                onHighlight: applyHighlight
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                lineNumber: 723,
                columnNumber: 9
            }, this),
            (0, _jsxdevruntime.jsxDEV)("div", {
                style: styles.graphArea,
                children: [
                    (0, _jsxdevruntime.jsxDEV)("div", {
                        ref: containerRef,
                        style: styles.graphCanvas
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                        lineNumber: 730,
                        columnNumber: 11
                    }, this),
                    liveStats && (liveStats.totalNodes > 0 || liveStats.totalEdges > 0) && (0, _jsxdevruntime.jsxDEV)("div", {
                        style: styles.statsOverlay,
                        children: [
                            (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
                                title: "节点总数",
                                value: liveStats.totalNodes,
                                valueStyle: {
                                    fontSize: 20,
                                    fontWeight: 700
                                }
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                lineNumber: 735,
                                columnNumber: 15
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)("div", {
                                style: styles.statsDivider
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                lineNumber: 736,
                                columnNumber: 15
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
                                title: "关系总数",
                                value: liveStats.totalEdges,
                                valueStyle: {
                                    fontSize: 20,
                                    fontWeight: 700
                                }
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                lineNumber: 737,
                                columnNumber: 15
                            }, this),
                            Object.keys(liveStats.nodeCounts || {}).length > 0 && (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                children: [
                                    (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: styles.statsDivider
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                        lineNumber: 740,
                                        columnNumber: 19
                                    }, this),
                                    (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            display: 'flex',
                                            gap: 4,
                                            flexWrap: 'wrap',
                                            alignItems: 'center'
                                        },
                                        children: Object.entries(liveStats.nodeCounts).slice(0, 4).map(([type, count])=>{
                                            var _NODE_VISUAL_type;
                                            return (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                color: ((_NODE_VISUAL_type = NODE_VISUAL[type]) === null || _NODE_VISUAL_type === void 0 ? void 0 : _NODE_VISUAL_type.color) || '#94a3b8',
                                                style: {
                                                    fontSize: 10,
                                                    margin: 0,
                                                    borderRadius: 4
                                                },
                                                children: [
                                                    type,
                                                    ": ",
                                                    count
                                                ]
                                            }, type, true, {
                                                fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                                lineNumber: 743,
                                                columnNumber: 23
                                            }, this);
                                        })
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                        lineNumber: 741,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true)
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                        lineNumber: 734,
                        columnNumber: 13
                    }, this),
                    (0, _jsxdevruntime.jsxDEV)(_GraphToolbar.default, {
                        onZoomIn: handleZoomIn,
                        onZoomOut: handleZoomOut,
                        onFitView: handleFitView,
                        onToggleFullscreen: handleToggleFullscreen,
                        isFullscreen: isFullscreen,
                        onExportImage: handleExportImage,
                        onChangeLayout: handleChangeLayout,
                        layoutMode: layoutMode,
                        onTogglePathOnly: handleTogglePathOnly,
                        pathOnly: pathOnly,
                        hasPaths: hasPaths
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                        lineNumber: 753,
                        columnNumber: 11
                    }, this),
                    selectedNode && (0, _jsxdevruntime.jsxDEV)("div", {
                        style: styles.infoCard,
                        children: [
                            (0, _jsxdevruntime.jsxDEV)("button", {
                                onClick: ()=>setSelectedNode(null),
                                style: styles.closeBtn,
                                children: "×"
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                lineNumber: 769,
                                columnNumber: 15
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    padding: 16
                                },
                                children: [
                                    (0, _jsxdevruntime.jsxDEV)(Text, {
                                        strong: true,
                                        style: {
                                            fontSize: 16,
                                            display: 'block'
                                        },
                                        children: selectedNode.title || selectedNode.zh_name || selectedNode.name
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                        lineNumber: 773,
                                        columnNumber: 17
                                    }, this),
                                    (0, _jsxdevruntime.jsxDEV)(Text, {
                                        type: "secondary",
                                        style: {
                                            fontSize: 12
                                        },
                                        children: selectedNode.type
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                        lineNumber: 776,
                                        columnNumber: 17
                                    }, this),
                                    (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            marginTop: 10,
                                            fontSize: 13,
                                            maxHeight: 200,
                                            overflowY: 'auto'
                                        },
                                        children: selectedNode.overview
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                        lineNumber: 779,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                lineNumber: 772,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                        lineNumber: 768,
                        columnNumber: 13
                    }, this),
                    (0, _jsxdevruntime.jsxDEV)(_NodeContextMenu.default, {
                        visible: contextMenu.visible,
                        x: contextMenu.x,
                        y: contextMenu.y,
                        nodeId: contextMenu.nodeId,
                        nodeName: contextMenu.nodeName,
                        nodeType: contextMenu.nodeType,
                        onClose: ()=>setContextMenu((prev)=>({
                                    ...prev,
                                    visible: false
                                })),
                        onViewDetail: handleContextViewDetail,
                        onAddMonitor: handleContextAddMonitor,
                        onExpand: handleContextExpand,
                        onGenerateReport: handleContextGenerateReport
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                        lineNumber: 786,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                lineNumber: 729,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
        lineNumber: 722,
        columnNumber: 7
    }, this);
}, "l92KRiOsyn5hHFR/PEy/K7paVng=")), "l92KRiOsyn5hHFR/PEy/K7paVng=");
_c1 = EnhancedGraphPanel;
const styles = {
    root: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#f8fafc'
    },
    graphArea: {
        flex: 1,
        position: 'relative',
        overflow: 'hidden'
    },
    graphCanvas: {
        width: '100%',
        height: '100%'
    },
    statsOverlay: {
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: 10,
        padding: '8px 14px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        border: '1px solid #e2e8f0',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        pointerEvents: 'none',
        backdropFilter: 'blur(8px)'
    },
    statsDivider: {
        width: 1,
        height: 28,
        background: '#e2e8f0',
        flexShrink: 0
    },
    infoCard: {
        position: 'absolute',
        top: 16,
        right: 60,
        width: 260,
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        zIndex: 10,
        border: '1px solid #e2e8f0'
    },
    closeBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        background: 'none',
        border: 'none',
        fontSize: 18,
        cursor: 'pointer',
        color: '#94a3b8'
    }
};
var _default = EnhancedGraphPanel;
var _c;
var _c1;
$RefreshReg$(_c, "EnhancedGraphPanel$forwardRef");
$RefreshReg$(_c1, "EnhancedGraphPanel");
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

},
"src/pages/KnowledgeQA/components/EntityMessageBubble.tsx": function (module, exports, __mako_require__){
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
    EntityMessageBubble: function() {
        return EntityMessageBubble;
    },
    default: function() {
        return _default;
    }
});
var _interop_require_default = __mako_require__("@swc/helpers/_/_interop_require_default");
var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
var _reactrefresh = _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var _jsxdevruntime = __mako_require__("node_modules/react/jsx-dev-runtime.js");
var _react = _interop_require_default._(__mako_require__("node_modules/react/index.js"));
var _antd = __mako_require__("node_modules/antd/es/index.js");
var _icons = __mako_require__("node_modules/@ant-design/icons/es/index.js");
var _constants = __mako_require__("src/pages/KnowledgeQA/styles/constants.ts");
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
const { Text } = _antd.Typography;
const formatTime = (ts)=>{
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};
const extractEntities = (text, recommendations)=>{
    const entities = [];
    const addedIds = new Set();
    const addEntity = (id, type, start, end, textContent)=>{
        if (!addedIds.has(id) && textContent && textContent.length > 1 && textContent.length < 30) {
            entities.push({
                id,
                type,
                start,
                end,
                text: textContent
            });
            addedIds.add(id);
        }
    };
    recommendations === null || recommendations === void 0 || recommendations.forEach((rec)=>{
        const bookRegex = /《([^》]+)》/g;
        let match;
        while((match = bookRegex.exec(text)) !== null)addEntity(match[1], 'COMPANY', match.index, match.index + match[0].length, match[1]);
    });
    recommendations === null || recommendations === void 0 || recommendations.forEach((rec)=>{
        if (rec.title || rec.zhTitle || rec.name) {
            const entityName = rec.zhTitle || rec.title || rec.name;
            const idx = text.indexOf(entityName);
            if (idx !== -1) addEntity(entityName, 'COMPANY', idx, idx + entityName.length, entityName);
        }
        if (rec.itemId && rec.itemId.length > 2 && rec.itemId.length < 50) {
            const idx = text.indexOf(rec.itemId);
            if (idx !== -1) addEntity(rec.itemId, 'COMPANY', idx, idx + rec.itemId.length, rec.itemId);
        }
    });
    return entities;
};
const EntityMessageBubble = ({ message, onEntityHover, onEntityClick, highlightedEntity })=>{
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';
    if (isSystem) return (0, _jsxdevruntime.jsxDEV)("div", {
        style: {
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            marginBottom: 12
        },
        children: [
            (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: _constants.DESIGN_TOKENS.ERROR_LIGHT,
                    border: `1px solid ${_constants.DESIGN_TOKENS.ERROR_BORDER}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                },
                children: (0, _jsxdevruntime.jsxDEV)(_icons.InfoCircleOutlined, {
                    style: {
                        color: _constants.DESIGN_TOKENS.COLOR_ERROR,
                        fontSize: 14
                    }
                }, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                    lineNumber: 97,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                lineNumber: 85,
                columnNumber: 9
            }, this),
            (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    background: _constants.DESIGN_TOKENS.ERROR_LIGHT,
                    border: `1px solid ${_constants.DESIGN_TOKENS.ERROR_BORDER}`,
                    borderRadius: 14,
                    padding: '10px 14px',
                    maxWidth: '80%'
                },
                children: (0, _jsxdevruntime.jsxDEV)(Text, {
                    style: {
                        color: _constants.DESIGN_TOKENS.COLOR_ERROR,
                        fontSize: 13,
                        lineHeight: 1.6
                    },
                    children: message.content
                }, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                    lineNumber: 108,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                lineNumber: 99,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
        lineNumber: 84,
        columnNumber: 7
    }, this);
    const renderContent = ()=>{
        var _message_data_output, _message_data;
        const recommendations = ((_message_data = message.data) === null || _message_data === void 0 ? void 0 : (_message_data_output = _message_data.output) === null || _message_data_output === void 0 ? void 0 : _message_data_output.recommendations) || [];
        const entities = extractEntities(message.content, recommendations);
        if (entities.length === 0) return (0, _jsxdevruntime.jsxDEV)("span", {
            children: message.content
        }, void 0, false, {
            fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
            lineNumber: 121,
            columnNumber: 14
        }, this);
        const sortedEntities = [
            ...entities
        ].sort((a, b)=>a.start - b.start);
        const parts = [];
        let lastIndex = 0;
        sortedEntities.forEach((entity, idx)=>{
            if (entity.start > lastIndex) parts.push((0, _jsxdevruntime.jsxDEV)("span", {
                children: message.content.slice(lastIndex, entity.start)
            }, `text-${idx}`, false, {
                fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                lineNumber: 132,
                columnNumber: 11
            }, this));
            const isHighlighted = highlightedEntity === entity.id;
            parts.push((0, _jsxdevruntime.jsxDEV)("span", {
                "data-entity-id": entity.id,
                "data-entity-type": entity.type,
                onMouseEnter: ()=>onEntityHover === null || onEntityHover === void 0 ? void 0 : onEntityHover(entity.id),
                onMouseLeave: ()=>onEntityHover === null || onEntityHover === void 0 ? void 0 : onEntityHover(null),
                onClick: ()=>onEntityClick === null || onEntityClick === void 0 ? void 0 : onEntityClick({
                        id: entity.id,
                        type: entity.type,
                        text: entity.id
                    }),
                style: {
                    color: isHighlighted ? _constants.DESIGN_TOKENS.ACCENT : _constants.DESIGN_TOKENS.TEXT_PRIMARY,
                    background: isHighlighted ? 'rgba(40, 85, 209, 0.2)' : 'rgba(40, 85, 209, 0.06)',
                    borderBottom: `2px solid ${isHighlighted ? _constants.DESIGN_TOKENS.ACCENT : 'rgba(40, 85, 209, 0.3)'}`,
                    cursor: 'pointer',
                    borderRadius: 2,
                    padding: '0 1px',
                    fontWeight: 500,
                    transition: 'all 0.15s ease'
                },
                onMouseEnter: (e)=>{
                    e.currentTarget.style.background = 'rgba(40, 85, 209, 0.15)';
                },
                onMouseLeave: (e)=>{
                    e.currentTarget.style.background = isHighlighted ? 'rgba(40, 85, 209, 0.2)' : 'rgba(40, 85, 209, 0.06)';
                },
                children: message.content.slice(entity.start, entity.end)
            }, `entity-${idx}`, false, {
                fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                lineNumber: 138,
                columnNumber: 9
            }, this));
            lastIndex = entity.end;
        });
        if (lastIndex < message.content.length) parts.push((0, _jsxdevruntime.jsxDEV)("span", {
            children: message.content.slice(lastIndex)
        }, "text-end", false, {
            fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
            lineNumber: 170,
            columnNumber: 18
        }, this));
        return parts;
    };
    return (0, _jsxdevruntime.jsxDEV)("div", {
        style: {
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            marginBottom: 16,
            flexDirection: isUser ? 'row-reverse' : 'row'
        },
        children: [
            (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 500,
                    flexShrink: 0,
                    background: isUser ? 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: '#ffffff',
                    boxShadow: isUser ? '0 4px 12px rgba(40, 85, 209, 0.35)' : '0 4px 12px rgba(16, 185, 129, 0.35)'
                },
                children: isUser ? (0, _jsxdevruntime.jsxDEV)(_icons.UserOutlined, {}, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                    lineNumber: 206,
                    columnNumber: 19
                }, this) : (0, _jsxdevruntime.jsxDEV)(_icons.RobotOutlined, {}, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                    lineNumber: 206,
                    columnNumber: 38
                }, this)
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                lineNumber: 186,
                columnNumber: 7
            }, this),
            (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    maxWidth: '75%',
                    alignItems: isUser ? 'flex-end' : 'flex-start'
                },
                children: [
                    (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            borderRadius: isUser ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
                            padding: '12px 16px',
                            fontSize: 14,
                            lineHeight: 1.7,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            background: isUser ? 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)' : 'rgba(255, 255, 255, 0.95)',
                            color: isUser ? '#ffffff' : _constants.DESIGN_TOKENS.TEXT_PRIMARY,
                            border: isUser ? 'none' : `1px solid ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`,
                            boxShadow: isUser ? '0 4px 16px rgba(40, 85, 209, 0.3)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                        },
                        children: renderContent()
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                        lineNumber: 218,
                        columnNumber: 9
                    }, this),
                    (0, _jsxdevruntime.jsxDEV)(Text, {
                        style: {
                            color: _constants.DESIGN_TOKENS.TEXT_MUTED,
                            fontSize: 11,
                            padding: '0 4px'
                        },
                        children: formatTime(message.timestamp)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                        lineNumber: 239,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                lineNumber: 209,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
        lineNumber: 177,
        columnNumber: 5
    }, this);
};
_c = EntityMessageBubble;
var _default = EntityMessageBubble;
var _c;
$RefreshReg$(_c, "EntityMessageBubble");
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

},
"src/pages/KnowledgeQA/components/GraphToolbar.tsx": function (module, exports, __mako_require__){
"use strict";
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
var _react = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/react/index.js"));
var _antd = __mako_require__("node_modules/antd/es/index.js");
var _icons = __mako_require__("node_modules/@ant-design/icons/es/index.js");
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
const btnStyle = {
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    border: '1px solid #e2e8f0',
    background: '#fff'
};
const GraphToolbar = ({ onZoomIn, onZoomOut, onFitView, onToggleFullscreen, isFullscreen, onExportImage, onChangeLayout, layoutMode, onTogglePathOnly, pathOnly, hasPaths })=>{
    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
        style: {
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6
        },
        children: [
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    background: 'rgba(255,255,255,0.95)',
                    borderRadius: 10,
                    padding: '4px 0',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                    border: '1px solid #e2e8f0'
                },
                children: [
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                        title: "Zoom In",
                        placement: "left",
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                            type: "text",
                            size: "small",
                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ZoomInOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                                lineNumber: 67,
                                columnNumber: 50
                            }, void 0),
                            onClick: onZoomIn,
                            style: {
                                border: 'none',
                                boxShadow: 'none'
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                            lineNumber: 67,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                        lineNumber: 66,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                        title: "Zoom Out",
                        placement: "left",
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                            type: "text",
                            size: "small",
                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ZoomOutOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                                lineNumber: 70,
                                columnNumber: 50
                            }, void 0),
                            onClick: onZoomOut,
                            style: {
                                border: 'none',
                                boxShadow: 'none'
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                            lineNumber: 70,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                        lineNumber: 69,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                        title: "Fit View",
                        placement: "left",
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                            type: "text",
                            size: "small",
                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ExpandOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                                lineNumber: 73,
                                columnNumber: 50
                            }, void 0),
                            onClick: onFitView,
                            style: {
                                border: 'none',
                                boxShadow: 'none'
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                            lineNumber: 73,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                        lineNumber: 72,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                        title: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen',
                        placement: "left",
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                            type: "text",
                            size: "small",
                            icon: isFullscreen ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FullscreenExitOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                                lineNumber: 79,
                                columnNumber: 34
                            }, void 0) : /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FullscreenOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                                lineNumber: 79,
                                columnNumber: 63
                            }, void 0),
                            onClick: onToggleFullscreen,
                            style: {
                                border: 'none',
                                boxShadow: 'none'
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                            lineNumber: 76,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                        lineNumber: 75,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                lineNumber: 65,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    background: 'rgba(255,255,255,0.95)',
                    borderRadius: 10,
                    padding: '4px 0',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                    border: '1px solid #e2e8f0'
                },
                children: [
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                        title: "Export PNG",
                        placement: "left",
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                            type: "text",
                            size: "small",
                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.CameraOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                                lineNumber: 89,
                                columnNumber: 50
                            }, void 0),
                            onClick: ()=>onExportImage('png'),
                            style: {
                                border: 'none',
                                boxShadow: 'none'
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                            lineNumber: 89,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                        lineNumber: 88,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                        title: "Export SVG",
                        placement: "left",
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                            type: "text",
                            size: "small",
                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FileImageOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                                lineNumber: 92,
                                columnNumber: 50
                            }, void 0),
                            onClick: ()=>onExportImage('svg'),
                            style: {
                                border: 'none',
                                boxShadow: 'none'
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                            lineNumber: 92,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                        lineNumber: 91,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                lineNumber: 87,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    background: 'rgba(255,255,255,0.95)',
                    borderRadius: 10,
                    padding: '4px 0',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                    border: '1px solid #e2e8f0'
                },
                children: [
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                        title: `Force Layout${layoutMode === 'force' ? ' (active)' : ''}`,
                        placement: "left",
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                            type: layoutMode === 'force' ? 'primary' : 'text',
                            size: "small",
                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ApartmentOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                                lineNumber: 102,
                                columnNumber: 19
                            }, void 0),
                            onClick: ()=>onChangeLayout('force'),
                            style: {
                                border: 'none',
                                boxShadow: 'none'
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                            lineNumber: 99,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                        lineNumber: 98,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                        title: `Hierarchical Layout${layoutMode === 'dagre' ? ' (active)' : ''}`,
                        placement: "left",
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                            type: layoutMode === 'dagre' ? 'primary' : 'text',
                            size: "small",
                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.VerticalAlignTopOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                                lineNumber: 111,
                                columnNumber: 19
                            }, void 0),
                            onClick: ()=>onChangeLayout('dagre'),
                            style: {
                                border: 'none',
                                boxShadow: 'none'
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                            lineNumber: 108,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                        lineNumber: 107,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                        title: `Circular Layout${layoutMode === 'circular' ? ' (active)' : ''}`,
                        placement: "left",
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                            type: layoutMode === 'circular' ? 'primary' : 'text',
                            size: "small",
                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.RadiusSettingOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                                lineNumber: 120,
                                columnNumber: 19
                            }, void 0),
                            onClick: ()=>onChangeLayout('circular'),
                            style: {
                                border: 'none',
                                boxShadow: 'none'
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                            lineNumber: 117,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                        lineNumber: 116,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                lineNumber: 97,
                columnNumber: 7
            }, this),
            hasPaths && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    background: 'rgba(255,255,255,0.95)',
                    borderRadius: 10,
                    padding: '4px 0',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                    border: '1px solid #e2e8f0'
                },
                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                    title: pathOnly ? 'Show All Nodes' : 'Show Path Nodes Only',
                    placement: "left",
                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                        type: pathOnly ? 'primary' : 'text',
                        size: "small",
                        icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FilterOutlined, {}, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                            lineNumber: 134,
                            columnNumber: 21
                        }, void 0),
                        onClick: onTogglePathOnly,
                        style: {
                            border: 'none',
                            boxShadow: 'none'
                        }
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                        lineNumber: 131,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                    lineNumber: 130,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
                lineNumber: 129,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/GraphToolbar.tsx",
        lineNumber: 53,
        columnNumber: 5
    }, this);
};
_c = GraphToolbar;
var _default = GraphToolbar;
var _c;
$RefreshReg$(_c, "GraphToolbar");
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

},
"src/pages/KnowledgeQA/components/LegendPanel.tsx": function (module, exports, __mako_require__){
"use strict";
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
var _react = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/react/index.js"));
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
const fmt = (n)=>n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const NODE_COLORS = {
    COMPANY: '#FFC101',
    PERSON: '#1890FF',
    EVENT: '#FF6B6B',
    SUB_EVENT: '#FF9999',
    TIME: '#FF8C00',
    RiskFeature: '#4CAF50',
    RiskFactor: '#9C27B0',
    Action: '#45B7D1',
    Regulation: '#FFC101',
    Law: '#1890FF'
};
const NODE_LABELS = {
    COMPANY: 'Company',
    PERSON: 'Person',
    EVENT: 'Event',
    SUB_EVENT: 'Sub Event',
    TIME: 'Time',
    RiskFeature: 'Risk Feature',
    RiskFactor: 'Risk Factor',
    Action: 'Action',
    Regulation: 'Regulation',
    Law: 'Law'
};
const REL_LABELS = {
    TRIGGERS: 'Triggers',
    REFLECTS: 'Reflects',
    COMPLIES_WITH: 'Complies With',
    MENTION: 'Mention',
    CAUSE: 'Cause',
    BELONG: 'Belong'
};
const LegendPanel = ({ stats, visibleCategories, onToggle, onHighlight })=>{
    const isEdgeHidden = (rel)=>!visibleCategories.has(rel);
    if (!stats) return null;
    const nodeCountTotal = stats.totalNodes || 0;
    const edgeCountTotal = stats.totalEdges || Object.values(stats.edgeCounts).reduce((a, b)=>a + b, 0);
    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
        style: styles.root,
        children: [
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: styles.row,
                children: [
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: styles.labelGroup,
                        children: [
                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                style: styles.rowLabel,
                                children: "Nodes"
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                                lineNumber: 72,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                style: styles.rowTotal,
                                children: [
                                    "(",
                                    fmt(nodeCountTotal),
                                    ")"
                                ]
                            }, void 0, true, {
                                fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                                lineNumber: 73,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                        lineNumber: 71,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: styles.divider
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                        lineNumber: 75,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: styles.chips,
                        children: Object.keys(NODE_LABELS).map((type)=>{
                            const count = stats.nodeCounts[type] ?? 0;
                            if (count === 0) return null;
                            const color = NODE_COLORS[type];
                            const hidden = !visibleCategories.has(type);
                            return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                onMouseEnter: ()=>onHighlight(type),
                                onMouseLeave: ()=>onHighlight(null),
                                onClick: ()=>onToggle(type),
                                style: {
                                    ...styles.nodeChip,
                                    background: hidden ? `${color}08` : `${color}12`,
                                    border: `1px solid ${hidden ? `${color}15` : `${color}30`}`,
                                    color: hidden ? `${color}60` : color
                                },
                                children: [
                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                        style: {
                                            ...styles.chipDot,
                                            background: color,
                                            opacity: hidden ? 0.3 : 1
                                        }
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                                        lineNumber: 95,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                        style: styles.chipText,
                                        children: [
                                            NODE_LABELS[type],
                                            " ",
                                            fmt(count)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                                        lineNumber: 98,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, type, true, {
                                fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                                lineNumber: 83,
                                columnNumber: 15
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                        lineNumber: 76,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                lineNumber: 70,
                columnNumber: 7
            }, this),
            edgeCountTotal > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    ...styles.row,
                    marginTop: 6
                },
                children: [
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: styles.labelGroup,
                        children: [
                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                style: styles.rowLabel,
                                children: "Relations"
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                                lineNumber: 110,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                style: styles.rowTotal,
                                children: [
                                    "(",
                                    fmt(edgeCountTotal),
                                    ")"
                                ]
                            }, void 0, true, {
                                fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                                lineNumber: 111,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                        lineNumber: 109,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: styles.divider
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                        lineNumber: 113,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: styles.chips,
                        children: Object.entries(stats.edgeCounts).map(([rel, count])=>{
                            if (count === 0 || rel === 'UNKNOWN') return null;
                            const label = REL_LABELS[rel] || rel;
                            const hidden = isEdgeHidden(rel);
                            return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                onMouseEnter: ()=>onHighlight(rel),
                                onMouseLeave: ()=>onHighlight(null),
                                onClick: ()=>onToggle(rel),
                                style: {
                                    ...styles.edgeChip,
                                    borderColor: hidden ? '#e2e8f0' : '#cbd5e1',
                                    color: hidden ? '#94a3b8' : '#475569',
                                    background: hidden ? '#f8fafc' : '#ffffff'
                                },
                                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                    style: styles.chipText,
                                    children: [
                                        label,
                                        " ",
                                        fmt(count)
                                    ]
                                }, void 0, true, {
                                    fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                                    lineNumber: 132,
                                    columnNumber: 19
                                }, this)
                            }, rel, false, {
                                fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                                lineNumber: 120,
                                columnNumber: 17
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                        lineNumber: 114,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                lineNumber: 108,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("style", {
                children: `
        .legend-scroll::-webkit-scrollbar { display: none; }
        .legend-scroll { scrollbar-width: none; }
      `
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
                lineNumber: 142,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/LegendPanel.tsx",
        lineNumber: 69,
        columnNumber: 5
    }, this);
};
_c = LegendPanel;
const styles = {
    root: {
        display: 'flex',
        flexDirection: 'column',
        padding: '10px 16px',
        background: '#ffffff',
        borderBottom: '1px solid #f1f5f9',
        flexShrink: 0
    },
    row: {
        display: 'flex',
        alignItems: 'center',
        width: '100%'
    },
    labelGroup: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 4,
        minWidth: 64,
        flexShrink: 0
    },
    rowLabel: {
        fontSize: 13,
        fontWeight: 700,
        color: '#1e293b'
    },
    rowTotal: {
        fontSize: 11,
        fontWeight: 500,
        color: '#94a3b8'
    },
    divider: {
        width: 1,
        height: 14,
        background: '#e2e8f0',
        margin: '0 12px',
        flexShrink: 0
    },
    chips: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        overflowX: 'auto',
        flexWrap: 'nowrap',
        flex: 1,
        paddingBottom: 2
    },
    nodeChip: {
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 6,
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        userSelect: 'none'
    },
    edgeChip: {
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 6,
        border: '1px solid',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        userSelect: 'none'
    },
    chipDot: {
        width: 5,
        height: 5,
        borderRadius: '50%'
    },
    chipText: {
        fontSize: 12,
        fontWeight: 600
    }
};
var _default = LegendPanel;
var _c;
$RefreshReg$(_c, "LegendPanel");
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

},
"src/pages/KnowledgeQA/components/NodeContextMenu.tsx": function (module, exports, __mako_require__){
"use strict";
__mako_require__.d(exports, "__esModule", {
    value: true
});
__mako_require__.d(exports, "default", {
    enumerable: true,
    get: function() {
        return _default;
    }
});
var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var _jsxdevruntime = __mako_require__("node_modules/react/jsx-dev-runtime.js");
var _react = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react/index.js"));
var _icons = __mako_require__("node_modules/@ant-design/icons/es/index.js");
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
var _s = $RefreshSig$();
const menuItems = [
    {
        key: 'detail',
        icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.EyeOutlined, {}, void 0, false, {
            fileName: "src/pages/KnowledgeQA/components/NodeContextMenu.tsx",
            lineNumber: 25,
            columnNumber: 26
        }, this),
        label: 'View Detail'
    },
    {
        key: 'expand',
        icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ApartmentOutlined, {}, void 0, false, {
            fileName: "src/pages/KnowledgeQA/components/NodeContextMenu.tsx",
            lineNumber: 26,
            columnNumber: 26
        }, this),
        label: 'Expand Connections'
    },
    {
        key: 'monitor',
        icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.PlusOutlined, {}, void 0, false, {
            fileName: "src/pages/KnowledgeQA/components/NodeContextMenu.tsx",
            lineNumber: 27,
            columnNumber: 27
        }, this),
        label: 'Add to Watchlist'
    },
    {
        key: 'report',
        icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FileTextOutlined, {}, void 0, false, {
            fileName: "src/pages/KnowledgeQA/components/NodeContextMenu.tsx",
            lineNumber: 28,
            columnNumber: 26
        }, this),
        label: 'Generate Risk Report'
    },
    {
        key: 'copy',
        icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.CopyOutlined, {}, void 0, false, {
            fileName: "src/pages/KnowledgeQA/components/NodeContextMenu.tsx",
            lineNumber: 29,
            columnNumber: 24
        }, this),
        label: 'Copy Node Name'
    }
];
const NodeContextMenu = ({ visible, x, y, nodeId, nodeName, nodeType, onClose, onViewDetail, onAddMonitor, onExpand, onGenerateReport })=>{
    _s();
    const menuRef = (0, _react.useRef)(null);
    (0, _react.useEffect)(()=>{
        if (!visible) return;
        const handleClick = (e)=>{
            if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
        };
        document.addEventListener('mousedown', handleClick);
        return ()=>document.removeEventListener('mousedown', handleClick);
    }, [
        visible,
        onClose
    ]);
    (0, _react.useEffect)(()=>{
        if (!visible) return;
        const handleKey = (e)=>{
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return ()=>document.removeEventListener('keydown', handleKey);
    }, [
        visible,
        onClose
    ]);
    if (!visible) return null;
    const handleAction = (key)=>{
        switch(key){
            case 'detail':
                onViewDetail();
                break;
            case 'expand':
                onExpand();
                break;
            case 'monitor':
                onAddMonitor();
                break;
            case 'report':
                onGenerateReport();
                break;
            case 'copy':
                navigator.clipboard.writeText(nodeName).catch(()=>{
                    const ta = document.createElement('textarea');
                    ta.value = nodeName;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                });
                break;
        }
        onClose();
    };
    // Adjust position to stay within viewport
    const adjustedX = Math.min(x, window.innerWidth - 200);
    const adjustedY = Math.min(y, window.innerHeight - (menuItems.length * 36 + 16));
    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
        ref: menuRef,
        style: {
            position: 'fixed',
            left: adjustedX,
            top: adjustedY,
            zIndex: 10000,
            background: '#fff',
            borderRadius: 10,
            boxShadow: '0 8px 30px rgba(15, 23, 42, 0.18)',
            border: '1px solid #e2e8f0',
            padding: '4px 0',
            minWidth: 190,
            backdropFilter: 'blur(10px)'
        },
        children: [
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    padding: '5px 14px 7px',
                    borderBottom: '1px solid #f1f5f9',
                    fontSize: 11,
                    color: '#94a3b8',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                },
                children: nodeType
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/NodeContextMenu.tsx",
                lineNumber: 110,
                columnNumber: 7
            }, this),
            menuItems.map((item)=>/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                    onClick: ()=>handleAction(item.key),
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '7px 14px',
                        cursor: 'pointer',
                        fontSize: 13,
                        color: '#334155',
                        transition: 'background 0.12s'
                    },
                    onMouseEnter: (e)=>{
                        e.currentTarget.style.background = '#f1f5f9';
                    },
                    onMouseLeave: (e)=>{
                        e.currentTarget.style.background = 'transparent';
                    },
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                            style: {
                                width: 16,
                                textAlign: 'center',
                                color: '#64748b',
                                fontSize: 12
                            },
                            children: item.icon
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/NodeContextMenu.tsx",
                            lineNumber: 144,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                            children: item.label
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/NodeContextMenu.tsx",
                            lineNumber: 147,
                            columnNumber: 11
                        }, this)
                    ]
                }, item.key, true, {
                    fileName: "src/pages/KnowledgeQA/components/NodeContextMenu.tsx",
                    lineNumber: 124,
                    columnNumber: 9
                }, this))
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/NodeContextMenu.tsx",
        lineNumber: 94,
        columnNumber: 5
    }, this);
};
_s(NodeContextMenu, "C8c55G4RkkeDIgsw+guSQfBbpOs=");
_c = NodeContextMenu;
var _default = NodeContextMenu;
var _c;
$RefreshReg$(_c, "NodeContextMenu");
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

},
"src/pages/KnowledgeQA/components/RiskEntityCard.tsx": function (module, exports, __mako_require__){
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
    RiskEntityCard: function() {
        return RiskEntityCard;
    },
    default: function() {
        return _default;
    }
});
var _interop_require_default = __mako_require__("@swc/helpers/_/_interop_require_default");
var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var _jsxdevruntime = __mako_require__("node_modules/react/jsx-dev-runtime.js");
var _react = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/react/index.js"));
var _antd = __mako_require__("node_modules/antd/es/index.js");
var _icons = __mako_require__("node_modules/@ant-design/icons/es/index.js");
var _constants = __mako_require__("src/pages/KnowledgeQA/styles/constants.ts");
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
const { Text, Paragraph } = _antd.Typography;
const RiskIcon = ({ style })=>/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("svg", {
        viewBox: "0 0 24 24",
        fill: "currentColor",
        style: {
            width: '1em',
            height: '1em',
            ...style
        },
        children: [
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("path", {
                d: "M12 2L2 20h20L12 2zm0 3.5L18.5 18H5.5L12 5.5z"
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                lineNumber: 11,
                columnNumber: 5
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("path", {
                d: "M11 10h2v5h-2zm0 6h2v2h-2z"
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                lineNumber: 12,
                columnNumber: 5
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
        lineNumber: 10,
        columnNumber: 3
    }, this);
_c = RiskIcon;
const SparkleIcon = ()=>/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("svg", {
        viewBox: "0 0 24 24",
        fill: "currentColor",
        style: {
            width: '1em',
            height: '1em'
        },
        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("path", {
            d: "M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"
        }, void 0, false, {
            fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
            lineNumber: 18,
            columnNumber: 5
        }, this)
    }, void 0, false, {
        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
        lineNumber: 17,
        columnNumber: 3
    }, this);
_c1 = SparkleIcon;
const RISK_LEVEL_MAP = {
    '-3': {
        color: '#f5222d',
        label: '极高风险'
    },
    '-2': {
        color: '#fa541c',
        label: '高风险'
    },
    '-1': {
        color: '#faad14',
        label: '一般风险'
    },
    '0': {
        color: '#1890ff',
        label: '提示'
    }
};
const ENTITY_TYPE_COLORS = {
    COMPANY: '#FFC101',
    PERSON: '#1890FF',
    EVENT: '#FF6B6B',
    RiskFeature: '#4CAF50',
    RiskFactor: '#9C27B0',
    Action: '#45B7D1',
    Regulation: '#FFC101'
};
const getRiskLevel = (rec)=>{
    const riskScore = rec.riskScore ?? rec.importance;
    if (riskScore && RISK_LEVEL_MAP[String(riskScore)]) return String(riskScore);
    if (riskScore !== undefined && Number(riskScore) < 0) return String(Math.max(Number(riskScore), -3));
    return null;
};
const RiskEntityCard = ({ recommendations, overallReasoning, onEntityClick })=>{
    const safeRecommendations = recommendations || [];
    if (safeRecommendations.length === 0) return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
        children: [
            overallReasoning && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    display: 'flex',
                    gap: 10,
                    padding: '10px 14px',
                    background: '#f8fafc',
                    borderRadius: 12,
                    border: `1px solid ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`,
                    marginBottom: 16
                },
                children: [
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: 'rgba(245, 34, 45, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        },
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(RiskIcon, {
                            style: {
                                fontSize: 14,
                                color: '#f5222d'
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                            lineNumber: 70,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                        lineNumber: 69,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
                        style: {
                            fontSize: 13,
                            lineHeight: 1.7,
                            color: _constants.DESIGN_TOKENS.TEXT_SECONDARY
                        },
                        children: overallReasoning
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                        lineNumber: 72,
                        columnNumber: 13
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                lineNumber: 63,
                columnNumber: 11
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    padding: 16,
                    textAlign: 'center'
                },
                children: [
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.AlertOutlined, {
                        style: {
                            fontSize: 32,
                            color: _constants.DESIGN_TOKENS.TEXT_MUTED,
                            marginBottom: 8
                        }
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                        lineNumber: 78,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            color: _constants.DESIGN_TOKENS.TEXT_MUTED,
                            fontSize: 13
                        },
                        children: "No matching risk entities found"
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                        lineNumber: 79,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            marginTop: 8,
                            fontSize: 12,
                            color: _constants.DESIGN_TOKENS.TEXT_MUTED,
                            opacity: 0.8
                        },
                        children: "Try adjusting your query"
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                        lineNumber: 80,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                lineNumber: 77,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
        lineNumber: 61,
        columnNumber: 7
    }, this);
    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
        children: [
            overallReasoning && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    display: 'flex',
                    gap: 10,
                    padding: '10px 14px',
                    background: '#f8fafc',
                    borderRadius: 12,
                    border: `1px solid ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`,
                    marginBottom: 16
                },
                children: [
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: 'rgba(245, 34, 45, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        },
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(RiskIcon, {
                            style: {
                                fontSize: 14,
                                color: '#f5222d'
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                            lineNumber: 93,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                        lineNumber: 92,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
                        style: {
                            fontSize: 13,
                            lineHeight: 1.7,
                            color: _constants.DESIGN_TOKENS.TEXT_SECONDARY
                        },
                        children: overallReasoning
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                        lineNumber: 95,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                lineNumber: 91,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 12
                },
                children: [
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: 'rgba(245, 34, 45, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        },
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(SparkleIcon, {}, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                            lineNumber: 101,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                        lineNumber: 100,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
                        strong: true,
                        style: {
                            fontSize: 14,
                            color: _constants.DESIGN_TOKENS.TEXT_PRIMARY
                        },
                        children: "Risk Entities"
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                        lineNumber: 103,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                        style: {
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#f5222d',
                            background: 'rgba(245, 34, 45, 0.08)',
                            padding: '2px 8px',
                            borderRadius: 10
                        },
                        children: [
                            safeRecommendations.length,
                            " entities"
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                        lineNumber: 104,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                lineNumber: 99,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                },
                children: safeRecommendations.map((rec, idx)=>{
                    const itemId = rec.itemId || `entity-${idx}`;
                    const title = rec.title || rec.zhTitle || rec.name || itemId;
                    const entityType = rec.entityType || rec.type || 'COMPANY';
                    const typeColor = ENTITY_TYPE_COLORS[entityType] || '#94a3b8';
                    const riskLevel = getRiskLevel(rec);
                    const riskInfo = riskLevel ? RISK_LEVEL_MAP[riskLevel] : null;
                    const score = rec.score ?? rec.confidence ?? 0;
                    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        onClick: ()=>onEntityClick === null || onEntityClick === void 0 ? void 0 : onEntityClick(itemId, entityType),
                        style: {
                            display: 'flex',
                            gap: 12,
                            padding: 12,
                            background: '#fff',
                            borderRadius: 14,
                            border: `1px solid ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: _constants.DESIGN_TOKENS.SHADOW_CARD
                        },
                        onMouseEnter: (e)=>{
                            e.currentTarget.style.boxShadow = _constants.DESIGN_TOKENS.SHADOW_GLOW;
                            e.currentTarget.style.borderColor = '#f5222d';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                        },
                        onMouseLeave: (e)=>{
                            e.currentTarget.style.boxShadow = _constants.DESIGN_TOKENS.SHADOW_CARD;
                            e.currentTarget.style.borderColor = _constants.DESIGN_TOKENS.BORDER_DEFAULT;
                            e.currentTarget.style.transform = 'none';
                        },
                        children: [
                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    width: 48,
                                    height: 48,
                                    borderRadius: 12,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    background: typeColor + '20',
                                    border: `2px solid ${typeColor}40`
                                },
                                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.BankOutlined, {
                                    style: {
                                        fontSize: 22,
                                        color: typeColor
                                    }
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                    lineNumber: 140,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                lineNumber: 139,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    flex: 1,
                                    minWidth: 0
                                },
                                children: [
                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            marginBottom: 4
                                        },
                                        children: [
                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
                                                strong: true,
                                                style: {
                                                    fontSize: 14
                                                },
                                                ellipsis: true,
                                                children: title
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                                lineNumber: 145,
                                                columnNumber: 19
                                            }, this),
                                            riskInfo && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                style: {
                                                    fontSize: 10,
                                                    padding: '0 6px',
                                                    borderRadius: 4,
                                                    background: riskInfo.color + '18',
                                                    border: 'none',
                                                    color: riskInfo.color
                                                },
                                                children: riskInfo.label
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                                lineNumber: 147,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                        lineNumber: 144,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            marginBottom: 4
                                        },
                                        children: [
                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                style: {
                                                    fontSize: 10,
                                                    padding: '0 6px',
                                                    borderRadius: 4,
                                                    background: typeColor + '18',
                                                    border: 'none',
                                                    color: typeColor
                                                },
                                                children: entityType
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                                lineNumber: 154,
                                                columnNumber: 19
                                            }, this),
                                            score > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 4
                                                },
                                                children: [
                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                        style: {
                                                            width: 40,
                                                            height: 4,
                                                            borderRadius: 2,
                                                            background: '#f1f5f9',
                                                            overflow: 'hidden'
                                                        },
                                                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                            style: {
                                                                width: `${Math.round(score * 100)}%`,
                                                                height: '100%',
                                                                borderRadius: 2,
                                                                background: score > 0.7 ? '#10B981' : score > 0.4 ? '#F59E0B' : '#EF4444'
                                                            }
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                                            lineNumber: 160,
                                                            columnNumber: 25
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                                        lineNumber: 159,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
                                                        style: {
                                                            fontSize: 10,
                                                            color: _constants.DESIGN_TOKENS.TEXT_MUTED
                                                        },
                                                        children: [
                                                            (score * 100).toFixed(0),
                                                            "%"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                                        lineNumber: 162,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                                lineNumber: 158,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                        lineNumber: 153,
                                        columnNumber: 17
                                    }, this),
                                    rec.highlight && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Paragraph, {
                                        ellipsis: {
                                            rows: 2
                                        },
                                        style: {
                                            fontSize: 11,
                                            color: _constants.DESIGN_TOKENS.TEXT_MUTED,
                                            marginBottom: 0
                                        },
                                        children: rec.highlight
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                        lineNumber: 168,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                                lineNumber: 143,
                                columnNumber: 15
                            }, this)
                        ]
                    }, itemId, true, {
                        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                        lineNumber: 120,
                        columnNumber: 13
                    }, this);
                })
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
                lineNumber: 109,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/RiskEntityCard.tsx",
        lineNumber: 89,
        columnNumber: 5
    }, this);
};
_c2 = RiskEntityCard;
var _default = RiskEntityCard;
var _c;
var _c1;
var _c2;
$RefreshReg$(_c, "RiskIcon");
$RefreshReg$(_c1, "SparkleIcon");
$RefreshReg$(_c2, "RiskEntityCard");
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

},
"src/pages/KnowledgeQA/components/RiskReportPanel.tsx": function (module, exports, __mako_require__){
"use strict";
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
var _reactrefresh = _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var _jsxdevruntime = __mako_require__("node_modules/react/jsx-dev-runtime.js");
var _icons = __mako_require__("node_modules/@ant-design/icons/es/index.js");
var _antd = __mako_require__("node_modules/antd/es/index.js");
var _react = _interop_require_wildcard._(__mako_require__("node_modules/react/index.js"));
var _reactmarkdown = _interop_require_default._(__mako_require__("node_modules/react-markdown/index.js"));
var _EventBarChart = _interop_require_default._(__mako_require__("src/pages/KnowledgeQA/components/charts/EventBarChart.tsx"));
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
var _s = $RefreshSig$();
const { Title, Text, Paragraph } = _antd.Typography;
const RISK_LEVEL_COLORS = {
    high: '#f5222d',
    medium: '#fa8c16',
    low: '#52c41a'
};
const RISK_LEVEL_BG = {
    high: 'rgba(245, 34, 45, 0.1)',
    medium: 'rgba(250, 140, 22, 0.1)',
    low: 'rgba(82, 196, 26, 0.1)'
};
const RISK_LEVEL_LABELS = {
    high: '高风险',
    medium: '中风险',
    low: '低风险'
};
const URGENCY_TAGS = {
    urgent: {
        color: '#f5222d',
        label: '紧急'
    },
    normal: {
        color: '#fa8c16',
        label: '一般'
    },
    low: {
        color: '#52c41a',
        label: '低'
    }
};
const STAGE_LABELS = {
    planning: '任务规划',
    retrieving: '图谱检索',
    entity_stats: '实体统计',
    community: '群体发现',
    analyzing: '风险分析',
    compliance: '合规匹配',
    reporting: '报告生成'
};
function computeRiskScore(riskPaths) {
    if (!riskPaths || riskPaths.length === 0) return 0;
    const weights = {
        high: 3,
        medium: 2,
        low: 1
    };
    let totalWeight = 0;
    let maxWeight = 0;
    for (const p of riskPaths){
        const w = weights[p.risk_level] || 1;
        totalWeight += w;
        maxWeight += 3;
    }
    return Math.round(totalWeight / maxWeight * 100);
}
function formatTimestamp(ts) {
    if (!ts) return new Date().toISOString().replace('T', ' ').slice(0, 19);
    return ts;
}
function generateReportId(ts) {
    const d = ts ? new Date(ts) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const seq = String(d.getTime() % 100000).padStart(5, '0');
    return `WIND-RPT-${y}${m}${day}-${seq}`;
}
const RiskReportPanel = ({ report, stages, community, isLoading, error, onRetry, onJumpToGraph, onAddMonitor, onGenerateTicket, queryText })=>{
    var _report_subgraph_summary, _stages_, _report_risk_paths, _report_anomaly_findings, _report_compliance_matches;
    _s();
    const { message } = _antd.App.useApp();
    const [historyOpen, setHistoryOpen] = (0, _react.useState)(false);
    const [historyLoading, setHistoryLoading] = (0, _react.useState)(false);
    const [historyReports, setHistoryReports] = (0, _react.useState)([]);
    const [showAllPaths, setShowAllPaths] = (0, _react.useState)(false);
    const [highlightSection, setHighlightSection] = (0, _react.useState)(null);
    const finalReportRef = (0, _react.useRef)(null);
    const reportId = (report === null || report === void 0 ? void 0 : report.report_id) || generateReportId(report === null || report === void 0 ? void 0 : report.generated_at);
    const riskScore = (0, _react.useMemo)(()=>report ? computeRiskScore(report.risk_paths) : 0, [
        report
    ]);
    (0, _react.useEffect)(()=>{
        if (report && finalReportRef.current) {
            const timer = setTimeout(()=>{
                var _finalReportRef_current;
                (_finalReportRef_current = finalReportRef.current) === null || _finalReportRef_current === void 0 || _finalReportRef_current.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                setHighlightSection('final-report');
                setTimeout(()=>setHighlightSection(null), 2000);
            }, 500);
            return ()=>clearTimeout(timer);
        }
    }, [
        report === null || report === void 0 ? void 0 : report.report_id
    ]);
    const { highCount, mediumCount, lowCount, sortedEntities, entityTypeData } = (0, _react.useMemo)(()=>{
        if (!report) return {
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            sortedEntities: [],
            entityTypeData: []
        };
        let high = 0, medium = 0, low = 0;
        for (const path of report.risk_paths || []){
            if (path.risk_level === 'high') high++;
            else if (path.risk_level === 'medium') medium++;
            else low++;
        }
        const entityCounts = new Map();
        for (const path of report.risk_paths || [])for (const entity of path.affected_entities || []){
            const existing = entityCounts.get(entity);
            if (existing) existing.count++;
            else entityCounts.set(entity, {
                count: 1,
                types: new Set()
            });
        }
        for (const anomaly of report.anomaly_findings || [])for (const entity of anomaly.affected_entities || []){
            const existing = entityCounts.get(entity);
            if (existing) existing.count++;
            else entityCounts.set(entity, {
                count: 1,
                types: new Set()
            });
        }
        const sorted = Array.from(entityCounts.entries()).sort((a, b)=>b[1].count - a[1].count).slice(0, 10);
        const typeCountMap = new Map();
        if (report.raw_data) for (const row of report.raw_data){
            const t = row.type || row.entity_type || 'Unknown';
            typeCountMap.set(t, (typeCountMap.get(t) || 0) + 1);
        }
        const typeData = Array.from(typeCountMap.entries()).map(([name, count], idx)=>({
                name,
                count,
                color: [
                    '#1890ff',
                    '#52c41a',
                    '#fa8c16',
                    '#f5222d',
                    '#722ed1',
                    '#13c2c2',
                    '#eb2f96'
                ][idx % 7]
            })).sort((a, b)=>b.count - a.count);
        return {
            highCount: high,
            mediumCount: medium,
            lowCount: low,
            sortedEntities: sorted,
            entityTypeData: typeData
        };
    }, [
        report
    ]);
    const stageOrder = [
        'planning',
        'retrieving',
        'entity_stats',
        'community',
        'analyzing',
        'compliance',
        'reporting'
    ];
    const completedStages = new Set(stages.map((s)=>s.stage));
    const currentStageIdx = stageOrder.findIndex((s)=>!completedStages.has(s));
    const activeStep = currentStageIdx >= 0 ? currentStageIdx : stageOrder.length;
    const loadHistory = async ()=>{
        setHistoryOpen(true);
        setHistoryLoading(true);
        try {
            const resp = await fetch('/api/v1/risk/reports');
            if (resp.ok) {
                const data = await resp.json();
                const items = Array.isArray(data) ? data : data.data || data.reports || [];
                setHistoryReports(items);
            }
        } catch  {} finally{
            setHistoryLoading(false);
        }
    };
    const loadHistoryReport = async (id)=>{
        try {
            const resp = await fetch(`/api/v1/risk/reports/${id}`);
            if (resp.ok) {
                const data = await resp.json();
                message.success('报告已加载');
                setHistoryOpen(false);
                window.dispatchEvent(new CustomEvent('loadRiskReport', {
                    detail: data
                }));
            }
        } catch  {
            message.error('加载报告失败');
        }
    };
    const handleExportMD = ()=>{
        if (!(report === null || report === void 0 ? void 0 : report.markdown_report)) return;
        const header = `# WindEye 风险分析报告\n\n**报告编号**: ${reportId}\n**生成时间**: ${formatTimestamp(report.generated_at)}\n**查询**: ${queryText || report.query_summary || '-'}\n\n---\n\n`;
        const blob = new Blob([
            header + report.markdown_report
        ], {
            type: 'text/markdown'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${reportId}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const handleExportPDF = ()=>{
        window.print();
    };
    const handleExportWord = ()=>{
        if (!(report === null || report === void 0 ? void 0 : report.markdown_report)) return;
        let html = report.markdown_report.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^- (.+)$/gm, '<li>$1</li>').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>');
        html = `<html><head><meta charset="utf-8"><style>body{font-family:'Microsoft YaHei',sans-serif;max-width:800px;margin:40px auto;line-height:1.8;color:#333}h1{color:#1a1a2e;border-bottom:2px solid #2855D1;padding-bottom:8px}h2{color:#2855D1}h3{color:#475569}li{margin:4px 0}</style></head><body><h1>WindEye 风险分析报告</h1><p><strong>报告编号:</strong> ${reportId}<br/><strong>生成时间:</strong> ${formatTimestamp(report.generated_at)}<br/><strong>查询:</strong> ${queryText || report.query_summary || '-'}</p><hr/><p>${html}</p></body></html>`;
        const blob = new Blob([
            html
        ], {
            type: 'application/msword'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${reportId}.doc`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const scrollToSection = (key)=>{
        const el = document.getElementById(`risk-section-${key}`);
        el === null || el === void 0 || el.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    };
    if (!report && !isLoading && stages.length === 0) return (0, _jsxdevruntime.jsxDEV)("div", {
        style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%'
        },
        children: (0, _jsxdevruntime.jsxDEV)(_antd.Empty, {
            image: _antd.Empty.PRESENTED_IMAGE_SIMPLE,
            description: (0, _jsxdevruntime.jsxDEV)("div", {
                children: [
                    (0, _jsxdevruntime.jsxDEV)(Text, {
                        style: {
                            color: '#475569',
                            fontSize: 14,
                            display: 'block'
                        },
                        children: "输入风险相关问题，生成风险分析报告"
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                        lineNumber: 302,
                        columnNumber: 15
                    }, void 0),
                    (0, _jsxdevruntime.jsxDEV)(Text, {
                        style: {
                            color: '#94A3B8',
                            fontSize: 12
                        },
                        children: "任务规划 → 图谱检索 → 实体统计 → 群体发现 → 风险分析 → 合规匹配 → 报告生成"
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                        lineNumber: 305,
                        columnNumber: 15
                    }, void 0)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                lineNumber: 301,
                columnNumber: 13
            }, void 0)
        }, void 0, false, {
            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
            lineNumber: 298,
            columnNumber: 9
        }, this)
    }, void 0, false, {
        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
        lineNumber: 297,
        columnNumber: 7
    }, this);
    const sortedPaths = (0, _react.useMemo)(()=>{
        if (!(report === null || report === void 0 ? void 0 : report.risk_paths)) return [];
        const order = {
            high: 0,
            medium: 1,
            low: 2
        };
        return [
            ...report.risk_paths
        ].sort((a, b)=>(order[a.risk_level] ?? 3) - (order[b.risk_level] ?? 3));
    }, [
        report
    ]);
    const sortedRecommendations = (0, _react.useMemo)(()=>{
        if (!(report === null || report === void 0 ? void 0 : report.recommendations)) return [];
        const order = {
            urgent: 0,
            normal: 1,
            low: 2
        };
        return [
            ...report.recommendations
        ].sort((a, b)=>(order[a.urgency] ?? 3) - (order[b.urgency] ?? 3));
    }, [
        report
    ]);
    const displayedPaths = showAllPaths ? sortedPaths : sortedPaths.slice(0, 5);
    const entityStats = report === null || report === void 0 ? void 0 : report.entity_stats;
    const totalEntities = (entityStats === null || entityStats === void 0 ? void 0 : entityStats.total_entities) || (report === null || report === void 0 ? void 0 : (_report_subgraph_summary = report.subgraph_summary) === null || _report_subgraph_summary === void 0 ? void 0 : _report_subgraph_summary.node_count) || 0;
    const entityTypeCounts = (entityStats === null || entityStats === void 0 ? void 0 : entityStats.entity_type_counts) || {};
    const topEntities = (entityStats === null || entityStats === void 0 ? void 0 : entityStats.top_entities) || [];
    const communityInfo = report === null || report === void 0 ? void 0 : report.community_info;
    const communities = (communityInfo === null || communityInfo === void 0 ? void 0 : communityInfo.communities) || (community === null || community === void 0 ? void 0 : community.communities) || [];
    return (0, _jsxdevruntime.jsxDEV)("div", {
        className: "risk-report-panel",
        style: {
            height: '100%',
            overflow: 'auto',
            padding: '12px 16px'
        },
        children: [
            (0, _jsxdevruntime.jsxDEV)("style", {
                children: `
        @media print {
          body * { visibility: hidden; }
          .risk-report-panel, .risk-report-panel * { visibility: visible; }
          .risk-report-panel { position: absolute; left: 0; top: 0; width: 100%; padding: 20px 40px !important; }
          .no-print { display: none !important; }
        }
        @keyframes sectionHighlight {
          0%, 100% { border-color: #e2e8f0; }
          50% { border-color: #2855D1; box-shadow: 0 0 12px rgba(40,85,209,0.15); }
        }
      `
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                lineNumber: 345,
                columnNumber: 7
            }, this),
            (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                },
                children: [
                    isLoading && stages.length > 0 && (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                        size: "small",
                        style: {
                            borderRadius: 8
                        },
                        className: "no-print",
                        children: [
                            (0, _jsxdevruntime.jsxDEV)(_antd.Steps, {
                                size: "small",
                                current: activeStep,
                                status: error ? 'error' : 'process',
                                items: stageOrder.map((key)=>({
                                        title: STAGE_LABELS[key] || key
                                    }))
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 362,
                                columnNumber: 13
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    marginTop: 8,
                                    textAlign: 'center'
                                },
                                children: (0, _jsxdevruntime.jsxDEV)(Text, {
                                    type: "secondary",
                                    style: {
                                        fontSize: 12
                                    },
                                    children: ((_stages_ = stages[stages.length - 1]) === null || _stages_ === void 0 ? void 0 : _stages_.content) || '初始化中...'
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 371,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 370,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                        lineNumber: 361,
                        columnNumber: 11
                    }, this),
                    isLoading && !report && stages.length === 0 && (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                        style: {
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: 200
                        },
                        children: (0, _jsxdevruntime.jsxDEV)("div", {
                            style: {
                                textAlign: 'center'
                            },
                            children: [
                                (0, _jsxdevruntime.jsxDEV)(_antd.Spin, {
                                    size: "large"
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 382,
                                    columnNumber: 15
                                }, this),
                                (0, _jsxdevruntime.jsxDEV)("div", {
                                    style: {
                                        marginTop: 16,
                                        color: '#94a3b8',
                                        fontSize: 14
                                    },
                                    children: "正在初始化风险分析流程..."
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 383,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                            lineNumber: 381,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                        lineNumber: 380,
                        columnNumber: 11
                    }, this),
                    error && !report && (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                        style: {
                            borderRadius: 8
                        },
                        children: (0, _jsxdevruntime.jsxDEV)("div", {
                            style: {
                                textAlign: 'center',
                                padding: 24
                            },
                            children: [
                                (0, _jsxdevruntime.jsxDEV)(Text, {
                                    type: "danger",
                                    style: {
                                        fontSize: 14,
                                        display: 'block',
                                        marginBottom: 12
                                    },
                                    children: [
                                        "风险分析失败: ",
                                        error
                                    ]
                                }, void 0, true, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 394,
                                    columnNumber: 15
                                }, this),
                                onRetry && (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                    icon: (0, _jsxdevruntime.jsxDEV)(_icons.ReloadOutlined, {}, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 398,
                                        columnNumber: 31
                                    }, void 0),
                                    onClick: onRetry,
                                    children: "重试"
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 398,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                            lineNumber: 393,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                        lineNumber: 392,
                        columnNumber: 11
                    }, this),
                    report && (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                        children: [
                            (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                size: "small",
                                style: {
                                    borderRadius: 8
                                },
                                className: "no-print",
                                children: [
                                    (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        },
                                        children: [
                                            (0, _jsxdevruntime.jsxDEV)("div", {
                                                style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 10
                                                },
                                                children: [
                                                    (0, _jsxdevruntime.jsxDEV)("div", {
                                                        style: {
                                                            width: 36,
                                                            height: 36,
                                                            borderRadius: 8,
                                                            background: 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            color: '#fff',
                                                            fontWeight: 700,
                                                            fontSize: 16,
                                                            flexShrink: 0
                                                        },
                                                        children: "W"
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 410,
                                                        columnNumber: 19
                                                    }, this),
                                                    (0, _jsxdevruntime.jsxDEV)("div", {
                                                        children: [
                                                            (0, _jsxdevruntime.jsxDEV)(Title, {
                                                                level: 5,
                                                                style: {
                                                                    margin: 0,
                                                                    fontSize: 15
                                                                },
                                                                children: [
                                                                    (0, _jsxdevruntime.jsxDEV)(_icons.ThunderboltOutlined, {
                                                                        style: {
                                                                            marginRight: 6,
                                                                            color: '#FFC101'
                                                                        }
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 429,
                                                                        columnNumber: 23
                                                                    }, this),
                                                                    "风险分析报告"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 428,
                                                                columnNumber: 21
                                                            }, this),
                                                            (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                type: "secondary",
                                                                style: {
                                                                    fontSize: 11
                                                                },
                                                                children: [
                                                                    reportId,
                                                                    " · ",
                                                                    formatTimestamp(report.generated_at)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 432,
                                                                columnNumber: 21
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 427,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 409,
                                                columnNumber: 17
                                            }, this),
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Space, {
                                                children: [
                                                    (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                        title: "历史报告",
                                                        children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                            size: "small",
                                                            icon: (0, _jsxdevruntime.jsxDEV)(_icons.HistoryOutlined, {}, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 439,
                                                                columnNumber: 48
                                                            }, void 0),
                                                            onClick: loadHistory
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 439,
                                                            columnNumber: 21
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 438,
                                                        columnNumber: 19
                                                    }, this),
                                                    (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                        title: "导出 Markdown",
                                                        children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                            size: "small",
                                                            icon: (0, _jsxdevruntime.jsxDEV)(_icons.FileMarkdownOutlined, {}, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 442,
                                                                columnNumber: 48
                                                            }, void 0),
                                                            onClick: handleExportMD
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 442,
                                                            columnNumber: 21
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 441,
                                                        columnNumber: 19
                                                    }, this),
                                                    (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                        title: "导出 Word",
                                                        children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                            size: "small",
                                                            icon: (0, _jsxdevruntime.jsxDEV)(_icons.FileWordOutlined, {}, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 445,
                                                                columnNumber: 48
                                                            }, void 0),
                                                            onClick: handleExportWord
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 445,
                                                            columnNumber: 21
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 444,
                                                        columnNumber: 19
                                                    }, this),
                                                    (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                        title: "导出 PDF",
                                                        children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                            size: "small",
                                                            icon: (0, _jsxdevruntime.jsxDEV)(_icons.FilePdfOutlined, {}, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 448,
                                                                columnNumber: 48
                                                            }, void 0),
                                                            onClick: handleExportPDF
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 448,
                                                            columnNumber: 21
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 447,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 437,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 408,
                                        columnNumber: 15
                                    }, this),
                                    queryText && (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            marginTop: 6,
                                            padding: '4px 10px',
                                            background: '#f8fafc',
                                            borderRadius: 6
                                        },
                                        children: (0, _jsxdevruntime.jsxDEV)(Text, {
                                            type: "secondary",
                                            style: {
                                                fontSize: 11
                                            },
                                            children: [
                                                "查询: ",
                                                queryText
                                            ]
                                        }, void 0, true, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 454,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 453,
                                        columnNumber: 17
                                    }, this),
                                    (0, _jsxdevruntime.jsxDEV)(_antd.Row, {
                                        gutter: 12,
                                        style: {
                                            marginTop: 12
                                        },
                                        children: [
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                                                span: 6,
                                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
                                                    title: "实体总数",
                                                    value: totalEntities,
                                                    valueStyle: {
                                                        fontSize: 18,
                                                        fontWeight: 700
                                                    }
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 462,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 461,
                                                columnNumber: 17
                                            }, this),
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                                                span: 6,
                                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
                                                    title: "风险路径",
                                                    value: ((_report_risk_paths = report.risk_paths) === null || _report_risk_paths === void 0 ? void 0 : _report_risk_paths.length) || 0,
                                                    valueStyle: {
                                                        fontSize: 18,
                                                        fontWeight: 700,
                                                        color: RISK_LEVEL_COLORS[report.overall_risk_level]
                                                    }
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 465,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 464,
                                                columnNumber: 17
                                            }, this),
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                                                span: 6,
                                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
                                                    title: "异常发现",
                                                    value: ((_report_anomaly_findings = report.anomaly_findings) === null || _report_anomaly_findings === void 0 ? void 0 : _report_anomaly_findings.length) || 0,
                                                    valueStyle: {
                                                        fontSize: 18,
                                                        fontWeight: 700
                                                    }
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 472,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 471,
                                                columnNumber: 17
                                            }, this),
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                                                span: 6,
                                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
                                                    title: "合规匹配",
                                                    value: ((_report_compliance_matches = report.compliance_matches) === null || _report_compliance_matches === void 0 ? void 0 : _report_compliance_matches.length) || 0,
                                                    valueStyle: {
                                                        fontSize: 18,
                                                        fontWeight: 700
                                                    }
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 475,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 474,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 460,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 407,
                                columnNumber: 13
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)("div", {
                                id: "risk-section-entity-stats",
                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                    size: "small",
                                    style: {
                                        borderRadius: 8,
                                        ...highlightSection === 'entity-stats' ? {
                                            animation: 'sectionHighlight 1s ease-in-out 2'
                                        } : {}
                                    },
                                    title: (0, _jsxdevruntime.jsxDEV)("span", {
                                        style: {
                                            fontSize: 13
                                        },
                                        children: [
                                            (0, _jsxdevruntime.jsxDEV)(_icons.TeamOutlined, {
                                                style: {
                                                    marginRight: 8,
                                                    color: '#2855D1'
                                                }
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 490,
                                                columnNumber: 21
                                            }, void 0),
                                            "实体统计",
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                style: {
                                                    marginLeft: 8,
                                                    fontSize: 10
                                                },
                                                children: [
                                                    totalEntities,
                                                    " 个实体"
                                                ]
                                            }, void 0, true, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 492,
                                                columnNumber: 21
                                            }, void 0)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 489,
                                        columnNumber: 19
                                    }, void 0),
                                    children: [
                                        Object.keys(entityTypeCounts).length > 0 ? (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                            children: [
                                                (0, _jsxdevruntime.jsxDEV)(Text, {
                                                    type: "secondary",
                                                    style: {
                                                        fontSize: 12,
                                                        display: 'block',
                                                        marginBottom: 8
                                                    },
                                                    children: "实体类型分布"
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 498,
                                                    columnNumber: 21
                                                }, this),
                                                (0, _jsxdevruntime.jsxDEV)(_EventBarChart.default, {
                                                    data: Object.entries(entityTypeCounts).map(([name, count], idx)=>({
                                                            name,
                                                            count,
                                                            color: [
                                                                '#1890ff',
                                                                '#52c41a',
                                                                '#fa8c16',
                                                                '#f5222d',
                                                                '#722ed1',
                                                                '#13c2c2',
                                                                '#eb2f96'
                                                            ][idx % 7]
                                                        }))
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 499,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true) : entityTypeData.length > 0 ? (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                            children: [
                                                (0, _jsxdevruntime.jsxDEV)(Text, {
                                                    type: "secondary",
                                                    style: {
                                                        fontSize: 12,
                                                        display: 'block',
                                                        marginBottom: 8
                                                    },
                                                    children: "实体类型分布"
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 509,
                                                    columnNumber: 21
                                                }, this),
                                                (0, _jsxdevruntime.jsxDEV)(_EventBarChart.default, {
                                                    data: entityTypeData
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 510,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true) : (0, _jsxdevruntime.jsxDEV)(Text, {
                                            type: "secondary",
                                            style: {
                                                fontSize: 12
                                            },
                                            children: "暂无实体类型统计数据"
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 513,
                                            columnNumber: 19
                                        }, this),
                                        topEntities.length > 0 && (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                            children: [
                                                (0, _jsxdevruntime.jsxDEV)(Text, {
                                                    type: "secondary",
                                                    style: {
                                                        fontSize: 12,
                                                        display: 'block',
                                                        marginTop: 12,
                                                        marginBottom: 4
                                                    },
                                                    children: [
                                                        "前 ",
                                                        topEntities.length,
                                                        " 个实体"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 518,
                                                    columnNumber: 21
                                                }, this),
                                                (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        display: 'flex',
                                                        gap: 4,
                                                        flexWrap: 'wrap'
                                                    },
                                                    children: topEntities.map((e, i)=>(0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                            style: {
                                                                fontSize: 11,
                                                                borderRadius: 6,
                                                                cursor: onJumpToGraph ? 'pointer' : 'default'
                                                            },
                                                            onClick: ()=>onJumpToGraph === null || onJumpToGraph === void 0 ? void 0 : onJumpToGraph(e.id || e.name, e.name, e.type),
                                                            children: [
                                                                onJumpToGraph ? (0, _jsxdevruntime.jsxDEV)(_icons.LinkOutlined, {
                                                                    style: {
                                                                        marginRight: 4,
                                                                        fontSize: 10
                                                                    }
                                                                }, void 0, false, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 526,
                                                                    columnNumber: 44
                                                                }, this) : null,
                                                                e.name,
                                                                (0, _jsxdevruntime.jsxDEV)("span", {
                                                                    style: {
                                                                        color: '#94a3b8',
                                                                        marginLeft: 4,
                                                                        fontSize: 10
                                                                    },
                                                                    children: [
                                                                        "(",
                                                                        e.type,
                                                                        ")"
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 528,
                                                                    columnNumber: 27
                                                                }, this)
                                                            ]
                                                        }, i, true, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 521,
                                                            columnNumber: 25
                                                        }, this))
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 519,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true),
                                        sortedEntities.length > 0 && topEntities.length === 0 && (0, _jsxdevruntime.jsxDEV)(_antd.List, {
                                            size: "small",
                                            header: (0, _jsxdevruntime.jsxDEV)(Text, {
                                                type: "secondary",
                                                style: {
                                                    fontSize: 11
                                                },
                                                children: "相关实体（前 10）"
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 538,
                                                columnNumber: 29
                                            }, void 0),
                                            dataSource: sortedEntities,
                                            renderItem: ([name, { count }])=>(0, _jsxdevruntime.jsxDEV)(_antd.List.Item, {
                                                    style: {
                                                        padding: '2px 0',
                                                        cursor: onJumpToGraph ? 'pointer' : 'default'
                                                    },
                                                    onClick: ()=>onJumpToGraph === null || onJumpToGraph === void 0 ? void 0 : onJumpToGraph(name, name, 'Entity'),
                                                    children: (0, _jsxdevruntime.jsxDEV)(_antd.Space, {
                                                        style: {
                                                            width: '100%',
                                                            justifyContent: 'space-between'
                                                        },
                                                        children: [
                                                            (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                style: {
                                                                    fontSize: 12
                                                                },
                                                                ellipsis: true,
                                                                children: [
                                                                    onJumpToGraph ? (0, _jsxdevruntime.jsxDEV)(_icons.LinkOutlined, {
                                                                        style: {
                                                                            marginRight: 4,
                                                                            fontSize: 10
                                                                        }
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 547,
                                                                        columnNumber: 46
                                                                    }, void 0) : null,
                                                                    name
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 546,
                                                                columnNumber: 27
                                                            }, void 0),
                                                            (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                type: "secondary",
                                                                style: {
                                                                    fontSize: 10
                                                                },
                                                                children: [
                                                                    count,
                                                                    "x"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 550,
                                                                columnNumber: 27
                                                            }, void 0)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 545,
                                                        columnNumber: 25
                                                    }, void 0)
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 541,
                                                    columnNumber: 23
                                                }, void 0)
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 536,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 482,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 481,
                                columnNumber: 13
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)("div", {
                                id: "risk-section-community",
                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                    size: "small",
                                    style: {
                                        borderRadius: 8,
                                        ...highlightSection === 'community' ? {
                                            animation: 'sectionHighlight 1s ease-in-out 2'
                                        } : {}
                                    },
                                    title: (0, _jsxdevruntime.jsxDEV)("span", {
                                        style: {
                                            fontSize: 13
                                        },
                                        children: [
                                            (0, _jsxdevruntime.jsxDEV)(_icons.ClusterOutlined, {
                                                style: {
                                                    marginRight: 8,
                                                    color: '#722ed1'
                                                }
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 569,
                                                columnNumber: 21
                                            }, void 0),
                                            "群体发现",
                                            communities.length > 0 && (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                style: {
                                                    marginLeft: 8,
                                                    fontSize: 10
                                                },
                                                children: [
                                                    communities.length,
                                                    " 个群体"
                                                ]
                                            }, void 0, true, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 572,
                                                columnNumber: 23
                                            }, void 0)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 568,
                                        columnNumber: 19
                                    }, void 0),
                                    children: [
                                        communities.length > 0 ? (0, _jsxdevruntime.jsxDEV)("div", {
                                            style: {
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 10
                                            },
                                            children: communities.map((comm)=>{
                                                var _comm_members;
                                                return (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        padding: '10px 14px',
                                                        background: '#faf5ff',
                                                        borderRadius: 8,
                                                        border: '1px solid #f3e8ff'
                                                    },
                                                    children: [
                                                        (0, _jsxdevruntime.jsxDEV)("div", {
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 8,
                                                                marginBottom: 6
                                                            },
                                                            children: [
                                                                (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                    strong: true,
                                                                    style: {
                                                                        fontSize: 13,
                                                                        color: '#722ed1'
                                                                    },
                                                                    children: [
                                                                        "群体 #",
                                                                        comm.community_id
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 590,
                                                                    columnNumber: 27
                                                                }, this),
                                                                (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                    color: "purple",
                                                                    style: {
                                                                        borderRadius: 4,
                                                                        fontSize: 10,
                                                                        margin: 0
                                                                    },
                                                                    children: [
                                                                        comm.size,
                                                                        " 个成员"
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 593,
                                                                    columnNumber: 27
                                                                }, this),
                                                                comm.modularity !== undefined && comm.modularity !== null && (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                    style: {
                                                                        fontSize: 10,
                                                                        borderRadius: 4,
                                                                        margin: 0,
                                                                        background: '#f0f5ff',
                                                                        border: '1px solid #d6e4ff',
                                                                        color: '#2855D1'
                                                                    },
                                                                    children: [
                                                                        "模块度: ",
                                                                        comm.modularity.toFixed(3)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 597,
                                                                    columnNumber: 29
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 589,
                                                            columnNumber: 25
                                                        }, this),
                                                        (0, _jsxdevruntime.jsxDEV)("div", {
                                                            style: {
                                                                display: 'flex',
                                                                gap: 4,
                                                                flexWrap: 'wrap'
                                                            },
                                                            children: [
                                                                (_comm_members = comm.members) === null || _comm_members === void 0 ? void 0 : _comm_members.slice(0, 15).map((m, i)=>(0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                        style: {
                                                                            fontSize: 10,
                                                                            borderRadius: 6,
                                                                            cursor: onJumpToGraph ? 'pointer' : 'default'
                                                                        },
                                                                        onClick: ()=>onJumpToGraph === null || onJumpToGraph === void 0 ? void 0 : onJumpToGraph(m.id, m.name, m.type),
                                                                        children: [
                                                                            onJumpToGraph ? (0, _jsxdevruntime.jsxDEV)(_icons.LinkOutlined, {
                                                                                style: {
                                                                                    marginRight: 2,
                                                                                    fontSize: 10
                                                                                }
                                                                            }, void 0, false, {
                                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                lineNumber: 609,
                                                                                columnNumber: 48
                                                                            }, this) : null,
                                                                            m.name
                                                                        ]
                                                                    }, i, true, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 604,
                                                                        columnNumber: 29
                                                                    }, this)),
                                                                comm.members && comm.members.length > 15 && (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                    type: "secondary",
                                                                    style: {
                                                                        fontSize: 10
                                                                    },
                                                                    children: [
                                                                        "+",
                                                                        comm.members.length - 15,
                                                                        " 更多"
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 614,
                                                                    columnNumber: 29
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 602,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, comm.community_id, true, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 580,
                                                    columnNumber: 23
                                                }, this);
                                            })
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 578,
                                            columnNumber: 19
                                        }, this) : (0, _jsxdevruntime.jsxDEV)(Text, {
                                            type: "secondary",
                                            style: {
                                                fontSize: 12
                                            },
                                            children: "当前子图规模较小，未检测到明显群体结构"
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 623,
                                            columnNumber: 19
                                        }, this),
                                        (communityInfo === null || communityInfo === void 0 ? void 0 : communityInfo.algorithm) && (0, _jsxdevruntime.jsxDEV)(Text, {
                                            type: "secondary",
                                            style: {
                                                fontSize: 10,
                                                display: 'block',
                                                marginTop: 8
                                            },
                                            children: [
                                                "算法: ",
                                                communityInfo.algorithm
                                            ]
                                        }, void 0, true, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 628,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 561,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 560,
                                columnNumber: 13
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)("div", {
                                id: "risk-section-risk-paths",
                                children: sortedPaths.length > 0 ? (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                    size: "small",
                                    style: {
                                        borderRadius: 8,
                                        ...highlightSection === 'risk-paths' ? {
                                            animation: 'sectionHighlight 1s ease-in-out 2'
                                        } : {}
                                    },
                                    title: (0, _jsxdevruntime.jsxDEV)("span", {
                                        style: {
                                            fontSize: 13
                                        },
                                        children: [
                                            (0, _jsxdevruntime.jsxDEV)(_icons.NodeIndexOutlined, {
                                                style: {
                                                    marginRight: 8,
                                                    color: '#f5222d'
                                                }
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 646,
                                                columnNumber: 23
                                            }, void 0),
                                            "风险传导路径 (",
                                            sortedPaths.length,
                                            ")"
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 645,
                                        columnNumber: 21
                                    }, void 0),
                                    extra: (0, _jsxdevruntime.jsxDEV)(_antd.Space, {
                                        size: 4,
                                        children: [
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                color: "error",
                                                style: {
                                                    fontSize: 10,
                                                    borderRadius: 4
                                                },
                                                children: [
                                                    "高风险 ",
                                                    highCount
                                                ]
                                            }, void 0, true, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 652,
                                                columnNumber: 23
                                            }, void 0),
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                color: "warning",
                                                style: {
                                                    fontSize: 10,
                                                    borderRadius: 4
                                                },
                                                children: [
                                                    "中风险 ",
                                                    mediumCount
                                                ]
                                            }, void 0, true, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 653,
                                                columnNumber: 23
                                            }, void 0),
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                color: "success",
                                                style: {
                                                    fontSize: 10,
                                                    borderRadius: 4
                                                },
                                                children: [
                                                    "低风险 ",
                                                    lowCount
                                                ]
                                            }, void 0, true, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 654,
                                                columnNumber: 23
                                            }, void 0)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 651,
                                        columnNumber: 21
                                    }, void 0),
                                    children: [
                                        (0, _jsxdevruntime.jsxDEV)("div", {
                                            style: {
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 8
                                            },
                                            children: displayedPaths.map((path)=>{
                                                var _path_affected_entities;
                                                return (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        padding: '10px 12px',
                                                        background: '#f8fafc',
                                                        borderRadius: 6,
                                                        borderLeft: `4px solid ${RISK_LEVEL_COLORS[path.risk_level] || '#fa8c16'}`
                                                    },
                                                    children: [
                                                        (0, _jsxdevruntime.jsxDEV)("div", {
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 6,
                                                                marginBottom: 4,
                                                                flexWrap: 'wrap'
                                                            },
                                                            children: [
                                                                (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                    color: RISK_LEVEL_COLORS[path.risk_level],
                                                                    style: {
                                                                        fontSize: 10,
                                                                        borderRadius: 4,
                                                                        lineHeight: '18px',
                                                                        margin: 0
                                                                    },
                                                                    children: path.risk_level === 'high' ? '高风险' : path.risk_level === 'medium' ? '中风险' : '低风险'
                                                                }, void 0, false, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 670,
                                                                    columnNumber: 27
                                                                }, this),
                                                                (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                    strong: true,
                                                                    style: {
                                                                        fontSize: 12
                                                                    },
                                                                    children: path.path_id
                                                                }, void 0, false, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 673,
                                                                    columnNumber: 27
                                                                }, this),
                                                                path.confidence !== undefined && (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                    style: {
                                                                        fontSize: 10,
                                                                        borderRadius: 4,
                                                                        lineHeight: '18px',
                                                                        margin: 0,
                                                                        background: '#f0f5ff',
                                                                        border: '1px solid #d6e4ff',
                                                                        color: '#2855D1'
                                                                    },
                                                                    children: [
                                                                        (path.confidence * 100).toFixed(0),
                                                                        "%"
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 675,
                                                                    columnNumber: 29
                                                                }, this),
                                                                onJumpToGraph && ((_path_affected_entities = path.affected_entities) === null || _path_affected_entities === void 0 ? void 0 : _path_affected_entities.length) > 0 && (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                    size: "small",
                                                                    type: "link",
                                                                    icon: (0, _jsxdevruntime.jsxDEV)(_icons.EyeOutlined, {}, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 683,
                                                                        columnNumber: 37
                                                                    }, void 0),
                                                                    style: {
                                                                        fontSize: 10,
                                                                        padding: 0,
                                                                        height: 20
                                                                    },
                                                                    onClick: ()=>onJumpToGraph(path.affected_entities[0], path.affected_entities[0], 'Entity'),
                                                                    children: "查看图谱"
                                                                }, void 0, false, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 680,
                                                                    columnNumber: 29
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 669,
                                                            columnNumber: 25
                                                        }, this),
                                                        (0, _jsxdevruntime.jsxDEV)(Text, {
                                                            style: {
                                                                fontSize: 12,
                                                                color: '#475569'
                                                            },
                                                            children: path.path_description
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 691,
                                                            columnNumber: 25
                                                        }, this),
                                                        path.affected_entities && path.affected_entities.length > 0 && (0, _jsxdevruntime.jsxDEV)("div", {
                                                            style: {
                                                                marginTop: 4,
                                                                display: 'flex',
                                                                gap: 4,
                                                                flexWrap: 'wrap'
                                                            },
                                                            children: [
                                                                path.affected_entities.slice(0, 8).map((e)=>(0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                        style: {
                                                                            fontSize: 10,
                                                                            borderRadius: 4,
                                                                            cursor: onJumpToGraph ? 'pointer' : 'default'
                                                                        },
                                                                        onClick: ()=>onJumpToGraph === null || onJumpToGraph === void 0 ? void 0 : onJumpToGraph(e, e, 'Entity'),
                                                                        children: e
                                                                    }, e, false, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 695,
                                                                        columnNumber: 31
                                                                    }, this)),
                                                                path.affected_entities.length > 8 && (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                    type: "secondary",
                                                                    style: {
                                                                        fontSize: 10
                                                                    },
                                                                    children: [
                                                                        "+",
                                                                        path.affected_entities.length - 8,
                                                                        " 更多"
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 704,
                                                                    columnNumber: 31
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 693,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, path.path_id, true, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 660,
                                                    columnNumber: 23
                                                }, this);
                                            })
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 658,
                                            columnNumber: 19
                                        }, this),
                                        sortedPaths.length > 5 && (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                            type: "link",
                                            size: "small",
                                            onClick: ()=>setShowAllPaths(!showAllPaths),
                                            style: {
                                                marginTop: 8,
                                                padding: 0
                                            },
                                            children: showAllPaths ? '收起，仅显示前 5 条' : `展开全部 ${sortedPaths.length} 条路径`
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 712,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 638,
                                    columnNumber: 17
                                }, this) : (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                    size: "small",
                                    style: {
                                        borderRadius: 8
                                    },
                                    title: (0, _jsxdevruntime.jsxDEV)("span", {
                                        style: {
                                            fontSize: 13
                                        },
                                        children: [
                                            (0, _jsxdevruntime.jsxDEV)(_icons.NodeIndexOutlined, {
                                                style: {
                                                    marginRight: 8,
                                                    color: '#f5222d'
                                                }
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 728,
                                                columnNumber: 23
                                            }, void 0),
                                            "风险传导路径"
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 727,
                                        columnNumber: 21
                                    }, void 0),
                                    children: (0, _jsxdevruntime.jsxDEV)(Text, {
                                        type: "secondary",
                                        style: {
                                            fontSize: 12
                                        },
                                        children: "未检测到风险传导路径"
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 733,
                                        columnNumber: 19
                                    }, this)
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 723,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 636,
                                columnNumber: 13
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)("div", {
                                id: "risk-section-final-report",
                                ref: finalReportRef,
                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                    size: "small",
                                    style: {
                                        borderRadius: 8,
                                        border: highlightSection === 'final-report' ? '2px solid #2855D1' : undefined,
                                        transition: 'border-color 0.5s ease',
                                        ...highlightSection === 'final-report' ? {
                                            animation: 'sectionHighlight 1s ease-in-out 2'
                                        } : {}
                                    },
                                    title: (0, _jsxdevruntime.jsxDEV)("span", {
                                        style: {
                                            fontSize: 13
                                        },
                                        children: [
                                            (0, _jsxdevruntime.jsxDEV)(_icons.FileTextOutlined, {
                                                style: {
                                                    marginRight: 8,
                                                    color: '#2855D1'
                                                }
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 750,
                                                columnNumber: 21
                                            }, void 0),
                                            "综合风险报告"
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 749,
                                        columnNumber: 19
                                    }, void 0),
                                    extra: (0, _jsxdevruntime.jsxDEV)(_antd.Space, {
                                        size: 4,
                                        className: "no-print",
                                        children: [
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                title: "导出 Markdown",
                                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                    size: "small",
                                                    icon: (0, _jsxdevruntime.jsxDEV)(_icons.FileMarkdownOutlined, {}, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 757,
                                                        columnNumber: 50
                                                    }, void 0),
                                                    onClick: handleExportMD
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 757,
                                                    columnNumber: 23
                                                }, void 0)
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 756,
                                                columnNumber: 21
                                            }, void 0),
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                title: "导出 Word",
                                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                    size: "small",
                                                    icon: (0, _jsxdevruntime.jsxDEV)(_icons.FileWordOutlined, {}, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 760,
                                                        columnNumber: 50
                                                    }, void 0),
                                                    onClick: handleExportWord
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 760,
                                                    columnNumber: 23
                                                }, void 0)
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 759,
                                                columnNumber: 21
                                            }, void 0),
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                title: "导出 PDF",
                                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                    size: "small",
                                                    icon: (0, _jsxdevruntime.jsxDEV)(_icons.FilePdfOutlined, {}, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 763,
                                                        columnNumber: 50
                                                    }, void 0),
                                                    onClick: handleExportPDF
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 763,
                                                    columnNumber: 23
                                                }, void 0)
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 762,
                                                columnNumber: 21
                                            }, void 0)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 755,
                                        columnNumber: 19
                                    }, void 0),
                                    children: [
                                        (0, _jsxdevruntime.jsxDEV)("div", {
                                            style: {
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                justifyContent: 'space-between',
                                                flexWrap: 'wrap',
                                                gap: 12,
                                                marginBottom: 12
                                            },
                                            children: [
                                                (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        flex: 1,
                                                        minWidth: 200
                                                    },
                                                    children: [
                                                        (0, _jsxdevruntime.jsxDEV)(Title, {
                                                            level: 5,
                                                            style: {
                                                                margin: '0 0 8px',
                                                                fontSize: 15
                                                            },
                                                            children: [
                                                                (0, _jsxdevruntime.jsxDEV)(_icons.ThunderboltOutlined, {
                                                                    style: {
                                                                        marginRight: 8,
                                                                        color: '#FFC101'
                                                                    }
                                                                }, void 0, false, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 772,
                                                                    columnNumber: 23
                                                                }, this),
                                                                "执行摘要"
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 771,
                                                            columnNumber: 21
                                                        }, this),
                                                        (0, _jsxdevruntime.jsxDEV)(Paragraph, {
                                                            ellipsis: {
                                                                rows: 3,
                                                                expandable: true
                                                            },
                                                            style: {
                                                                color: '#475569',
                                                                fontSize: 13,
                                                                marginBottom: 0
                                                            },
                                                            children: report.executive_summary
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 775,
                                                            columnNumber: 21
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 770,
                                                    columnNumber: 19
                                                }, this),
                                                (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        textAlign: 'center',
                                                        flexShrink: 0
                                                    },
                                                    children: (0, _jsxdevruntime.jsxDEV)("div", {
                                                        style: {
                                                            display: 'inline-block',
                                                            padding: '10px 20px',
                                                            borderRadius: 12,
                                                            background: RISK_LEVEL_BG[report.overall_risk_level] || RISK_LEVEL_BG.medium,
                                                            border: `2px solid ${RISK_LEVEL_COLORS[report.overall_risk_level] || RISK_LEVEL_COLORS.medium}`
                                                        },
                                                        children: [
                                                            (0, _jsxdevruntime.jsxDEV)("div", {
                                                                style: {
                                                                    fontSize: 28,
                                                                    fontWeight: 800,
                                                                    color: RISK_LEVEL_COLORS[report.overall_risk_level] || RISK_LEVEL_COLORS.medium,
                                                                    lineHeight: 1
                                                                },
                                                                children: RISK_LEVEL_LABELS[report.overall_risk_level] || '中风险'
                                                            }, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 792,
                                                                columnNumber: 23
                                                            }, this),
                                                            (0, _jsxdevruntime.jsxDEV)("div", {
                                                                style: {
                                                                    fontSize: 20,
                                                                    fontWeight: 700,
                                                                    color: '#1e293b',
                                                                    marginTop: 4
                                                                },
                                                                children: [
                                                                    riskScore,
                                                                    (0, _jsxdevruntime.jsxDEV)("span", {
                                                                        style: {
                                                                            fontSize: 12,
                                                                            fontWeight: 400,
                                                                            color: '#94a3b8'
                                                                        },
                                                                        children: "/100"
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 804,
                                                                        columnNumber: 25
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 802,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 783,
                                                        columnNumber: 21
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 782,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 769,
                                            columnNumber: 17
                                        }, this),
                                        report.anomaly_findings && report.anomaly_findings.length > 0 && (0, _jsxdevruntime.jsxDEV)(_antd.Collapse, {
                                            size: "small",
                                            ghost: true,
                                            style: {
                                                marginBottom: 8
                                            },
                                            items: [
                                                {
                                                    key: 'anomalies',
                                                    label: (0, _jsxdevruntime.jsxDEV)("span", {
                                                        style: {
                                                            fontSize: 12
                                                        },
                                                        children: [
                                                            (0, _jsxdevruntime.jsxDEV)(_icons.BulbOutlined, {
                                                                style: {
                                                                    marginRight: 6,
                                                                    color: '#FF8C00'
                                                                }
                                                            }, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 820,
                                                                columnNumber: 27
                                                            }, void 0),
                                                            "异常发现 (",
                                                            report.anomaly_findings.length,
                                                            ")"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 819,
                                                        columnNumber: 25
                                                    }, void 0),
                                                    children: (0, _jsxdevruntime.jsxDEV)("div", {
                                                        style: {
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: 8
                                                        },
                                                        children: report.anomaly_findings.map((anomaly, idx)=>(0, _jsxdevruntime.jsxDEV)("div", {
                                                                style: {
                                                                    padding: '8px 12px',
                                                                    background: '#fffbeb',
                                                                    borderRadius: 6,
                                                                    border: '1px solid #fef3c7'
                                                                },
                                                                children: [
                                                                    (0, _jsxdevruntime.jsxDEV)("div", {
                                                                        style: {
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 8,
                                                                            marginBottom: 4,
                                                                            flexWrap: 'wrap'
                                                                        },
                                                                        children: [
                                                                            (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                                strong: true,
                                                                                style: {
                                                                                    fontSize: 12
                                                                                },
                                                                                children: anomaly.anomaly_type
                                                                            }, void 0, false, {
                                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                lineNumber: 829,
                                                                                columnNumber: 33
                                                                            }, void 0),
                                                                            (0, _jsxdevruntime.jsxDEV)(_antd.Progress, {
                                                                                percent: Math.round((anomaly.confidence || 0) * 100),
                                                                                size: "small",
                                                                                style: {
                                                                                    width: 100,
                                                                                    margin: 0
                                                                                },
                                                                                strokeColor: (anomaly.confidence || 0) > 0.8 ? '#52c41a' : (anomaly.confidence || 0) > 0.5 ? '#fa8c16' : '#f5222d'
                                                                            }, void 0, false, {
                                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                lineNumber: 830,
                                                                                columnNumber: 33
                                                                            }, void 0)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 828,
                                                                        columnNumber: 31
                                                                    }, void 0),
                                                                    (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                        style: {
                                                                            fontSize: 11,
                                                                            color: '#64748b',
                                                                            display: 'block'
                                                                        },
                                                                        children: anomaly.evidence
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 837,
                                                                        columnNumber: 31
                                                                    }, void 0),
                                                                    anomaly.affected_entities && anomaly.affected_entities.length > 0 && (0, _jsxdevruntime.jsxDEV)("div", {
                                                                        style: {
                                                                            marginTop: 4,
                                                                            display: 'flex',
                                                                            gap: 4,
                                                                            flexWrap: 'wrap'
                                                                        },
                                                                        children: [
                                                                            (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                                type: "secondary",
                                                                                style: {
                                                                                    fontSize: 10
                                                                                },
                                                                                children: "涉及: "
                                                                            }, void 0, false, {
                                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                lineNumber: 840,
                                                                                columnNumber: 35
                                                                            }, void 0),
                                                                            anomaly.affected_entities.map((e)=>(0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                                    style: {
                                                                                        fontSize: 10,
                                                                                        borderRadius: 4,
                                                                                        cursor: onJumpToGraph ? 'pointer' : 'default'
                                                                                    },
                                                                                    onClick: ()=>onJumpToGraph === null || onJumpToGraph === void 0 ? void 0 : onJumpToGraph(e, e, 'Entity'),
                                                                                    children: e
                                                                                }, e, false, {
                                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                    lineNumber: 842,
                                                                                    columnNumber: 37
                                                                                }, void 0))
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 839,
                                                                        columnNumber: 33
                                                                    }, void 0)
                                                                ]
                                                            }, idx, true, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 827,
                                                                columnNumber: 29
                                                            }, void 0))
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 825,
                                                        columnNumber: 25
                                                    }, void 0)
                                                }
                                            ]
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 812,
                                            columnNumber: 19
                                        }, this),
                                        report.compliance_matches && report.compliance_matches.length > 0 && (0, _jsxdevruntime.jsxDEV)(_antd.Collapse, {
                                            size: "small",
                                            ghost: true,
                                            style: {
                                                marginBottom: 8
                                            },
                                            items: [
                                                {
                                                    key: 'compliance',
                                                    label: (0, _jsxdevruntime.jsxDEV)("span", {
                                                        style: {
                                                            fontSize: 12
                                                        },
                                                        children: [
                                                            (0, _jsxdevruntime.jsxDEV)(_icons.SafetyOutlined, {
                                                                style: {
                                                                    marginRight: 6,
                                                                    color: '#722ed1'
                                                                }
                                                            }, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 866,
                                                                columnNumber: 27
                                                            }, void 0),
                                                            "合规匹配 (",
                                                            report.compliance_matches.length,
                                                            ")"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 865,
                                                        columnNumber: 25
                                                    }, void 0),
                                                    children: (0, _jsxdevruntime.jsxDEV)("div", {
                                                        style: {
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: 8
                                                        },
                                                        children: report.compliance_matches.map((match, idx)=>(0, _jsxdevruntime.jsxDEV)("div", {
                                                                style: {
                                                                    padding: '8px 12px',
                                                                    background: '#faf5ff',
                                                                    borderRadius: 6,
                                                                    border: '1px solid #f3e8ff'
                                                                },
                                                                children: [
                                                                    (0, _jsxdevruntime.jsxDEV)("div", {
                                                                        style: {
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 6,
                                                                            marginBottom: 4,
                                                                            flexWrap: 'wrap'
                                                                        },
                                                                        children: [
                                                                            (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                                strong: true,
                                                                                style: {
                                                                                    fontSize: 12
                                                                                },
                                                                                children: match.regulation
                                                                            }, void 0, false, {
                                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                lineNumber: 875,
                                                                                columnNumber: 33
                                                                            }, void 0),
                                                                            match.article && (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                                color: "purple",
                                                                                style: {
                                                                                    fontSize: 10,
                                                                                    borderRadius: 4,
                                                                                    margin: 0
                                                                                },
                                                                                children: match.article
                                                                            }, void 0, false, {
                                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                lineNumber: 876,
                                                                                columnNumber: 51
                                                                            }, void 0),
                                                                            match.confidence !== undefined && (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                                style: {
                                                                                    fontSize: 10,
                                                                                    borderRadius: 4,
                                                                                    margin: 0,
                                                                                    background: '#f0f5ff',
                                                                                    border: '1px solid #d6e4ff',
                                                                                    color: '#2855D1'
                                                                                },
                                                                                children: [
                                                                                    (match.confidence * 100).toFixed(0),
                                                                                    "%"
                                                                                ]
                                                                            }, void 0, true, {
                                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                lineNumber: 878,
                                                                                columnNumber: 35
                                                                            }, void 0),
                                                                            (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                                color: "#722ed1",
                                                                                style: {
                                                                                    fontSize: 10,
                                                                                    borderRadius: 4,
                                                                                    margin: 0
                                                                                },
                                                                                children: match.suggested_action
                                                                            }, void 0, false, {
                                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                lineNumber: 882,
                                                                                columnNumber: 33
                                                                            }, void 0)
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 874,
                                                                        columnNumber: 31
                                                                    }, void 0),
                                                                    (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                        style: {
                                                                            fontSize: 11,
                                                                            color: '#64748b',
                                                                            display: 'block'
                                                                        },
                                                                        children: match.violation
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 884,
                                                                        columnNumber: 31
                                                                    }, void 0)
                                                                ]
                                                            }, idx, true, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 873,
                                                                columnNumber: 29
                                                            }, void 0))
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                        lineNumber: 871,
                                                        columnNumber: 25
                                                    }, void 0)
                                                }
                                            ]
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 858,
                                            columnNumber: 19
                                        }, this),
                                        report.integrated_report || report.markdown_report ? (0, _jsxdevruntime.jsxDEV)("div", {
                                            className: "markdown-report",
                                            style: {
                                                fontSize: 13,
                                                lineHeight: 1.7,
                                                color: '#334155',
                                                marginTop: 12,
                                                padding: '12px 16px',
                                                background: '#f8fafc',
                                                borderRadius: 8
                                            },
                                            children: (0, _jsxdevruntime.jsxDEV)(_reactmarkdown.default, {
                                                children: report.integrated_report || report.markdown_report
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 896,
                                                columnNumber: 21
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 895,
                                            columnNumber: 19
                                        }, this) : null,
                                        sortedRecommendations.length > 0 && (0, _jsxdevruntime.jsxDEV)("div", {
                                            style: {
                                                marginTop: 12
                                            },
                                            children: [
                                                (0, _jsxdevruntime.jsxDEV)(Text, {
                                                    strong: true,
                                                    style: {
                                                        fontSize: 13,
                                                        display: 'block',
                                                        marginBottom: 8
                                                    },
                                                    children: "建议措施"
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 903,
                                                    columnNumber: 21
                                                }, this),
                                                (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: 8
                                                    },
                                                    children: sortedRecommendations.map((rec, idx)=>{
                                                        const urgency = URGENCY_TAGS[rec.urgency] || URGENCY_TAGS.normal;
                                                        const trendIcon = rec.urgency === 'urgent' ? (0, _jsxdevruntime.jsxDEV)(_icons.RiseOutlined, {}, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 907,
                                                            columnNumber: 70
                                                        }, this) : rec.urgency === 'low' ? (0, _jsxdevruntime.jsxDEV)(_icons.FallOutlined, {}, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 907,
                                                            columnNumber: 113
                                                        }, this) : (0, _jsxdevruntime.jsxDEV)(_icons.MinusOutlined, {}, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 907,
                                                            columnNumber: 132
                                                        }, this);
                                                        return (0, _jsxdevruntime.jsxDEV)("div", {
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'flex-start',
                                                                gap: 8,
                                                                padding: '8px 12px',
                                                                background: rec.urgency === 'urgent' ? '#fff2f0' : '#f8fafc',
                                                                borderRadius: 6,
                                                                border: rec.urgency === 'urgent' ? '1px solid #ffccc7' : '1px solid transparent'
                                                            },
                                                            children: [
                                                                (0, _jsxdevruntime.jsxDEV)("span", {
                                                                    style: {
                                                                        fontSize: 18,
                                                                        fontWeight: 700,
                                                                        color: urgency.color,
                                                                        minWidth: 24,
                                                                        textAlign: 'center',
                                                                        lineHeight: 1.2
                                                                    },
                                                                    children: idx + 1
                                                                }, void 0, false, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 921,
                                                                    columnNumber: 29
                                                                }, this),
                                                                (0, _jsxdevruntime.jsxDEV)("div", {
                                                                    style: {
                                                                        flex: 1
                                                                    },
                                                                    children: [
                                                                        (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                            strong: true,
                                                                            style: {
                                                                                fontSize: 12
                                                                            },
                                                                            children: rec.action
                                                                        }, void 0, false, {
                                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                            lineNumber: 925,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                            style: {
                                                                                fontSize: 11,
                                                                                color: '#94a3b8',
                                                                                display: 'block'
                                                                            },
                                                                            children: rec.reasoning
                                                                        }, void 0, false, {
                                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                            lineNumber: 926,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        (0, _jsxdevruntime.jsxDEV)("div", {
                                                                            style: {
                                                                                marginTop: 4,
                                                                                display: 'flex',
                                                                                gap: 4,
                                                                                flexWrap: 'wrap'
                                                                            },
                                                                            children: [
                                                                                (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                                    color: urgency.color,
                                                                                    style: {
                                                                                        borderRadius: 4,
                                                                                        fontSize: 10,
                                                                                        margin: 0
                                                                                    },
                                                                                    children: [
                                                                                        trendIcon,
                                                                                        " ",
                                                                                        urgency.label
                                                                                    ]
                                                                                }, void 0, true, {
                                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                    lineNumber: 928,
                                                                                    columnNumber: 33
                                                                                }, this),
                                                                                (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                                    style: {
                                                                                        borderRadius: 4,
                                                                                        fontSize: 10,
                                                                                        margin: 0
                                                                                    },
                                                                                    children: rec.department
                                                                                }, void 0, false, {
                                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                    lineNumber: 931,
                                                                                    columnNumber: 33
                                                                                }, this)
                                                                            ]
                                                                        }, void 0, true, {
                                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                            lineNumber: 927,
                                                                            columnNumber: 31
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 924,
                                                                    columnNumber: 29
                                                                }, this),
                                                                (0, _jsxdevruntime.jsxDEV)(_antd.Space, {
                                                                    size: 4,
                                                                    className: "no-print",
                                                                    children: [
                                                                        onAddMonitor && (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                                            title: "加入监控",
                                                                            children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                                size: "small",
                                                                                type: "primary",
                                                                                ghost: true,
                                                                                icon: (0, _jsxdevruntime.jsxDEV)(_icons.PlusOutlined, {}, void 0, false, {
                                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                    lineNumber: 937,
                                                                                    columnNumber: 83
                                                                                }, void 0),
                                                                                style: {
                                                                                    fontSize: 10,
                                                                                    height: 24,
                                                                                    padding: '0 8px'
                                                                                },
                                                                                onClick: ()=>onAddMonitor(rec.action, rec.department),
                                                                                children: "监控"
                                                                            }, void 0, false, {
                                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                lineNumber: 937,
                                                                                columnNumber: 35
                                                                            }, this)
                                                                        }, void 0, false, {
                                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                            lineNumber: 936,
                                                                            columnNumber: 33
                                                                        }, this),
                                                                        onGenerateTicket && (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                                            title: "生成工单",
                                                                            children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                                size: "small",
                                                                                icon: (0, _jsxdevruntime.jsxDEV)(_icons.FileTextOutlined, {}, void 0, false, {
                                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                    lineNumber: 944,
                                                                                    columnNumber: 62
                                                                                }, void 0),
                                                                                style: {
                                                                                    fontSize: 10,
                                                                                    height: 24,
                                                                                    padding: '0 8px'
                                                                                },
                                                                                onClick: ()=>onGenerateTicket(rec),
                                                                                children: "工单"
                                                                            }, void 0, false, {
                                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                                lineNumber: 944,
                                                                                columnNumber: 35
                                                                            }, this)
                                                                        }, void 0, false, {
                                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                            lineNumber: 943,
                                                                            columnNumber: 33
                                                                        }, this)
                                                                    ]
                                                                }, void 0, true, {
                                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                    lineNumber: 934,
                                                                    columnNumber: 29
                                                                }, this)
                                                            ]
                                                        }, idx, true, {
                                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                            lineNumber: 909,
                                                            columnNumber: 27
                                                        }, this);
                                                    })
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                    lineNumber: 904,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                            lineNumber: 902,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 740,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 739,
                                columnNumber: 13
                            }, this),
                            error && report && (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                size: "small",
                                style: {
                                    borderRadius: 8,
                                    border: '1px solid #ffccc7'
                                },
                                className: "no-print",
                                children: (0, _jsxdevruntime.jsxDEV)(Text, {
                                    type: "danger",
                                    style: {
                                        fontSize: 12
                                    },
                                    children: [
                                        "注意: ",
                                        error
                                    ]
                                }, void 0, true, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 962,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 961,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true),
                    report && (0, _jsxdevruntime.jsxDEV)("div", {
                        className: "no-print",
                        style: {
                            position: 'fixed',
                            right: 24,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            zIndex: 100,
                            background: 'rgba(255,255,255,0.95)',
                            borderRadius: 10,
                            padding: '6px',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                            border: '1px solid #e2e8f0'
                        },
                        children: [
                            (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                title: "实体统计",
                                placement: "left",
                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                    size: "small",
                                    type: "text",
                                    icon: (0, _jsxdevruntime.jsxDEV)(_icons.TeamOutlined, {}, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 992,
                                        columnNumber: 23
                                    }, void 0),
                                    onClick: ()=>scrollToSection('entity-stats'),
                                    style: {
                                        color: '#2855D1'
                                    }
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 989,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 988,
                                columnNumber: 13
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                title: "群体发现",
                                placement: "left",
                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                    size: "small",
                                    type: "text",
                                    icon: (0, _jsxdevruntime.jsxDEV)(_icons.ClusterOutlined, {}, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 1001,
                                        columnNumber: 23
                                    }, void 0),
                                    onClick: ()=>scrollToSection('community'),
                                    style: {
                                        color: '#722ed1'
                                    }
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 998,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 997,
                                columnNumber: 13
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                title: "风险传导路径",
                                placement: "left",
                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                    size: "small",
                                    type: "text",
                                    icon: (0, _jsxdevruntime.jsxDEV)(_icons.NodeIndexOutlined, {}, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 1010,
                                        columnNumber: 23
                                    }, void 0),
                                    onClick: ()=>scrollToSection('risk-paths'),
                                    style: {
                                        color: '#f5222d'
                                    }
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 1007,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 1006,
                                columnNumber: 13
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                title: "综合风险报告",
                                placement: "left",
                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                    size: "small",
                                    type: "text",
                                    icon: (0, _jsxdevruntime.jsxDEV)(_icons.FileTextOutlined, {}, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 1019,
                                        columnNumber: 23
                                    }, void 0),
                                    onClick: ()=>scrollToSection('final-report'),
                                    style: {
                                        color: '#1e293b'
                                    }
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                    lineNumber: 1016,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 1015,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                        lineNumber: 970,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                lineNumber: 358,
                columnNumber: 7
            }, this),
            (0, _jsxdevruntime.jsxDEV)(_antd.Drawer, {
                title: "历史报告",
                open: historyOpen,
                onClose: ()=>setHistoryOpen(false),
                width: 360,
                children: historyLoading ? (0, _jsxdevruntime.jsxDEV)("div", {
                    style: {
                        textAlign: 'center',
                        padding: 40
                    },
                    children: (0, _jsxdevruntime.jsxDEV)(_antd.Spin, {
                        indicator: (0, _jsxdevruntime.jsxDEV)(_icons.LoadingOutlined, {
                            spin: true
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                            lineNumber: 1037,
                            columnNumber: 30
                        }, void 0)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                        lineNumber: 1037,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                    lineNumber: 1036,
                    columnNumber: 11
                }, this) : historyReports.length === 0 ? (0, _jsxdevruntime.jsxDEV)(_antd.Empty, {
                    description: "暂无历史报告",
                    image: _antd.Empty.PRESENTED_IMAGE_SIMPLE
                }, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                    lineNumber: 1040,
                    columnNumber: 11
                }, this) : (0, _jsxdevruntime.jsxDEV)(_antd.List, {
                    dataSource: historyReports,
                    renderItem: (item)=>{
                        var _item_overall_risk_level;
                        return (0, _jsxdevruntime.jsxDEV)(_antd.List.Item, {
                            style: {
                                cursor: 'pointer',
                                padding: '10px 12px',
                                borderRadius: 6
                            },
                            onClick: ()=>loadHistoryReport(item.report_id),
                            children: (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    width: '100%'
                                },
                                children: [
                                    (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        },
                                        children: [
                                            (0, _jsxdevruntime.jsxDEV)(Text, {
                                                strong: true,
                                                style: {
                                                    fontSize: 12
                                                },
                                                children: item.report_id
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 1051,
                                                columnNumber: 21
                                            }, void 0),
                                            (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                color: RISK_LEVEL_COLORS[item.overall_risk_level] || '#fa8c16',
                                                style: {
                                                    borderRadius: 4,
                                                    fontSize: 10
                                                },
                                                children: RISK_LEVEL_LABELS[item.overall_risk_level] || ((_item_overall_risk_level = item.overall_risk_level) === null || _item_overall_risk_level === void 0 ? void 0 : _item_overall_risk_level.toUpperCase())
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 1052,
                                                columnNumber: 21
                                            }, void 0)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 1050,
                                        columnNumber: 19
                                    }, void 0),
                                    (0, _jsxdevruntime.jsxDEV)(Text, {
                                        type: "secondary",
                                        style: {
                                            fontSize: 11,
                                            display: 'block'
                                        },
                                        children: item.query_summary || '-'
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 1059,
                                        columnNumber: 19
                                    }, void 0),
                                    (0, _jsxdevruntime.jsxDEV)(Text, {
                                        type: "secondary",
                                        style: {
                                            fontSize: 10
                                        },
                                        children: [
                                            item.generated_at ? formatTimestamp(item.generated_at) : '',
                                            " · ",
                                            item.subtasks_completed,
                                            " 个子任务"
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                        lineNumber: 1062,
                                        columnNumber: 19
                                    }, void 0)
                                ]
                            }, void 0, true, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 1049,
                                columnNumber: 17
                            }, void 0)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                            lineNumber: 1045,
                            columnNumber: 15
                        }, void 0);
                    }
                }, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                    lineNumber: 1042,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                lineNumber: 1029,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
        lineNumber: 344,
        columnNumber: 5
    }, this);
};
_s(RiskReportPanel, "EpO1d8w/blCTlQOePdIZRR48a+0=", false, function() {
    return [
        _antd.App.useApp
    ];
});
_c = RiskReportPanel;
var _default = RiskReportPanel;
var _c;
$RefreshReg$(_c, "RiskReportPanel");
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

},
"src/pages/KnowledgeQA/components/WorkspaceContainer.tsx": function (module, exports, __mako_require__){
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
    WorkspaceContainer: function() {
        return WorkspaceContainer;
    },
    default: function() {
        return _default;
    }
});
var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
var _reactrefresh = _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var _jsxdevruntime = __mako_require__("node_modules/react/jsx-dev-runtime.js");
var _react = _interop_require_wildcard._(__mako_require__("node_modules/react/index.js"));
var _antd = __mako_require__("node_modules/antd/es/index.js");
var _icons = __mako_require__("node_modules/@ant-design/icons/es/index.js");
var _EntityMessageBubble = __mako_require__("src/pages/KnowledgeQA/components/EntityMessageBubble.tsx");
var _RiskEntityCard = __mako_require__("src/pages/KnowledgeQA/components/RiskEntityCard.tsx");
var _ContextTagBar = __mako_require__("src/pages/KnowledgeQA/components/ContextTagBar.tsx");
var _agentStore = __mako_require__("src/pages/KnowledgeQA/store/agentStore.ts");
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
const { Text } = _antd.Typography;
const { TextArea } = _antd.Input;
const WorkspaceContainer = ({ messages, isLoading, pendingRecommendations, onSendMessage, onClearHistory, onEntityHover, onEntityClick, highlightedEntity, graphInjectedEntity, onClearGraphInject })=>{
    _s();
    const [input, setInput] = (0, _react.useState)('');
    const [contextTags, setContextTags] = (0, _react.useState)([]);
    const messagesEndRef = (0, _react.useRef)(null);
    const inputRef = (0, _react.useRef)(null);
    const uploadedFile = (0, _agentStore.useAgentStore)((s)=>s.uploadedFile);
    const fileUploading = (0, _agentStore.useAgentStore)((s)=>s.fileUploading);
    const uploadFile = (0, _agentStore.useAgentStore)((s)=>s.uploadFile);
    const clearUploadedFile = (0, _agentStore.useAgentStore)((s)=>s.clearUploadedFile);
    const storeError = (0, _agentStore.useAgentStore)((s)=>s.error);
    (0, _react.useEffect)(()=>{
        var _messagesEndRef_current;
        (_messagesEndRef_current = messagesEndRef.current) === null || _messagesEndRef_current === void 0 || _messagesEndRef_current.scrollIntoView({
            behavior: 'smooth'
        });
    }, [
        messages,
        isLoading
    ]);
    const handleSend = (0, _react.useCallback)(async ()=>{
        const text = input.trim();
        if (!text || isLoading) return;
        let fullQuery = text;
        if (graphInjectedEntity) fullQuery = `[${graphInjectedEntity.name}] ${fullQuery}`;
        if (contextTags.length > 0) fullQuery = `Context: ${contextTags.map((t)=>t.id).join(', ')}. Query: ${fullQuery}`;
        try {
            var _inputRef_current;
            await onSendMessage(fullQuery);
            setInput('');
            (_inputRef_current = inputRef.current) === null || _inputRef_current === void 0 || _inputRef_current.focus();
        } catch  {}
    }, [
        input,
        isLoading,
        onSendMessage,
        graphInjectedEntity,
        contextTags
    ]);
    const handleKeyDown = (e)=>{
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };
    const handleRemoveTag = (id)=>{
        setContextTags((prev)=>prev.filter((t)=>t.id !== id));
    };
    const handleClearTags = ()=>{
        setContextTags([]);
    };
    return (0, _jsxdevruntime.jsxDEV)("div", {
        style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'linear-gradient(180deg, #F7F9FC 0%, #F1F5F9 100%)'
        },
        children: [
            (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(16px)',
                    borderBottom: `1px solid ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`,
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                },
                children: [
                    (0, _jsxdevruntime.jsxDEV)("div", {
                        children: [
                            (0, _jsxdevruntime.jsxDEV)("h2", {
                                style: {
                                    margin: 0,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: _constants.DESIGN_TOKENS.TEXT_PRIMARY
                                },
                                children: "Chat"
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 111,
                                columnNumber: 11
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)(Text, {
                                type: "secondary",
                                className: "text-xs",
                                children: [
                                    messages.length,
                                    " messages"
                                ]
                            }, void 0, true, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 114,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                        lineNumber: 110,
                        columnNumber: 9
                    }, this),
                    (0, _jsxdevruntime.jsxDEV)("button", {
                        onClick: onClearHistory,
                        style: {
                            background: 'none',
                            border: 'none',
                            color: '#94A3B8',
                            cursor: 'pointer',
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '6px 10px',
                            borderRadius: 8,
                            transition: 'all 0.2s ease'
                        },
                        onMouseEnter: (e)=>{
                            e.currentTarget.style.background = '#f1f5f9';
                        },
                        onMouseLeave: (e)=>{
                            e.currentTarget.style.background = 'none';
                        },
                        title: "Clear chat",
                        children: [
                            (0, _jsxdevruntime.jsxDEV)(_icons.ClearOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 141,
                                columnNumber: 11
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)("span", {
                                children: "Clear"
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 142,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                        lineNumber: 118,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                lineNumber: 98,
                columnNumber: 7
            }, this),
            (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px'
                },
                children: messages.length === 0 ? (0, _jsxdevruntime.jsxDEV)("div", {
                    style: {
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    },
                    children: (0, _jsxdevruntime.jsxDEV)(_antd.Empty, {
                        image: _antd.Empty.PRESENTED_IMAGE_SIMPLE,
                        description: (0, _jsxdevruntime.jsxDEV)("div", {
                            style: {
                                textAlign: 'center'
                            },
                            children: [
                                (0, _jsxdevruntime.jsxDEV)("p", {
                                    style: {
                                        color: '#475569',
                                        fontSize: 14,
                                        marginBottom: 8
                                    },
                                    children: "Start your first query!"
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                    lineNumber: 161,
                                    columnNumber: 19
                                }, void 0),
                                (0, _jsxdevruntime.jsxDEV)("p", {
                                    style: {
                                        color: '#94A3B8',
                                        fontSize: 12
                                    },
                                    children: 'Try: "查询某公司近期的风险传导路径和异常事件"'
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                    lineNumber: 164,
                                    columnNumber: 19
                                }, void 0)
                            ]
                        }, void 0, true, {
                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                            lineNumber: 160,
                            columnNumber: 17
                        }, void 0)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                        lineNumber: 157,
                        columnNumber: 13
                    }, this)
                }, void 0, false, {
                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                    lineNumber: 149,
                    columnNumber: 11
                }, this) : (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                    children: [
                        messages.map((msg)=>{
                            var _msg_data, _msg_data1;
                            return (0, _jsxdevruntime.jsxDEV)("div", {
                                children: [
                                    (0, _jsxdevruntime.jsxDEV)(_EntityMessageBubble.EntityMessageBubble, {
                                        message: msg,
                                        onEntityHover: onEntityHover,
                                        onEntityClick: (entity)=>{
                                            setContextTags((prev)=>{
                                                if (prev.find((t)=>t.id === entity.id)) return prev;
                                                return [
                                                    ...prev,
                                                    {
                                                        id: entity.id,
                                                        type: entity.type
                                                    }
                                                ];
                                            });
                                            onEntityClick === null || onEntityClick === void 0 || onEntityClick(entity.id, entity.type);
                                        },
                                        highlightedEntity: highlightedEntity
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                        lineNumber: 175,
                                        columnNumber: 17
                                    }, this),
                                    msg.role === 'assistant' && (((_msg_data = msg.data) === null || _msg_data === void 0 ? void 0 : _msg_data.output) || pendingRecommendations) && (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            marginLeft: 44,
                                            marginBottom: 12
                                        },
                                        children: pendingRecommendations && pendingRecommendations.length > 0 ? (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                            children: [
                                                (0, _jsxdevruntime.jsxDEV)(_RiskEntityCard.RiskEntityCard, {
                                                    recommendations: pendingRecommendations,
                                                    onEntityClick: ()=>{}
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                    lineNumber: 191,
                                                    columnNumber: 25
                                                }, this),
                                                (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 8,
                                                        marginTop: 8
                                                    },
                                                    children: [
                                                        (0, _jsxdevruntime.jsxDEV)(_antd.Spin, {
                                                            size: "small"
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                            lineNumber: 196,
                                                            columnNumber: 27
                                                        }, this),
                                                        (0, _jsxdevruntime.jsxDEV)("span", {
                                                            style: {
                                                                color: _constants.DESIGN_TOKENS.TEXT_MUTED,
                                                                fontSize: 12
                                                            },
                                                            children: "Generating review..."
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                            lineNumber: 197,
                                                            columnNumber: 27
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                    lineNumber: 195,
                                                    columnNumber: 25
                                                }, this)
                                            ]
                                        }, void 0, true) : ((_msg_data1 = msg.data) === null || _msg_data1 === void 0 ? void 0 : _msg_data1.output) ? (0, _jsxdevruntime.jsxDEV)(_RiskEntityCard.RiskEntityCard, {
                                            recommendations: msg.data.output.recommendations || [],
                                            onEntityClick: (entityId, entityType)=>{
                                                setContextTags((prev)=>{
                                                    if (prev.find((t)=>t.id === entityId)) return prev;
                                                    return [
                                                        ...prev,
                                                        {
                                                            id: entityId,
                                                            type: entityType
                                                        }
                                                    ];
                                                });
                                                onEntityClick === null || onEntityClick === void 0 || onEntityClick(entityId, entityType);
                                            }
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                            lineNumber: 203,
                                            columnNumber: 23
                                        }, this) : null
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                        lineNumber: 188,
                                        columnNumber: 19
                                    }, this)
                                ]
                            }, msg.id, true, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 174,
                                columnNumber: 15
                            }, this);
                        }),
                        (0, _jsxdevruntime.jsxDEV)("div", {
                            ref: messagesEndRef
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                            lineNumber: 218,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true)
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                lineNumber: 147,
                columnNumber: 7
            }, this),
            (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    padding: '12px 16px',
                    background: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(16px)',
                    borderTop: `1px solid ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`
                },
                children: [
                    graphInjectedEntity && (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 12px',
                            background: 'rgba(0, 47, 167, 0.06)',
                            borderRadius: 10,
                            border: '1px dashed rgba(0, 47, 167, 0.3)',
                            marginBottom: 8
                        },
                        children: [
                            (0, _jsxdevruntime.jsxDEV)("svg", {
                                width: "12",
                                height: "12",
                                viewBox: "0 0 12 12",
                                fill: "none",
                                children: (0, _jsxdevruntime.jsxDEV)("path", {
                                    d: "M6 1L11 6L6 11",
                                    stroke: _constants.DESIGN_TOKENS.KLEIN_BLUE,
                                    strokeWidth: "1.5",
                                    strokeLinecap: "round",
                                    strokeLinejoin: "round"
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                    lineNumber: 246,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 245,
                                columnNumber: 13
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)("span", {
                                style: {
                                    fontSize: 11,
                                    color: '#475569',
                                    fontWeight: 500
                                },
                                children: "From Graph:"
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 254,
                                columnNumber: 13
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                style: {
                                    background: 'rgba(0, 47, 167, 0.1)',
                                    border: '1px solid rgba(0, 47, 167, 0.3)',
                                    color: _constants.DESIGN_TOKENS.KLEIN_BLUE,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    padding: '1px 8px',
                                    borderRadius: 14,
                                    animation: 'tagFlyIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
                                },
                                children: graphInjectedEntity.name
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 257,
                                columnNumber: 13
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)("span", {
                                style: {
                                    fontSize: 11,
                                    color: '#94a3b8'
                                },
                                children: "· Click input to continue"
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 271,
                                columnNumber: 13
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)("button", {
                                onClick: ()=>{
                                    var _inputRef_current;
                                    onClearGraphInject === null || onClearGraphInject === void 0 || onClearGraphInject();
                                    (_inputRef_current = inputRef.current) === null || _inputRef_current === void 0 || _inputRef_current.focus();
                                },
                                style: {
                                    marginLeft: 'auto',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#94a3b8',
                                    fontSize: 14,
                                    lineHeight: 1,
                                    padding: '2px 4px'
                                },
                                children: "×"
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 274,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                        lineNumber: 233,
                        columnNumber: 11
                    }, this),
                    (0, _jsxdevruntime.jsxDEV)(_ContextTagBar.ContextTagBar, {
                        tags: contextTags,
                        onRemove: handleRemoveTag,
                        onClearAll: handleClearTags,
                        onTagClick: (entity)=>{
                            setContextTags((prev)=>{
                                if (prev.find((t)=>t.id === entity.id)) return prev;
                                return [
                                    ...prev,
                                    {
                                        id: entity.id,
                                        type: entity.type
                                    }
                                ];
                            });
                        }
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                        lineNumber: 295,
                        columnNumber: 9
                    }, this),
                    (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            marginBottom: 8
                        },
                        children: [
                            uploadedFile ? (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 10px',
                                    background: '#f0f5ff',
                                    borderRadius: 8,
                                    border: '1px solid #d6e4ff'
                                },
                                children: [
                                    (0, _jsxdevruntime.jsxDEV)(_icons.FileTextOutlined, {
                                        style: {
                                            color: '#2855D1',
                                            fontSize: 14
                                        }
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                        lineNumber: 321,
                                        columnNumber: 15
                                    }, this),
                                    (0, _jsxdevruntime.jsxDEV)("span", {
                                        style: {
                                            fontSize: 12,
                                            flex: 1,
                                            color: '#1e40af'
                                        },
                                        children: [
                                            uploadedFile.filename,
                                            (0, _jsxdevruntime.jsxDEV)("span", {
                                                style: {
                                                    color: '#64748b',
                                                    marginLeft: 6
                                                },
                                                children: [
                                                    "(",
                                                    uploadedFile.char_count,
                                                    " 字符",
                                                    uploadedFile.truncated ? '，已截断' : '',
                                                    ")"
                                                ]
                                            }, void 0, true, {
                                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                lineNumber: 324,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                        lineNumber: 322,
                                        columnNumber: 15
                                    }, this),
                                    uploadedFile.truncated && (0, _jsxdevruntime.jsxDEV)("span", {
                                        style: {
                                            fontSize: 11,
                                            color: '#fa8c16'
                                        },
                                        children: "内容过长，已自动截取前 50,000 字符"
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                        lineNumber: 329,
                                        columnNumber: 17
                                    }, this),
                                    (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                        type: "text",
                                        size: "small",
                                        icon: (0, _jsxdevruntime.jsxDEV)(_icons.CloseOutlined, {}, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                            lineNumber: 334,
                                            columnNumber: 23
                                        }, void 0),
                                        onClick: clearUploadedFile,
                                        style: {
                                            color: '#94a3b8'
                                        }
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                        lineNumber: 331,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 310,
                                columnNumber: 13
                            }, this) : (0, _jsxdevruntime.jsxDEV)(_antd.Upload, {
                                accept: ".txt,.md,.docx,.pdf",
                                showUploadList: false,
                                beforeUpload: (file)=>{
                                    uploadFile(file);
                                    return false;
                                },
                                disabled: fileUploading || isLoading,
                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                    icon: fileUploading ? (0, _jsxdevruntime.jsxDEV)(_icons.LoadingOutlined, {}, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                        lineNumber: 350,
                                        columnNumber: 39
                                    }, void 0) : (0, _jsxdevruntime.jsxDEV)(_icons.UploadOutlined, {}, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                        lineNumber: 350,
                                        columnNumber: 61
                                    }, void 0),
                                    size: "small",
                                    type: "text",
                                    disabled: fileUploading || isLoading,
                                    style: {
                                        fontSize: 12,
                                        color: '#64748b'
                                    },
                                    children: fileUploading ? '上传中...' : '上传文本文件 (.txt .md .docx .pdf)'
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                    lineNumber: 349,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 340,
                                columnNumber: 13
                            }, this),
                            storeError && (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    fontSize: 11,
                                    color: '#f5222d',
                                    marginTop: 4,
                                    paddingLeft: 4
                                },
                                children: storeError
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 361,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                        lineNumber: 308,
                        columnNumber: 9
                    }, this),
                    (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            background: '#FFFFFF',
                            border: `1px solid ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`,
                            borderRadius: 14,
                            padding: '10px 14px',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
                        },
                        children: (0, _jsxdevruntime.jsxDEV)("div", {
                            style: {
                                display: 'flex',
                                gap: 8,
                                alignItems: 'flex-end'
                            },
                            children: [
                                (0, _jsxdevruntime.jsxDEV)(TextArea, {
                                    ref: inputRef,
                                    value: input,
                                    onChange: (e)=>setInput(e.target.value),
                                    onKeyDown: handleKeyDown,
                                    placeholder: contextTags.length > 0 ? 'Continue with context constraints, or enter a new question...' : 'Enter your question, press Enter to send...',
                                    autoSize: {
                                        minRows: 1,
                                        maxRows: 4
                                    },
                                    style: {
                                        flex: 1,
                                        border: 'none',
                                        outline: 'none',
                                        resize: 'none',
                                        fontSize: 14,
                                        lineHeight: 1.5,
                                        background: 'transparent',
                                        padding: 0
                                    },
                                    disabled: isLoading || fileUploading
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                    lineNumber: 376,
                                    columnNumber: 13
                                }, this),
                                (0, _jsxdevruntime.jsxDEV)("button", {
                                    onClick: handleSend,
                                    disabled: !input.trim() || isLoading,
                                    style: {
                                        width: 38,
                                        height: 38,
                                        borderRadius: 10,
                                        border: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                                        background: input.trim() && !isLoading ? 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)' : '#F1F5F9',
                                        color: input.trim() && !isLoading ? '#ffffff' : '#94A3B8',
                                        transition: 'all 0.2s ease',
                                        flexShrink: 0,
                                        boxShadow: input.trim() && !isLoading ? '0 4px 12px rgba(40, 85, 209, 0.3)' : 'none'
                                    },
                                    children: (0, _jsxdevruntime.jsxDEV)(_icons.SendOutlined, {
                                        style: {
                                            fontSize: 15
                                        }
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                        lineNumber: 424,
                                        columnNumber: 15
                                    }, this)
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                    lineNumber: 399,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                            lineNumber: 375,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                        lineNumber: 365,
                        columnNumber: 9
                    }, this),
                    (0, _jsxdevruntime.jsxDEV)("span", {
                        style: {
                            color: _constants.DESIGN_TOKENS.TEXT_MUTED,
                            fontSize: 12,
                            marginTop: 8,
                            display: 'block',
                            paddingLeft: 4
                        },
                        children: "Enter 发送 · Shift+Enter 换行 · 双击图谱节点添加上下文"
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                        lineNumber: 429,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                lineNumber: 224,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
        lineNumber: 89,
        columnNumber: 5
    }, this);
};
_s(WorkspaceContainer, "UMJKJEDdJ4LU6qv75WAXLuFyLKY=", false, function() {
    return [
        _agentStore.useAgentStore,
        _agentStore.useAgentStore,
        _agentStore.useAgentStore,
        _agentStore.useAgentStore,
        _agentStore.useAgentStore
    ];
});
_c = WorkspaceContainer;
var _default = WorkspaceContainer;
var _c;
$RefreshReg$(_c, "WorkspaceContainer");
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

},
"src/pages/KnowledgeQA/components/charts/EventBarChart.tsx": function (module, exports, __mako_require__){
"use strict";
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
var _react = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/react/index.js"));
var _echartsforreact = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/echarts-for-react/esm/index.js"));
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
const EventBarChart = ({ data })=>{
    const sorted = [
        ...data
    ].sort((a, b)=>b.count - a.count);
    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow'
            }
        },
        grid: {
            left: 10,
            right: 20,
            top: 5,
            bottom: 5,
            containLabel: true
        },
        xAxis: {
            type: 'value',
            axisLabel: {
                fontSize: 10,
                color: '#94a3b8'
            },
            splitLine: {
                lineStyle: {
                    color: '#f1f5f9'
                }
            }
        },
        yAxis: {
            type: 'category',
            data: sorted.map((d)=>d.name),
            axisLabel: {
                fontSize: 10,
                color: '#475569'
            },
            axisLine: {
                show: false
            },
            axisTick: {
                show: false
            }
        },
        series: [
            {
                type: 'bar',
                data: sorted.map((d)=>({
                        value: d.count,
                        itemStyle: {
                            color: d.color,
                            borderRadius: [
                                0,
                                4,
                                4,
                                0
                            ]
                        }
                    })),
                barWidth: 14,
                label: {
                    show: true,
                    position: 'right',
                    fontSize: 10,
                    color: '#64748b'
                }
            }
        ]
    };
    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_echartsforreact.default, {
        option: option,
        style: {
            height: sorted.length * 30 + 50,
            maxHeight: 200
        }
    }, void 0, false, {
        fileName: "src/pages/KnowledgeQA/components/charts/EventBarChart.tsx",
        lineNumber: 53,
        columnNumber: 10
    }, this);
};
_c = EventBarChart;
var _default = EventBarChart;
var _c;
$RefreshReg$(_c, "EventBarChart");
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

},
"src/pages/KnowledgeQA/index.tsx": function (module, exports, __mako_require__){
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
var _reactrefresh = _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var _jsxdevruntime = __mako_require__("node_modules/react/jsx-dev-runtime.js");
var _react = _interop_require_wildcard._(__mako_require__("node_modules/react/index.js"));
var _procomponents = __mako_require__("node_modules/@ant-design/pro-components/es/index.js");
var _antd = __mako_require__("node_modules/antd/es/index.js");
var _WorkspaceContainer = __mako_require__("src/pages/KnowledgeQA/components/WorkspaceContainer.tsx");
var _EnhancedGraphPanel = __mako_require__("src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx");
var _RiskReportPanel = _interop_require_default._(__mako_require__("src/pages/KnowledgeQA/components/RiskReportPanel.tsx"));
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
    if (matched.length === 0) {
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
    const { messages, currentSubgraph, alignmentFeatures, isLoading, sendMessage, clearHistory, pendingRecommendations, clarifyMessage, activeRightPanel, riskReport, riskStages, riskCommunity, error, retryRiskQuery } = (0, _agentStore.useAgentStore)();
    const { activeSessionId, updateCurrentSession, getActiveSession, createNewSession } = (0, _chatStore.useChatStore)();
    const graphRef = (0, _react.useRef)(null);
    const [highlightedEntity, setHighlightedEntity] = (0, _react.useState)(null);
    const [graphInjectedEntity, setGraphInjectedEntity] = (0, _react.useState)(null);
    const [sidebarCollapsed, setSidebarCollapsed] = (0, _react.useState)(false);
    (0, _react.useEffect)(()=>{
        if (_agentStore.useAgentStore.getState().isLoading) return;
        if (!activeSessionId) {
            if (_chatStore.useChatStore.getState().sessions.length === 0) createNewSession();
            return;
        }
        const timer = setTimeout(()=>{
            const activeSession = getActiveSession();
            if (!activeSession) return;
            if (messages.length > 0 || currentSubgraph || riskReport) {
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
        riskReport,
        activeSessionId,
        updateCurrentSession,
        getActiveSession,
        createNewSession
    ]);
    (0, _react.useEffect)(()=>{
        if (_agentStore.useAgentStore.getState().isLoading) return;
        const session = getActiveSession();
        if (!session) return;
        const savedPanel = session.workspaceState.riskReport ? 'risk' : session.workspaceState.graphData ? 'graph' : 'graph';
        _agentStore.useAgentStore.setState({
            messages: session.messages,
            currentSubgraph: session.workspaceState.graphData,
            riskReport: session.workspaceState.riskReport || null,
            riskStages: session.workspaceState.riskStages || [],
            riskCommunity: session.workspaceState.riskCommunity || null,
            activeRightPanel: savedPanel === 'analysis' ? 'graph' : savedPanel
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
    (0, _react.useEffect)(()=>{
        if (currentSubgraph && graphRef.current) {
            const lastUserMsg = [
                ...messages
            ].reverse().find((m)=>m.role === 'user');
            const query = (lastUserMsg === null || lastUserMsg === void 0 ? void 0 : lastUserMsg.content) || '';
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
    return (0, _jsxdevruntime.jsxDEV)(_procomponents.PageContainer, {
        header: {
            title: '知识图谱问答',
            subTitle: '知识图谱风险分析引擎'
        },
        children: [
            (0, _jsxdevruntime.jsxDEV)("div", {
                style: {
                    display: 'flex',
                    height: 'calc(100vh - 120px)',
                    overflow: 'hidden',
                    background: _constants.DESIGN_TOKENS.BG_CANVAS,
                    margin: '-24px',
                    borderRadius: 0
                },
                children: [
                    (0, _jsxdevruntime.jsxDEV)(_ChatSidebar.ChatSidebar, {
                        collapsed: sidebarCollapsed,
                        onToggle: ()=>setSidebarCollapsed(!sidebarCollapsed)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeQA/index.tsx",
                        lineNumber: 355,
                        columnNumber: 9
                    }, this),
                    (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            flex: 1,
                            overflow: 'hidden'
                        },
                        children: [
                            (0, _jsxdevruntime.jsxDEV)("header", {
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
                                    (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 16
                                        },
                                        children: [
                                            (0, _jsxdevruntime.jsxDEV)("div", {
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
                                                children: (0, _jsxdevruntime.jsxDEV)("svg", {
                                                    width: "24",
                                                    height: "24",
                                                    viewBox: "0 0 32 32",
                                                    fill: "none",
                                                    children: [
                                                        (0, _jsxdevruntime.jsxDEV)("circle", {
                                                            cx: "16",
                                                            cy: "16",
                                                            r: "12",
                                                            stroke: "#ffffff",
                                                            strokeWidth: "2",
                                                            opacity: "0.3"
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 389,
                                                            columnNumber: 19
                                                        }, this),
                                                        (0, _jsxdevruntime.jsxDEV)("circle", {
                                                            cx: "16",
                                                            cy: "10",
                                                            r: "3",
                                                            fill: "#ffffff"
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 390,
                                                            columnNumber: 19
                                                        }, this),
                                                        (0, _jsxdevruntime.jsxDEV)("circle", {
                                                            cx: "10",
                                                            cy: "20",
                                                            r: "2.5",
                                                            fill: "#10B981"
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 391,
                                                            columnNumber: 19
                                                        }, this),
                                                        (0, _jsxdevruntime.jsxDEV)("circle", {
                                                            cx: "22",
                                                            cy: "20",
                                                            r: "2.5",
                                                            fill: "#F59E0B"
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 392,
                                                            columnNumber: 19
                                                        }, this),
                                                        (0, _jsxdevruntime.jsxDEV)("line", {
                                                            x1: "16",
                                                            y1: "13",
                                                            x2: "11",
                                                            y2: "18",
                                                            stroke: "#ffffff",
                                                            strokeWidth: "1.5"
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 393,
                                                            columnNumber: 19
                                                        }, this),
                                                        (0, _jsxdevruntime.jsxDEV)("line", {
                                                            x1: "16",
                                                            y1: "13",
                                                            x2: "21",
                                                            y2: "18",
                                                            stroke: "#ffffff",
                                                            strokeWidth: "1.5"
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 394,
                                                            columnNumber: 19
                                                        }, this),
                                                        (0, _jsxdevruntime.jsxDEV)("line", {
                                                            x1: "12",
                                                            y1: "20",
                                                            x2: "20",
                                                            y2: "20",
                                                            stroke: "#ffffff",
                                                            strokeWidth: "1.5"
                                                        }, void 0, false, {
                                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                                            lineNumber: 395,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                                    lineNumber: 388,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                                lineNumber: 376,
                                                columnNumber: 15
                                            }, this),
                                            (0, _jsxdevruntime.jsxDEV)("div", {
                                                children: [
                                                    (0, _jsxdevruntime.jsxDEV)("h1", {
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
                                                        lineNumber: 399,
                                                        columnNumber: 17
                                                    }, this),
                                                    (0, _jsxdevruntime.jsxDEV)("p", {
                                                        style: {
                                                            margin: 0,
                                                            fontSize: 12,
                                                            color: '#94A3B8'
                                                        },
                                                        children: "Knowledge Graph Recommendation Engine"
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                                        lineNumber: 410,
                                                        columnNumber: 17
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                                lineNumber: 398,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                        lineNumber: 375,
                                        columnNumber: 13
                                    }, this),
                                    (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 16
                                        },
                                        children: (0, _jsxdevruntime.jsxDEV)("div", {
                                            style: {
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8
                                            },
                                            children: [
                                                (0, _jsxdevruntime.jsxDEV)("span", {
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
                                                    lineNumber: 418,
                                                    columnNumber: 17
                                                }, this),
                                                (0, _jsxdevruntime.jsxDEV)("span", {
                                                    style: {
                                                        fontSize: 12,
                                                        color: '#64748B'
                                                    },
                                                    children: apiHealthy === null ? '检测中' : apiHealthy ? 'API 在线' : 'API 离线'
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                                    lineNumber: 429,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "src/pages/KnowledgeQA/index.tsx",
                                            lineNumber: 417,
                                            columnNumber: 15
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                        lineNumber: 416,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                lineNumber: 363,
                                columnNumber: 11
                            }, this),
                            (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    display: 'flex',
                                    flex: 1,
                                    overflow: 'hidden',
                                    padding: '16px',
                                    gap: '16px'
                                },
                                children: [
                                    (0, _jsxdevruntime.jsxDEV)("div", {
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
                                            (0, _jsxdevruntime.jsxDEV)(_WorkspaceContainer.WorkspaceContainer, {
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
                                                lineNumber: 460,
                                                columnNumber: 15
                                            }, this),
                                            clarifyMessage && (0, _jsxdevruntime.jsxDEV)("div", {
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
                                                    (0, _jsxdevruntime.jsxDEV)("strong", {
                                                        style: {
                                                            fontSize: 12,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: 0.5
                                                        },
                                                        children: "Needs Clarification"
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                                        lineNumber: 486,
                                                        columnNumber: 19
                                                    }, this),
                                                    (0, _jsxdevruntime.jsxDEV)("div", {
                                                        style: {
                                                            marginTop: 6
                                                        },
                                                        children: clarifyMessage
                                                    }, void 0, false, {
                                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                                        lineNumber: 495,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                                lineNumber: 474,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                        lineNumber: 447,
                                        columnNumber: 13
                                    }, this),
                                    (0, _jsxdevruntime.jsxDEV)("div", {
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
                                            (0, _jsxdevruntime.jsxDEV)("div", {
                                                style: {
                                                    padding: '10px 16px',
                                                    borderBottom: '1px solid #f1f5f9',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    background: 'rgba(255, 255, 255, 0.5)',
                                                    backdropFilter: 'blur(10px)'
                                                },
                                                children: (0, _jsxdevruntime.jsxDEV)(_antd.Segmented, {
                                                    options: [
                                                        {
                                                            label: '知识图谱',
                                                            value: 'graph'
                                                        },
                                                        {
                                                            label: '风险报告',
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
                                                    lineNumber: 524,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                                lineNumber: 513,
                                                columnNumber: 15
                                            }, this),
                                            (0, _jsxdevruntime.jsxDEV)("div", {
                                                style: {
                                                    flex: 1,
                                                    position: 'relative',
                                                    overflow: 'hidden'
                                                },
                                                children: activeRightPanel === 'risk' ? (0, _jsxdevruntime.jsxDEV)(_RiskReportPanel.default, {
                                                    report: riskReport,
                                                    stages: riskStages,
                                                    community: riskCommunity,
                                                    isLoading: isLoading,
                                                    error: error,
                                                    onJumpToGraph: handleJumpToGraph,
                                                    onAddMonitor: handleAddMonitor,
                                                    onGenerateTicket: handleGenerateTicket,
                                                    onRetry: retryRiskQuery,
                                                    queryText: lastQueryText
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                                    lineNumber: 544,
                                                    columnNumber: 19
                                                }, this) : (0, _jsxdevruntime.jsxDEV)(_EnhancedGraphPanel.EnhancedGraphPanel, {
                                                    ref: graphRef,
                                                    subgraph: currentSubgraph,
                                                    alignmentFeatures: alignmentFeatures,
                                                    onNodeDoubleClick: handleNodeDoubleClick,
                                                    onNodeHover: (nodeId)=>setHighlightedEntity(nodeId),
                                                    highlightedEntity: highlightedEntity
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/index.tsx",
                                                    lineNumber: 557,
                                                    columnNumber: 19
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                                lineNumber: 542,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/index.tsx",
                                        lineNumber: 501,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "src/pages/KnowledgeQA/index.tsx",
                                lineNumber: 437,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeQA/index.tsx",
                        lineNumber: 361,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeQA/index.tsx",
                lineNumber: 344,
                columnNumber: 7
            }, this),
            (0, _jsxdevruntime.jsxDEV)("style", {
                children: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `
            }, void 0, false, {
                fileName: "src/pages/KnowledgeQA/index.tsx",
                lineNumber: 572,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeQA/index.tsx",
        lineNumber: 338,
        columnNumber: 5
    }, this);
};
_s(KnowledgeQA, "MqdB0IuAOa03LBm0UlmWAjhx3TI=", false, function() {
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

},
"src/pages/KnowledgeQA/store/agentStore.ts": function (module, exports, __mako_require__){
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
var _reactrefresh = _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var _zustand = __mako_require__("node_modules/zustand/esm/index.mjs");
var _axios = _interop_require_default._(__mako_require__("node_modules/axios/index.js"));
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
        activeRightPanel: 'graph',
        riskReport: null,
        riskStages: [],
        riskCommunity: null,
        uploadedFile: null,
        fileUploading: false,
        lastRiskQuery: '',
        sendMessage: async (query, rewrittenQuery)=>{
            if (get().isLoading) return;
            const { sessionId, roundId, messages, uploadedFile } = get();
            set({
                roundId: roundId + 1
            });
            let backendQuery = rewrittenQuery || query;
            if (uploadedFile) backendQuery = `[上传文件: ${uploadedFile.filename}]\n文件内容:\n${uploadedFile.text}\n\n问题: ${backendQuery}`;
            const userMsg = {
                id: `user_${Date.now()}`,
                role: 'user',
                content: query,
                timestamp: Date.now()
            };
            const tempId = `asst_${Date.now()}`;
            const assistantMsg = {
                id: tempId,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isLoading: true
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
            if (route === 'risk') {
                set({
                    currentRoute: 'risk',
                    activeRightPanel: 'risk',
                    riskReport: null,
                    riskStages: [],
                    riskCommunity: null,
                    isLoading: true,
                    currentSubgraph: null
                });
                await get().sendRiskQuery(backendQuery);
                return;
            }
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
        },
        sendRiskQuery: async (query, communityId)=>{
            const { sessionId, roundId } = get();
            set({
                lastRiskQuery: query
            });
            const tempId = `asst_${Date.now()}`;
            const assistantMsg = {
                id: tempId,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isLoading: true
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
                                    thinkingStatus: content
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
        retryRiskQuery: async ()=>{
            const { lastRiskQuery } = get();
            if (lastRiskQuery) await get().sendRiskQuery(lastRiskQuery);
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
                riskReport: null,
                riskStages: [],
                riskCommunity: null,
                activeRightPanel: 'graph',
                uploadedFile: null,
                fileUploading: false,
                lastRiskQuery: ''
            });
        },
        uploadFile: async (file)=>{
            const MAX_SIZE = 10485760;
            if (file.size > MAX_SIZE) {
                set({
                    error: '文件过大（最大 10MB）',
                    fileUploading: false
                });
                return;
            }
            set({
                fileUploading: true,
                error: null
            });
            try {
                const formData = new FormData();
                formData.append('file', file);
                const resp = await fetch('/api/v1/chat/upload', {
                    method: 'POST',
                    body: formData
                });
                const result = await resp.json();
                if (result.success) set({
                    uploadedFile: result.data,
                    fileUploading: false
                });
                else set({
                    error: result.message || '文件上传失败',
                    fileUploading: false
                });
            } catch (err) {
                set({
                    error: err.message || '文件上传失败',
                    fileUploading: false
                });
            }
        },
        clearUploadedFile: ()=>set({
                uploadedFile: null
            }),
        setError: (error)=>set({
                error
            }),
        clearRoute: ()=>set({
                currentRoute: null,
                currentSubgraph: null
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

},
"src/pages/KnowledgeQA/store/chatStore.ts": function (module, exports, __mako_require__){
"use strict";
__mako_require__.d(exports, "__esModule", {
    value: true
});
__mako_require__.d(exports, "useChatStore", {
    enumerable: true,
    get: function() {
        return useChatStore;
    }
});
var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var _zustand = __mako_require__("node_modules/zustand/esm/index.mjs");
var _middleware = __mako_require__("node_modules/zustand/esm/middleware.mjs");
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
const createEmptyState = ()=>({
        graphData: null,
        chartOptions: null,
        stats: {},
        riskReport: null,
        riskStages: [],
        riskCommunity: null
    });
const useChatStore = (0, _zustand.create)()((0, _middleware.persist)((set, get)=>({
        sessions: [],
        activeSessionId: null,
        createNewSession: ()=>{
            const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const newSession = {
                id,
                title: '新会话',
                updatedAt: Date.now(),
                messages: [],
                workspaceState: createEmptyState()
            };
            set((state)=>({
                    sessions: [
                        ...state.sessions,
                        newSession
                    ],
                    activeSessionId: id
                }));
            return id;
        },
        switchSession: (id)=>{
            set({
                activeSessionId: id
            });
        },
        deleteSession: (id)=>{
            set((state)=>{
                const remaining = state.sessions.filter((s)=>s.id !== id);
                const nextActive = state.activeSessionId === id ? remaining.length > 0 ? remaining[remaining.length - 1].id : null : state.activeSessionId;
                return {
                    sessions: remaining,
                    activeSessionId: nextActive
                };
            });
        },
        renameSession: (id, title)=>{
            set((state)=>({
                    sessions: state.sessions.map((s)=>s.id === id ? {
                            ...s,
                            title,
                            updatedAt: Date.now()
                        } : s)
                }));
        },
        updateCurrentSession: (updates)=>{
            const { activeSessionId } = get();
            if (!activeSessionId) return;
            set((state)=>({
                    sessions: state.sessions.map((s)=>{
                        if (s.id !== activeSessionId) return s;
                        return {
                            ...s,
                            ...updates.messages !== undefined ? {
                                messages: updates.messages
                            } : {},
                            ...updates.title !== undefined ? {
                                title: updates.title
                            } : {},
                            updatedAt: Date.now(),
                            workspaceState: {
                                ...s.workspaceState,
                                ...updates.workspaceState
                            }
                        };
                    })
                }));
        },
        getActiveSession: ()=>{
            const { sessions, activeSessionId } = get();
            return sessions.find((s)=>s.id === activeSessionId);
        }
    }), {
    name: 'bidakg-chat-history'
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

},
"src/pages/KnowledgeQA/styles/constants.ts": function (module, exports, __mako_require__){
"use strict";
__mako_require__.d(exports, "__esModule", {
    value: true
});
__mako_require__.d(exports, "DESIGN_TOKENS", {
    enumerable: true,
    get: function() {
        return DESIGN_TOKENS;
    }
});
var _interop_require_wildcard = __mako_require__("@swc/helpers/_/_interop_require_wildcard");
var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
const DESIGN_TOKENS = {
    // Klein Blue primary
    KLEIN_BLUE: '#002FA7',
    ACCENT: '#2855D1',
    ACCENT_HOVER: '#1A44B5',
    ACCENT_LIGHT: 'rgba(40, 85, 209, 0.08)',
    ACCENT_BORDER: 'rgba(40, 85, 209, 0.2)',
    ACCENT_SHADOW: '0 4px 16px rgba(40, 85, 209, 0.25)',
    // Background
    BG_CANVAS: '#F7F9FC',
    BG_SURFACE: '#FFFFFF',
    BG_HOVER: '#F1F5F9',
    BG_ELEVATED: '#FFFFFF',
    // Text
    TEXT_PRIMARY: '#0F172A',
    TEXT_SECONDARY: '#475569',
    TEXT_MUTED: '#94A3B8',
    // Border
    BORDER_DEFAULT: '#E2E8F0',
    BORDER_LIGHT: '#F1F5F9',
    // Emerald / Success
    ACCENT_EMERALD: '#10B981',
    EMERALD_LIGHT: 'rgba(16, 185, 129, 0.08)',
    EMERALD_BORDER: 'rgba(16, 185, 129, 0.25)',
    // Warning
    ACCENT_WARNING: '#F59E0B',
    WARNING_LIGHT: 'rgba(245, 158, 11, 0.08)',
    // Error
    COLOR_ERROR: '#EF4444',
    ERROR_LIGHT: 'rgba(239, 68, 68, 0.08)',
    ERROR_BORDER: 'rgba(239, 68, 68, 0.15)',
    // Purple (for KG actions)
    ACCENT_PURPLE: '#7C3AED',
    PURPLE_LIGHT: 'rgba(124, 58, 237, 0.1)',
    // Neutral
    NEUTRAL: '#E8E8E8',
    NEUTRAL_DARK: '#64748B',
    // Shadows
    SHADOW_SM: '0 1px 2px rgba(15, 23, 42, 0.04)',
    SHADOW_MD: '0 4px 12px rgba(15, 23, 42, 0.06)',
    SHADOW_CARD: '0 2px 8px rgba(15, 23, 42, 0.06)',
    SHADOW_GLOW: '0 0 24px rgba(40, 85, 209, 0.12)',
    SHADOW_ACCENT: '0 4px 12px rgba(40, 85, 209, 0.3)',
    // Glass
    GLASS_BG: 'rgba(255, 255, 255, 0.85)',
    GLASS_BLUR: 'blur(16px)',
    GLASS_BORDER: '1px solid rgba(255, 255, 255, 0.6)',
    // Radius
    RADIUS_SM: 8,
    RADIUS_MD: 12,
    RADIUS_LG: 16,
    RADIUS_XL: 20,
    // Font
    FONT_FAMILY: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif",
    FONT_MONO: "'Monaco', 'Consolas', monospace"
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

},
 }]);
//# sourceMappingURL=p__KnowledgeQA__index-async.js.map