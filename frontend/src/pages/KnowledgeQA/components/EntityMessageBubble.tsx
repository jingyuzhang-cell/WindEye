import React, { useState } from 'react'
import { Typography } from 'antd'
import { UserOutlined, RobotOutlined, InfoCircleOutlined, BugOutlined, CaretRightOutlined } from '@ant-design/icons'
import type { ChatMessage } from '../types/api'
import { DESIGN_TOKENS } from '../styles/constants'

const { Text } = Typography

interface Entity {
  id: string
  type: string
  text: string
}

interface MessageEntity {
  id: string
  type: string
  start: number
  end: number
  text: string
}

interface EntityMessageBubbleProps {
  message: ChatMessage
  onEntityHover?: (entityId: string | null) => void
  onEntityClick?: (entity: Entity) => void
  highlightedEntity?: string | null
}

const formatTime = (ts: number) => {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

const extractEntities = (text: string, recommendations: any[]): MessageEntity[] => {
  const entities: MessageEntity[] = []
  const addedIds = new Set<string>()

  const addEntity = (id: string, type: string, start: number, end: number, textContent: string) => {
    if (!addedIds.has(id) && textContent && textContent.length > 1 && textContent.length < 30) {
      entities.push({ id, type, start, end, text: textContent })
      addedIds.add(id)
    }
  }

  recommendations?.forEach((rec) => {
    const bookRegex = /《([^》]+)》/g
    let match
    while ((match = bookRegex.exec(text)) !== null) {
      addEntity(match[1], 'COMPANY', match.index, match.index + match[0].length, match[1])
    }
  })

  recommendations?.forEach((rec) => {
    if (rec.title || (rec as any).zhTitle || (rec as any).name) {
      const entityName = (rec as any).zhTitle || rec.title || (rec as any).name
      const idx = text.indexOf(entityName)
      if (idx !== -1) {
        addEntity(entityName, 'COMPANY', idx, idx + entityName.length, entityName)
      }
    }
    if (rec.itemId && rec.itemId.length > 2 && rec.itemId.length < 50) {
      const idx = text.indexOf(rec.itemId)
      if (idx !== -1) {
        addEntity(rec.itemId, 'COMPANY', idx, idx + rec.itemId.length, rec.itemId)
      }
    }
  })

  return entities
}

export const EntityMessageBubble: React.FC<EntityMessageBubbleProps> = ({
  message,
  onEntityHover,
  onEntityClick,
  highlightedEntity,
}) => {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const [showReasoning, setShowReasoning] = useState(false)

  if (isSystem) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: DESIGN_TOKENS.ERROR_LIGHT,
            border: `1px solid ${DESIGN_TOKENS.ERROR_BORDER}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <InfoCircleOutlined style={{ color: DESIGN_TOKENS.COLOR_ERROR, fontSize: 14 }} />
        </div>
        <div
          style={{
            background: DESIGN_TOKENS.ERROR_LIGHT,
            border: `1px solid ${DESIGN_TOKENS.ERROR_BORDER}`,
            borderRadius: 14,
            padding: '10px 14px',
            maxWidth: '80%',
          }}
        >
          <Text style={{ color: DESIGN_TOKENS.COLOR_ERROR, fontSize: 13, lineHeight: 1.6 }}>
            {message.content}
          </Text>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    const recommendations = message.data?.output?.recommendations || []
    const entities = extractEntities(message.content, recommendations)

    if (entities.length === 0) {
      return <span>{message.content}</span>
    }

    const sortedEntities = [...entities].sort((a, b) => a.start - b.start)

    const parts: React.ReactNode[] = []
    let lastIndex = 0

    sortedEntities.forEach((entity, idx) => {
      if (entity.start > lastIndex) {
        parts.push(
          <span key={`text-${idx}`}>{message.content.slice(lastIndex, entity.start)}</span>
        )
      }

      const isHighlighted = highlightedEntity === entity.id
      parts.push(
        <span
          key={`entity-${idx}`}
          data-entity-id={entity.id}
          data-entity-type={entity.type}
          onMouseEnter={() => onEntityHover?.(entity.id)}
          onMouseLeave={() => onEntityHover?.(null)}
          onClick={() => onEntityClick?.({ id: entity.id, type: entity.type, text: entity.id })}
          style={{
            color: isHighlighted ? DESIGN_TOKENS.ACCENT : DESIGN_TOKENS.TEXT_PRIMARY,
            background: isHighlighted ? 'rgba(40, 85, 209, 0.2)' : 'rgba(40, 85, 209, 0.06)',
            borderBottom: `2px solid ${isHighlighted ? DESIGN_TOKENS.ACCENT : 'rgba(40, 85, 209, 0.3)'}`,
            cursor: 'pointer',
            borderRadius: 2,
            padding: '0 1px',
            fontWeight: 500,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(40, 85, 209, 0.15)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isHighlighted ? 'rgba(40, 85, 209, 0.2)' : 'rgba(40, 85, 209, 0.06)'
          }}
        >
          {message.content.slice(entity.start, entity.end)}
        </span>
      )

      lastIndex = entity.end
    })

    if (lastIndex < message.content.length) {
      parts.push(<span key="text-end">{message.content.slice(lastIndex)}</span>)
    }

    return parts
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 16,
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          fontWeight: 500,
          flexShrink: 0,
          background: isUser
            ? 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)'
            : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
          color: '#ffffff',
          boxShadow: isUser
            ? '0 4px 12px rgba(40, 85, 209, 0.35)'
            : '0 4px 12px rgba(16, 185, 129, 0.35)',
        }}
      >
        {isUser ? <UserOutlined /> : <RobotOutlined />}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          maxWidth: '75%',
          alignItems: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          style={{
            borderRadius: isUser ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
            padding: '12px 16px',
            fontSize: 14,
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: isUser
              ? 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)'
              : 'rgba(255, 255, 255, 0.95)',
            color: isUser ? '#ffffff' : DESIGN_TOKENS.TEXT_PRIMARY,
            border: isUser ? 'none' : `1px solid ${DESIGN_TOKENS.BORDER_DEFAULT}`,
            boxShadow: isUser
              ? '0 4px 16px rgba(40, 85, 209, 0.3)'
              : '0 2px 8px rgba(15, 23, 42, 0.06)',
          }}
        >
          {renderContent()}
        </div>

        {/* Agent Reasoning Log — collapsible debug section */}
        {!isUser && message.reasoningLog && (
          <div style={{ width: '100%', marginTop: 4 }}>
            <div
              onClick={() => setShowReasoning(!showReasoning)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                padding: '4px 10px',
                borderRadius: 6,
                background: 'rgba(250, 140, 22, 0.08)',
                border: '1px solid rgba(250, 140, 22, 0.2)',
                fontSize: 12,
                color: '#d46b08',
                userSelect: 'none',
                transition: 'all 0.2s',
              }}
            >
              <CaretRightOutlined
                style={{
                  fontSize: 10,
                  transition: 'transform 0.2s',
                  transform: showReasoning ? 'rotate(90deg)' : 'rotate(0deg)',
                }}
              />
              <BugOutlined style={{ fontSize: 12 }} />
              <span>智能体推理日志</span>
            </div>
            {showReasoning && (
              <div
                style={{
                  marginTop: 6,
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: 'rgba(15, 23, 42, 0.92)',
                  border: '1px solid rgba(250, 140, 22, 0.25)',
                  fontSize: 12,
                  lineHeight: 1.7,
                  color: '#e2e8f0',
                  fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 500,
                  overflowY: 'auto',
                }}
              >
                {message.reasoningLog}
              </div>
            )}
          </div>
        )}

        <Text style={{ color: DESIGN_TOKENS.TEXT_MUTED, fontSize: 11, padding: '0 4px' }}>
          {formatTime(message.timestamp)}
        </Text>
      </div>
    </div>
  )
}

export default EntityMessageBubble
