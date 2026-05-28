import React from 'react'
import { Button, Tooltip, Space } from 'antd'
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  CameraOutlined,
  FileImageOutlined,
  ApartmentOutlined,
  VerticalAlignTopOutlined,
  RadiusSettingOutlined,
  FilterOutlined,
} from '@ant-design/icons'

export type LayoutMode = 'force' | 'dagre' | 'circular'

export interface GraphToolbarProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFitView: () => void
  onToggleFullscreen: () => void
  isFullscreen: boolean
  onExportImage: (format: 'png' | 'svg') => void
  onChangeLayout: (mode: LayoutMode) => void
  layoutMode: LayoutMode
  onTogglePathOnly: () => void
  pathOnly: boolean
  hasPaths: boolean
}

const btnStyle: React.CSSProperties = {
  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  border: '1px solid #e2e8f0',
  background: '#fff',
}

const GraphToolbar: React.FC<GraphToolbarProps> = ({
  onZoomIn,
  onZoomOut,
  onFitView,
  onToggleFullscreen,
  isFullscreen,
  onExportImage,
  onChangeLayout,
  layoutMode,
  onTogglePathOnly,
  pathOnly,
  hasPaths,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Zoom & View */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '4px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
        <Tooltip title="Zoom In" placement="left">
          <Button type="text" size="small" icon={<ZoomInOutlined />} onClick={onZoomIn} style={{ border: 'none', boxShadow: 'none' }} />
        </Tooltip>
        <Tooltip title="Zoom Out" placement="left">
          <Button type="text" size="small" icon={<ZoomOutOutlined />} onClick={onZoomOut} style={{ border: 'none', boxShadow: 'none' }} />
        </Tooltip>
        <Tooltip title="Fit View" placement="left">
          <Button type="text" size="small" icon={<ExpandOutlined />} onClick={onFitView} style={{ border: 'none', boxShadow: 'none' }} />
        </Tooltip>
        <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} placement="left">
          <Button
            type="text"
            size="small"
            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={onToggleFullscreen}
            style={{ border: 'none', boxShadow: 'none' }}
          />
        </Tooltip>
      </div>

      {/* Export */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '4px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
        <Tooltip title="Export PNG" placement="left">
          <Button type="text" size="small" icon={<CameraOutlined />} onClick={() => onExportImage('png')} style={{ border: 'none', boxShadow: 'none' }} />
        </Tooltip>
        <Tooltip title="Export SVG" placement="left">
          <Button type="text" size="small" icon={<FileImageOutlined />} onClick={() => onExportImage('svg')} style={{ border: 'none', boxShadow: 'none' }} />
        </Tooltip>
      </div>

      {/* Layout */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '4px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
        <Tooltip title={`Force Layout${layoutMode === 'force' ? ' (active)' : ''}`} placement="left">
          <Button
            type={layoutMode === 'force' ? 'primary' : 'text'}
            size="small"
            icon={<ApartmentOutlined />}
            onClick={() => onChangeLayout('force')}
            style={{ border: 'none', boxShadow: 'none' }}
          />
        </Tooltip>
        <Tooltip title={`Hierarchical Layout${layoutMode === 'dagre' ? ' (active)' : ''}`} placement="left">
          <Button
            type={layoutMode === 'dagre' ? 'primary' : 'text'}
            size="small"
            icon={<VerticalAlignTopOutlined />}
            onClick={() => onChangeLayout('dagre')}
            style={{ border: 'none', boxShadow: 'none' }}
          />
        </Tooltip>
        <Tooltip title={`Circular Layout${layoutMode === 'circular' ? ' (active)' : ''}`} placement="left">
          <Button
            type={layoutMode === 'circular' ? 'primary' : 'text'}
            size="small"
            icon={<RadiusSettingOutlined />}
            onClick={() => onChangeLayout('circular')}
            style={{ border: 'none', boxShadow: 'none' }}
          />
        </Tooltip>
      </div>

      {/* Path Filter */}
      {hasPaths && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '4px 0', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
          <Tooltip title={pathOnly ? 'Show All Nodes' : 'Show Path Nodes Only'} placement="left">
            <Button
              type={pathOnly ? 'primary' : 'text'}
              size="small"
              icon={<FilterOutlined />}
              onClick={onTogglePathOnly}
              style={{ border: 'none', boxShadow: 'none' }}
            />
          </Tooltip>
        </div>
      )}
    </div>
  )
}

export default GraphToolbar
