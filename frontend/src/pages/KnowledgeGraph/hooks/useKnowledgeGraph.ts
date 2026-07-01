import { useCallback, useEffect, useMemo, useState } from 'react';
import { expandGraphNode, searchAllGraph, subjectTraverseGraph } from '@/api/knowledgeGraph';
import type {
  ExpandNodePayload,
  KGEdge,
  KGNode,
  KGSummary,
  KGTriple,
  SearchAllPayload,
  SubjectTraversePayload,
} from '@/types/knowledgeGraph';
import {
  computeCurrentSubgraphStats,
  mergeGraph,
  normalizeEdge,
  normalizeNode,
} from '@/utils/knowledgeGraph';

const EMPTY_SUMMARY: KGSummary = { nodeCount: 0, edgeCount: 0 };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '知识图谱请求失败';
}

export function useKnowledgeGraph() {
  const [nodes, setNodes] = useState<KGNode[]>([]);
  const [edges, setEdges] = useState<KGEdge[]>([]);
  const [matchedNodes, setMatchedNodes] = useState<KGNode[]>([]);
  const [triples, setTriples] = useState<KGTriple[]>([]);
  const [summary, setSummary] = useState<KGSummary>(EMPTY_SUMMARY);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const currentStats = useMemo(
    () => computeCurrentSubgraphStats(nodes, edges),
    [nodes, edges],
  );

  const loadInitialGraph = useCallback(async () => {
    setLoading(true);
    setGraphError(null);
    try {
      const response = await fetch('/api/v1/graph/data');
      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(
          data?.error?.message
          || data?.detail?.message
          || data?.detail
          || data?.error
          || `初始子图加载失败（HTTP ${response.status}）`,
        );
      }
      const normalizedNodes = (data.nodes || []).map(normalizeNode);
      const normalizedEdges = (data.edges || data.links || []).map(normalizeEdge);
      const merged = mergeGraph([], [], normalizedNodes, normalizedEdges);
      setNodes(merged.nodes);
      setEdges(merged.edges);
      setMatchedNodes([]);
      setTriples([]);
      setSummary({
        nodeCount: merged.nodes.length,
        edgeCount: merged.edges.length,
      });
      setWarnings([]);
      setTraceId(null);
    } catch (error) {
      setGraphError(errorMessage(error));
      setNodes([]);
      setEdges([]);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    void loadInitialGraph();
  }, [loadInitialGraph]);

  const search = useCallback(async (payload: SearchAllPayload) => {
    setLoading(true);
    setGraphError(null);
    try {
      const response = await searchAllGraph(payload);
      const matchedIds = new Set(
        (response.matchedNodes || []).map(node => String(node.id ?? node.element_id)),
      );
      const normalizedNodes = (response.nodes || []).map((raw) => ({
        ...normalizeNode(raw),
        isMatched: matchedIds.has(String(raw.id ?? raw.element_id)),
        isCenter: matchedIds.has(String(raw.id ?? raw.element_id)),
      }));
      const normalizedEdges = (response.edges || []).map(normalizeEdge);
      const merged = mergeGraph([], [], normalizedNodes, normalizedEdges);
      const normalizedMatched = (response.matchedNodes || []).map((raw) => ({
        ...normalizeNode(raw),
        isMatched: true,
        isCenter: true,
      }));

      setNodes(merged.nodes);
      setEdges(merged.edges);
      setMatchedNodes(normalizedMatched);
      setTriples(response.triples || []);
      setSummary({
        ...response.summary,
        nodeCount: merged.nodes.length,
        edgeCount: merged.edges.length,
      });
      const countWarnings = [...(response.warnings || [])];
      if (
        typeof response.summary?.edgeCount === 'number'
        && response.summary.edgeCount !== merged.edges.length
      ) {
        countWarnings.push(
          `SUMMARY_EDGE_COUNT_MISMATCH: summary=${response.summary.edgeCount}, edges=${merged.edges.length}`,
        );
      }
      setWarnings(countWarnings);
      setTraceId(response.traceId || null);
      return response;
    } catch (error) {
      setGraphError(errorMessage(error));
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const subjectTraverse = useCallback(async (payload: SubjectTraversePayload) => {
    setLoading(true);
    setGraphError(null);
    try {
      const response = await subjectTraverseGraph(payload);
      const matchedIds = new Set(
        (response.matchedNodes || []).map(node => String(node.id ?? node.element_id)),
      );
      const normalizedNodes = (response.nodes || []).map((raw) => ({
        ...normalizeNode(raw),
        isMatched: matchedIds.has(String(raw.id ?? raw.element_id)),
        isCenter: matchedIds.has(String(raw.id ?? raw.element_id)),
      }));
      const normalizedEdges = (response.edges || []).map(normalizeEdge);
      const merged = mergeGraph([], [], normalizedNodes, normalizedEdges);
      const normalizedMatched = (response.matchedNodes || []).map((raw) => ({
        ...normalizeNode(raw),
        isMatched: true,
        isCenter: true,
      }));

      setNodes(merged.nodes);
      setEdges(merged.edges);
      setMatchedNodes(normalizedMatched);
      setTriples(response.triples || []);
      setSummary({
        ...response.summary,
        nodeCount: merged.nodes.length,
        edgeCount: merged.edges.length,
      });
      setWarnings([...(response.warnings || [])]);
      setTraceId(response.traceId || null);
      return response;
    } catch (error) {
      setGraphError(errorMessage(error));
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const expand = useCallback(async (
    nodeId: string,
    payload: ExpandNodePayload = {},
  ) => {
    setLoading(true);
    setGraphError(null);
    try {
      const response = await expandGraphNode(nodeId, payload);
      const normalizedNodes = (response.nodes || []).map((raw) => ({
        ...normalizeNode(raw),
        isCenter: String(raw.id ?? raw.element_id) === nodeId,
      }));
      const normalizedEdges = (response.edges || []).map(normalizeEdge);

      const clearedCenters = nodes.map(node => ({ ...node, isCenter: false }));
      const merged = mergeGraph(clearedCenters, edges, normalizedNodes, normalizedEdges);
      setNodes(merged.nodes);
      setEdges(merged.edges);
      setSummary({
        ...response.summary,
        centerNodeId: nodeId,
        nodeCount: merged.nodes.length,
        edgeCount: merged.edges.length,
      });
      const countWarnings = [...(response.warnings || [])];
      if (
        typeof response.summary?.edgeCount === 'number'
        && response.summary.edgeCount !== merged.edges.length
      ) {
        countWarnings.push(
          `SUMMARY_EDGE_COUNT_MISMATCH: summary=${response.summary.edgeCount}, edges=${merged.edges.length}`,
        );
      }
      setWarnings(countWarnings);
      setTraceId(response.traceId || null);
      return response;
    } catch (error) {
      setGraphError(errorMessage(error));
      throw error;
    } finally {
      setLoading(false);
    }
  }, [nodes, edges]);

  const clear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setMatchedNodes([]);
    setTriples([]);
    setSummary(EMPTY_SUMMARY);
    setWarnings([]);
    setTraceId(null);
    setGraphError(null);
  }, []);

  return {
    nodes,
    edges,
    matchedNodes,
    triples,
    summary,
    warnings,
    traceId,
    graphError,
    loading,
    initialized,
    currentStats,
    setGraphError,
    loadInitialGraph,
    search,
    subjectTraverse,
    expand,
    clear,
  };
}
