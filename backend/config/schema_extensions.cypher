// ============================================================================
// BiDA-KG Schema Extensions — 风险报告节点
// Version: 1.0
//
// Usage: Run against Neo4j Browser or cypher-shell:
//   :source schema_extensions.cypher
// ============================================================================

// ---------------------------------------------------------------------------
// Section 1: Unique constraints (primary keys)
// ---------------------------------------------------------------------------

// RiskReport — 自动生成的风险报告
CREATE CONSTRAINT risk_report_id_unique IF NOT EXISTS
FOR (r:RiskReport) REQUIRE r.report_id IS UNIQUE;

// ---------------------------------------------------------------------------
// Section 2: Property indexes
// ---------------------------------------------------------------------------

// RiskReport full-text index (title + summary)
CREATE FULLTEXT INDEX reportFtIdx IF NOT EXISTS
FOR (r:RiskReport) ON EACH [r.title, r.summary]
OPTIONS {indexConfig: {`fulltext.analyzer`: 'simple'}};

// ---------------------------------------------------------------------------
// Utility: Verify all new constraints and indexes are online
// ---------------------------------------------------------------------------
// SHOW CONSTRAINTS YIELD name, type, entityType, state
// WHERE entityType IN ['RiskReport']
// RETURN name, type, state;
//
// SHOW INDEXES YIELD name, type, state
// WHERE name IN ['reportFtIdx']
// RETURN name, type, state;
