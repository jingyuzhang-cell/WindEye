// Full pipeline test: 4 companies
// Unique persons: 12, Statements: 31

// --- Statement 1 ---
MERGE (p:PERSON:Subject {name: "张明远", ID: "310000198001010001"})
ON CREATE SET
  p.PERSON_NM = "张明远",
  p.POSITION = "法定代表人",
  p.source = "demo",
  p.confidence = 0.5,
  p.aliases = "[]",
  p.company_count = 2,
  p.crawl_batch = "final_test",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "张明远",
  p.source = CASE
    WHEN p.source CONTAINS "demo" THEN p.source
    WHEN p.source IS NULL THEN "demo"
    ELSE p.source + ",demo"
  END,
  p.confidence = CASE WHEN p.confidence < 0.5 THEN 0.5 ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < 2 THEN 2 ELSE p.company_count END,
  p.crawl_batch = "final_test",
  p.last_seen = datetime();

// --- Statement 2 ---
MERGE (p:PERSON:Subject {name: "赵志强", ID: "310000196507040004"})
ON CREATE SET
  p.PERSON_NM = "赵志强",
  p.POSITION = "法定代表人",
  p.source = "demo",
  p.confidence = 0.5,
  p.aliases = "[]",
  p.company_count = 1,
  p.crawl_batch = "final_test",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "赵志强",
  p.source = CASE
    WHEN p.source CONTAINS "demo" THEN p.source
    WHEN p.source IS NULL THEN "demo"
    ELSE p.source + ",demo"
  END,
  p.confidence = CASE WHEN p.confidence < 0.5 THEN 0.5 ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < 1 THEN 1 ELSE p.company_count END,
  p.crawl_batch = "final_test",
  p.last_seen = datetime();

// --- Statement 3 ---
MERGE (p:PERSON:Subject {name: "陈晓峰", ID: "310000197809050005"})
ON CREATE SET
  p.PERSON_NM = "陈晓峰",
  p.POSITION = "法定代表人",
  p.source = "demo",
  p.confidence = 0.5,
  p.aliases = "[]",
  p.company_count = 2,
  p.crawl_batch = "final_test",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "陈晓峰",
  p.source = CASE
    WHEN p.source CONTAINS "demo" THEN p.source
    WHEN p.source IS NULL THEN "demo"
    ELSE p.source + ",demo"
  END,
  p.confidence = CASE WHEN p.confidence < 0.5 THEN 0.5 ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < 2 THEN 2 ELSE p.company_count END,
  p.crawl_batch = "final_test",
  p.last_seen = datetime();

// --- Statement 4 ---
MERGE (p:PERSON:Subject {name: "李建国"})
ON CREATE SET
  p.PERSON_NM = "李建国",
  p.POSITION = "总经理",
  p.source = "demo",
  p.confidence = 0.5,
  p.aliases = "[]",
  p.company_count = 1,
  p.crawl_batch = "final_test",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "李建国",
  p.source = CASE
    WHEN p.source CONTAINS "demo" THEN p.source
    WHEN p.source IS NULL THEN "demo"
    ELSE p.source + ",demo"
  END,
  p.confidence = CASE WHEN p.confidence < 0.5 THEN 0.5 ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < 1 THEN 1 ELSE p.company_count END,
  p.crawl_batch = "final_test",
  p.last_seen = datetime();

// --- Statement 5 ---
MERGE (p:PERSON:Subject {name: "王丽华"})
ON CREATE SET
  p.PERSON_NM = "王丽华",
  p.POSITION = "财务总监",
  p.source = "demo",
  p.confidence = 0.5,
  p.aliases = "[]",
  p.company_count = 2,
  p.crawl_batch = "final_test",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "王丽华",
  p.source = CASE
    WHEN p.source CONTAINS "demo" THEN p.source
    WHEN p.source IS NULL THEN "demo"
    ELSE p.source + ",demo"
  END,
  p.confidence = CASE WHEN p.confidence < 0.5 THEN 0.5 ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < 2 THEN 2 ELSE p.company_count END,
  p.crawl_batch = "final_test",
  p.last_seen = datetime();

// --- Statement 6 ---
MERGE (p:PERSON:Subject {name: "孙志强"})
ON CREATE SET
  p.PERSON_NM = "孙志强",
  p.POSITION = "监事",
  p.source = "demo",
  p.confidence = 0.5,
  p.aliases = "[]",
  p.company_count = 1,
  p.crawl_batch = "final_test",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "孙志强",
  p.source = CASE
    WHEN p.source CONTAINS "demo" THEN p.source
    WHEN p.source IS NULL THEN "demo"
    ELSE p.source + ",demo"
  END,
  p.confidence = CASE WHEN p.confidence < 0.5 THEN 0.5 ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < 1 THEN 1 ELSE p.company_count END,
  p.crawl_batch = "final_test",
  p.last_seen = datetime();

