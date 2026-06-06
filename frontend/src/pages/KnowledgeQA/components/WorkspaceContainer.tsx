import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Input, Spin, Empty, Tag, Typography, Upload, Button } from 'antd'
import { SendOutlined, ClearOutlined, UploadOutlined, FileTextOutlined, CloseOutlined, LoadingOutlined, SearchOutlined } from '@ant-design/icons'
import { EntityMessageBubble } from './EntityMessageBubble'
import { RiskEntityCard } from './RiskEntityCard'
import { ContextTagBar, ContextEntity } from './ContextTagBar'
import type { ChatMessage, EntityCandidate, RecommendationItem } from '../types/api'
import { useAgentStore } from '../store/agentStore'
import { DESIGN_TOKENS } from '../styles/constants'

const { Text } = Typography
const { TextArea } = Input

interface WorkspaceContainerProps {
  messages: ChatMessage[]
  isLoading: boolean
  pendingRecommendations: RecommendationItem[] | null
  onSendMessage: (query: string) => Promise<void>
  onClearHistory: () => void
  onEntityHover?: (entityId: string | null) => void
  onEntityClick?: (entityId: string, entityType: string) => void
  highlightedEntity?: string | null
  graphInjectedEntity?: { id: string; name: string; type: string } | null
  onClearGraphInject?: () => void
  contextInjectedEntity?: { id: string; name: string; type: string; nonce?: number } | null
}

