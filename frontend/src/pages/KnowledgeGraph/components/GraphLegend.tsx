/**
 * GraphLegend.tsx — 四层知识图谱图例面板
 * 展示：节点颜色层 / 边线型 / 常见形状
 * 可折叠，默认折叠
 */
import {
  CaretDownOutlined,
  CaretRightOutlined,
} from '@ant-design/icons';
import { Button, Space, Tag, Tooltip } from 'antd';
import React, { useState } from 'react';
import type { GraphFilterLayer } from '@/types/knowledgeGraph';
import {
  LAYER_COLORS,
  NODE_SIZE_BY_LAYER,
  NODE_SHAPE_MAP,
  EDGE_CROSS_LAYER_SPEC,
  EDGE_INTRA_LAYER_SPEC,
} from '../config/visualTheme';

export interface GraphLegendProps {
  currentNodeCounts: Partial<Record<GraphFilterLayer, number>>;
}

const LAYER_ORDER: GraphFilterLayer[] = ['Subject', 'Event', 'Feature', 'Regulation'];

/** 节点形状 → 中文描述映射 */
const SHAPE_LABELS: Record<string, string> = {
  circle: '圆形', rect: '方形', diamond: '菱形', hexagon: '六边形',
  triangle: '三角形', invertedTriangle: '倒三角', ellipse: '椭圆',
  roundRect: '圆角矩形', parallelogram: '平行四边形', star: '五角星',
};

/** 常⻅形状示例类型 */
const SHAPE_EXAMPLES: Array<{
  shape: string;
  type: string;
  layer: GraphFilterLayer;
}> = [
  { shape: 'circle', type: 'PERSON / EVENT / Law', layer: 'Subject' },
  { shape: 'rect', type: 'COMPANY / Action', layer: 'Subject' },
  { shape: 'diamond', type: 'PFUND / RiskFactor', layer: 'Event' },
  { shape: 'hexagon', type: 'SECURITY / REGULATOR', layer: 'Feature' },
  { shape: 'triangle', type: 'Actor / Restriction', layer: 'Feature' },
  { shape: 'star', type: 'Advantage / Punishment', layer: 'Regulation' },
];

const EDGE_STYLE_EXAMPLES = [
  {
    label: 'Subject ↔ Event',
    style: EDGE_CROSS_LAYER_SPEC['Subject-Event'],
    desc: '核心关联（实线）',
  },
  {
    label: 'Event ↔ Feature',
    style: EDGE_CROSS_LAYER_SPEC['Event-Feature'],
    desc: '中间链路（虚线）',
  },
  {
    label: 'Feature ↔ Regulation',
    style: EDGE_CROSS_LAYER_SPEC['Feature-Regulation'],
    desc: '法规链路（点线）',
  },
  {
    label: '同层关系',
    style: EDGE_INTRA_LAYER_SPEC,
    desc: '辅助关系（浅灰实线）',
  },
];

