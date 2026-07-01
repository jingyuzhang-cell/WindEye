/**
 * GraphSkeleton.tsx — 知识图谱加载骨架屏
 * 在 FourLayerGraph 初始化期间展示，避免空白画布。
 */
import { Spin } from 'antd';
import React from 'react';

interface GraphSkeletonProps {
  visible?: boolean;
  height?: number;
}

const GraphSkeleton: React.FC<GraphSkeletonProps> = ({
  visible = true,
  height = 620,
}) => {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.88)',
        minHeight: height,
      }}
    >
      <Spin size="large" />
      <div style={{ marginTop: 16, color: '#8c8c8c', fontSize: 13 }}>
        正在加载知识图谱...
      </div>
      {/* 四层骨架条 */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginTop: 28,
        opacity: 0.4,
      }}>
        {[
          { label: '主体层', color: '#1677ff' },
          { label: '事件层', color: '#fa8c16' },
          { label: '特征层', color: '#f5222d' },
          { label: '法规层', color: '#52c41a' },
        ].map(({ label, color }) => (
          <div
            key={label}
            style={{
              width: 140,
              height: 10,
              borderRadius: 5,
              background: color,
              animation: 'pulse 1.8s ease-in-out infinite',
            }}
          >
            <style>{`
              @keyframes pulse {
                0%, 100% { opacity: 0.25; }
                50% { opacity: 0.65; }
              }
            `}</style>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GraphSkeleton;