export const WorkspaceContainer: React.FC<WorkspaceContainerProps> = ({
  messages,
  isLoading,
  pendingRecommendations,
  onSendMessage,
  onClearHistory,
  onEntityHover,
  onEntityClick,
  highlightedEntity,
  graphInjectedEntity,
  onClearGraphInject,
  contextInjectedEntity,
}) => {
  const [input, setInput] = useState('')
  const [contextTags, setContextTags] = useState<ContextEntity[]>([])
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<any>(null)

  const uploadedFile = useAgentStore((s) => s.uploadedFile)
  const fileUploading = useAgentStore((s) => s.fileUploading)
  const uploadFile = useAgentStore((s) => s.uploadFile)
  const clearUploadedFile = useAgentStore((s) => s.clearUploadedFile)
  const confirmEntityCandidate = useAgentStore((s) => s.confirmEntityCandidate)
  const storeError = useAgentStore((s) => s.error)

  useEffect(() => {
    if (!contextInjectedEntity) return
    setContextTags((prev) => {
      if (prev.find((t) => t.id === contextInjectedEntity.id || t.label === contextInjectedEntity.name)) {
        return prev
      }
      return [
        ...prev,
        {
          id: contextInjectedEntity.id,
          label: contextInjectedEntity.name,
          type: contextInjectedEntity.type,
        },
      ]
    })
    inputRef.current?.focus()
  }, [contextInjectedEntity])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    if (distanceToBottom < 96) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [messages, isLoading])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return
    let fullQuery = text
    if (graphInjectedEntity) {
      fullQuery = `[${graphInjectedEntity.name}] ${fullQuery}`
    }
    if (contextTags.length > 0) {
      fullQuery = `Context: ${contextTags.map(t => t.label || t.id).join(', ')}. Query: ${fullQuery}`
    }
    try {
      await onSendMessage(fullQuery)
      setInput('')
      inputRef.current?.focus()
    } catch {
      // Keep input text on failure
    }
  }, [input, isLoading, onSendMessage, graphInjectedEntity, contextTags])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleRemoveTag = (id: string) => {
    setContextTags((prev) => prev.filter((t) => t.id !== id))
  }

  const handleClearTags = () => {
    setContextTags([])
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'linear-gradient(180deg, #F7F9FC 0%, #F1F5F9 100%)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${DESIGN_TOKENS.BORDER_DEFAULT}`,
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: DESIGN_TOKENS.TEXT_PRIMARY }}>
            Chat
          </h2>
          <Text type="secondary" className="text-xs">
            {messages.length} messages
          </Text>
        </div>
        <button
          onClick={onClearHistory}
          style={{
            background: 'none',
            border: 'none',
            color: '#94A3B8',
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 10px',
            borderRadius: 8,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f1f5f9'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none'
          }}
          title="Clear chat"
        >
          <ClearOutlined />
          <span>Clear</span>
        </button>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {messages.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#475569', fontSize: 14, marginBottom: 8 }}>
                    Start your first query!
                  </p>
                  <p style={{ color: '#94A3B8', fontSize: 12 }}>
                    Try: "查询某公司近期的风险传导路径和异常事件"
                  </p>
                </div>
              }
            />
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id}>
                <EntityMessageBubble
                  message={msg}
                  onEntityHover={onEntityHover}
                  onEntityClick={(entity) => {
                    setContextTags((prev) => {
                      if (prev.find((t) => t.id === entity.id)) return prev
                      return [...prev, { id: entity.id, type: entity.type }]
                    })
                    onEntityClick?.(entity.id, entity.type)
                  }}
                  highlightedEntity={highlightedEntity}
                />
                {msg.role === 'assistant' && msg.data?.entityCandidates && (
                  <div style={{ marginLeft: 44, marginBottom: 12 }}>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: 10,
                        background: '#fff',
                        border: '1px solid #dbeafe',
                        borderRadius: 8,
                        boxShadow: '0 6px 16px rgba(15, 23, 42, 0.06)',
                        maxHeight: 260,
                        overflowY: 'auto',
                      }}
                    >
                      {msg.data.entityCandidates.candidates.map((candidate: EntityCandidate, index: number) => (
                        <Button
                          key={`${candidate.kg_node_id || candidate.canonical_name}-${index}`}
                          size="small"
                          style={{
                            height: 'auto',
                            minHeight: 32,
                            display: 'flex',
                            justifyContent: 'space-between',
                            width: '100%',
                            whiteSpace: 'normal',
                            textAlign: 'left',
                          }}
                          onClick={() => {
                            const payload = msg.data?.entityCandidates
                            if (!payload) return
                            confirmEntityCandidate(payload.alias, candidate, payload.originalQuery)
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{candidate.canonical_name}</span>
                          <span style={{ marginLeft: 8, color: '#64748b', fontSize: 12 }}>
                            {candidate.entity_type === 'PERSON' ? '人物' : '企业'} · {Math.round((candidate.confidence || 0) * 100)}%
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {msg.role === 'assistant' && (msg.data?.output || pendingRecommendations) && (
                  <div style={{ marginLeft: 44, marginBottom: 12 }}>
                    {pendingRecommendations && pendingRecommendations.length > 0 ? (
                      <>
                        <RiskEntityCard
                          recommendations={pendingRecommendations}
                          onEntityClick={() => {}}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                          <Spin size="small" />
                          <span style={{ color: DESIGN_TOKENS.TEXT_MUTED, fontSize: 12 }}>
                            Generating review...
                          </span>
                        </div>
                      </>
                    ) : msg.data?.output ? (
                      <RiskEntityCard
                        recommendations={msg.data.output.recommendations || []}
                        onEntityClick={(entityId, entityType) => {
                          setContextTags((prev) => {
                            if (prev.find((t) => t.id === entityId)) return prev
                            return [...prev, { id: entityId, type: entityType }]
                          })
                          onEntityClick?.(entityId, entityType)
                        }}
                      />
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(16px)',
          borderTop: `1px solid ${DESIGN_TOKENS.BORDER_DEFAULT}`,
        }}
      >
        {graphInjectedEntity && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              background: 'rgba(0, 47, 167, 0.06)',
              borderRadius: 10,
              border: '1px dashed rgba(0, 47, 167, 0.3)',
              marginBottom: 8,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M6 1L11 6L6 11"
                stroke={DESIGN_TOKENS.KLEIN_BLUE}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>
              From Graph:
            </span>
            <Tag
              style={{
                background: 'rgba(0, 47, 167, 0.1)',
                border: '1px solid rgba(0, 47, 167, 0.3)',
                color: DESIGN_TOKENS.KLEIN_BLUE,
                fontSize: 12,
                fontWeight: 600,
                padding: '1px 8px',
                borderRadius: 14,
                animation: 'tagFlyIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              {graphInjectedEntity.name}
            </Tag>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              · Click input to continue
            </span>
            <button
              onClick={() => {
                onClearGraphInject?.()
                inputRef.current?.focus()
              }}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                fontSize: 14,
                lineHeight: 1,
                padding: '2px 4px',
              }}
            >
              ×
            </button>
          </div>
        )}

        <ContextTagBar
          tags={contextTags}
          onRemove={handleRemoveTag}
          onClearAll={handleClearTags}
          onTagClick={(entity) => {
            setContextTags((prev) => {
              if (prev.find((t) => t.id === entity.id)) return prev
              return [...prev, { id: entity.id, type: entity.type }]
            })
          }}
        />

        {/* 文件上传区域 */}
        <div style={{ marginBottom: 8 }}>
          {uploadedFile ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: '#f0f5ff',
                borderRadius: 8,
                border: '1px solid #d6e4ff',
              }}
            >
              <FileTextOutlined style={{ color: '#2855D1', fontSize: 14 }} />
              <span style={{ fontSize: 12, flex: 1, color: '#1e40af' }}>
                {uploadedFile.filename}
                <span style={{ color: '#64748b', marginLeft: 6 }}>
                  ({uploadedFile.char_count} 字符{uploadedFile.truncated ? '，已截断' : ''})
                </span>
              </span>
              {uploadedFile.truncated && (
                <span style={{ fontSize: 11, color: '#fa8c16' }}>内容过长，已自动截取前 50,000 字符</span>
              )}
              <Button
                type="primary"
                size="small"
                icon={<SearchOutlined />}
                onClick={() => {
                  onSendMessage('请分析该文件中的风险信息')
                }}
                disabled={isLoading}
                style={{ fontSize: 12 }}
              >
                协同治理
              </Button>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={clearUploadedFile}
                style={{ color: '#94a3b8' }}
              />
            </div>
          ) : (
            <Upload
              accept=".txt,.md,.docx,.pdf"
              showUploadList={false}
              beforeUpload={(file) => {
                uploadFile(file)
                return false
              }}
              disabled={fileUploading || isLoading}
            >
              <Button
                icon={fileUploading ? <LoadingOutlined /> : <UploadOutlined />}
                size="small"
                type="text"
                disabled={fileUploading || isLoading}
                style={{ fontSize: 12, color: '#64748b' }}
              >
                {fileUploading ? '上传中...' : '上传文本文件 (.txt .md .docx .pdf)'}
              </Button>
            </Upload>
          )}
          {storeError && (
            <div style={{ fontSize: 11, color: '#f5222d', marginTop: 4, paddingLeft: 4 }}>{storeError}</div>
          )}
        </div>

        <div
          style={{
            background: '#FFFFFF',
            border: `1px solid ${DESIGN_TOKENS.BORDER_DEFAULT}`,
            borderRadius: 14,
            padding: '10px 14px',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <TextArea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                contextTags.length > 0
                  ? 'Continue with context constraints, or enter a new question...'
                  : 'Enter your question, press Enter to send...'
              }
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontSize: 14,
                lineHeight: 1.5,
                background: 'transparent',
                padding: 0,
              }}
              disabled={isLoading || fileUploading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                background:
                  input.trim() && !isLoading
                    ? 'linear-gradient(135deg, #2855D1 0%, #1A44B5 100%)'
                    : '#F1F5F9',
                color: input.trim() && !isLoading ? '#ffffff' : '#94A3B8',
                transition: 'all 0.2s ease',
                flexShrink: 0,
                boxShadow:
                  input.trim() && !isLoading
                    ? '0 4px 12px rgba(40, 85, 209, 0.3)'
                    : 'none',
              }}
            >
              <SendOutlined style={{ fontSize: 15 }} />
            </button>
          </div>
        </div>

        <span
          style={{
            color: DESIGN_TOKENS.TEXT_MUTED,
            fontSize: 12,
            marginTop: 8,
            display: 'block',
            paddingLeft: 4,
          }}
        >
          Enter 发送 · Shift+Enter 换行 · 双击图谱节点添加上下文
        </span>
      </div>
    </div>
  )
}

export default WorkspaceContainer