// --- Statement 7 ---
MERGE (p:PERSON:Subject {name: "刘伟民"})
ON CREATE SET
  p.PERSON_NM = "刘伟民",
  p.POSITION = "总经理",
  p.source = "demo",
  p.confidence = 0.5,
  p.aliases = "[]",
  p.company_count = 1,
  p.crawl_batch = "final_test",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "刘伟民",
  p.source = CASE
    WHEN p.source CONTAINS "demo" THEN p.source
    WHEN p.source IS NULL THEN "demo"
    ELSE p.source + ",demo"
  END,
  p.confidence = CASE WHEN p.confidence < 0.5 THEN 0.5 ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < 1 THEN 1 ELSE p.company_count END,
  p.crawl_batch = "final_test",
  p.last_seen = datetime();

// --- Statement 8 ---
MERGE (p:PERSON:Subject {name: "陈芳"})
ON CREATE SET
  p.PERSON_NM = "陈芳",
  p.POSITION = "财务负责人",
  p.source = "demo",
  p.confidence = 0.5,
  p.aliases = "[]",
  p.company_count = 1,
  p.crawl_batch = "final_test",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "陈芳",
  p.source = CASE
    WHEN p.source CONTAINS "demo" THEN p.source
    WHEN p.source IS NULL THEN "demo"
    ELSE p.source + ",demo"
  END,
  p.confidence = CASE WHEN p.confidence < 0.5 THEN 0.5 ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < 1 THEN 1 ELSE p.company_count END,
  p.crawl_batch = "final_test",
  p.last_seen = datetime();

// --- Statement 9 ---
MERGE (p:PERSON:Subject {name: "周建华"})
ON CREATE SET
  p.PERSON_NM = "周建华",
  p.POSITION = "副总经理",
  p.source = "demo",
  p.confidence = 0.5,
  p.aliases = "[]",
  p.company_count = 1,
  p.crawl_batch = "final_test",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "周建华",
  p.source = CASE
    WHEN p.source CONTAINS "demo" THEN p.source
    WHEN p.source IS NULL THEN "demo"
    ELSE p.source + ",demo"
  END,
  p.confidence = CASE WHEN p.confidence < 0.5 THEN 0.5 ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < 1 THEN 1 ELSE p.company_count END,
  p.crawl_batch = "final_test",
  p.last_seen = datetime();

// --- Statement 10 ---
MERGE (p:PERSON:Subject {name: "吴涛"})
ON CREATE SET
  p.PERSON_NM = "吴涛",
  p.POSITION = "风控总监",
  p.source = "demo",
  p.confidence = 0.5,
  p.aliases = "[]",
  p.company_count = 1,
  p.crawl_batch = "final_test",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "吴涛",
  p.source = CASE
    WHEN p.source CONTAINS "demo" THEN p.source
    WHEN p.source IS NULL THEN "demo"
    ELSE p.source + ",demo"
  END,
  p.confidence = CASE WHEN p.confidence < 0.5 THEN 0.5 ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < 1 THEN 1 ELSE p.company_count END,
  p.crawl_batch = "final_test",
  p.last_seen = datetime();

// --- Statement 11 ---
MERGE (p:PERSON:Subject {name: "徐明辉"})
ON CREATE SET
  p.PERSON_NM = "徐明辉",
  p.POSITION = "技术总监",
  p.source = "demo",
  p.confidence = 0.5,
  p.aliases = "[]",
  p.company_count = 1,
  p.crawl_batch = "final_test",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "徐明辉",
  p.source = CASE
    WHEN p.source CONTAINS "demo" THEN p.source
    WHEN p.source IS NULL THEN "demo"
    ELSE p.source + ",demo"
  END,
  p.confidence = CASE WHEN p.confidence < 0.5 THEN 0.5 ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < 1 THEN 1 ELSE p.company_count END,
  p.crawl_batch = "final_test",
  p.last_seen = datetime();

// --- Statement 12 ---
MERGE (p:PERSON:Subject {name: "梁欣怡"})
ON CREATE SET
  p.PERSON_NM = "梁欣怡",
  p.POSITION = "运营总监",
  p.source = "demo",
  p.confidence = 0.5,
  p.aliases = "[]",
  p.company_count = 1,
  p.crawl_batch = "final_test",
  p.created_at = datetime()
ON MATCH SET
  p.PERSON_NM = "梁欣怡",
  p.source = CASE
    WHEN p.source CONTAINS "demo" THEN p.source
    WHEN p.source IS NULL THEN "demo"
    ELSE p.source + ",demo"
  END,
  p.confidence = CASE WHEN p.confidence < 0.5 THEN 0.5 ELSE p.confidence END,
  p.company_count = CASE WHEN p.company_count < 1 THEN 1 ELSE p.company_count END,
  p.crawl_batch = "final_test",
  p.last_seen = datetime();

