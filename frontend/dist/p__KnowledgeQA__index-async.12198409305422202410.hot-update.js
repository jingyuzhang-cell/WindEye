globalThis.makoModuleHotUpdate('p__KnowledgeQA__index', {
    modules: {
        "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx": function(module, exports, __mako_require__) {
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
                if (isSystem) return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                    style: {
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        marginBottom: 12
                    },
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
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
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.InfoCircleOutlined, {
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
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                            style: {
                                background: _constants.DESIGN_TOKENS.ERROR_LIGHT,
                                border: `1px solid ${_constants.DESIGN_TOKENS.ERROR_BORDER}`,
                                borderRadius: 14,
                                padding: '10px 14px',
                                maxWidth: '80%'
                            },
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                    if (entities.length === 0) return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
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
                        if (entity.start > lastIndex) parts.push(/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                            children: message.content.slice(lastIndex, entity.start)
                        }, `text-${idx}`, false, {
                            fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                            lineNumber: 132,
                            columnNumber: 11
                        }, this));
                        const isHighlighted = highlightedEntity === entity.id;
                        parts.push(/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
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
                    if (lastIndex < message.content.length) parts.push(/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                        children: message.content.slice(lastIndex)
                    }, "text-end", false, {
                        fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                        lineNumber: 170,
                        columnNumber: 18
                    }, this));
                    return parts;
                };
                return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                    style: {
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        marginBottom: 16,
                        flexDirection: isUser ? 'row-reverse' : 'row'
                    },
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
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
                            children: isUser ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.UserOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                                lineNumber: 206,
                                columnNumber: 19
                            }, this) : /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.RobotOutlined, {}, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                                lineNumber: 206,
                                columnNumber: 38
                            }, this)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/EntityMessageBubble.tsx",
                            lineNumber: 186,
                            columnNumber: 7
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                                maxWidth: '75%',
                                alignItems: isUser ? 'flex-end' : 'flex-start'
                            },
                            children: [
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
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
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
        }
    }
}, function(runtime) {
    runtime._h = '1573936089732148849';
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

//# sourceMappingURL=p__KnowledgeQA__index-async.12198409305422202410.hot-update.js.map