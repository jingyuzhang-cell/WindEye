import React, { useEffect, useRef, useMemo } from 'react'
import * as echarts from 'echarts'
import { Spin, Empty, Table, Button, Tooltip, message, List, Tag, Typography } from 'antd'
import { DownloadOutlined, FileImageOutlined, SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import ReactECharts from 'echarts-for-react'
import RiskPieChart from './charts/RiskPieChart'
import EventBarChart from './charts/EventBarChart'
import TimelineChart from './charts/TimelineChart'
import { useAgentStore } from '../store/agentStore'

const { Text } = Typography

interface AnalysisPanelProps {
  onClose: () => void
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ onClose }) => {
  const { analysisResult, analysisQuery, isLoading, error } = useAgentStore()
  const backendChartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)
  const resizeObserver = useRef<ResizeObserver | null>(null)

  // ── Derived chart data from raw_data ──
  const derived = useMemo(() => {
    const raw = analysisResult?.raw_data || []
    if (!raw || raw.length === 0) {
      return { riskPie: null, entityTypes: [], topEntities: [], timelineEvents: [] }
    }

    // Risk level distribution
    let high = 0, medium = 0, low = 0
    const typeCounts = new Map<string, number>()
    const entityCounts = new Map<string, { name: string; count: number; type: string }>()
    const dateCounts = new Map<string, number>()

    for (const row of raw) {
      // Risk level
      const level = (row.risk_level || row.riskLevel || row.level || '').toLowerCase()
      if (level === 'high' || level === '高') high++
      else if (level === 'medium' || level === '中') medium++
      else if (level === 'low' || level === '低') low++

      // Entity type / Event type
      const t = row.type || row.entity_type || row.event_type || row.category || 'Other'
      typeCounts.set(t, (typeCounts.get(t) || 0) + 1)

      // Entity name
      const name = row.name || row.title || row.entity_name || row.company || ''
      if (name) {
        const existing = entityCounts.get(name)
        if (existing) {
          existing.count++
        } else {
          entityCounts.set(name, { name, count: 1, type: t })
        }
      }

      // Date / timestamp
      const dateField =
        row.date || row.timestamp || row.time || row.event_date || row.release_date || row.created_at || ''
      if (dateField) {
        const dateStr = String(dateField).slice(0, 10)
        dateCounts.set(dateStr, (dateCounts.get(dateStr) || 0) + 1)
      }
    }

    const riskPie = high + medium + low > 0 ? { high, medium, low } : null

    const entityTypes = Array.from(typeCounts.entries())
      .map(([name, count], idx) => ({
        name,
        count,
        color: ['#1890ff', '#52c41a', '#fa8c16', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96'][idx % 7],
      }))
      .sort((a, b) => b.count - a.count)

    const topEntities = Array.from(entityCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const timelineEvents = Array.from(dateCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return { riskPie, entityTypes, topEntities, timelineEvents }
  }, [analysisResult])

  // ── Export ──
  const handleExportImage = () => {
    if (!chartInstance.current) {
      message.warning('Chart not ready')
      return
    }
    try {
      const dataURL = chartInstance.current.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#fff',
      })
      const link = document.createElement('a')
      link.download = `chart_${Date.now()}.png`
      link.href = dataURL
      link.click()
      message.success('Chart exported')
    } catch {
      message.error('Export failed')
    }
  }

  const handleExportCSV = () => {
    const raw = analysisResult?.raw_data
    if (!raw || raw.length === 0) {
      message.warning('No data to export')
      return
    }
    try {
      const headers = Object.keys(raw[0])
      const csvRows = [
        headers.join(','),
        ...raw.map((row) =>
          headers
            .map((h) => {
              const val = row[h]
              return `"${('' + (val ?? '')).replace(/"/g, '""')}"`
            })
            .join(',')
        ),
      ]
      const csvString = '﻿' + csvRows.join('\n')
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `data_${Date.now()}.csv`)
      link.click()
      URL.revokeObjectURL(url)
      message.success('CSV exported')
    } catch {
      message.error('Export failed')
    }
  }

  // ── Table columns ──
  const columns: ColumnsType<any> = useMemo(() => {
    const raw = analysisResult?.raw_data
    if (!raw || raw.length === 0) return []
    return Object.keys(raw[0]).map((key) => ({
      title: key,
      dataIndex: key,
      key,
      sorter: (a: any, b: any) => {
        const valA = a[key]
        const valB = b[key]
        if (typeof valA === 'number' && typeof valB === 'number') return valA - valB
        return String(valA).localeCompare(String(valB))
      },
      ellipsis: true,
    }))
  }, [analysisResult?.raw_data])

  // ── Backend echarts instance ──
  useEffect(() => {
    if (!backendChartRef.current) return
    chartInstance.current = echarts.init(backendChartRef.current)
    resizeObserver.current = new ResizeObserver(() => {
      chartInstance.current?.resize()
    })
    resizeObserver.current.observe(backendChartRef.current)
    return () => {
      resizeObserver.current?.disconnect()
      chartInstance.current?.dispose()
      chartInstance.current = null
    }
  }, [])

  useEffect(() => {
    if (!analysisResult?.echarts_config || !chartInstance.current) {
      chartInstance.current?.clear()
      return
    }
    chartInstance.current.setOption(analysisResult.echarts_config, true)
  }, [analysisResult?.echarts_config])

  // ── Entity click → jump to graph ──
  const handleEntityClick = (entityName: string) => {
    useAgentStore.setState({ activeRightPanel: 'graph' })
    window.dispatchEvent(
      new CustomEvent('focusGraphEntity', { detail: { entityId: entityName, entityName, entityType: 'Entity' } })
    )
  }

  const handleTimelineClick = (date: string) => {
    message.info(`Filtering by date: ${date}`)
  }

  // ── Empty state ──
  if (!analysisResult && !isLoading && !error) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span style={{ color: '#94a3b8', fontSize: 14 }}>Start a data analysis query on the left</span>}
        />
      </div>
    )
  }

  const hasRawData = analysisResult?.raw_data && analysisResult.raw_data.length > 0
  const hasEchartsConfig = !!analysisResult?.echarts_config

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <rect x="1" y="3" width="14" height="10" rx="2" stroke="#6c8ef5" strokeWidth="1.4" />
            <path d="M4 7h8M4 10h5" stroke="#6c8ef5" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span style={styles.headerTitle}>Analysis Dashboard</span>
          {analysisQuery && <span style={styles.queryBadge}>{analysisQuery}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasEchartsConfig && (
            <Tooltip title="Export backend chart">
              <Button type="text" icon={<FileImageOutlined style={{ color: '#64748b' }} />} onClick={handleExportImage} />
            </Tooltip>
          )}
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {isLoading && !analysisResult && (
          <div style={styles.loadingOverlay}>
            <Spin tip="Analyzing data..." size="large" />
          </div>
        )}
        {error && <div style={styles.errorBanner}>{error}</div>}

        {/* Dashboard grid: 2×2 */}
        <div style={styles.dashboardGrid}>
          {/* Cell 1: Risk Distribution Pie */}
          <div style={styles.chartCell}>
            <div style={styles.cellHeader}>
              <Text strong style={{ fontSize: 12 }}>Risk Distribution</Text>
            </div>
            <div style={styles.cellBody}>
              {derived.riskPie ? (
                <RiskPieChart
                  highCount={derived.riskPie.high}
                  mediumCount={derived.riskPie.medium}
                  lowCount={derived.riskPie.low}
                />
              ) : (
                <div style={styles.noChartData}>No risk level data</div>
              )}
            </div>
          </div>

          {/* Cell 2: Entity Type Distribution Bar */}
          <div style={styles.chartCell}>
            <div style={styles.cellHeader}>
              <Text strong style={{ fontSize: 12 }}>Entity Type Distribution</Text>
            </div>
            <div style={styles.cellBody}>
              {derived.entityTypes.length > 0 ? (
                <EventBarChart data={derived.entityTypes} />
              ) : (
                <div style={styles.noChartData}>No entity type data</div>
              )}
            </div>
          </div>

          {/* Cell 3: Top 10 Entities */}
          <div style={styles.chartCell}>
            <div style={styles.cellHeader}>
              <Text strong style={{ fontSize: 12 }}>Top Entities ({derived.topEntities.length})</Text>
            </div>
            <div style={{ ...styles.cellBody, overflow: 'auto' }}>
              {derived.topEntities.length > 0 ? (
                <List
                  size="small"
                  dataSource={derived.topEntities}
                  renderItem={(item, idx) => (
                    <List.Item
                      style={{ padding: '3px 0', cursor: 'pointer' }}
                      onClick={() => handleEntityClick(item.name)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            display: 'inline-flex',
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: idx < 3 ? '#2855D1' : '#e2e8f0',
                            color: idx < 3 ? '#fff' : '#64748b',
                            fontSize: 10,
                            fontWeight: 600,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {idx + 1}
                          </span>
                          <Text style={{ fontSize: 11 }} ellipsis>{item.name}</Text>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Tag style={{ fontSize: 9, borderRadius: 4, margin: 0, lineHeight: '16px' }}>{item.type}</Tag>
                          <Text type="secondary" style={{ fontSize: 10 }}>{item.count}x</Text>
                        </div>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <div style={styles.noChartData}>No entity data</div>
              )}
            </div>
          </div>

          {/* Cell 4: Timeline */}
          <div style={styles.chartCell}>
            <div style={styles.cellHeader}>
              <Text strong style={{ fontSize: 12 }}>Event Timeline</Text>
            </div>
            <div style={styles.cellBody}>
              {derived.timelineEvents.length > 0 ? (
                <TimelineChart
                  events={derived.timelineEvents}
                  onEventClick={handleTimelineClick}
                />
              ) : (
                <div style={styles.noChartData}>No time-based data</div>
              )}
            </div>
          </div>
        </div>

        {/* Backend echarts_config (collapsible, shown when exists) */}
        {hasEchartsConfig && (
          <div style={styles.backendChartSection}>
            <div style={styles.sectionHeader}>
              <Text strong style={{ fontSize: 12 }}>Advanced Analysis (Backend)</Text>
            </div>
            <div ref={backendChartRef} style={{ width: '100%', height: 250 }} />
          </div>
        )}

        {/* Raw Data Table */}
        <div style={styles.dataSection}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
              Data Preview {hasRawData && `(${analysisResult.row_count || analysisResult.raw_data.length} rows)`}
            </Text>
            {hasRawData && (
              <Button
                type="primary"
                ghost
                size="small"
                icon={<DownloadOutlined />}
                onClick={handleExportCSV}
                style={{ fontSize: 11, borderRadius: 4, height: 24 }}
              >
                Export CSV
              </Button>
            )}
          </div>
          {hasRawData ? (
            <div style={styles.tableWrapper}>
              <Table
                dataSource={analysisResult.raw_data}
                columns={columns}
                rowKey={(_record, index) => index?.toString() || ''}
                pagination={{ pageSize: 10, size: 'small', showSizeChanger: false, style: { marginBottom: 0 } }}
                size="middle"
                scroll={{ y: 'calc(100% - 40px)' }}
              />
            </div>
          ) : (
            <div style={styles.noDataPlaceholder}>
              {isLoading ? 'Fetching data...' : 'No raw data available'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', borderBottom: '1px solid #f0f0f5', background: '#fafafa', flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' },
  headerTitle: { fontSize: 14, fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' },
  queryBadge: {
    fontSize: 11, color: '#6c8ef5', background: 'rgba(108,142,245,0.1)',
    padding: '2px 8px', borderRadius: 10, overflow: 'hidden', textOverflow: 'ellipsis',
    whiteSpace: 'nowrap', maxWidth: 200,
  },
  closeBtn: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center', flexShrink: 0 },
  content: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' },
  loadingOverlay: {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.8)', zIndex: 10,
  },
  errorBanner: { padding: '8px 16px', background: '#fef2f2', color: '#dc2626', fontSize: 12, borderBottom: '1px solid #fee2e2', flexShrink: 0 },
  dashboardGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: '1fr 1fr',
    gap: 10,
    padding: 12,
    minHeight: 450,
    flexShrink: 0,
  },
  chartCell: {
    background: '#fafbfc',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  cellHeader: { padding: '6px 10px', borderBottom: '1px solid #f0f0f5', flexShrink: 0 },
  cellBody: { flex: 1, padding: 8, position: 'relative', minHeight: 0 },
  noChartData: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#cbd5e1', fontSize: 12 },
  backendChartSection: {
    margin: '0 12px 8px',
    padding: 8,
    background: '#fafbfc',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    flexShrink: 0,
  },
  sectionHeader: { marginBottom: 4 },
  dataSection: { flex: 1, display: 'flex', flexDirection: 'column', padding: '0 12px 12px', overflow: 'hidden', minHeight: 150 },
  tableWrapper: { flex: 1, overflow: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' },
  noDataPlaceholder: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#94a3b8', fontSize: 13, background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0',
  },
}

export default AnalysisPanel
