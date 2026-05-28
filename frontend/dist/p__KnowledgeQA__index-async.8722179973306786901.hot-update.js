globalThis.makoModuleHotUpdate('p__KnowledgeQA__index', {
    modules: {
        "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx": function(module, exports, __mako_require__) {
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
            var _reactrefresh = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react-refresh/runtime.js"));
            var _jsxdevruntime = __mako_require__("node_modules/react/jsx-dev-runtime.js");
            var _react = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react/index.js"));
            var _antd = __mako_require__("node_modules/antd/es/index.js");
            var _g6 = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/@antv/g6/es/index.js"));
            var _axios = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/axios/index.js"));
            var _LegendPanel = /*#__PURE__*/ _interop_require_default._(__mako_require__("src/pages/KnowledgeQA/components/LegendPanel.tsx"));
            var _NodeContextMenu = /*#__PURE__*/ _interop_require_default._(__mako_require__("src/pages/KnowledgeQA/components/NodeContextMenu.tsx"));
            var _GraphToolbar = /*#__PURE__*/ _interop_require_default._(__mako_require__("src/pages/KnowledgeQA/components/GraphToolbar.tsx"));
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
                // Compute degree centrality for node sizing
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
                // Build path node id set for path highlighting
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
                    // Risk-level color mapping
                    const riskLevel = node.risk_level || node.riskLevel;
                    const riskColor = riskLevel === 'high' ? '#f5222d' : riskLevel === 'medium' ? '#fa8c16' : riskLevel === 'low' ? '#52c41a' : null;
                    const fillColor = riskColor || visual.color;
                    // Degree-based size
                    const deg = degreeMap.get(nodeIdStr) || 1;
                    const nodeSize = scaleSize(deg);
                    const isPathNode = pathNodeIds.has(nodeIdStr);
                    const isSubject = subjectIdSet.has(nodeIdStr);
                    const isNeighbor = neighborIdSet.has(nodeIdStr);
                    // Subject nodes: larger, thick blue border
                    // Neighbor nodes: secondary blue border
                    // Path nodes: medium blue border
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
            const EnhancedGraphPanel = /*#__PURE__*/ _s((0, _react.forwardRef)(_c = _s(({ subgraph, alignmentFeatures, onNodeDoubleClick, highlightedEntity }, ref)=>{
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
                                } catch (e) {
                                // Node may already exist, skip silently
                                }
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
                            } catch (err) {
                            // Edge may already exist, skip silently
                            }
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
                // ── Toolbar handlers ──
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
                // ── Context menu handlers ──
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
                    // Dispatch a custom event that the parent can listen to for switching to risk tab
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
                            // Pulse animation for high-risk nodes via a render timer
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
                            // Path flow animation
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
                return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                    style: styles.root,
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_LegendPanel.default, {
                            stats: liveStats,
                            visibleCategories: visibleCategories,
                            onToggle: toggleCategory,
                            onHighlight: applyHighlight
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                            lineNumber: 723,
                            columnNumber: 9
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                            style: styles.graphArea,
                            children: [
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                    ref: containerRef,
                                    style: styles.graphCanvas
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                    lineNumber: 730,
                                    columnNumber: 11
                                }, this),
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_GraphToolbar.default, {
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
                                    lineNumber: 732,
                                    columnNumber: 11
                                }, this),
                                selectedNode && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                    style: styles.infoCard,
                                    children: [
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("button", {
                                            onClick: ()=>setSelectedNode(null),
                                            style: styles.closeBtn,
                                            children: "×"
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                            lineNumber: 748,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                            style: {
                                                padding: 16
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
                                                    strong: true,
                                                    style: {
                                                        fontSize: 16,
                                                        display: 'block'
                                                    },
                                                    children: selectedNode.title || selectedNode.zh_name || selectedNode.name
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                                    lineNumber: 752,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
                                                    type: "secondary",
                                                    style: {
                                                        fontSize: 12
                                                    },
                                                    children: selectedNode.type
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                                    lineNumber: 755,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        marginTop: 10,
                                                        fontSize: 13,
                                                        maxHeight: 200,
                                                        overflowY: 'auto'
                                                    },
                                                    children: selectedNode.overview
                                                }, void 0, false, {
                                                    fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                                    lineNumber: 758,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                            lineNumber: 751,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "src/pages/KnowledgeQA/components/EnhancedGraphPanel.tsx",
                                    lineNumber: 747,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_NodeContextMenu.default, {
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
                                    lineNumber: 765,
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
        }
    }
}, function(runtime) {
    runtime._h = '17549461131665821686';
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

//# sourceMappingURL=p__KnowledgeQA__index-async.8722179973306786901.hot-update.js.map