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
  entityType?: string
  entity_type?: string
  label?: string
  score: number
  properties?: Record<string, unknown>
  raw?: Record<string, unknown>
  risk_level?: 'high' | 'medium' | 'low'
  compliance_score?: number
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
  id?: string
  source: string
  target: string
  relation: string
  confidence?: number
}

export interface SubgraphPath {
  pathId: string
  nodeIds: string[]
  edgeIds: string[]
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

export interface StreamReasoningEvent {
  reasoning_log: string
}

export interface EntityCandidate {
  raw: string
  canonical_name: string
  kg_node_id: string
  entity_type: string
  labels: string[]
  match_type: string
  match_score: number
  confidence: number
  reason?: string
  properties?: Record<string, unknown>
}

export interface EntityCandidatePrompt {
  alias: string
  originalQuery: string
  candidates: EntityCandidate[]
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
  reasoningLog?: string
  data?: {
    rewriteResult?: QueryRewriteResult
    subgraph?: Subgraph
    alignmentFeatures?: AlignmentFeature[]
    output?: AgentOutput
    trace?: TraceContext
    echartsConfig?: Record<string, unknown>
    entityCandidates?: EntityCandidatePrompt
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
  node_ids?: string[]
  edge_ids?: string[]
  community_path?: number[]
  path_description: string
  path_text?: string
  confidence?: number
}

// ── Standalone Risk Paths API types (governance_routes.py /risk-paths) ──

export interface RiskPathEvidence {
  node_id?: string
  nodeId?: string
  evidence_type?: string
  evidenceType?: string
  content: string
  confidence: number
}

export interface EnrichedRiskPath {
  pathId: string
  riskLevel: 'high' | 'medium' | 'low'
  score: number
  confidence: number
  pathType: string
  communityPath: number[]
  nodeIds: string[]
  edgeIds: string[]
  relations: string[]
  affectedEntities: string[]
  pathDescription: string
  evidence: RiskPathEvidence[]
}

export interface CommunityRiskPath {
  sourceCommunity: number
  targetCommunity: number
  riskLevel: 'high' | 'medium' | 'low'
  score: number
  pathIds: string[]
  mainRelations: string[]
  description: string
}

export interface PathViewModel {
  highlightNodeIds?: string[]
  highlightEdgeIds?: string[]
  highlightCommunityIds?: number[]
  defaultSelectedPathId?: string
}

export interface RiskPathsSummary {
  seedNodeCount: number
  nodeCount: number
  edgeCount: number
  communityCount: number
  candidatePathCount: number
  riskPathCount: number
  highRiskCount: number
  mediumRiskCount: number
  lowRiskCount: number
}

export interface CommunityDiscoverySummary {
  seedCommunityId: number | null
  selectedMethod: string
  communityCount: number
  communityGraph: CommunityGraphData
  entityCommunityMap: Record<string, CommunityMemberDetail>
}

export interface RiskPathsRequest {
  seedNames: string[]
  seedIds: string[]
  maxHop: number
  maxPathLength: number
  method: string
  communityMode: string
  includeCommunityDiscovery: boolean
  includeCommunityPath: boolean
  includeNodePath: boolean
  riskRelationWhitelist: string[]
  subgraphPathLimit: number
  riskPathLimit: number
  maxBranchPerNode: number
  minRiskScore: number
  responseMode: string
}

export interface RiskPathsResponse {
  success: boolean
  traceId: string
  elapsedMs?: number
  summary: RiskPathsSummary
  seedNodes: SubgraphNode[]
  communityDiscovery: CommunityDiscoverySummary | null
  riskPaths: EnrichedRiskPath[]
  communityRiskPaths: CommunityRiskPath[]
  viewModel: PathViewModel
  warnings: string[]
  error?: string
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

export interface EntityCommunityEntry {
  name: string
  type: string
  id: string
  communities: Array<{
    community_id: number
    size: number
    role: 'core' | 'bridge' | 'member'
  }>
}

export interface EntityCommunityMap {
  entities: EntityCommunityEntry[]
  unmapped_count: number
}

export interface RiskReport {
  report_id?: string
  generated_at?: string
  query_summary?: string
  executive_summary: string
  entity_stats?: EntityStats
  community_info?: CommunityResult
  entity_community_map?: EntityCommunityMap
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
  resolved_entities?: ResolvedEntity[]
  evidence_chains?: EvidenceChains
  risk_scores?: RiskScores
  governance_plan?: GovernancePlan
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

// ── Unified Engine types ──

export interface ResolvedEntity {
  raw: string
  canonical_name: string | null
  kg_node_id: string | null
  match_type: 'exact' | 'alias' | 'contains' | 'fuzzy' | 'llm_fallback' | 'unresolved'
  match_score: number
  confidence: number
}

export interface EvidenceChain {
  claim_id: string
  claim: string
  supporting_nodes: string[]
  supporting_edges: string[]
  cypher_source: string
  verifier_score: number
  document_snippets: string[]
  confidence: number
}

export interface EvidenceChains {
  chains: EvidenceChain[]
  overall_confidence: number
  total_claims: number
  verified_claims: number
}

export interface RiskScoreDetail {
  dimension: string
  score: number
  weight: number
  explanation?: string
}

export interface RiskScores {
  scores: RiskScoreDetail[]
  base_overall: number | null
  final_overall: number | null
  level: 'high' | 'medium' | 'low' | 'insufficient_evidence'
  llm_adjustment: number
  llm_adjustment_reason: string
}

export interface GovernanceAction {
  target: string
  risk_issue: string
  measure: string
  priority: 'urgent' | 'normal' | 'low'
  department: string
}

export interface EscalationRule {
  condition: string
  action: string
  timeline: string
}

export interface GovernancePlan {
  actions: GovernanceAction[]
  escalation_rules: EscalationRule[]
  monitoring_checklist: string[]
}

// ── Unified SSE Envelope ──

export interface UnifiedEnvelope {
  event_id: string
  session_id: string
  round_id: number
  stage: string
  type: string
  status: 'running' | 'success' | 'warning' | 'error'
  data: any
  error: string | null
  timestamp: string
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

/**
 * Community info received via SSE events. Handles both shapes:
 * - Phase A (matched): { communities, algorithm, matched_community_id }
 * - Phase B (detection): { communities, algorithm }
 * - Legacy (explicit communityId): { community_id, size, top_entities }
 */
// ── Compliance Indicator types ──

export interface ComplianceIndicator {
  id: string
  l1: string
  l2: string
  l3: string
  objective: number
  category: 'data_driven' | 'evidence_based' | 'policy_driven'
  evidence: string
}

export interface ComplianceIndicatorScore extends ComplianceIndicator {
  subjective: number
  score: number
}

export interface CommunityInfo {
  communities?: CommunityItem[]
  algorithm?: string
  matched_community_id?: number
  community_id?: number
  size?: number
  top_entities?: Array<{ id: string; name: string; label: string }>
}

// ── Expanded Community (Phase B / community-discovery API) ──

export interface CommunityAggNode {
  id: string
  communityId: number
  label: string
  size: number
  riskLevel?: 'high' | 'medium' | 'low'
  memberCount: number
  topEntityNames: string[]
}

export interface CommunityAggEdge {
  id?: string
  source: string
  target: string
  weight: number
  riskLevel?: 'high' | 'medium' | 'low'
  relationTypes: string[]
}

export interface CommunityGraphData {
  nodes: CommunityAggNode[]
  edges: CommunityAggEdge[]
}

export interface CommunityMemberDetail {
  id: string
  name: string
  type: string
  communityId: number
  role: 'core' | 'bridge' | 'member'
  isSeed: boolean
  riskLevel?: 'high' | 'medium' | 'low'
}

export interface ExpandedCommunityResult {
  seedNodes: Array<{ id: string; name: string; type: string }>
  communities: CommunityItem[]
  seedCommunityId: number | null
  entityCommunityMap: Record<string, CommunityMemberDetail>
  communityEdges: Array<{
    sourceCommunityId: number
    targetCommunityId: number
    weight: number
    riskLevel?: string
    relationTypes: string[]
    bridgeNodeIds: string[]
  }>
  communityGraph: CommunityGraphData
  selectedMethod: string
  fallbackReason: string | null
  visualization?: Record<string, unknown>
}
