globalThis.makoModuleHotUpdate('p__KnowledgeQA__index', {
    modules: {
        "src/pages/KnowledgeQA/components/RiskReportPanel.tsx": function(module, exports, __mako_require__) {
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
            var _icons = __mako_require__("node_modules/@ant-design/icons/es/index.js");
            var _antd = __mako_require__("node_modules/antd/es/index.js");
            var _react = /*#__PURE__*/ _interop_require_wildcard._(__mako_require__("node_modules/react/index.js"));
            var _reactmarkdown = /*#__PURE__*/ _interop_require_default._(__mako_require__("node_modules/react-markdown/index.js"));
            var _EventBarChart = /*#__PURE__*/ _interop_require_default._(__mako_require__("src/pages/KnowledgeQA/components/charts/EventBarChart.tsx"));
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
                // Auto-scroll to final report when report loads
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
                    } catch  {
                    // silent
                    } finally{
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
                // ── Empty state ──
                if (!report && !isLoading && stages.length === 0) return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%'
                    },
                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Empty, {
                        image: _antd.Empty.PRESENTED_IMAGE_SIMPLE,
                        description: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                            children: [
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                // Entity stats from new API (entity_stats) or fallback from subgraph_summary
                const entityStats = report === null || report === void 0 ? void 0 : report.entity_stats;
                const totalEntities = (entityStats === null || entityStats === void 0 ? void 0 : entityStats.total_entities) || (report === null || report === void 0 ? void 0 : (_report_subgraph_summary = report.subgraph_summary) === null || _report_subgraph_summary === void 0 ? void 0 : _report_subgraph_summary.node_count) || 0;
                const entityTypeCounts = (entityStats === null || entityStats === void 0 ? void 0 : entityStats.entity_type_counts) || {};
                const topEntities = (entityStats === null || entityStats === void 0 ? void 0 : entityStats.top_entities) || [];
                // Community info from new API (community_info) or fallback from community prop
                const communityInfo = report === null || report === void 0 ? void 0 : report.community_info;
                const communities = (communityInfo === null || communityInfo === void 0 ? void 0 : communityInfo.communities) || (community === null || community === void 0 ? void 0 : community.communities) || [];
                return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                    className: "risk-report-panel",
                    style: {
                        height: '100%',
                        overflow: 'auto',
                        padding: '12px 16px'
                    },
                    children: [
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("style", {
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
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 12
                            },
                            children: [
                                isLoading && stages.length > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                    size: "small",
                                    style: {
                                        borderRadius: 8
                                    },
                                    className: "no-print",
                                    children: [
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Steps, {
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
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                            style: {
                                                marginTop: 8,
                                                textAlign: 'center'
                                            },
                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                isLoading && !report && stages.length === 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                    style: {
                                        borderRadius: 8,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minHeight: 200
                                    },
                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            textAlign: 'center'
                                        },
                                        children: [
                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Spin, {
                                                size: "large"
                                            }, void 0, false, {
                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                lineNumber: 382,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
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
                                error && !report && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                    style: {
                                        borderRadius: 8
                                    },
                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                        style: {
                                            textAlign: 'center',
                                            padding: 24
                                        },
                                        children: [
                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                            onRetry && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ReloadOutlined, {}, void 0, false, {
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
                                report && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                    children: [
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                            size: "small",
                                            style: {
                                                borderRadius: 8
                                            },
                                            className: "no-print",
                                            children: [
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between'
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                            style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 10
                                                            },
                                                            children: [
                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
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
                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                    children: [
                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Title, {
                                                                            level: 5,
                                                                            style: {
                                                                                margin: 0,
                                                                                fontSize: 15
                                                                            },
                                                                            children: [
                                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ThunderboltOutlined, {
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
                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Space, {
                                                            children: [
                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                                    title: "历史报告",
                                                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                        size: "small",
                                                                        icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.HistoryOutlined, {}, void 0, false, {
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
                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                                    title: "导出 Markdown",
                                                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                        size: "small",
                                                                        icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FileMarkdownOutlined, {}, void 0, false, {
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
                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                                    title: "导出 Word",
                                                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                        size: "small",
                                                                        icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FileWordOutlined, {}, void 0, false, {
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
                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                                    title: "导出 PDF",
                                                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                        size: "small",
                                                                        icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FilePdfOutlined, {}, void 0, false, {
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
                                                queryText && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        marginTop: 6,
                                                        padding: '4px 10px',
                                                        background: '#f8fafc',
                                                        borderRadius: 6
                                                    },
                                                    children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Row, {
                                                    gutter: 12,
                                                    style: {
                                                        marginTop: 12
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                                                            span: 6,
                                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
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
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                                                            span: 6,
                                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
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
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                                                            span: 6,
                                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
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
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Col, {
                                                            span: 6,
                                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Statistic, {
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
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                            id: "risk-section-entity-stats",
                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                                size: "small",
                                                style: {
                                                    borderRadius: 8,
                                                    ...highlightSection === 'entity-stats' ? {
                                                        animation: 'sectionHighlight 1s ease-in-out 2'
                                                    } : {}
                                                },
                                                title: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                                    style: {
                                                        fontSize: 13
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.TeamOutlined, {
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
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                    Object.keys(entityTypeCounts).length > 0 ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                                        children: [
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_EventBarChart.default, {
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
                                                    }, void 0, true) : entityTypeData.length > 0 ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                                        children: [
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_EventBarChart.default, {
                                                                data: entityTypeData
                                                            }, void 0, false, {
                                                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                lineNumber: 510,
                                                                columnNumber: 21
                                                            }, this)
                                                        ]
                                                    }, void 0, true) : /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                    topEntities.length > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_jsxdevruntime.Fragment, {
                                                        children: [
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                style: {
                                                                    display: 'flex',
                                                                    gap: 4,
                                                                    flexWrap: 'wrap'
                                                                },
                                                                children: topEntities.map((e, i)=>/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                        style: {
                                                                            fontSize: 11,
                                                                            borderRadius: 6,
                                                                            cursor: onJumpToGraph ? 'pointer' : 'default'
                                                                        },
                                                                        onClick: ()=>onJumpToGraph === null || onJumpToGraph === void 0 ? void 0 : onJumpToGraph(e.id || e.name, e.name, e.type),
                                                                        children: [
                                                                            onJumpToGraph ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.LinkOutlined, {
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
                                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
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
                                                    sortedEntities.length > 0 && topEntities.length === 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.List, {
                                                        size: "small",
                                                        header: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                        renderItem: ([name, { count }])=>/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.List.Item, {
                                                                style: {
                                                                    padding: '2px 0',
                                                                    cursor: onJumpToGraph ? 'pointer' : 'default'
                                                                },
                                                                onClick: ()=>onJumpToGraph === null || onJumpToGraph === void 0 ? void 0 : onJumpToGraph(name, name, 'Entity'),
                                                                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Space, {
                                                                    style: {
                                                                        width: '100%',
                                                                        justifyContent: 'space-between'
                                                                    },
                                                                    children: [
                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
                                                                            style: {
                                                                                fontSize: 12
                                                                            },
                                                                            ellipsis: true,
                                                                            children: [
                                                                                onJumpToGraph ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.LinkOutlined, {
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
                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                            id: "risk-section-community",
                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                                size: "small",
                                                style: {
                                                    borderRadius: 8,
                                                    ...highlightSection === 'community' ? {
                                                        animation: 'sectionHighlight 1s ease-in-out 2'
                                                    } : {}
                                                },
                                                title: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                                    style: {
                                                        fontSize: 13
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ClusterOutlined, {
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
                                                        communities.length > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                    communities.length > 0 ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                        style: {
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: 10
                                                        },
                                                        children: communities.map((comm)=>{
                                                            var _comm_members;
                                                            return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                style: {
                                                                    padding: '10px 14px',
                                                                    background: '#faf5ff',
                                                                    borderRadius: 8,
                                                                    border: '1px solid #f3e8ff'
                                                                },
                                                                children: [
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                        style: {
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 8,
                                                                            marginBottom: 6
                                                                        },
                                                                        children: [
                                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                                            comm.modularity !== undefined && comm.modularity !== null && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                        style: {
                                                                            display: 'flex',
                                                                            gap: 4,
                                                                            flexWrap: 'wrap'
                                                                        },
                                                                        children: [
                                                                            (_comm_members = comm.members) === null || _comm_members === void 0 ? void 0 : _comm_members.slice(0, 15).map((m, i)=>/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
                                                                                    style: {
                                                                                        fontSize: 10,
                                                                                        borderRadius: 6,
                                                                                        cursor: onJumpToGraph ? 'pointer' : 'default'
                                                                                    },
                                                                                    onClick: ()=>onJumpToGraph === null || onJumpToGraph === void 0 ? void 0 : onJumpToGraph(m.id, m.name, m.type),
                                                                                    children: [
                                                                                        onJumpToGraph ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.LinkOutlined, {
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
                                                                            comm.members && comm.members.length > 15 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                    }, this) : /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                    (communityInfo === null || communityInfo === void 0 ? void 0 : communityInfo.algorithm) && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                            id: "risk-section-risk-paths",
                                            children: sortedPaths.length > 0 ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                                size: "small",
                                                style: {
                                                    borderRadius: 8,
                                                    ...highlightSection === 'risk-paths' ? {
                                                        animation: 'sectionHighlight 1s ease-in-out 2'
                                                    } : {}
                                                },
                                                title: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                                    style: {
                                                        fontSize: 13
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.NodeIndexOutlined, {
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
                                                extra: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Space, {
                                                    size: 4,
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                        style: {
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: 8
                                                        },
                                                        children: displayedPaths.map((path)=>{
                                                            var _path_affected_entities;
                                                            return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                style: {
                                                                    padding: '10px 12px',
                                                                    background: '#f8fafc',
                                                                    borderRadius: 6,
                                                                    borderLeft: `4px solid ${RISK_LEVEL_COLORS[path.risk_level] || '#fa8c16'}`
                                                                },
                                                                children: [
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                        style: {
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 6,
                                                                            marginBottom: 4,
                                                                            flexWrap: 'wrap'
                                                                        },
                                                                        children: [
                                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                                            path.confidence !== undefined && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                                            onJumpToGraph && ((_path_affected_entities = path.affected_entities) === null || _path_affected_entities === void 0 ? void 0 : _path_affected_entities.length) > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                                size: "small",
                                                                                type: "link",
                                                                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.EyeOutlined, {}, void 0, false, {
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
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                                    path.affected_entities && path.affected_entities.length > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                        style: {
                                                                            marginTop: 4,
                                                                            display: 'flex',
                                                                            gap: 4,
                                                                            flexWrap: 'wrap'
                                                                        },
                                                                        children: [
                                                                            path.affected_entities.slice(0, 8).map((e)=>/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                                            path.affected_entities.length > 8 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                    sortedPaths.length > 5 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
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
                                            }, this) : /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                                size: "small",
                                                style: {
                                                    borderRadius: 8
                                                },
                                                title: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                                    style: {
                                                        fontSize: 13
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.NodeIndexOutlined, {
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
                                                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                            id: "risk-section-final-report",
                                            ref: finalReportRef,
                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                                size: "small",
                                                style: {
                                                    borderRadius: 8,
                                                    border: highlightSection === 'final-report' ? '2px solid #2855D1' : undefined,
                                                    transition: 'border-color 0.5s ease',
                                                    ...highlightSection === 'final-report' ? {
                                                        animation: 'sectionHighlight 1s ease-in-out 2'
                                                    } : {}
                                                },
                                                title: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                                    style: {
                                                        fontSize: 13
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FileTextOutlined, {
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
                                                extra: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Space, {
                                                    size: 4,
                                                    className: "no-print",
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                            title: "导出 Markdown",
                                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                size: "small",
                                                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FileMarkdownOutlined, {}, void 0, false, {
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
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                            title: "导出 Word",
                                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                size: "small",
                                                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FileWordOutlined, {}, void 0, false, {
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
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                            title: "导出 PDF",
                                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                size: "small",
                                                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FilePdfOutlined, {}, void 0, false, {
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
                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                        style: {
                                                            display: 'flex',
                                                            alignItems: 'flex-start',
                                                            justifyContent: 'space-between',
                                                            flexWrap: 'wrap',
                                                            gap: 12,
                                                            marginBottom: 12
                                                        },
                                                        children: [
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                style: {
                                                                    flex: 1,
                                                                    minWidth: 200
                                                                },
                                                                children: [
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Title, {
                                                                        level: 5,
                                                                        style: {
                                                                            margin: '0 0 8px',
                                                                            fontSize: 15
                                                                        },
                                                                        children: [
                                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ThunderboltOutlined, {
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
                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Paragraph, {
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
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                style: {
                                                                    textAlign: 'center',
                                                                    flexShrink: 0
                                                                },
                                                                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                    style: {
                                                                        display: 'inline-block',
                                                                        padding: '10px 20px',
                                                                        borderRadius: 12,
                                                                        background: RISK_LEVEL_BG[report.overall_risk_level] || RISK_LEVEL_BG.medium,
                                                                        border: `2px solid ${RISK_LEVEL_COLORS[report.overall_risk_level] || RISK_LEVEL_COLORS.medium}`
                                                                    },
                                                                    children: [
                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
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
                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                            style: {
                                                                                fontSize: 20,
                                                                                fontWeight: 700,
                                                                                color: '#1e293b',
                                                                                marginTop: 4
                                                                            },
                                                                            children: [
                                                                                riskScore,
                                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
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
                                                    report.anomaly_findings && report.anomaly_findings.length > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Collapse, {
                                                        size: "small",
                                                        ghost: true,
                                                        style: {
                                                            marginBottom: 8
                                                        },
                                                        items: [
                                                            {
                                                                key: 'anomalies',
                                                                label: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                                                    style: {
                                                                        fontSize: 12
                                                                    },
                                                                    children: [
                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.BulbOutlined, {
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
                                                                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                    style: {
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        gap: 8
                                                                    },
                                                                    children: report.anomaly_findings.map((anomaly, idx)=>/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                            style: {
                                                                                padding: '8px 12px',
                                                                                background: '#fffbeb',
                                                                                borderRadius: 6,
                                                                                border: '1px solid #fef3c7'
                                                                            },
                                                                            children: [
                                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                                    style: {
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        gap: 8,
                                                                                        marginBottom: 4,
                                                                                        flexWrap: 'wrap'
                                                                                    },
                                                                                    children: [
                                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Progress, {
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
                                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                                                anomaly.affected_entities && anomaly.affected_entities.length > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                                    style: {
                                                                                        marginTop: 4,
                                                                                        display: 'flex',
                                                                                        gap: 4,
                                                                                        flexWrap: 'wrap'
                                                                                    },
                                                                                    children: [
                                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                                                        anomaly.affected_entities.map((e)=>/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                    report.compliance_matches && report.compliance_matches.length > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Collapse, {
                                                        size: "small",
                                                        ghost: true,
                                                        style: {
                                                            marginBottom: 8
                                                        },
                                                        items: [
                                                            {
                                                                key: 'compliance',
                                                                label: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
                                                                    style: {
                                                                        fontSize: 12
                                                                    },
                                                                    children: [
                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.SafetyOutlined, {
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
                                                                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                    style: {
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        gap: 8
                                                                    },
                                                                    children: report.compliance_matches.map((match, idx)=>/*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                            style: {
                                                                                padding: '8px 12px',
                                                                                background: '#faf5ff',
                                                                                borderRadius: 6,
                                                                                border: '1px solid #f3e8ff'
                                                                            },
                                                                            children: [
                                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                                    style: {
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        gap: 6,
                                                                                        marginBottom: 4,
                                                                                        flexWrap: 'wrap'
                                                                                    },
                                                                                    children: [
                                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                                                        match.article && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                                                        match.confidence !== undefined && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                    report.integrated_report || report.markdown_report ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
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
                                                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_reactmarkdown.default, {
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
                                                    sortedRecommendations.length > 0 && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                        style: {
                                                            marginTop: 12
                                                        },
                                                        children: [
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                style: {
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: 8
                                                                },
                                                                children: sortedRecommendations.map((rec, idx)=>{
                                                                    const urgency = URGENCY_TAGS[rec.urgency] || URGENCY_TAGS.normal;
                                                                    const trendIcon = rec.urgency === 'urgent' ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.RiseOutlined, {}, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 907,
                                                                        columnNumber: 70
                                                                    }, this) : rec.urgency === 'low' ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FallOutlined, {}, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 907,
                                                                        columnNumber: 113
                                                                    }, this) : /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.MinusOutlined, {}, void 0, false, {
                                                                        fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                                                        lineNumber: 907,
                                                                        columnNumber: 132
                                                                    }, this);
                                                                    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
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
                                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("span", {
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
                                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                                style: {
                                                                                    flex: 1
                                                                                },
                                                                                children: [
                                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                                                    /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                                                        style: {
                                                                                            marginTop: 4,
                                                                                            display: 'flex',
                                                                                            gap: 4,
                                                                                            flexWrap: 'wrap'
                                                                                        },
                                                                                        children: [
                                                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                                            /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Space, {
                                                                                size: 4,
                                                                                className: "no-print",
                                                                                children: [
                                                                                    onAddMonitor && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                                                        title: "加入监控",
                                                                                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                                            size: "small",
                                                                                            type: "primary",
                                                                                            ghost: true,
                                                                                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.PlusOutlined, {}, void 0, false, {
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
                                                                                    onGenerateTicket && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                                                                        title: "生成工单",
                                                                                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                                                            size: "small",
                                                                                            icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FileTextOutlined, {}, void 0, false, {
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
                                        error && report && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Card, {
                                            size: "small",
                                            style: {
                                                borderRadius: 8,
                                                border: '1px solid #ffccc7'
                                            },
                                            className: "no-print",
                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                report && /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
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
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                            title: "实体统计",
                                            placement: "left",
                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                size: "small",
                                                type: "text",
                                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.TeamOutlined, {}, void 0, false, {
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
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                            title: "群体发现",
                                            placement: "left",
                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                size: "small",
                                                type: "text",
                                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.ClusterOutlined, {}, void 0, false, {
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
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                            title: "风险传导路径",
                                            placement: "left",
                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                size: "small",
                                                type: "text",
                                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.NodeIndexOutlined, {}, void 0, false, {
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
                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tooltip, {
                                            title: "综合风险报告",
                                            placement: "left",
                                            children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Button, {
                                                size: "small",
                                                type: "text",
                                                icon: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.FileTextOutlined, {}, void 0, false, {
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
                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Drawer, {
                            title: "历史报告",
                            open: historyOpen,
                            onClose: ()=>setHistoryOpen(false),
                            width: 360,
                            children: historyLoading ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                style: {
                                    textAlign: 'center',
                                    padding: 40
                                },
                                children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Spin, {
                                    indicator: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_icons.LoadingOutlined, {
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
                            }, this) : historyReports.length === 0 ? /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Empty, {
                                description: "暂无历史报告",
                                image: _antd.Empty.PRESENTED_IMAGE_SIMPLE
                            }, void 0, false, {
                                fileName: "src/pages/KnowledgeQA/components/RiskReportPanel.tsx",
                                lineNumber: 1040,
                                columnNumber: 11
                            }, this) : /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.List, {
                                dataSource: historyReports,
                                renderItem: (item)=>{
                                    var _item_overall_risk_level;
                                    return /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.List.Item, {
                                        style: {
                                            cursor: 'pointer',
                                            padding: '10px 12px',
                                            borderRadius: 6
                                        },
                                        onClick: ()=>loadHistoryReport(item.report_id),
                                        children: /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                            style: {
                                                width: '100%'
                                            },
                                            children: [
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)("div", {
                                                    style: {
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between'
                                                    },
                                                    children: [
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                        /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(_antd.Tag, {
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
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
                                                /*#__PURE__*/ (0, _jsxdevruntime.jsxDEV)(Text, {
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
        }
    }
}, function(runtime) {
    runtime._h = '3753884904185762120';
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

//# sourceMappingURL=p__KnowledgeQA__index-async.1879709747579497210.hot-update.js.map