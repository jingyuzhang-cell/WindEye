"""Phase 1 acceptance test for POST /api/v1/governance/community-discovery."""
import json
import urllib.request

API_URL = "http://127.0.0.1:18900/api/v1/governance/community-discovery"


def test(method, max_hop=3, seed="鑫达投资管理有限公司", label=""):
    request_body = {
        "seedNames": [seed],
        "seedIds": [],
        "maxHop": max_hop,
        "method": method,
        "communityMode": "expanded",
        "minCommunitySize": 2,
        "pathLimit": 5000,
        "maxNodes": 300,
        "relationWhitelist": [],
        "includeHgtEmbedding": False,
    }

    data = json.dumps(request_body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        print(f"[{label}] REQUEST FAILED: {exc}")
        return None

    csg = result.get("connectedSubgraph", {})
    csg_nc = csg.get("nodeCount", 0)
    communities = result.get("communities", [])
    cg = result.get("communityGraph", {})
    scid = result.get("seedCommunityId")
    seed_nodes = result.get("seedNodes", [])
    subgraph = result.get("subgraph", {})

    name = label or f"{method}_h{max_hop}"
    print(f"[{name}] selectedMethod={result.get('selectedMethod')} "
          f"subgraph={subgraph.get('nodeCount',0)}n/{subgraph.get('edgeCount',0)}e "
          f"connected={csg_nc}n/{csg.get('edgeCount',0)}e "
          f"communities={len(communities)} "
          f"cgNodes={len(cg.get('nodes',[]))} "
          f"cgEdges={len(cg.get('edges',[]))} "
          f"seedCid={scid} "
          f"seedNode={seed_nodes[0].get('name','?') if seed_nodes else 'NONE'} "
          f"fallback={result.get('fallbackReason')}")

    for c in communities:
        members_sample = [m.get('name', '?') for m in c.get('members', [])[:5]]
        print(f"  Community {c.get('communityId')}: size={c.get('size')} "
              f"density={c.get('density')} labels={c.get('labelDistribution')}")
        print(f"    top members: {members_sample}")

    if cg.get('edges'):
        for e in cg['edges']:
            print(f"  CG Edge: {e.get('source')} -> {e.get('target')} "
                  f"rels={e.get('relationCount')} [{e.get('riskLevel')}] "
                  f"types={e.get('mainRelations')}")

    # Verify entityCommunityMap uses node_id as key
    ecm = result.get("entityCommunityMap", {})
    if ecm:
        sample_key = next(iter(ecm.keys()))
        print(f"  entityCommunityMap key sample: {sample_key[:50]}... (type={type(sample_key).__name__})")
        sample_val = ecm[sample_key]
        print(f"    -> communityId={sample_val.get('communityId')} role={sample_val.get('role')} isSeed={sample_val.get('isSeed')} riskLevel={sample_val.get('riskLevel')}")

    return result


if __name__ == "__main__":
    print("=" * 60)
    print("PHASE 1 ACCEPTANCE TEST")
    print("=" * 60)

    # Test with different hop counts
    test("auto", max_hop=3, label="auto_h3")
    print()
    test("louvain", max_hop=3, label="louvain_h3")
    print()
    test("auto", max_hop=4, label="auto_h4")
    print()
    test("louvain", max_hop=4, label="louvain_h4")
