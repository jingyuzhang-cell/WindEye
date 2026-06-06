"""Diagnostic script part 2: Test VerifierAgent scoring on candidate risk paths."""
import sys, asyncio
sys.path.insert(0, '.')

from dotenv import load_dotenv
load_dotenv()

from core.database import Neo4jClient
from dra_ma.tools.graph_analytics_tools import GraphAnalyticsTool
from dra_ma.agents.layer4_consensus.verifier import VerifierAgent

client = Neo4jClient.from_env()
test_entity = '鑫达投资管理有限公司'

# ── 1. Get subgraph ─────────────────────────────────────────────────
print('=' * 60)
print('Step 1: Retrieve subgraph')
print('=' * 60)

q1 = client.execute_read(
    "MATCH (n {name: $name})-[r]-(m) "
    "RETURN DISTINCT elementId(n) AS n_id, n.name AS n_name, labels(n) AS n_labels, "
    "elementId(m) AS m_id, m.name AS m_name, labels(m) AS m_labels, "
    "type(r) AS relation "
    "LIMIT 20",
    parameters={"name": test_entity}
)

nodes = {}
edges = []
for rec in q1:
    n_id = rec['n_id']
    m_id = rec['m_id']
    if n_id not in nodes:
        nodes[n_id] = {
            'id': n_id, 'name': rec['n_name'] or n_id,
            'labels': rec['n_labels'],
            'entity_type': rec['n_labels'][0] if rec['n_labels'] else '',
            'type': rec['n_labels'][0] if rec['n_labels'] else '',
        }
    if m_id not in nodes:
        nodes[m_id] = {
            'id': m_id, 'name': rec['m_name'] or m_id,
            'labels': rec['m_labels'],
            'entity_type': rec['m_labels'][0] if rec['m_labels'] else '',
            'type': rec['m_labels'][0] if rec['m_labels'] else '',
        }
    edges.append({
        'source': n_id, 'target': m_id,
        'relation': rec['relation'], 'label': rec['relation'], 'type': rec['relation'],
    })

node_list = list(nodes.values())
print(f'Subgraph: {len(node_list)} nodes, {len(edges)} edges')

# ── 2. Get candidate risk paths ─────────────────────────────────────
print()
print('=' * 60)
print('Step 2: Candidate risk paths')
print('=' * 60)

candidates = GraphAnalyticsTool.enumerate_candidate_risk_paths(node_list, edges)
print(f'Candidate paths: {len(candidates)}')

# ── 3. Test VerifierAgent on each candidate path ────────────────────
print()
print('=' * 60)
print('Step 3: VerifierAgent scoring on candidate paths')
print('=' * 60)

async def test_verifier():
    # Create a minimal IntentObject for Verifier
    from dra_ma.agents.layer1_perception.intent_agent import IntentObject
    intent = IntentObject(
        Start_Entities=[test_entity],
        Constraint_Filters=["INVEST", "CONTROL", "GUARANTEE", "MENTION", "TRIGGERS", "REFLECTS", "CAUSE", "WORK"],
        Expected_Answer_Type="risk_evidence",  # Risk mode bypasses hard filter
        Expected_Hop=1,
        reasoning="diagnostic test"
    )

    for i, path in enumerate(candidates[:5]):  # Test first 5
        src_name = path['entities'][0]
        tgt_name = path['entities'][1]
        rel = path['relation']

        # Simulate what DRAEngine passes to Verifier
        cypher = f"MATCH (n)-[:{rel}]-(m) WHERE n.name = '{src_name}' AND m.name = '{tgt_name}' RETURN n, m"
        results = [src_name, tgt_name]

        try:
            score = await VerifierAgent.verify(intent, cypher, results)
            print(f'  {path["path_id"]}: {src_name[:20]} -[{rel}]-> {tgt_name[:20]} => Verifier score={score:.2f}')
        except Exception as e:
            print(f'  {path["path_id"]}: {src_name[:20]} -[{rel}]-> {tgt_name[:20]} => Verifier ERROR: {e}')

    print()
    print('Key check: In risk_analysis mode, engine.py line 407 sets keep_path=True ALWAYS.')
    print('Verifier score is advisory only - no paths are hard-filtered in risk mode.')

asyncio.run(test_verifier())

# ── 4. Summary ──────────────────────────────────────────────────────
print()
print('=' * 60)
print('Step 4: Diagnostic Summary')
print('=' * 60)
print(f'  Neo4j connection: OK')
print(f'  Test entity: {test_entity}')
print(f'  Subgraph size: {len(node_list)} nodes, {len(edges)} edges')
print(f'  Edge types: {sorted(set(e["relation"] for e in edges))}')
print(f'  Candidate paths (expanded whitelist): {len(candidates)}')
print(f'  Entity stats type_counts: {GraphAnalyticsTool.compute_entity_stats(node_list)["entity_type_counts"]}')
print()
print('Frontend checks (open browser Console after sending query):')
print('  [agentStore] onSubgraph -> nodes/edges/paths count')
print('  [agentStore] onCandidateRiskPaths -> candidate count + merged paths')
print('  [agentStore] onCommunity -> community count + method')
print('  [agentStore] onEntityCommunityMap -> entity count + unmapped')
print('  [buildG6Data] rendered -> G6 nodes/edges/pathNodeIds/pathEdgeKeys')
