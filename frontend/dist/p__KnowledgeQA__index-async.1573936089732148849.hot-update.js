globalThis.makoModuleHotUpdate('p__KnowledgeQA__index', {
    modules: {
        "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx": function(module, exports, __mako_require__) {
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
            var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
            var _jsxdevruntime = __mako_require__("node_modules/react/jsx-dev-runtime.js");
            var _react = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react/index.js"));
            var _antd = __mako_require__("node_modules/antd/es/index.js");
            var _icons = __mako_require__("node_modules/@ant-design/icons/es/index.js");
            var _EntityMessageBubble = __mako_require__("src/pages/KnowledgeQA/components/EntityMessageBubble.tsx");
            var _RiskEntityCard = __mako_require__("src/pages/KnowledgeQA/components/RiskEntityCard.tsx");
            var _ContextTagBar = __mako_require__("src/pages/KnowledgeQA/components/ContextTagBar.tsx");
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
                    } catch  {
                    // Keep input text on failure
                    }
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
                return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                    style: {
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        background: 'linear-gradient(180deg, #F7F9FC 0%, #F1F5F9 100%)'
                    },
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
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
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                    children: [
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("h2", {
                                            style: {
                                                margin: 0,
                                                fontSize: 15,
                                                fontWeight: 600,
                                                color: _constants.DESIGN_TOKENS.TEXT_PRIMARY
                                            },
                                            children: "Chat"
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                            lineNumber: 104,
                                            columnNumber: 11
                                        }, this),
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
                                            type: "secondary",
                                            className: "text-xs",
                                            children: [
                                                messages.length,
                                                " messages"
                                            ]
                                        }, void 0, true, {
                                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                            lineNumber: 107,
                                            columnNumber: 11
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                    lineNumber: 103,
                                    columnNumber: 9
                                }, this),
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("button", {
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
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ClearOutlined, {}, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                            lineNumber: 134,
                                            columnNumber: 11
                                        }, this),
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                            children: "Clear"
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                            lineNumber: 135,
                                            columnNumber: 11
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                    lineNumber: 111,
                                    columnNumber: 9
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                            lineNumber: 91,
                            columnNumber: 7
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                            style: {
                                flex: 1,
                                overflowY: 'auto',
                                padding: '16px'
                            },
                            children: messages.length === 0 ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                },
                                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Empty, {
                                    image: _antd.Empty.PRESENTED_IMAGE_SIMPLE,
                                    description: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            textAlign: 'center'
                                        },
                                        children: [
                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("p", {
                                                style: {
                                                    color: '#475569',
                                                    fontSize: 14,
                                                    marginBottom: 8
                                                },
                                                children: "Start your first query!"
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                lineNumber: 154,
                                                columnNumber: 19
                                            }, void 0),
                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("p", {
                                                style: {
                                                    color: '#94A3B8',
                                                    fontSize: 12
                                                },
                                                children: 'Try: "查询某公司近期的风险传导路径和异常事件"'
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                lineNumber: 157,
                                                columnNumber: 19
                                            }, void 0)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                        lineNumber: 153,
                                        columnNumber: 17
                                    }, void 0)
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                    lineNumber: 150,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                lineNumber: 142,
                                columnNumber: 11
                            }, this) : /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                children: [
                                    messages.map((msg)=>{
                                        var _msg_data, _msg_data1;
                                        return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                            children: [
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_EntityMessageBubble.EntityMessageBubble, {
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
                                                    lineNumber: 168,
                                                    columnNumber: 17
                                                }, this),
                                                msg.role === 'assistant' && (((_msg_data = msg.data) === null || _msg_data === void 0 ? void 0 : _msg_data.output) || pendingRecommendations) && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        marginLeft: 44,
                                                        marginBottom: 12
                                                    },
                                                    children: pendingRecommendations && pendingRecommendations.length > 0 ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                                        children: [
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_RiskEntityCard.RiskEntityCard, {
                                                                recommendations: pendingRecommendations,
                                                                onEntityClick: ()=>{}
                                                            }, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                                lineNumber: 184,
                                                                columnNumber: 25
                                                            }, this),
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                style: {
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 8,
                                                                    marginTop: 8
                                                                },
                                                                children: [
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Spin, {
                                                                        size: "small"
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                                        lineNumber: 189,
                                                                        columnNumber: 27
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                                                        style: {
                                                                            color: _constants.DESIGN_TOKENS.TEXT_MUTED,
                                                                            fontSize: 12
                                                                        },
                                                                        children: "Generating review..."
                                                                    }, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                                        lineNumber: 190,
                                                                        columnNumber: 27
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                                lineNumber: 188,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true) : ((_msg_data1 = msg.data) === null || _msg_data1 === void 0 ? void 0 : _msg_data1.output) ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_RiskEntityCard.RiskEntityCard, {
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
                                                        lineNumber: 196,
                                                        columnNumber: 23
                                                    }, this) : null
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                    lineNumber: 181,
                                                    columnNumber: 19
                                                }, this)
                                            ]
                                        }, msg.id, true, {
                                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                            lineNumber: 167,
                                            columnNumber: 15
                                        }, this);
                                    }),
                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                        ref: messagesEndRef
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                        lineNumber: 211,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                            lineNumber: 140,
                            columnNumber: 7
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                            style: {
                                padding: '12px 16px',
                                background: 'rgba(255, 255, 255, 0.9)',
                                backdropFilter: 'blur(16px)',
                                borderTop: `1px solid ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`
                            },
                            children: [
                                graphInjectedEntity && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
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
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("svg", {
                                            width: "12",
                                            height: "12",
                                            viewBox: "0 0 12 12",
                                            fill: "none",
                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("path", {
                                                d: "M6 1L11 6L6 11",
                                                stroke: _constants.DESIGN_TOKENS.KLEIN_BLUE,
                                                strokeWidth: "1.5",
                                                strokeLinecap: "round",
                                                strokeLinejoin: "round"
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                lineNumber: 239,
                                                columnNumber: 15
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                            lineNumber: 238,
                                            columnNumber: 13
                                        }, this),
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                            style: {
                                                fontSize: 11,
                                                color: '#475569',
                                                fontWeight: 500
                                            },
                                            children: "From Graph:"
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                            lineNumber: 247,
                                            columnNumber: 13
                                        }, this),
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                            lineNumber: 250,
                                            columnNumber: 13
                                        }, this),
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                            style: {
                                                fontSize: 11,
                                                color: '#94a3b8'
                                            },
                                            children: "· Click input to continue"
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                            lineNumber: 264,
                                            columnNumber: 13
                                        }, this),
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("button", {
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
                                            lineNumber: 267,
                                            columnNumber: 13
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                    lineNumber: 226,
                                    columnNumber: 11
                                }, this),
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_ContextTagBar.ContextTagBar, {
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
                                    lineNumber: 288,
                                    columnNumber: 9
                                }, this),
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                    style: {
                                        background: '#FFFFFF',
                                        border: `1px solid ${_constants.DESIGN_TOKENS.BORDER_DEFAULT}`,
                                        borderRadius: 14,
                                        padding: '10px 14px',
                                        transition: 'all 0.2s ease',
                                        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
                                    },
                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            display: 'flex',
                                            gap: 8,
                                            alignItems: 'flex-end'
                                        },
                                        children: [
                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(TextArea, {
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
                                                disabled: isLoading
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                lineNumber: 311,
                                                columnNumber: 13
                                            }, this),
                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("button", {
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
                                                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.SendOutlined, {
                                                    style: {
                                                        fontSize: 15
                                                    }
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                    lineNumber: 359,
                                                    columnNumber: 15
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                                lineNumber: 334,
                                                columnNumber: 13
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                        lineNumber: 310,
                                        columnNumber: 11
                                    }, this)
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                    lineNumber: 300,
                                    columnNumber: 9
                                }, this),
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                    style: {
                                        color: _constants.DESIGN_TOKENS.TEXT_MUTED,
                                        fontSize: 12,
                                        marginTop: 8,
                                        display: 'block',
                                        paddingLeft: 4
                                    },
                                    children: "Enter to send · Shift+Enter for newline · Double-click graph node to add context"
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                                    lineNumber: 364,
                                    columnNumber: 9
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                            lineNumber: 217,
                            columnNumber: 7
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "src/pages/KnowledgeQA/components/WorkspaceContainer.tsx",
                    lineNumber: 82,
                    columnNumber: 5
                }, this);
            };
            _s(WorkspaceContainer, "iM18rKO3YEv04mpgH9oA0MQ/zlM=");
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
        }
    }
}, function(runtime) {
    runtime._h = '10423949271021911995';
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

//# sourceMappingURL=p__KnowledgeQA__index-async.1573936089732148849.hot-update.js.map