const GraphLegend: React.FC<GraphLegendProps> = ({ currentNodeCounts }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: '1px solid #f0f0f0',
      background: '#fafafa',
      fontSize: 12,
    }}>
      {/* 折叠标题栏：四层颜色 + 当前节点数 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6,
      }}>
        <Space size={6} wrap>
          {LAYER_ORDER.map(layer => (
            <Tooltip key={layer} title={`${LAYER_COLORS[layer].label}`}>
              <Tag
                color={LAYER_COLORS[layer].color}
                style={{ cursor: 'default', margin: 0 }}
              >
                ● {LAYER_COLORS[layer].label} {(currentNodeCounts[layer] || 0).toLocaleString()}
              </Tag>
            </Tooltip>
          ))}
        </Space>
        <Button
          type="link"
          size="small"
          icon={expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
          onClick={() => setExpanded(v => !v)}
          style={{ padding: '0 4px', fontSize: 12 }}
        >
          {expanded ? '收起图例' : '展开图例'}
        </Button>
      </div>

      {/* 展开内容：形状 + 边样式 */}
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {/* 节点形状说明 */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 600, marginRight: 8 }}>节点形状：</span>
            <Space size={[4, 4]} wrap>
              {SHAPE_EXAMPLES.map(({ shape, type, layer }) => {
                const { color } = LAYER_COLORS[layer];
                return (
                  <Tooltip
                    key={`${shape}-${type}`}
                    title={`${SHAPE_LABELS[shape] || shape} — ${type}`}
                  >
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '1px 6px',
                      border: '1px solid #e8e8e8',
                      borderRadius: 4,
                      background: '#fff',
                      cursor: 'default',
                    }}>
                      <ShapeIcon shape={shape} color={color} size={12} />
                      <span style={{ color: '#595959' }}>{SHAPE_LABELS[shape] || shape}</span>
                    </span>
                  </Tooltip>
                );
              })}
            </Space>
          </div>

          {/* 边样式说明 */}
          <div>
            <span style={{ fontWeight: 600, marginRight: 8 }}>关系样式：</span>
            <Space size={[4, 4]} wrap>
              {EDGE_STYLE_EXAMPLES.map(({ label, style, desc }) => (
                <Tooltip key={label} title={desc}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '1px 6px',
                    border: '1px solid #e8e8e8',
                    borderRadius: 4,
                    background: '#fff',
                    cursor: 'default',
                  }}>
                    <EdgeDashPreview
                      dashPattern={style.dashPattern}
                      stroke={style.stroke}
                      lineWidth={style.lineWidth}
                    />
                    <span style={{ color: '#595959' }}>{label}</span>
                  </span>
                </Tooltip>
              ))}
            </Space>
          </div>
        </div>
      )}
    </div>
  );
};

/** 小型形状图标（SVG） */
const ShapeIcon: React.FC<{ shape: string; color: string; size: number }> = ({
  shape, color, size,
}) => {
  const s = size;
  const half = s / 2;

  const shapeSvg = (): React.ReactNode => {
    switch (shape) {
      case 'rect':
        return <rect x={-half + 1} y={-half * 0.65} width={s - 2} height={s * 0.65} rx={2} fill={color} />;
      case 'diamond':
        return <polygon points={`0,${-half + 1} ${half - 2},0 0,${half - 1} ${-half + 2},0`} fill={color} />;
      case 'triangle':
        return <polygon points={`0,${-half + 1} ${half - 1},${half - 1} ${-half + 1},${half - 1}`} fill={color} />;
      case 'hexagon': {
        const pts = Array.from({ length: 6 }, (_, i) => {
          const angle = (Math.PI / 180) * (30 + 60 * i);
          return `${Math.cos(angle) * (half - 1)},${Math.sin(angle) * (half - 1)}`;
        }).join(' ');
        return <polygon points={pts} fill={color} />;
      }
      case 'star': {
        const pts = Array.from({ length: 10 }, (_, i) => {
          const angle = (Math.PI / 180) * (-90 + 36 * i);
          const r = i % 2 === 0 ? half - 1 : (half - 1) * 0.4;
          return `${Math.cos(angle) * r},${Math.sin(angle) * r}`;
        }).join(' ');
        return <polygon points={pts} fill={color} />;
      }
      default:
        return <circle r={half - 1} fill={color} />;
    }
  };

  return (
    <svg width={s} height={s} viewBox={`${-half} ${-half} ${s} ${s}`}>
      {shapeSvg()}
    </svg>
  );
};

/** 小型边样式预览（SVG 线段） */
const EdgeDashPreview: React.FC<{
  dashPattern: number[] | undefined;
  stroke: string;
  lineWidth: number;
}> = ({ dashPattern, stroke, lineWidth }) => (
  <svg width={32} height={14} viewBox="0 0 32 14">
    <line
      x1={2} y1={7} x2={30} y2={7}
      stroke={stroke}
      strokeWidth={Math.max(1, lineWidth)}
      strokeDasharray={dashPattern?.join(',') || undefined}
    />
  </svg>
);

export default GraphLegend;
