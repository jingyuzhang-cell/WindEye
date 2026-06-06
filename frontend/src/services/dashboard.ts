/** Dashboard data service — centralized API calls for the Welcome page. */

export interface SummaryStats {
  total_nodes: number;
  total_relationships: number;
  layers: {
    layer: string;
    layer_code: string;
    node_count: number;
    rel_count: number;
    node_types: Record<string, number>;
    rel_types: string[];
    cross_layer_rels: Record<string, number>;
  }[];
}

export interface RiskDistribution {
  Subject: { high: number; medium: number; low: number; total: number };
  Event: { high: number; medium: number; low: number; total: number };
  Feature: { high: number; medium: number; low: number; total: number };
  Regulation: { high: number; medium: number; low: number; total: number };
}

export interface CrossLayerRel {
  count: number;
  rel_types: string[];
}

export interface CrossStats {
  success: boolean;
  cross_layer_rels: Record<string, CrossLayerRel>;
}

export interface HighRiskEntity {
  id: string;
  name: string;
  labels: string[];
  warning_num: number;
  status: string;
  risk_info: string;
  reg_capital: string;
  related_count: number;
  relation_types: string[];
}

export interface RiskReportSummary {
  report_id: string;
  query: string;
  executive_summary: string;
  overall_risk_level: string;
  risk_path_count: number;
  anomaly_count: number;
  compliance_count: number;
  node_count: number;
  edge_count: number;
  created_at: string;
}

const BASE = '';

export async function fetchSummaryStats(): Promise<SummaryStats> {
  const res = await fetch(`${BASE}/api/v1/graph/summary-stats`);
  if (!res.ok) throw new Error(`summary-stats: ${res.status}`);
  return res.json();
}

export async function fetchRiskDistribution(): Promise<{ success: boolean; data: RiskDistribution }> {
  const res = await fetch(`${BASE}/api/v1/graph/risk-distribution`);
  if (!res.ok) throw new Error(`risk-distribution: ${res.status}`);
  return res.json();
}

export async function fetchCrossStats(): Promise<CrossStats> {
  const res = await fetch(`${BASE}/api/v1/graph/cross-stats`);
  if (!res.ok) throw new Error(`cross-stats: ${res.status}`);
  return res.json();
}

export async function fetchHighRiskEntities(limit = 10): Promise<{ success: boolean; data: HighRiskEntity[]; total: number }> {
  const res = await fetch(`${BASE}/api/v1/graph/high-risk-entities?limit=${limit}`);
  if (!res.ok) throw new Error(`high-risk-entities: ${res.status}`);
  return res.json();
}

export async function fetchRecentReports(page = 1, limit = 5): Promise<{ success: boolean; data: { reports: RiskReportSummary[]; total: number; page: number } }> {
  const res = await fetch(`${BASE}/api/v1/risk/reports?page=${page}&limit=${limit}`);
  if (!res.ok) throw new Error(`reports: ${res.status}`);
  return res.json();
}

export async function fetchPipelineStatus(): Promise<{ status: string; current_run?: any; message?: string }> {
  const res = await fetch(`${BASE}/api/v1/pipeline/status`);
  if (!res.ok) throw new Error(`pipeline-status: ${res.status}`);
  return res.json();
}
