import React, { useEffect, useRef } from 'react'
import {
  EyeOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  CopyOutlined,
} from '@ant-design/icons'

export interface NodeContextMenuProps {
  visible: boolean
  x: number
  y: number
  nodeId: string
  nodeName: string
  nodeType: string
  onClose: () => void
  onViewDetail: () => void
  onExpand: () => void
  onGenerateReport: () => void
}

const menuItems = [
  { key: 'detail', icon: <EyeOutlined />, label: 'View Detail' },
  { key: 'expand', icon: <ApartmentOutlined />, label: 'Expand Connections' },
  { key: 'report', icon: <FileTextOutlined />, label: 'Generate Risk Report' },
  { key: 'copy', icon: <CopyOutlined />, label: 'Copy Node Name' },
]

const NodeContextMenu: React.FC<NodeContextMenuProps> = ({
  visible,
  x,
  y,
  nodeId,
  nodeName,
  nodeType,
  onClose,
  onViewDetail,
  onExpand,
  onGenerateReport,
}) => {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [visible, onClose])

  useEffect(() => {
    if (!visible) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [visible, onClose])

  if (!visible) return null

  const handleAction = (key: string) => {
    switch (key) {
      case 'detail': onViewDetail(); break
      case 'expand': onExpand(); break
      case 'report': onGenerateReport(); break
      case 'copy':
        navigator.clipboard.writeText(nodeName).catch(() => {
          const ta = document.createElement('textarea')
          ta.value = nodeName
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
        })
        break
    }
    onClose()
  }

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - (menuItems.length * 36 + 16))

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 10000,
        background: '#fff',
        borderRadius: 10,
        boxShadow: '0 8px 30px rgba(15, 23, 42, 0.18)',
        border: '1px solid #e2e8f0',
        padding: '4px 0',
        minWidth: 190,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        style={{
          padding: '5px 14px 7px',
          borderBottom: '1px solid #f1f5f9',
          fontSize: 11,
          color: '#94a3b8',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {nodeType}
      </div>
      {menuItems.map((item) => (
        <div
          key={item.key}
          onClick={() => handleAction(item.key)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 14px',
            cursor: 'pointer',
            fontSize: 13,
            color: '#334155',
            transition: 'background 0.12s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f1f5f9'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <span style={{ width: 16, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
            {item.icon}
          </span>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

export default NodeContextMenu
