import {
  SafetyCertificateOutlined,
  AlertOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClusterOutlined,
} from '@ant-design/icons';
import { Card, Progress, Row, Col, Statistic, Tag, Typography, Spin } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import type { Community, QualityMetrics } from '../service';
import { getCommunityQuality } from '../service';

const { Text } = Typography;

const RISK_COLORS: Record<string, string> = {
  high: '#f5222d',
  medium: '#faad14',
  low: '#52c41a',
};

const RISK_LABELS: Record<string, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
};

const RISK_ICONS: Record<string, React.ReactNode> = {
  high: <AlertOutlined />,
  medium: <WarningOutlined />,
  low: <CheckCircleOutlined />,
};

interface RiskAssessmentProps {
  community: Community;
}

function deriveRiskLevel(community: Community): { level: string; score: number } {
  const labelDist = community.label_distribution || {};
  const hasEvent = Object.keys(labelDist).some((l) =>
    ['Event', 'RiskEvent', '事件', '风险事件'].includes(l),
  );
  const hasRegulation = Object.keys(labelDist).some((l) =>
    ['Regulation', '法规', 'RegulatoryViolation'].includes(l),
  );

  let score = 15 + community.size * 2;
  if (hasEvent) score += 25;
  if (hasRegulation) score += 20;
  score = Math.min(score, 100);

  const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  return { level, score };
}

const RiskAssessment: React.FC<RiskAssessmentProps> = ({ community }) => {
  const { level, score } = useMemo(() => deriveRiskLevel(community), [community]);
  const [quality, setQuality] = useState<QualityMetrics | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);

  useEffect(() => {
    setQualityLoading(true);
    getCommunityQuality(community.community_id)
      .then(setQuality)
      .catch(() => setQuality(null))
      .finally(() => setQualityLoading(false));
  }, [community.community_id]);

  const labelDist = community.label_distribution || {};
  const eventCount = Object.entries(labelDist)
    .filter(([l]) => ['Event', 'RiskEvent', '事件', '风险事件'].includes(l))
    .reduce((s, [, c]) => s + c, 0);
  const regulationCount = Object.entries(labelDist)
    .filter(([l]) => ['Regulation', '法规', 'RegulatoryViolation'].includes(l))
    .reduce((s, [, c]) => s + c, 0);

  return (
    <Card
      size="small"
      title={
        <span>
          <SafetyCertificateOutlined style={{ marginRight: 6 }} />
          风险评估
        </span>
      }
    >
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <Tag
          color={RISK_COLORS[level]}
          icon={RISK_ICONS[level]}
          style={{ fontSize: 15, padding: '4px 16px', lineHeight: '24px' }}
        >
          {RISK_LABELS[level]}
        </Tag>
        <Progress
          percent={score}
          size="small"
          strokeColor={
            score >= 60 ? RISK_COLORS.high : score >= 30 ? RISK_COLORS.medium : RISK_COLORS.low
          }
          style={{ marginTop: 8 }}
          format={() => `${score}/100`}
        />
      </div>

      <Row gutter={[8, 8]}>
        <Col span={12}>
          <Statistic title="风险事件" value={eventCount} valueStyle={{ fontSize: 20 }} />
        </Col>
        <Col span={12}>
          <Statistic title="法规关联" value={regulationCount} valueStyle={{ fontSize: 20 }} />
        </Col>
        <Col span={12}>
          <Statistic title="群体规模" value={community.size} valueStyle={{ fontSize: 20 }} />
        </Col>
        <Col span={12}>
          <Statistic title="密度" value={community.density.toFixed(2)} valueStyle={{ fontSize: 20 }} />
        </Col>
      </Row>

      <div style={{ marginTop: 12 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {level === 'high'
            ? '该群体风险较高，建议重点监控其动态变化。'
            : level === 'medium'
              ? '该群体存在一定风险，建议定期审查。'
              : '该群体风险较低，常规关注即可。'}
        </Text>
      </div>

      {/* Quality Metrics Section */}
      <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#1a1a2e' }}>
          <ClusterOutlined style={{ marginRight: 4 }} />
          社区质量指标
        </div>
        {qualityLoading ? (
          <div style={{ textAlign: 'center', padding: 12 }}><Spin size="small" /></div>
        ) : quality ? (
          <Row gutter={[8, 8]}>
            <Col span={12}>
              <Statistic
                title="电导率"
                value={quality.conductance}
                valueStyle={{ fontSize: 18, color: quality.conductance < 0.3 ? '#52c41a' : '#faad14' }}
              />
              <Text type="secondary" style={{ fontSize: 10 }}>越低越好</Text>
            </Col>
            <Col span={12}>
              <Statistic
                title="覆盖率"
                value={(quality.coverage * 100).toFixed(0) + '%'}
                valueStyle={{ fontSize: 18, color: quality.coverage > 0.6 ? '#52c41a' : '#faad14' }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title="三角形数"
                value={quality.triangle_count}
                valueStyle={{ fontSize: 18 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title="聚类系数"
                value={quality.avg_clustering.toFixed(3)}
                valueStyle={{ fontSize: 18, color: quality.avg_clustering > 0.3 ? '#52c41a' : '#999' }}
              />
            </Col>
          </Row>
        ) : (
          <Text type="secondary" style={{ fontSize: 11 }}>质量指标加载失败</Text>
        )}
      </div>
    </Card>
  );
};

export default RiskAssessment;
