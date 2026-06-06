"""Diagnostic script: test DRAEngine Cypher + Verifier scoring for KnowledgeQA graph view."""
import sys, asyncio
sys.path.insert(0, '.')

from dotenv import load_dotenv
load_dotenv()

from core.database import Neo4jClient
from dra_ma.tools.graph_analytics_tools import GraphAnalyticsTool

client = Neo4jClient.from_env()
test_entity = '鑫达投资管理有限公司'

# ── 1. Simulate DRAEngine 1-hop subgraph retrieval ──────────────────
print('=' * 60)
print('1. DRAEngine 1-hop subgraph simulation')
print('=' * 60)

q1 = client.execute_read(
    "MATCH (n {name: $name})-[r]-(m) "
    "RETURN DISTINCT elementId(n) AS n_id, n.name AS n_name, labels(n) AS n_labels, "
    "elementId(m) AS m_id, m.name AS m_name, labels(m) AS m_labels, "
    "type(r) AS relation "
    "LIMIT 20",
    parameters={"name": test_entity}
)
print(f'1-hop results: {len(q1)} rows')

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

# ── 2. Enumerate candidate risk paths (with NEW expanded whitelist) ─
print()
print('=' * 60)
print('2. Candidate Risk Paths (expanded whitelist)')
print('=' * 60)

candidates = GraphAnalyticsTool.enumerate_candidate_risk_paths(node_list, edges)
print(f'Candidate paths: {len(candidates)}')
for p in candidates:
    print(f'  {p["path_id"]}: {p["entities"][0][:25]} -[{p["relation"]}]-> {p["entities"][1][:25]}  '
          f'risk={p["risk_level_hint"]} conf={p["confidence"]}')

# ── 3. Compute entity stats ─────────────────────────────────────────
print()
print('=' * 60)
print('3. Entity Stats')
print('=' * 60)

stats = GraphAnalyticsTool.compute_entity_stats(node_list)
print(f'  total_entities: {stats["total_entities"]}')
print(f'  type_counts: {stats["entity_type_counts"]}')

# ── 4. Compute graph metrics ────────────────────────────────────────
print()
print('=' * 60)
print('4. Graph Metrics')
print('=' * 60)

metrics = GraphAnalyticsTool.compute_graph_metrics(node_list, edges)
scoring_indicators = GraphAnalyticsTool.compute_scoring_indicators(node_list, edges, [])
merged = {**metrics, **scoring_indicators}
for k, v in merged.items():
    print(f'  {k}: {v}')

# ── 5. 2-hop propagation test ───────────────────────────────────────
print()
print('=' * 60)
print('5. 2-hop propagation (risk paths)')
print('=' * 60)

q2 = client.execute_read(
    "MATCH (n {name: $name})-[r1]-(m1)-[r2]-(m2) "
    "WHERE m2.name <> n.name "
    "RETURN DISTINCT n.name AS start, type(r1) AS rel1, m1.name AS mid, "
    "type(r2) AS rel2, m2.name AS end "
    "LIMIT 20",
    parameters={'name': test_entity}
)
print(f'2-hop paths: {len(q2)}')
for rec in q2:
    print(f'  {rec["start"][:15]} -[{rec["rel1"]:12s}]-> {rec["mid"][:20]} -[{rec["rel2"]:12s}]-> {rec["end"][:20]}')

# ── 6. Check specific risk relations for this entity ─────────────────
print()
print('=' * 60)
print('6. Risk relation coverage for test entity')
print('=' * 60)

for rel in ['GUARANTEE', 'CONTROLLER', 'MENTION', 'TRIGGERS', 'CAUSE', 'INVEST', 'WORK', 'REFLECTS']:
    q3 = client.execute_read(
        f"MATCH (n {{name: $name}})-[r:{rel}]-(m) RETURN count(*) AS cnt",
        parameters={'name': test_entity}
    )
    count = q3[0]['cnt'] if q3 else 0
    status = '[OK] candidate' if count > 0 else '- absent'
    print(f'  {rel:15s}: {count:3d} edges  {status}')

print()
print('Done.')