// --- Statement 13 ---
MATCH (p:PERSON:Subject {name: "张明远", ID: "310000198001010001"})
MATCH (c:COMPANY {COMPANY_NM: "华创控股集团有限公司"})
MERGE (p)-[r:LEGAL_PERSON]->(c)
ON CREATE SET
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 14 ---
MATCH (p:PERSON:Subject {name: "张明远", ID: "310000198001010001"})
MATCH (c:COMPANY {COMPANY_NM: "华创地产股份有限公司"})
MERGE (p)-[r:LEGAL_PERSON]->(c)
ON CREATE SET
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 15 ---
MATCH (p:PERSON:Subject {name: "张明远", ID: "310000198001010001"})
MATCH (c:COMPANY {COMPANY_NM: "华创控股集团有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "董事长",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "董事长",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 16 ---
MATCH (p:PERSON:Subject {name: "张明远", ID: "310000198001010001"})
MATCH (c:COMPANY {COMPANY_NM: "华创地产股份有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "董事长",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "董事长",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 17 ---
MATCH (p:PERSON:Subject {name: "赵志强", ID: "310000196507040004"})
MATCH (c:COMPANY {COMPANY_NM: "海通金融服务有限公司"})
MERGE (p)-[r:LEGAL_PERSON]->(c)
ON CREATE SET
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 18 ---
MATCH (p:PERSON:Subject {name: "赵志强", ID: "310000196507040004"})
MATCH (c:COMPANY {COMPANY_NM: "海通金融服务有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "董事长",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "董事长",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 19 ---
MATCH (p:PERSON:Subject {name: "陈晓峰", ID: "310000197809050005"})
MATCH (c:COMPANY {COMPANY_NM: "天元科技发展有限公司"})
MERGE (p)-[r:LEGAL_PERSON]->(c)
ON CREATE SET
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 20 ---
MATCH (p:PERSON:Subject {name: "陈晓峰", ID: "310000197809050005"})
MATCH (c:COMPANY {COMPANY_NM: "海通金融服务有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "监事",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "监事",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 21 ---
MATCH (p:PERSON:Subject {name: "陈晓峰", ID: "310000197809050005"})
MATCH (c:COMPANY {COMPANY_NM: "天元科技发展有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "总经理",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "总经理",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 22 ---
MATCH (p:PERSON:Subject {name: "李建国"})
MATCH (c:COMPANY {COMPANY_NM: "华创控股集团有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "总经理",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "总经理",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 23 ---
MATCH (p:PERSON:Subject {name: "王丽华"})
MATCH (c:COMPANY {COMPANY_NM: "华创控股集团有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "财务总监",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "财务总监",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 24 ---
MATCH (p:PERSON:Subject {name: "王丽华"})
MATCH (c:COMPANY {COMPANY_NM: "海通金融服务有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "财务负责人",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "财务负责人",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 25 ---
MATCH (p:PERSON:Subject {name: "孙志强"})
MATCH (c:COMPANY {COMPANY_NM: "华创控股集团有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "监事",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "监事",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 26 ---
MATCH (p:PERSON:Subject {name: "刘伟民"})
MATCH (c:COMPANY {COMPANY_NM: "华创地产股份有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "总经理",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "总经理",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 27 ---
MATCH (p:PERSON:Subject {name: "陈芳"})
MATCH (c:COMPANY {COMPANY_NM: "华创地产股份有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "财务负责人",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "财务负责人",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 28 ---
MATCH (p:PERSON:Subject {name: "周建华"})
MATCH (c:COMPANY {COMPANY_NM: "华创地产股份有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "副总经理",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "副总经理",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 29 ---
MATCH (p:PERSON:Subject {name: "吴涛"})
MATCH (c:COMPANY {COMPANY_NM: "海通金融服务有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "风控总监",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "风控总监",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 30 ---
MATCH (p:PERSON:Subject {name: "徐明辉"})
MATCH (c:COMPANY {COMPANY_NM: "天元科技发展有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "技术总监",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "技术总监",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

// --- Statement 31 ---
MATCH (p:PERSON:Subject {name: "梁欣怡"})
MATCH (c:COMPANY {COMPANY_NM: "天元科技发展有限公司"})
MERGE (p)-[r:EXECUTIVE]->(c)
ON CREATE SET
  r.position = "运营总监",
  r.source = "demo",
  r.crawl_batch = "final_test",
  r.created_at = datetime()
ON MATCH SET
  r.position = "运营总监",
  r.last_seen = datetime(),
  r.crawl_batch = "final_test";

