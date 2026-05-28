((typeof globalThis !== 'undefined' ? globalThis : self)["makoChunk_ant-design-pro"] = (typeof globalThis !== 'undefined' ? globalThis : self)["makoChunk_ant-design-pro"] || []).push([
        ['common'],
{ "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx": function (module, exports, __mako_require__){
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
var _react = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react/index.js"));
var _antd = __mako_require__("node_modules/antd/es/index.js");
var _icons = __mako_require__("node_modules/@ant-design/icons/es/index.js");
var _g6 = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/@antv/g6/es/index.js"));
var _procomponents = __mako_require__("node_modules/@ant-design/pro-components/es/index.js");
var _graphConfig = __mako_require__("src/pages/graphConfig.ts");
var _LayoutSwitcher = /*#__PURE__*/ _interop_require_default._(__mako_require__("src/pages/KnowledgeGraph/components/LayoutSwitcher.tsx"));
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
var _s = $RefreshSig$();
const { Option } = _antd.Select;
const LayerGraphPage = ({ config })=>{
    _s();
    const { layerName, pageTitle, nodeStyles, relationLabels, propertyMap } = config;
    const [rawData, setRawData] = (0, _react.useState)(null);
    const [loading, setLoading] = (0, _react.useState)(false);
    const [graphError, setGraphError] = (0, _react.useState)(null);
    const [drawerVisible, setDrawerVisible] = (0, _react.useState)(false);
    const [selectedNode, setSelectedNode] = (0, _react.useState)(null);
    const [detailModalVisible, setDetailModalVisible] = (0, _react.useState)(false);
    const [detailData, setDetailData] = (0, _react.useState)([]);
    const [detailTitle, setDetailTitle] = (0, _react.useState)('');
    const [currentLayout, setCurrentLayout] = (0, _react.useState)('gForce');
    const [dbStats, setDbStats] = (0, _react.useState)({
        total: 0,
        details: []
    });
    const [expanding, setExpanding] = (0, _react.useState)(false);
    const containerRef = (0, _react.useRef)(null);
    const graphRef = (0, _react.useRef)(null);
    const expandedNodesRef = (0, _react.useRef)(new Set());
    const [form] = _antd.Form.useForm();
    // ─── Data Loading ─────────────────────────────────────────────────
    const loadData = (0, _react.useCallback)(async (params, isSearch)=>{
        setLoading(true);
        setGraphError(null);
        params.set('layer', layerName);
        const endpoint = isSearch ? 'search-all' : 'data';
        const url = `/api/v1/graph/${endpoint}?${params.toString()}`;
        try {
            const response = await fetch(url);
            const result = await response.json();
            if (result.error) {
                setGraphError(result.error);
                setRawData(null);
                return;
            }
            if (!result.nodes || !Array.isArray(result.nodes)) {
                setGraphError('后端返回数据格式异常，缺少 nodes 字段');
                setRawData(null);
                return;
            }
            if (isSearch && result.nodes.length === 0) _antd.message.warning('未找到相关的关联节点');
            setRawData({
                nodes: result.nodes,
                edges: result.edges || []
            });
            if (isSearch) _antd.message.success(`找到 ${result.nodes.length} 个关联节点`);
            expandedNodesRef.current.clear();
        } catch  {
            setGraphError('后端服务连接失败，请检查服务是否启动');
            setRawData(null);
        } finally{
            setLoading(false);
        }
    }, [
        layerName
    ]);
    const loadFullGraph = (0, _react.useCallback)(()=>{
        const params = new URLSearchParams({
            limit: '100'
        });
        loadData(params, false);
    }, [
        loadData
    ]);
    const loadDbStatistics = (0, _react.useCallback)(async ()=>{
        try {
            const response = await fetch(`/api/v1/graph/statistics?layer=${layerName}`);
            const data = await response.json();
            if (data && Array.isArray(data.details)) setDbStats({
                total: data.total || 0,
                details: data.details
            });
        } catch  {
            console.error('加载统计数据失败');
        }
    }, [
        layerName
    ]);
    const handleSearch = (0, _react.useCallback)((values)=>{
        const { keyword, layers } = values;
        const params = new URLSearchParams();
        if (keyword) params.append('q', keyword.trim());
        if (layers) params.append('depth', (layers || 1).toString());
        params.append('limit', '200');
        if (!keyword) loadFullGraph();
        else loadData(params, true);
    }, [
        loadData,
        loadFullGraph
    ]);
    const handleExpand = (0, _react.useCallback)(async (nodeId)=>{
        if (expandedNodesRef.current.has(nodeId)) {
            _antd.message.info('该节点已展开');
            return;
        }
        setExpanding(true);
        try {
            const response = await fetch(`/api/v1/graph/subgraph/${nodeId}?layer=${layerName}&limit=50`);
            const result = await response.json();
            if (result.nodes && result.nodes.length > 0 && rawData) {
                const existingNodeIds = new Set(rawData.nodes.map((n)=>n.element_id || n.id));
                const existingEdgeIds = new Set(rawData.edges.map((e)=>e.element_id || e.id));
                const newNodes = result.nodes.filter((n)=>!existingNodeIds.has(n.element_id || n.id));
                const newEdges = result.edges.filter((e)=>!existingEdgeIds.has(e.element_id || e.id));
                if (newNodes.length > 0 || newEdges.length > 0) {
                    setRawData({
                        nodes: [
                            ...rawData.nodes,
                            ...newNodes
                        ],
                        edges: [
                            ...rawData.edges,
                            ...newEdges
                        ]
                    });
                    expandedNodesRef.current.add(nodeId);
                    _antd.message.success(`展开 ${newNodes.length} 个新节点, ${newEdges.length} 条新关系`);
                } else _antd.message.info('没有新的节点或关系');
            }
        } catch  {
            _antd.message.error('节点展开失败');
        } finally{
            setExpanding(false);
        }
    }, [
        rawData,
        layerName
    ]);
    // ─── Data Processing ──────────────────────────────────────────────
    const processedData = (0, _react.useMemo)(()=>{
        if (!rawData || !rawData.nodes || !rawData.nodes.length) return {
            nodes: [],
            links: []
        };
        var nodes = rawData.nodes.map(function(node) {
            var labels = node.labels || [];
            var props = node.properties || {};
            var typeKey = 'Unknown';
            for(var i = 0; i < labels.length; i++)if (nodeStyles[labels[i]]) {
                typeKey = labels[i];
                break;
            }
            var nodeStyle = nodeStyles[typeKey] || nodeStyles['Unknown'] || {
                color: '#BFBFBF',
                label: '未知'
            };
            var nodeName = props.name || props.COMPANY_NM || props.PERSON_NM || props.title || props.e_id || props.id || '未知';
            return {
                id: String(node.element_id || node.id),
                name: nodeName,
                labels: labels,
                properties: props,
                typeKey: typeKey,
                color: nodeStyle.color
            };
        });
        var nodeIds = new Set(nodes.map(function(n) {
            return n.id;
        }));
        var edges = rawData.edges || [];
        var links = edges.filter(function(e) {
            var src = String(e.startNodeElementId || e.source || '');
            var tgt = String(e.endNodeElementId || e.target || '');
            return nodeIds.has(src) && nodeIds.has(tgt);
        }).map(function(e) {
            var src = String(e.startNodeElementId || e.source || '');
            var tgt = String(e.endNodeElementId || e.target || '');
            var edgeLabel = e.type || e.label || '';
            return {
                source: src,
                target: tgt,
                label: relationLabels[edgeLabel] || edgeLabel,
                originalLabel: edgeLabel,
                id: String(e.element_id || e.id || src + '-' + tgt + '-' + edgeLabel)
            };
        });
        return {
            nodes: nodes,
            links: links
        };
    }, [
        rawData,
        nodeStyles,
        relationLabels
    ]);
    // ─── Layout Configuration ──────────────────────────────────────────
    var getLayoutConfig = function(layoutType, nodeCount) {
        switch(layoutType){
            case 'gForce':
                return {
                    type: 'gForce',
                    maxIteration: 200 * Math.ceil(nodeCount / 50),
                    gravity: 5,
                    linkDistance: 100,
                    preventOverlap: true
                };
            case 'force2':
                return {
                    type: 'force2',
                    maxIteration: 200,
                    linkDistance: 100,
                    nodeStrength: -30,
                    preventOverlap: true
                };
            case 'dagre':
                return {
                    type: 'dagre',
                    rankdir: 'TB',
                    nodesep: 30,
                    ranksep: 50
                };
            case 'dagre-lr':
                return {
                    type: 'dagre',
                    rankdir: 'LR',
                    nodesep: 30,
                    ranksep: 50
                };
            case 'circular':
                return {
                    type: 'circular',
                    radius: null
                };
            case 'concentric':
                return {
                    type: 'concentric',
                    minNodeSpacing: 40,
                    equidistant: true
                };
            default:
                return {
                    type: 'gForce',
                    maxIteration: 200,
                    gravity: 5,
                    linkDistance: 100
                };
        }
    };
    var getNodeLayer = function(typeKey) {
        var style = _graphConfig.GENERAL_CONFIG.nodeStyles[typeKey];
        if (style && style.layer !== undefined) return style.layer;
        return LAYER_NAME_MAP[config.layerName] ?? 0;
    };
    var LAYER_NAME_MAP = {
        'Subject': 0,
        'Event': 1,
        'Feature': 2,
        'Regulation': 3
    };
    // ─── G6 Graph ─────────────────────────────────────────────────────
    (0, _react.useEffect)(()=>{
        if (!containerRef.current || !processedData.nodes.length) return;
        if (graphRef.current) {
            graphRef.current.destroy();
            graphRef.current = null;
        }
        var width = containerRef.current.scrollWidth || window.innerWidth - 400;
        var height = containerRef.current.scrollHeight || 600;
        var nodeCount = processedData.nodes.length;
        var graph = new _g6.default.Graph({
            container: containerRef.current,
            width: width,
            height: height,
            layout: getLayoutConfig(currentLayout, nodeCount),
            modes: {
                default: [
                    'drag-canvas',
                    'zoom-canvas',
                    'drag-node'
                ]
            },
            defaultNode: {
                type: 'circle',
                size: 28,
                labelCfg: {
                    position: 'bottom',
                    offset: 6,
                    style: {
                        fill: '#666',
                        fontSize: 11
                    }
                },
                style: {
                    stroke: '#fff',
                    lineWidth: 2
                }
            },
            defaultEdge: {
                type: 'line',
                style: {
                    endArrow: {
                        path: _g6.default.Arrow.triangle(6, 8, 2),
                        fill: '#d9d9d9'
                    },
                    lineWidth: 1.5
                },
                labelCfg: {
                    autoRotate: true,
                    refY: -8,
                    style: {
                        fill: '#999',
                        fontSize: 9
                    }
                }
            },
            animate: nodeCount < 200,
            renderer: 'canvas',
            fitView: true
        });
        var g6Nodes = processedData.nodes.map(function(n) {
            return {
                id: n.id,
                label: n.name.length > 6 ? n.name.substring(0, 6) + '...' : n.name,
                style: {
                    fill: n.color
                },
                typeKey: n.typeKey,
                properties: n.properties,
                labels: n.labels,
                fullName: n.name
            };
        });
        var g6Edges = processedData.links.map(function(l) {
            var edgeColor = '#d9d9d9';
            var edgeWidth = 1.5;
            // Use EDGE_STYLE_MAP for color-coded edges based on node layer pairs
            var srcNode = g6Nodes.find(function(n) {
                return n.id === l.source;
            });
            var tgtNode = g6Nodes.find(function(n) {
                return n.id === l.target;
            });
            if (srcNode && tgtNode) {
                var srcLayer = getNodeLayer(srcNode.typeKey);
                var tgtLayer = getNodeLayer(tgtNode.typeKey);
                var key = srcLayer + '-' + tgtLayer;
                var styleConfig = _graphConfig.EDGE_STYLE_MAP[key] || _graphConfig.EDGE_STYLE_MAP['default'];
                edgeColor = styleConfig.stroke;
                edgeWidth = styleConfig.lineWidth;
            }
            return {
                id: l.id,
                source: l.source,
                target: l.target,
                label: l.label,
                style: {
                    stroke: edgeColor,
                    lineWidth: edgeWidth,
                    endArrow: {
                        path: _g6.default.Arrow.triangle(6, 8, 2),
                        fill: edgeColor
                    }
                },
                originalLabel: l.originalLabel
            };
        });
        graph.data({
            nodes: g6Nodes,
            edges: g6Edges
        });
        graph.render();
        graph.on('node:click', function(evt) {
            var item = evt.item;
            var model = item.getModel();
            if (model.properties) {
                setSelectedNode(model);
                setDrawerVisible(true);
            }
        });
        graph.on('node:dblclick', function(evt) {
            var item = evt.item;
            var model = item.getModel();
            handleExpand(model.id);
        });
        graphRef.current = graph;
        return function() {
            if (graphRef.current) {
                graphRef.current.destroy();
                graphRef.current = null;
            }
        };
    }, [
        processedData,
        currentLayout
    ]);
    // ─── Initial Load ──────────────────────────────────────────────────
    (0, _react.useEffect)(()=>{
        loadFullGraph();
        loadDbStatistics();
    }, []);
    // ─── Export ────────────────────────────────────────────────────────
    var handleExportPNG = (0, _react.useCallback)(function() {
        if (graphRef.current) graphRef.current.downloadFullImage(layerName + '-graph-' + Date.now(), 'image/png', {
            backgroundColor: '#fff',
            padding: 20
        });
    }, [
        layerName
    ]);
    var handleExportCSV = (0, _react.useCallback)(function() {
        var headers = '层级,节点类型,节点数\r\n';
        var rows = dbStats.details.map(function(d) {
            return layerName + ',' + d.label + ',' + d.value;
        }).join('\r\n');
        var csv = '﻿' + headers + rows;
        var blob = new Blob([
            csv
        ], {
            type: 'text/csv;charset=utf-8;'
        });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = layerName + '-stats-' + Date.now() + '.csv';
        a.click();
        URL.revokeObjectURL(url);
        _antd.message.success('统计数据已导出');
    }, [
        dbStats,
        layerName
    ]);
    // ─── Property Rendering ────────────────────────────────────────────
    var renderPropertyValue = function(key, value) {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'object') try {
            return JSON.stringify(value);
        } catch  {
            return String(value);
        }
        var strValue = String(value);
        var propConfig = propertyMap[key];
        if (propConfig && propConfig.isRisk && strValue && strValue !== '[]' && strValue !== '{}') try {
            var parsed = JSON.parse(strValue);
            if (Array.isArray(parsed) && parsed.length > 0) return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                type: "link",
                size: "small",
                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.EyeOutlined, {}, void 0, false, {
                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                    lineNumber: 416,
                    columnNumber: 21
                }, void 0),
                onClick: function() {
                    setDetailTitle(propConfig.label || key);
                    setDetailData(parsed);
                    setDetailModalVisible(true);
                },
                children: [
                    "查看详情 (",
                    parsed.length,
                    "条)"
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                lineNumber: 413,
                columnNumber: 13
            }, this);
        } catch  {}
        return strValue.length > 100 ? strValue.substring(0, 100) + '...' : strValue;
    };
    // ─── UI ────────────────────────────────────────────────────────────
    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_procomponents.PageContainer, {
        header: {
            title: pageTitle,
            subTitle: layerName + '层知识图谱检索与可视化'
        },
        children: [
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Row, {
                gutter: 16,
                style: {
                    marginBottom: 16
                },
                children: [
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                        span: 6,
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                            size: "small",
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
                                title: layerName + '层总节点数',
                                value: dbStats.total,
                                prefix: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.NodeIndexOutlined, {}, void 0, false, {
                                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                    lineNumber: 443,
                                    columnNumber: 23
                                }, void 0),
                                loading: !dbStats.total
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 440,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 439,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                        lineNumber: 438,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                        span: 6,
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                            size: "small",
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
                                title: "图谱当前节点数",
                                value: processedData.nodes.length,
                                prefix: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.AimOutlined, {}, void 0, false, {
                                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                    lineNumber: 453,
                                    columnNumber: 23
                                }, void 0)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 450,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 449,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                        lineNumber: 448,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                        span: 6,
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                            size: "small",
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
                                title: "图谱当前关系数",
                                value: processedData.links.length,
                                prefix: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ExpandOutlined, {}, void 0, false, {
                                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                    lineNumber: 462,
                                    columnNumber: 23
                                }, void 0)
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 459,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 458,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                        lineNumber: 457,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                        span: 6,
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                            size: "small",
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    display: 'flex',
                                    gap: 8,
                                    justifyContent: 'flex-end'
                                },
                                children: [
                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                        title: "导出图谱PNG",
                                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.PictureOutlined, {}, void 0, false, {
                                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                                lineNumber: 470,
                                                columnNumber: 31
                                            }, void 0),
                                            size: "small",
                                            onClick: handleExportPNG,
                                            children: "PNG"
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                            lineNumber: 470,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                        lineNumber: 469,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                        title: "导出统计CSV",
                                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FileExcelOutlined, {}, void 0, false, {
                                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                                lineNumber: 475,
                                                columnNumber: 31
                                            }, void 0),
                                            size: "small",
                                            onClick: handleExportCSV,
                                            children: "CSV"
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                            lineNumber: 475,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                        lineNumber: 474,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                        title: "刷新数据",
                                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ReloadOutlined, {}, void 0, false, {
                                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                                lineNumber: 481,
                                                columnNumber: 25
                                            }, void 0),
                                            size: "small",
                                            onClick: function() {
                                                loadFullGraph();
                                                loadDbStatistics();
                                            }
                                        }, void 0, false, {
                                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                            lineNumber: 480,
                                            columnNumber: 17
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                        lineNumber: 479,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 468,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 467,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                        lineNumber: 466,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                lineNumber: 437,
                columnNumber: 7
            }, this),
            dbStats.details.length > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Row, {
                gutter: 16,
                style: {
                    marginBottom: 16
                },
                children: dbStats.details.map(function(d) {
                    var color = nodeStyles[d.type] && nodeStyles[d.type].color || '#BFBFBF';
                    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                        span: Math.max(4, Math.floor(24 / dbStats.details.length)),
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                            size: "small",
                            style: {
                                borderLeft: '3px solid ' + color
                            },
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
                                title: d.label,
                                value: d.value,
                                valueStyle: {
                                    fontSize: 18
                                }
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 503,
                                columnNumber: 19
                            }, this)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 502,
                            columnNumber: 17
                        }, this)
                    }, d.type, false, {
                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                        lineNumber: 501,
                        columnNumber: 15
                    }, this);
                })
            }, void 0, false, {
                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                lineNumber: 496,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                size: "small",
                style: {
                    marginBottom: 16
                },
                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Form, {
                    form: form,
                    layout: "inline",
                    onFinish: handleSearch,
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Form.Item, {
                            name: "keyword",
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Input.Search, {
                                placeholder: "输入节点名称搜索...",
                                style: {
                                    width: 320
                                },
                                enterButton: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.SearchOutlined, {}, void 0, false, {
                                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                    lineNumber: 518,
                                    columnNumber: 28
                                }, void 0),
                                onSearch: function() {
                                    form.submit();
                                }
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 515,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 514,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Form.Item, {
                            name: "layers",
                            initialValue: 2,
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Select, {
                                style: {
                                    width: 120
                                },
                                placeholder: "穿透深度",
                                children: [
                                    1,
                                    2,
                                    3,
                                    4,
                                    5
                                ].map(function(n) {
                                    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Option, {
                                        value: n,
                                        children: [
                                            n,
                                            "层穿透"
                                        ]
                                    }, n, true, {
                                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                        lineNumber: 528,
                                        columnNumber: 19
                                    }, this);
                                })
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 525,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 524,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Form.Item, {
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                type: "primary",
                                htmlType: "submit",
                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.SearchOutlined, {}, void 0, false, {
                                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                    lineNumber: 536,
                                    columnNumber: 60
                                }, void 0),
                                loading: loading,
                                children: "检索"
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 536,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 535,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Form.Item, {
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ReloadOutlined, {}, void 0, false, {
                                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                    lineNumber: 542,
                                    columnNumber: 21
                                }, void 0),
                                onClick: function() {
                                    form.resetFields();
                                    loadFullGraph();
                                },
                                children: "重置"
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 541,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 540,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                    lineNumber: 513,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                lineNumber: 512,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                size: "small",
                bodyStyle: {
                    padding: 0
                },
                style: {
                    marginBottom: 16,
                    overflow: 'hidden'
                },
                extra: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Space, {
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_LayoutSwitcher.default, {
                            currentLayout: currentLayout,
                            onLayoutChange: function(layout) {
                                setCurrentLayout(layout);
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 561,
                            columnNumber: 13
                        }, void 0),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                            title: "适应画布",
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                size: "small",
                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.AimOutlined, {}, void 0, false, {
                                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                    lineNumber: 568,
                                    columnNumber: 23
                                }, void 0),
                                onClick: function() {
                                    if (graphRef.current) graphRef.current.fitView(20);
                                }
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 566,
                                columnNumber: 15
                            }, void 0)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 565,
                            columnNumber: 13
                        }, void 0),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                            title: "导出PNG",
                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                size: "small",
                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.DownloadOutlined, {}, void 0, false, {
                                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                    lineNumber: 575,
                                    columnNumber: 42
                                }, void 0),
                                onClick: handleExportPNG
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 575,
                                columnNumber: 15
                            }, void 0)
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 574,
                            columnNumber: 13
                        }, void 0)
                    ]
                }, void 0, true, {
                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                    lineNumber: 560,
                    columnNumber: 11
                }, void 0),
                title: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.NodeIndexOutlined, {
                            style: {
                                marginRight: 8
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 581,
                            columnNumber: 13
                        }, void 0),
                        "图谱可视化 (",
                        processedData.nodes.length,
                        "节点, ",
                        processedData.links.length,
                        "关系)",
                        expanding && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Spin, {
                            size: "small",
                            style: {
                                marginLeft: 8
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 583,
                            columnNumber: 27
                        }, void 0)
                    ]
                }, void 0, true, {
                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                    lineNumber: 580,
                    columnNumber: 11
                }, void 0),
                children: [
                    loading && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            height: 500,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        },
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Spin, {
                            size: "large",
                            tip: "加载图谱数据中..."
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 597,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                        lineNumber: 589,
                        columnNumber: 11
                    }, this),
                    graphError && !loading && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            height: 500,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center'
                        },
                        children: [
                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    fontSize: 48,
                                    color: '#f5222d',
                                    marginBottom: 16
                                },
                                children: "⚠"
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 612,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    color: '#f5222d',
                                    marginBottom: 8,
                                    fontSize: 14
                                },
                                children: graphError
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 613,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                type: "primary",
                                onClick: loadFullGraph,
                                children: "重新加载"
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                lineNumber: 616,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                        lineNumber: 603,
                        columnNumber: 11
                    }, this),
                    !loading && !graphError && processedData.nodes.length === 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        style: {
                            height: 500,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        },
                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Empty, {
                            description: "暂无图谱数据，请尝试检索或刷新"
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 632,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                        lineNumber: 624,
                        columnNumber: 11
                    }, this),
                    !loading && !graphError && processedData.nodes.length > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                        ref: containerRef,
                        style: {
                            width: '100%',
                            height: 550
                        }
                    }, void 0, false, {
                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                        lineNumber: 638,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                lineNumber: 555,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Drawer, {
                title: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.InfoCircleOutlined, {
                            style: {
                                marginRight: 8
                            }
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 646,
                            columnNumber: 13
                        }, void 0),
                        "节点详情 - ",
                        selectedNode ? selectedNode.name : ''
                    ]
                }, void 0, true, {
                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                    lineNumber: 645,
                    columnNumber: 11
                }, void 0),
                placement: "right",
                width: 480,
                open: drawerVisible,
                onClose: function() {
                    setDrawerVisible(false);
                    setSelectedNode(null);
                },
                children: selectedNode && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Descriptions, {
                            column: 1,
                            size: "small",
                            bordered: true,
                            style: {
                                marginBottom: 16
                            },
                            children: [
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Descriptions.Item, {
                                    label: "节点ID",
                                    children: selectedNode.id
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                    lineNumber: 661,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Descriptions.Item, {
                                    label: "节点名称",
                                    children: selectedNode.name
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                    lineNumber: 662,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Descriptions.Item, {
                                    label: "节点类型",
                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                        color: selectedNode.color,
                                        children: selectedNode.typeKey
                                    }, void 0, false, {
                                        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                        lineNumber: 664,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                    lineNumber: 663,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Descriptions.Item, {
                                    label: "标签",
                                    children: (selectedNode.labels || []).map(function(l) {
                                        return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                            color: "blue",
                                            children: l
                                        }, l, false, {
                                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                            lineNumber: 669,
                                            columnNumber: 21
                                        }, this);
                                    })
                                }, void 0, false, {
                                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                                    lineNumber: 666,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 660,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("h4", {
                            children: "属性"
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 677,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Table, {
                            dataSource: Object.entries(selectedNode.properties || {}).map(function([key, value]) {
                                return {
                                    key: key,
                                    value: value
                                };
                            }),
                            columns: [
                                {
                                    title: '属性名',
                                    dataIndex: 'key',
                                    key: 'key',
                                    width: 160,
                                    render: function(k) {
                                        return propertyMap[k] ? propertyMap[k].label : k;
                                    }
                                },
                                {
                                    title: '属性值',
                                    dataIndex: 'value',
                                    key: 'value',
                                    render: function(val, record) {
                                        return renderPropertyValue(record.key, val);
                                    }
                                }
                            ],
                            pagination: {
                                pageSize: 10
                            },
                            size: "small",
                            rowKey: "key"
                        }, void 0, false, {
                            fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                            lineNumber: 678,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true)
            }, void 0, false, {
                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                lineNumber: 643,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Modal, {
                title: detailTitle,
                open: detailModalVisible,
                onCancel: function() {
                    setDetailModalVisible(false);
                },
                footer: null,
                width: 700,
                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Table, {
                    dataSource: detailData,
                    columns: [
                        {
                            title: '#',
                            dataIndex: 'index',
                            key: 'index',
                            width: 60,
                            render: function(_, __, idx) {
                                return idx + 1;
                            }
                        },
                        {
                            title: '内容',
                            dataIndex: 'content',
                            key: 'content',
                            render: function(val, record) {
                                if (typeof record === 'string') return record;
                                return JSON.stringify(record, null, 2);
                            }
                        }
                    ],
                    size: "small",
                    rowKey: function(_, idx) {
                        return String(idx);
                    },
                    pagination: {
                        pageSize: 10
                    }
                }, void 0, false, {
                    fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                    lineNumber: 722,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
                lineNumber: 713,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "src/pages/KnowledgeGraph/components/LayerGraphPage.tsx",
        lineNumber: 435,
        columnNumber: 5
    }, this);
};
_s(LayerGraphPage, "QWwfF14wGq/LCt8rjeDZSEgaIkc=", false, function() {
    return [
        _antd.Form.useForm
    ];
});
_c = LayerGraphPage;
var _default = LayerGraphPage;
var _c;
$RefreshReg$(_c, "LayerGraphPage");
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
"src/pages/KnowledgeGraph/components/LayoutSwitcher.tsx": function (module, exports, __mako_require__){
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
var _react = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/react/index.js"));
var _antd = __mako_require__("node_modules/antd/es/index.js");
var prevRefreshReg;
var prevRefreshSig;
prevRefreshReg = self.$RefreshReg$;
prevRefreshSig = self.$RefreshSig$;
self.$RefreshReg$ = (type, id)=>{
    _reactrefresh.register(type, module.id + id);
};
self.$RefreshSig$ = _reactrefresh.createSignatureFunctionForTransform;
var LAYOUT_OPTIONS = [
    {
        value: 'gForce',
        label: '力导向 (GPU)'
    },
    {
        value: 'force2',
        label: '力导向'
    },
    {
        value: 'dagre',
        label: '层次化 (TB)'
    },
    {
        value: 'dagre-lr',
        label: '层次化 (LR)'
    },
    {
        value: 'circular',
        label: '环形'
    },
    {
        value: 'concentric',
        label: '同心圆'
    }
];
var LayoutSwitcher = function(_a) {
    var currentLayout = _a.currentLayout, onLayoutChange = _a.onLayoutChange, disabled = _a.disabled;
    return /*#__PURE__*/ _react.default.createElement(_antd.Select, {
        value: currentLayout,
        onChange: onLayoutChange,
        options: LAYOUT_OPTIONS,
        size: "small",
        style: {
            width: 150
        },
        disabled: disabled
    });
};
_c = LayoutSwitcher;
var _default = LayoutSwitcher;
var _c;
$RefreshReg$(_c, "LayoutSwitcher");
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
"src/pages/graphConfig.ts": function (module, exports, __mako_require__){
// graphConfig.ts
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
    EDGE_STYLE_MAP: function() {
        return EDGE_STYLE_MAP;
    },
    EVENT_CONFIG: function() {
        return EVENT_CONFIG;
    },
    FACTOR_TYPE_MAP: function() {
        return FACTOR_TYPE_MAP;
    },
    FEATURE_CONFIG: function() {
        return FEATURE_CONFIG;
    },
    GENERAL_CONFIG: function() {
        return GENERAL_CONFIG;
    },
    IMPORTANCE_MAP: function() {
        return IMPORTANCE_MAP;
    },
    REGULATION_CONFIG: function() {
        return REGULATION_CONFIG;
    },
    RISK_TYPE_MAP: function() {
        return RISK_TYPE_MAP;
    },
    SUBJECT_CONFIG: function() {
        return SUBJECT_CONFIG;
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
const IMPORTANCE_MAP = {
    '-3': {
        label: '极高风险',
        color: '#f5222d',
        priority: 1
    },
    '-2': {
        label: '高风险',
        color: '#fa541c',
        priority: 2
    },
    '-1': {
        label: '一般风险',
        color: '#faad14',
        priority: 3
    },
    '0': {
        label: '提示信息',
        color: '#1890ff',
        priority: 4
    }
};
const FACTOR_TYPE_MAP = {
    '1': '财务预警',
    '2': '法律诉讼',
    '3': '股权变动'
};
const RISK_TYPE_MAP = {
    '1': '减持风险',
    '2': '违规风险',
    '3': '负面舆情'
};
const EDGE_STYLE_MAP = {
    '0-1': {
        stroke: '#f5222d',
        lineWidth: 2.5
    },
    '1-0': {
        stroke: '#f5222d',
        lineWidth: 2.5
    },
    '1-2': {
        stroke: '#fa8c16',
        lineWidth: 2.5
    },
    '2-1': {
        stroke: '#fa8c16',
        lineWidth: 2.5
    },
    '2-3': {
        stroke: '#1890ff',
        lineWidth: 2.5
    },
    '3-2': {
        stroke: '#1890ff',
        lineWidth: 2.5
    },
    '0-2': {
        stroke: '#52c41a',
        lineWidth: 2.5
    },
    '2-0': {
        stroke: '#52c41a',
        lineWidth: 2.5
    },
    '0-3': {
        stroke: '#faad14',
        lineWidth: 2.5
    },
    '3-0': {
        stroke: '#faad14',
        lineWidth: 2.5
    },
    '1-3': {
        stroke: '#13c2c2',
        lineWidth: 2.5
    },
    '3-1': {
        stroke: '#13c2c2',
        lineWidth: 2.5
    },
    '0-0': {
        stroke: '#d1d1d6',
        lineWidth: 2
    },
    '1-1': {
        stroke: '#d1d1d6',
        lineWidth: 2
    },
    '2-2': {
        stroke: '#d1d1d6',
        lineWidth: 2
    },
    '3-3': {
        stroke: '#d1d1d6',
        lineWidth: 2
    },
    'default': {
        stroke: '#d1d1d6',
        lineWidth: 2
    } // 其他边
};
const GENERAL_CONFIG = {
    layerName: 'General',
    pageTitle: '总览层图谱检索',
    apiPrefix: '/api/v1',
    nodeStyles: {
        'COMPANY': {
            color: '#FFC101',
            label: '公司',
            layer: 0
        },
        'PERSON': {
            color: '#1890FF',
            label: '自然人',
            layer: 0
        },
        'EVENT': {
            color: '#FF6B6B',
            label: '主事件',
            layer: 1
        },
        'SUB_EVENT': {
            color: '#FF9999',
            label: '子事件',
            layer: 1
        },
        'TIME': {
            color: '#FF8C00',
            label: '时间',
            layer: 1
        },
        'RiskFeature': {
            color: '#4CAF50',
            label: '风险特征',
            layer: 2
        },
        'RiskFactor': {
            color: '#9C27B0',
            label: '风险因子',
            layer: 2
        },
        'Action': {
            color: '#45B7D1',
            label: '法规行为',
            layer: 3
        },
        'Unknown': {
            color: '#2196F3',
            label: '未知',
            layer: 0
        }
    },
    relationLabels: {
        'TRIGGERS': '发生',
        'REFLECTS': '反映',
        'COMPLIES_WITH': '遵守',
        'PARTICIPATE_IN': '参与',
        'REL_TYPE': '贡献度'
    },
    propertyMap: {
        // 公司属性
        COMPANY_NM: {
            label: '名称'
        },
        ORGNUM: {
            label: '统一社会信用代码'
        },
        STATUS: {
            label: '状态'
        },
        REG_CAPITAL: {
            label: '注册资本'
        },
        WARNING_NUM: {
            label: '风险预警总数',
            isRisk: true
        },
        RISK_INFO: {
            label: '风险详情',
            isRisk: true
        },
        // 事件属性
        action_type: {
            label: '事件动作类型'
        },
        event_category: {
            label: '事件分类',
            isRisk: true
        },
        name: {
            label: '事件名称'
        },
        node_type: {
            label: '节点类型'
        },
        normalized_time: {
            label: '事件时间'
        },
        PERIOD_INFO: {
            label: '周期信息'
        },
        text: {
            label: '事件详情'
        },
        title: {
            label: '事件标题'
        },
        // 特征属性
        feature_type: {
            label: '特征类型'
        },
        e_id: {
            label: '事件ID'
        },
        e_text: {
            label: '事件详情'
        },
        feature_nm: {
            label: '特征名称'
        },
        factor_nm: {
            label: '因子名称'
        },
        // 法规属性
        regulation_id: {
            label: '法规ID'
        },
        regulation_name: {
            label: '法规名称'
        },
        regulation_text: {
            label: '法规详情'
        },
        regulation_title: {
            label: '法规标题'
        }
    }
};
const SUBJECT_CONFIG = {
    layerName: 'Subject',
    pageTitle: '主体层图谱检索',
    apiPrefix: '/api/v1',
    nodeStyles: {
        'COMPANY': {
            color: '#FFC101',
            label: '企业'
        },
        'PERSON': {
            color: '#1890FF',
            label: '自然人'
        },
        'PFCOMPANY': {
            color: '#722ED1',
            label: '私募公司'
        },
        'PFUND': {
            color: '#008000',
            label: '私募基金'
        },
        'SECURITY': {
            color: '#F5222D',
            label: '证券'
        },
        'Unknown': {
            color: '#BFBFBF',
            label: '未知'
        }
    },
    relationLabels: {
        'BRANCH': '分支机构(BRANCH)',
        'INVEST': '投资(INVEST)',
        'SUE': '诉讼(SUE)',
        'TRUSTEE': '信托受托方',
        'JOINDER': '共同签署人',
        'CUSTOMER': '客户',
        'GUARANTEE': '担保',
        'CONTROLLER': '控制',
        'SUPPLIER': '供应商',
        'ISSUE': '发行',
        'WORK': '工作',
        '__': '子公司'
    },
    propertyMap: {
        COMPANY_NM: {
            label: '名称'
        },
        ORGNUM: {
            label: '统一社会信用代码'
        },
        STATUS: {
            label: '状态'
        },
        REG_CAPITAL: {
            label: '注册资本'
        },
        WARNING_NUM: {
            label: '风险预警总数',
            isRisk: true
        },
        RISK_INFO: {
            label: '风险详情',
            isRisk: true
        },
        AFFILIATION: {
            label: '关联公司'
        },
        ID: {
            label: 'ID'
        },
        NAME: {
            label: '名称'
        },
        NODE_ID: {
            label: '节点ID'
        },
        NODE_TYPE: {
            label: '节点类型'
        },
        POSITION: {
            label: '职位'
        }
    }
};
const EVENT_CONFIG = {
    layerName: 'Event',
    pageTitle: '事件层图谱检索',
    apiPrefix: '/api/v1',
    nodeStyles: {
        'COMPANY': {
            color: '#FFC101',
            label: '企业'
        },
        'PERSON': {
            color: '#1890FF',
            label: '自然人'
        },
        'TIME': {
            color: '#52C41A',
            label: '时间'
        },
        'EVENT': {
            color: '#FF6B6B',
            label: '事件'
        },
        'REGULATOR': {
            color: '#722ED1',
            label: '监管机构'
        },
        'Unknown': {
            color: '#BFBFBF',
            label: '其他'
        }
    },
    relationLabels: {
        'MENTION': '提及',
        'CAUSE': '引发',
        'BELONG': '属于'
    },
    propertyMap: {
        EVENT_TITLE: {
            label: '事件标题'
        },
        EVENT_DATE: {
            label: '发生时间'
        },
        EVENT_TYPE: {
            label: '事件类型'
        },
        IMPACT_LEVEL: {
            label: '影响等级',
            isRisk: true
        }
    }
};
const FEATURE_CONFIG = {
    layerName: 'Feature',
    pageTitle: '特征层图谱检索',
    apiPrefix: '/api/v1',
    nodeStyles: {
        'Riskfeature': {
            color: '#FFC101',
            label: '风险特征'
        },
        'Riskfactor': {
            color: '#1890FF',
            label: '风险因子'
        },
        'Unknown': {
            color: '#BFBFBF',
            label: '未知'
        }
    },
    relationLabels: {
        'MENTION': '提及',
        'CAUSE': '引发',
        'BELONG': '属于'
    },
    propertyMap: {
        EVENT_TITLE: {
            label: '事件标题'
        },
        EVENT_DATE: {
            label: '发生时间'
        },
        EVENT_TYPE: {
            label: '事件类型'
        },
        IMPACT_LEVEL: {
            label: '影响等级',
            isRisk: true
        }
    }
};
const REGULATION_CONFIG = {
    layerName: 'Regulation',
    pageTitle: '法规层图谱检索',
    apiPrefix: '/api/v1',
    nodeStyles: {
        'Regulation': {
            color: '#FFC101',
            label: '法规'
        },
        'Law': {
            color: '#1890FF',
            label: '法律'
        },
        'Unknown': {
            color: '#BFBFBF',
            label: '未知'
        }
    },
    relationLabels: {
        'MENTION': '提及',
        'CAUSE': '引发',
        'BELONG': '属于'
    },
    propertyMap: {
        EVENT_TITLE: {
            label: '事件标题'
        },
        EVENT_DATE: {
            label: '发生时间'
        },
        EVENT_TYPE: {
            label: '事件类型'
        },
        IMPACT_LEVEL: {
            label: '影响等级',
            isRisk: true
        }
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
 }]);
//# sourceMappingURL=common-async.js.map