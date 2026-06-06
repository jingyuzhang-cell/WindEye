import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Card, Row, Col, Statistic, Form, Input, Select, Button, Slider, Drawer, Table,
  Tag, Spin, Empty, message, Modal, Space, Tooltip, Descriptions,
} from 'antd';
import {
  SearchOutlined, ExpandOutlined, AimOutlined, ExportOutlined,
  ReloadOutlined, NodeIndexOutlined, InfoCircleOutlined, CloseOutlined,
  DownloadOutlined, FileExcelOutlined, PictureOutlined, EyeOutlined,
} from '@ant-design/icons';
import G6 from '@antv/g6';
import { PageContainer } from '@ant-design/pro-components';
import type { LayerConfig } from '../../graphConfig';
import { GENERAL_CONFIG, EDGE_STYLE_MAP } from '../../graphConfig';
import LayoutSwitcher from './LayoutSwitcher';

const { Option } = Select;

interface GraphNode {
  id: string;
  name: string;
  labels: string[];
  properties: Record<string, any>;
  typeKey: string;
  color: string;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
  originalLabel: string;
  id: string;
}

interface LayerGraphPageProps {
  config: LayerConfig;
}

const LayerGraphPage: React.FC<LayerGraphPageProps> = ({ config }) => {
  const { layerName, pageTitle, nodeStyles, relationLabels, propertyMap } = config;

  const [rawData, setRawData] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailData, setDetailData] = useState<any[]>([]);
  const [detailTitle, setDetailTitle] = useState('');
  const [currentLayout, setCurrentLayout] = useState<string>('gForce');
  const [dbStats, setDbStats] = useState<{ total: number; details: any[] }>({
    total: 0,
    details: [],
  });
  const [expanding, setExpanding] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const expandedNodesRef = useRef<Set<string>>(new Set());
  const [form] = Form.useForm();

  // ─── Data Loading ─────────────────────────────────────────────────

  const loadData = useCallback(
    async (params: URLSearchParams, isSearch: boolean) => {
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
        if (isSearch && result.nodes.length === 0) {
          message.warning('未找到相关的关联节点');
        }
        setRawData({ nodes: result.nodes, edges: result.edges || [] });
        if (isSearch) message.success(`找到 ${result.nodes.length} 个关联节点`);
        expandedNodesRef.current.clear();
      } catch {
        setGraphError('后端服务连接失败，请检查服务是否启动');
        setRawData(null);
      } finally {
        setLoading(false);
      }
    },
    [layerName]
  );

  const loadFullGraph = useCallback(() => {
    const params = new URLSearchParams({ limit: '100' });
    loadData(params, false);
  }, [loadData]);

  const loadDbStatistics = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/graph/statistics?layer=${layerName}`);
      const data = await response.json();
      if (data && Array.isArray(data.details)) {
        setDbStats({ total: data.total || 0, details: data.details });
      }
    } catch {
      console.error('加载统计数据失败');
    }
  }, [layerName]);

  const handleSearch = useCallback(
    (values: any) => {
      const { keyword, layers } = values;
      const params = new URLSearchParams();
      if (keyword) params.append('q', keyword.trim());
      if (layers) params.append('depth', (layers || 1).toString());
      params.append('limit', '200');
      if (!keyword) {
        loadFullGraph();
      } else {
        loadData(params, true);
      }
    },
    [loadData, loadFullGraph]
  );

  const handleExpand = useCallback(
    async (nodeId: string) => {
      if (expandedNodesRef.current.has(nodeId)) {
        message.info('该节点已展开');
        return;
      }
      setExpanding(true);
      try {
        const response = await fetch(`/api/v1/graph/subgraph/${nodeId}?layer=${layerName}&limit=50`);
        const result = await response.json();
        if (result.nodes && result.nodes.length > 0 && rawData) {
          const existingNodeIds = new Set(rawData.nodes.map((n: any) => n.element_id || n.id));
          const existingEdgeIds = new Set(rawData.edges.map((e: any) => e.element_id || e.id));
          const newNodes = result.nodes.filter(
            (n: any) => !existingNodeIds.has(n.element_id || n.id)
          );
          const newEdges = result.edges.filter(
            (e: any) => !existingEdgeIds.has(e.element_id || e.id)
          );
          if (newNodes.length > 0 || newEdges.length > 0) {
            setRawData({
              nodes: [...rawData.nodes, ...newNodes],
              edges: [...rawData.edges, ...newEdges],
            });
            expandedNodesRef.current.add(nodeId);
            message.success(`展开 ${newNodes.length} 个新节点, ${newEdges.length} 条新关系`);
          } else {
            message.info('没有新的节点或关系');
          }
        }
      } catch {
        message.error('节点展开失败');
      } finally {
        setExpanding(false);
      }
    },
    [rawData, layerName]
  );

  // ─── Data Processing ──────────────────────────────────────────────

  const processedData = useMemo(() => {
    if (!rawData || !rawData.nodes || !rawData.nodes.length) {
      return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
    }

    var nodes = rawData.nodes.map(function (node: any) {
      var labels = node.labels || [];
      var props = node.properties || {};
      var typeKey = 'Unknown';
      for (var i = 0; i < labels.length; i++) {
        if (nodeStyles[labels[i]]) {
          typeKey = labels[i];
          break;
        }
      }
      var nodeStyle = nodeStyles[typeKey] || nodeStyles['Unknown'] || { color: '#BFBFBF', label: '未知' };
      var nodeName =
        props.name || props.COMPANY_NM || props.PERSON_NM || props.title || props.e_id || props.id || '未知';

      return {
        id: String(node.element_id || node.id),
        name: nodeName,
        labels: labels,
        properties: props,
        typeKey: typeKey,
        color: nodeStyle.color,
      } as GraphNode;
    });

    var nodeIds = new Set(nodes.map(function (n) { return n.id; }));
    var edges = rawData.edges || [];
    var links = edges
      .filter(function (e: any) {
        var src = String(e.startNodeElementId || e.source || '');
        var tgt = String(e.endNodeElementId || e.target || '');
        return nodeIds.has(src) && nodeIds.has(tgt);
      })
      .map(function (e: any) {
        var src = String(e.startNodeElementId || e.source || '');
        var tgt = String(e.endNodeElementId || e.target || '');
        var edgeLabel = e.type || e.label || '';
        return {
          source: src,
          target: tgt,
          label: relationLabels[edgeLabel] || edgeLabel,
          originalLabel: edgeLabel,
          id: String(e.element_id || e.id || src + '-' + tgt + '-' + edgeLabel),
        } as GraphLink;
      });

    return { nodes: nodes, links: links };
  }, [rawData, nodeStyles, relationLabels]);

  // ─── Layout Configuration ──────────────────────────────────────────

  var getLayoutConfig = function (layoutType: string, nodeCount: number): any {
    switch (layoutType) {
      case 'gForce':
        return { type: 'gForce', maxIteration: 200 * Math.ceil(nodeCount / 50), gravity: 5, linkDistance: 100, preventOverlap: true };
      case 'force2':
        return { type: 'force2', maxIteration: 200, linkDistance: 100, nodeStrength: -30, preventOverlap: true };
      case 'dagre':
        return { type: 'dagre', rankdir: 'TB', nodesep: 30, ranksep: 50 };
      case 'dagre-lr':
        return { type: 'dagre', rankdir: 'LR', nodesep: 30, ranksep: 50 };
      case 'circular':
        return { type: 'circular', radius: null };
      case 'concentric':
        return { type: 'concentric', minNodeSpacing: 40, equidistant: true };
      default:
        return { type: 'gForce', maxIteration: 200, gravity: 5, linkDistance: 100 };
    }
  };

  var getNodeLayer = function (typeKey: string): number {
    var style = (GENERAL_CONFIG.nodeStyles as any)[typeKey];
    if (style && style.layer !== undefined) return style.layer;
    return LAYER_NAME_MAP[config.layerName] ?? 0;
  };

  var LAYER_NAME_MAP: Record<string, number> = { 'Subject': 0, 'Event': 1, 'Feature': 2, 'Regulation': 3 };

  // ─── G6 Graph ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || !processedData.nodes.length) return;
    if (graphRef.current) {
      graphRef.current.destroy();
      graphRef.current = null;
    }

    var width = containerRef.current.scrollWidth || window.innerWidth - 400;
    var height = containerRef.current.scrollHeight || 600;
    var nodeCount = processedData.nodes.length;

    var graph = new G6.Graph({
      container: containerRef.current,
      width: width,
      height: height,
      layout: getLayoutConfig(currentLayout, nodeCount),
      modes: {
        default: ['drag-canvas', 'zoom-canvas', 'drag-node'],
      },
      defaultNode: {
        type: 'circle',
        size: 28,
        labelCfg: { position: 'bottom', offset: 6, style: { fill: '#666', fontSize: 11 } },
        style: { stroke: '#fff', lineWidth: 2 },
      },
      defaultEdge: {
        type: 'line',
        style: { endArrow: { path: G6.Arrow.triangle(6, 8, 2), fill: '#d9d9d9' }, lineWidth: 1.5 },
        labelCfg: { autoRotate: true, refY: -8, style: { fill: '#999', fontSize: 9 } },
      },
      animate: nodeCount < 200,
      renderer: 'canvas',
      fitView: true,
    });

    var g6Nodes = processedData.nodes.map(function (n) {
      return {
        id: n.id,
        label: n.name.length > 6 ? n.name.substring(0, 6) + '...' : n.name,
        style: { fill: n.color },
        typeKey: n.typeKey,
        properties: n.properties,
        labels: n.labels,
        fullName: n.name,
      };
    });

    var g6Edges = processedData.links.map(function (l) {
      var edgeColor = '#d9d9d9';
      var edgeWidth = 1.5;
      // Use EDGE_STYLE_MAP for color-coded edges based on node layer pairs
      var srcNode = g6Nodes.find(function (n) { return n.id === l.source; });
      var tgtNode = g6Nodes.find(function (n) { return n.id === l.target; });
      if (srcNode && tgtNode) {
        var srcLayer = getNodeLayer(srcNode.typeKey);
        var tgtLayer = getNodeLayer(tgtNode.typeKey);
        var key = srcLayer + '-' + tgtLayer;
        var styleConfig = (EDGE_STYLE_MAP as any)[key] || (EDGE_STYLE_MAP as any)['default'];
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
          endArrow: { path: G6.Arrow.triangle(6, 8, 2), fill: edgeColor },
        },
        originalLabel: l.originalLabel,
      };
    });

    graph.data({ nodes: g6Nodes, edges: g6Edges });
    graph.render();

    graph.on('node:click', function (evt: any) {
      var item = evt.item;
      var model = item.getModel();
      if (model.properties) {
        setSelectedNode(model as any);
        setDrawerVisible(true);
      }
    });

    graph.on('node:dblclick', function (evt: any) {
      var item = evt.item;
      var model = item.getModel();
      handleExpand(model.id);
    });

    graphRef.current = graph;

    return function () {
      if (graphRef.current) {
        graphRef.current.destroy();
        graphRef.current = null;
      }
    };
  }, [processedData, currentLayout]);

  // ─── Initial Load ──────────────────────────────────────────────────

  useEffect(() => {
    loadFullGraph();
    loadDbStatistics();
  }, []);

  // ─── Export ────────────────────────────────────────────────────────

  var handleExportPNG = useCallback(function () {
    if (graphRef.current) {
      graphRef.current.downloadFullImage(
        layerName + '-graph-' + Date.now(),
        'image/png',
        { backgroundColor: '#fff', padding: 20 }
      );
    }
  }, [layerName]);

  var handleExportCSV = useCallback(function () {
    var headers = '层级,节点类型,节点数\r\n';
    var rows = dbStats.details
      .map(function (d) { return layerName + ',' + d.label + ',' + d.value; })
      .join('\r\n');
    var csv = '﻿' + headers + rows;
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = layerName + '-stats-' + Date.now() + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    message.success('统计数据已导出');
  }, [dbStats, layerName]);

  // ─── Property Rendering ────────────────────────────────────────────

  var renderPropertyValue = function (key: string, value: any) {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    var strValue = String(value);
    var propConfig = propertyMap[key];
    if (propConfig && propConfig.isRisk && strValue && strValue !== '[]' && strValue !== '{}') {
      try {
        var parsed = JSON.parse(strValue);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return (
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={function () {
                setDetailTitle(propConfig.label || key);
                setDetailData(parsed);
                setDetailModalVisible(true);
              }}
            >
              查看详情 ({parsed.length}条)
            </Button>
          );
        }
      } catch {}
    }
    return strValue.length > 100 ? strValue.substring(0, 100) + '...' : strValue;
  };

  // ─── UI ────────────────────────────────────────────────────────────

  return (
    <PageContainer header={{ title: pageTitle, subTitle: layerName + '层知识图谱检索与可视化' }}>
      {/* Stats Cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title={layerName + '层总节点数'}
              value={dbStats.total}
              prefix={<NodeIndexOutlined />}
              loading={!dbStats.total}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="图谱当前节点数"
              value={processedData.nodes.length}
              prefix={<AimOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="图谱当前关系数"
              value={processedData.links.length}
              prefix={<ExpandOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Tooltip title="导出图谱PNG">
                <Button icon={<PictureOutlined />} size="small" onClick={handleExportPNG}>
                  PNG
                </Button>
              </Tooltip>
              <Tooltip title="导出统计CSV">
                <Button icon={<FileExcelOutlined />} size="small" onClick={handleExportCSV}>
                  CSV
                </Button>
              </Tooltip>
              <Tooltip title="刷新数据">
                <Button
                  icon={<ReloadOutlined />}
                  size="small"
                  onClick={function () {
                    loadFullGraph();
                    loadDbStatistics();
                  }}
                />
              </Tooltip>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Node-Type Stats */}
      {dbStats.details.length > 0 && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          {dbStats.details.map(function (d) {
            var color =
              (nodeStyles[d.type] && nodeStyles[d.type].color) || '#BFBFBF';
            return (
              <Col key={d.type} span={Math.max(4, Math.floor(24 / dbStats.details.length))}>
                <Card size="small" style={{ borderLeft: '3px solid ' + color }}>
                  <Statistic title={d.label} value={d.value} valueStyle={{ fontSize: 18 }} />
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Search Form */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item name="keyword">
            <Input.Search
              placeholder="输入节点名称搜索..."
              style={{ width: 320 }}
              enterButton={<SearchOutlined />}
              onSearch={function () {
                form.submit();
              }}
            />
          </Form.Item>
          <Form.Item name="layers" initialValue={2}>
            <Select style={{ width: 120 }} placeholder="穿透深度">
              {[1, 2, 3, 4, 5].map(function (n) {
                return (
                  <Option key={n} value={n}>
                    {n}层穿透
                  </Option>
                );
              })}
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
              检索
            </Button>
          </Form.Item>
          <Form.Item>
            <Button
              icon={<ReloadOutlined />}
              onClick={function () {
                form.resetFields();
                loadFullGraph();
              }}
            >
              重置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Graph Canvas */}
      <Card
        size="small"
        bodyStyle={{ padding: 0 }}
        style={{ marginBottom: 16, overflow: 'hidden' }}
        extra={
          <Space>
            <LayoutSwitcher
              currentLayout={currentLayout}
              onLayoutChange={function (layout: string) { setCurrentLayout(layout); }}
            />
            <Tooltip title="适应画布">
              <Button
                size="small"
                icon={<AimOutlined />}
                onClick={function () {
                  if (graphRef.current) graphRef.current.fitView(20);
                }}
              />
            </Tooltip>
            <Tooltip title="导出PNG">
              <Button size="small" icon={<DownloadOutlined />} onClick={handleExportPNG} />
            </Tooltip>
          </Space>
        }
        title={
          <span>
            <NodeIndexOutlined style={{ marginRight: 8 }} />
            图谱可视化 ({processedData.nodes.length}节点, {processedData.links.length}关系)
            {expanding && <Spin size="small" style={{ marginLeft: 8 }} />}
          </span>
        }
      >
        {/* Loading State */}
        {loading && (
          <div
            style={{
              height: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Spin size="large" tip="加载图谱数据中..." />
          </div>
        )}

        {/* Error State */}
        {graphError && !loading && (
          <div
            style={{
              height: 500,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ fontSize: 48, color: '#f5222d', marginBottom: 16 }}>⚠</div>
            <div style={{ color: '#f5222d', marginBottom: 8, fontSize: 14 }}>
              {graphError}
            </div>
            <Button type="primary" onClick={loadFullGraph}>
              重新加载
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !graphError && processedData.nodes.length === 0 && (
          <div
            style={{
              height: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Empty description="暂无图谱数据，请尝试检索或刷新" />
          </div>
        )}

        {/* Graph */}
        {!loading && !graphError && processedData.nodes.length > 0 && (
          <div ref={containerRef} style={{ width: '100%', height: 550 }} />
        )}
      </Card>

      {/* Node Detail Drawer */}
      <Drawer
        title={
          <span>
            <InfoCircleOutlined style={{ marginRight: 8 }} />
            节点详情 - {selectedNode ? selectedNode.name : ''}
          </span>
        }
        placement="right"
        width={480}
        open={drawerVisible}
        onClose={function () {
          setDrawerVisible(false);
          setSelectedNode(null);
        }}
      >
        {selectedNode && (
          <>
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="节点ID">{selectedNode.id}</Descriptions.Item>
              <Descriptions.Item label="节点名称">{selectedNode.name}</Descriptions.Item>
              <Descriptions.Item label="节点类型">
                <Tag color={selectedNode.color}>{selectedNode.typeKey}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="标签">
                {(selectedNode.labels || []).map(function (l) {
                  return (
                    <Tag key={l} color="blue">
                      {l}
                    </Tag>
                  );
                })}
              </Descriptions.Item>
            </Descriptions>

            <h4>属性</h4>
            <Table
              dataSource={Object.entries(selectedNode.properties || {}).map(function ([
                key,
                value,
              ]) {
                return { key: key, value: value };
              })}
              columns={[
                {
                  title: '属性名',
                  dataIndex: 'key',
                  key: 'key',
                  width: 160,
                  render: function (k) {
                    return propertyMap[k] ? propertyMap[k].label : k;
                  },
                },
                {
                  title: '属性值',
                  dataIndex: 'value',
                  key: 'value',
                  render: function (val, record) {
                    return renderPropertyValue(record.key, val);
                  },
                },
              ]}
              pagination={{ pageSize: 10 }}
              size="small"
              rowKey="key"
            />
          </>
        )}
      </Drawer>

      {/* Risk Detail Modal */}
      <Modal
        title={detailTitle}
        open={detailModalVisible}
        onCancel={function () {
          setDetailModalVisible(false);
        }}
        footer={null}
        width={700}
      >
        <Table
          dataSource={detailData}
          columns={[
            {
              title: '#',
              dataIndex: 'index',
              key: 'index',
              width: 60,
              render: function (_: any, __: any, idx: number) {
                return idx + 1;
              },
            },
            {
              title: '内容',
              dataIndex: 'content',
              key: 'content',
              render: function (val: any, record: any) {
                if (typeof record === 'string') return record;
                return JSON.stringify(record, null, 2);
              },
            },
          ]}
          size="small"
          rowKey={function (_: any, idx: number) {
            return String(idx);
          }}
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </PageContainer>
  );
};

export default LayerGraphPage;
