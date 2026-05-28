// Types aligned with backend/app/core/models.py

export interface DisambiguationCandidate {
  kgNodeId: string
  displayName: string | null
  score: number
}

export interface Entity {
  mention: string
  kgNodeId: string
  entityType: string
  confidence: number
  disambiguationCandidates: DisambiguationCandidate[]
}

export interface ContextData {
  contextId: string
  query: string
  history: string[]
  intent: string
  constraints: Record<string, unknown>
  sessionGoal: string
  sessionId: string
  roundId: number
  traceId: string
  entities: Entity[]
}

export interface SubQuery {
  subQueryId: string
  text: string
  focusEntities: string[]
  focusIntent: string
  priority: number
}

export interface QueryRewriteResult {
  originalQuery: string
  rewrittenQuery: string
  subQueries: SubQuery[]
  strategySuggestion: 'multi_hop' | 'text2cypher' | 'hybrid'
  suggestedMaxHop: number
  expansionTerms: string[]
  isComplex: boolean
}

export interface SubgraphNode {
  id: string
  type: string
  score: number
  title?: string
  name?: string
  zh_name?: string
  popularity?: number
  rating?: number
  year?: number
  poster?: string
  overview?: string
  genres?: string[]
  directors?: string[]
  zh_title?: string
  poster_url?: string
  release_date?: string
  vote_average?: number
}

export interface SubgraphEdge {
  source: string
  target: string
  relation: string
}

export interface SubgraphPath {
  pathId: string
  nodeIds: string[]
  score: number
}

export interface Subgraph {
  nodes: SubgraphNode[]
  edges: SubgraphEdge[]
  paths: SubgraphPath[]
}

export interface AlignmentFeature {
  entityId: string
  graphEmbedding: number[]
  semanticEmbedding: number[]
  alignedEmbedding: number[]
  alignmentScore: number
  modelVersion: string
}

export interface RecommendationItem {
  itemId: string
  score: number
  title?: string
  zhTitle?: string
  rating?: number
  year?: number
  poster?: string
  overview?: string
  directors?: string[]
  genres?: string[]
  actors?: string[]
  highlight?: string
}

export interface ReasoningStep {
  thought: string
  action?: string
  action_input?: Record<string, unknown>
  observation?: string
  is_final?: boolean
}

export interface ExplanationItem {
  itemId: string
  highlight: string
  pathIds: string[]
}

export interface AgentOutput {
  overallReasoning: string
  recommendations: RecommendationItem[]
  explanations: ExplanationItem[]
  reasoningSteps?: ReasoningStep[]
}

export interface TraceContext {
  sessionId: string
  roundId: number
  traceId: string
}

export interface ApiResponse {
  success: boolean
  message: string
  trace: TraceContext
  data: {
    context: ContextData
    rewriteResult: QueryRewriteResult
    subgraph: Subgraph
    alignmentFeatures: AlignmentFeature[]
    output: AgentOutput
  }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  thinkingStatus?: string
  thinkingProcess?: string[]
  isLoading?: boolean
  pipelineStages?: PipelineStage[]
  data?: {
    rewriteResult?: QueryRewriteResult
    subgraph?: Subgraph
    alignmentFeatures?: AlignmentFeature[]
    output?: AgentOutput
    trace?: TraceContext
    echartsConfig?: Record<string, unknown>
  }
}

// ── Pipeline Progress types ──

export interface PipelineStage {
  stage_id: string
  stage_name: string
  stage_index: number
  total_stages: number
  agent: string
  agent_action: string
  progress: number
  timestamp: number
  status: 'pending' | 'running' | 'done' | 'error'
  duration_ms?: number
  trace?: Record<string, unknown>
}

export interface StreamCardsEvent {
  recommendations: RecommendationItem[]
}

export interface StreamGraphEvent {
  nodes: SubgraphNode[]
  edges: SubgraphEdge[]
}

export interface StreamReviewEvent {
  overall: string
  highlights: { itemId: string; highlight: string }[]
  explanation: string
}

export interface StreamErrorEvent {
  error: string
}

// ── Risk Report types (aligned with backend RiskAnalysisEngine output) ──

export interface RiskPath {
  path_id: string
  risk_level: 'high' | 'medium' | 'low'
  affected_entities: string[]
  path_description: string
  confidence?: number
}

export interface AnomalyFinding {
  anomaly_type: string
  affected_entities: string[]
  evidence: string
  confidence: number
}

export interface ComplianceMatch {
  regulation: string
  article: string
  violation: string
  suggested_action: string
  confidence: number
}

export interface RiskRecommendation {
  action: string
  department: string
  urgency: 'urgent' | 'normal' | 'low'
  reasoning: string
}

export interface EntityStats {
  total_entities: number
  entity_type_counts: Record<string, number>
  top_entities: Array<{ name: string; type: string; id: string }>
}

export interface CommunityMember {
  id: string
  name: string
  type: string
}

export interface CommunityItem {
  community_id: number
  size: number
  members: CommunityMember[]
  modularity?: number | null
}

export interface CommunityResult {
  communities: CommunityItem[]
  algorithm: string
}

export interface RiskReport {
  report_id?: string
  generated_at?: string
  query_summary?: string
  executive_summary: string
  entity_stats?: EntityStats
  community_info?: CommunityResult
  risk_paths: RiskPath[]
  anomaly_findings: AnomalyFinding[]
  compliance_matches: ComplianceMatch[]
  overall_risk_level: 'high' | 'medium' | 'low'
  recommendations: RiskRecommendation[]
  integrated_report?: string
  markdown_report: string
  subtasks_completed: number
  subgraph_summary: {
    node_count: number
    edge_count: number
  }
  echarts_config?: any
  raw_data?: any[]
  legal_basis?: string[]
  penalty_cases?: PenaltyCase[]
}

export interface PenaltyCase {
  case_name: string
  case_number: string
  regulation: string
  penalty_amount: string
  penalty_type: string
  summary: string
  source_url?: string
}

export interface ReportHistoryItem {
  report_id: string
  generated_at: string
  query_summary: string
  overall_risk_level: string
  subtasks_completed: number
}

export interface RiskStage {
  stage: 'planning' | 'retrieving' | 'entity_stats' | 'community' | 'analyzing' | 'compliance' | 'reporting'
  content: string
}

export interface CommunityInfo extends CommunityResult {
  community_id?: number
  size?: number
  top_entities?: Array<{ id: string; name: string; label: string }>
}
