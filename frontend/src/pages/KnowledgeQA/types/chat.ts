import { ChatMessage, Subgraph, RiskReport, RiskStage, CommunityInfo } from './api';

export interface WorkspaceState {
  graphData: Subgraph | null;
  riskReport: RiskReport | null;
  riskStages: RiskStage[];
  riskCommunity: CommunityInfo | null;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  workspaceState: WorkspaceState;
}
