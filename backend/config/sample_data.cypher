// ============================================================================
// BiDA-KG 四层金融风控知识图谱 — 样本数据
// 场景: 某集团企业间股权穿透、担保链、高管关联、被执行事件、监管处罚
// ============================================================================

// ── 清理旧数据 (谨慎使用) ─────────────────────────────────────────────────
MATCH (n) DETACH DELETE n;

// ============================================================================
// Layer 1: 主体层 (Subject) — 企业 + 自然人
// ============================================================================

// ── 企业 ──
CREATE (c1:COMPANY:Subject {name: '华创控股集团有限公司', COMPANY_NM: '华创控股集团有限公司', ORGNUM: '91110000MA0000001', STATUS: '存续', REG_CAPITAL: '500000万', WARNING_NUM: 12, RISK_INFO: '[]'});
CREATE (c2:COMPANY:Subject {name: '华创地产股份有限公司',   COMPANY_NM: '华创地产股份有限公司',   ORGNUM: '91110000MA0000002', STATUS: '存续', REG_CAPITAL: '200000万', WARNING_NUM: 8,  RISK_INFO: '[]'});
CREATE (c3:COMPANY:Subject {name: '华创贸易有限责任公司',   COMPANY_NM: '华创贸易有限责任公司',   ORGNUM: '91110000MA0000003', STATUS: '存续', REG_CAPITAL: '50000万',  WARNING_NUM: 3,  RISK_INFO: '[]'});
CREATE (c4:COMPANY:Subject {name: '鑫达投资管理有限公司',   COMPANY_NM: '鑫达投资管理有限公司',   ORGNUM: '91110000MA0000004', STATUS: '存续', REG_CAPITAL: '10000万',  WARNING_NUM: 5,  RISK_INFO: '[]'});
CREATE (c5:COMPANY:Subject {name: '中远建设工程有限公司',   COMPANY_NM: '中远建设工程有限公司',   ORGNUM: '91110000MA0000005', STATUS: '存续', REG_CAPITAL: '30000万',  WARNING_NUM: 2,  RISK_INFO: '[]'});
CREATE (c6:COMPANY:Subject {name: '海通金融服务有限公司',   COMPANY_NM: '海通金融服务有限公司',   ORGNUM: '91110000MA0000006', STATUS: '吊销', REG_CAPITAL: '80000万',  WARNING_NUM: 15, RISK_INFO: '[]'});
CREATE (c7:COMPANY:Subject {name: '天元科技发展有限公司',   COMPANY_NM: '天元科技发展有限公司',   ORGNUM: '91110000MA0000007', STATUS: '存续', REG_CAPITAL: '15000万',  WARNING_NUM: 1,  RISK_INFO: '[]'});

// ── 自然人 ──
CREATE (p1:PERSON:Subject {name: '张明远', PERSON_NM: '张明远', POSITION: '董事长', ID: '310000198001010001'});
CREATE (p2:PERSON:Subject {name: '李建国', PERSON_NM: '李建国', POSITION: '总经理', ID: '310000198205020002'});
CREATE (p3:PERSON:Subject {name: '王丽华', PERSON_NM: '王丽华', POSITION: '财务总监', ID: '310000198308030003'});
CREATE (p4:PERSON:Subject {name: '赵志强', PERSON_NM: '赵志强', POSITION: '法人代表', ID: '310000196507040004'});
CREATE (p5:PERSON:Subject {name: '陈晓峰', PERSON_NM: '陈晓峰', POSITION: '监事',     ID: '310000197809050005'});

// ============================================================================
// Layer 1 关系: 主体层内部
// ============================================================================

MATCH (c1:COMPANY {name:'华创控股集团有限公司'}), (c2:COMPANY {name:'华创地产股份有限公司'}) CREATE (c1)-[:INVEST {ratio:'70%', amount:'140000万'}]->(c2);
MATCH (c1:COMPANY {name:'华创控股集团有限公司'}), (c3:COMPANY {name:'华创贸易有限责任公司'}) CREATE (c1)-[:INVEST {ratio:'51%', amount:'25500万'}]->(c3);
MATCH (c1:COMPANY {name:'华创控股集团有限公司'}), (c4:COMPANY {name:'鑫达投资管理有限公司'}) CREATE (c1)-[:INVEST {ratio:'80%', amount:'8000万'}]->(c4);
MATCH (c2:COMPANY {name:'华创地产股份有限公司'}), (c5:COMPANY {name:'中远建设工程有限公司'}) CREATE (c2)-[:INVEST {ratio:'60%', amount:'18000万'}]->(c5);
MATCH (c4:COMPANY {name:'鑫达投资管理有限公司'}), (c6:COMPANY {name:'海通金融服务有限公司'}) CREATE (c4)-[:INVEST {ratio:'30%', amount:'24000万'}]->(c6);
MATCH (c4:COMPANY {name:'鑫达投资管理有限公司'}), (c2:COMPANY {name:'华创地产股份有限公司'}) CREATE (c4)-[:INVEST {ratio:'10%', amount:'20000万'}]->(c2);
MATCH (c6:COMPANY {name:'海通金融服务有限公司'}), (c3:COMPANY {name:'华创贸易有限责任公司'}) CREATE (c6)-[:GUARANTEE {amount:'10000万', start_date:'2024-06-01'}]->(c3);
MATCH (c2:COMPANY {name:'华创地产股份有限公司'}), (c6:COMPANY {name:'海通金融服务有限公司'}) CREATE (c2)-[:GUARANTEE {amount:'50000万', start_date:'2024-03-15'}]->(c6);

// ── 高管任职 ──
MATCH (p1:PERSON {name:'张明远'}), (c1:COMPANY {name:'华创控股集团有限公司'}) CREATE (p1)-[:CONTROLLER]->(c1);
MATCH (p1:PERSON {name:'张明远'}), (c2:COMPANY {name:'华创地产股份有限公司'}) CREATE (p1)-[:WORK {position:'董事长'}]->(c2);
MATCH (p1:PERSON {name:'张明远'}), (c4:COMPANY {name:'鑫达投资管理有限公司'}) CREATE (p1)-[:WORK {position:'执行董事'}]->(c4);
MATCH (p2:PERSON {name:'李建国'}), (c1:COMPANY {name:'华创控股集团有限公司'}) CREATE (p2)-[:WORK {position:'总经理'}]->(c1);
MATCH (p2:PERSON {name:'李建国'}), (c3:COMPANY {name:'华创贸易有限责任公司'}) CREATE (p2)-[:WORK {position:'法人代表'}]->(c3);
MATCH (p3:PERSON {name:'王丽华'}), (c1:COMPANY {name:'华创控股集团有限公司'}) CREATE (p3)-[:WORK {position:'财务总监'}]->(c1);
MATCH (p3:PERSON {name:'王丽华'}), (c6:COMPANY {name:'海通金融服务有限公司'}) CREATE (p3)-[:WORK {position:'财务负责人'}]->(c6);
MATCH (p4:PERSON {name:'赵志强'}), (c6:COMPANY {name:'海通金融服务有限公司'}) CREATE (p4)-[:CONTROLLER]->(c6);
MATCH (p4:PERSON {name:'赵志强'}), (c5:COMPANY {name:'中远建设工程有限公司'}) CREATE (p4)-[:WORK {position:'项目经理'}]->(c5);
MATCH (p5:PERSON {name:'陈晓峰'}), (c4:COMPANY {name:'鑫达投资管理有限公司'}) CREATE (p5)-[:WORK {position:'监事'}]->(c4);
MATCH (p5:PERSON {name:'陈晓峰'}), (c6:COMPANY {name:'海通金融服务有限公司'}) CREATE (p5)-[:WORK {position:'监事'}]->(c6);

// ── 交叉持股 (隐性关联) ──
MATCH (c3:COMPANY {name:'华创贸易有限责任公司'}), (c4:COMPANY {name:'鑫达投资管理有限公司'}) CREATE (c3)-[:INVEST {ratio:'15%', amount:'7500万'}]->(c4);

// ============================================================================
// Layer 2: 事件层 (Event) — 风险事件 + 时间
// ============================================================================

// ── 时间节点 ──
CREATE (t1:TIME:Event {id:'2024-03-15', normalized_time:'2024-03-15'});
CREATE (t2:TIME:Event {id:'2024-06-20', normalized_time:'2024-06-20'});
CREATE (t3:TIME:Event {id:'2024-09-10', normalized_time:'2024-09-10'});
CREATE (t4:TIME:Event {id:'2024-12-05', normalized_time:'2024-12-05'});
CREATE (t5:TIME:Event {id:'2025-01-18', normalized_time:'2025-01-18'});
CREATE (t6:TIME:Event {id:'2025-03-22', normalized_time:'2025-03-22'});
CREATE (t7:TIME:Event {id:'2025-04-30', normalized_time:'2025-04-30'});

// ── 主事件 ──
CREATE (e1:EVENT:Event {
    name:'华创集团被列入被执行人', title:'华创集团被列入被执行人', EVENT_TITLE:'华创集团被列入被执行人',
    EVENT_DATE:'2024-03-15', EVENT_TYPE:'司法执行', IMPACT_LEVEL:'high',
    action_type:'被执行人', event_category:'司法',
    text:'华创控股集团因未履行对供应商的付款义务，被北京市第一中级人民法院列为被执行人，执行标的3.2亿元。'
});
CREATE (e2:EVENT:Event {
    name:'海通金融涉嫌非法集资', title:'海通金融涉嫌非法集资', EVENT_TITLE:'海通金融涉嫌非法集资',
    EVENT_DATE:'2024-06-20', EVENT_TYPE:'刑事立案', IMPACT_LEVEL:'high',
    action_type:'刑事立案', event_category:'刑事',
    text:'海通金融服务有限公司因涉嫌非法吸收公众存款，被公安机关立案侦查，涉案金额超过15亿元。'
});
CREATE (e3:EVENT:Event {
    name:'鑫达投资股权冻结', title:'鑫达投资股权冻结', EVENT_TITLE:'鑫达投资股权冻结',
    EVENT_DATE:'2024-09-10', EVENT_TYPE:'股权冻结', IMPACT_LEVEL:'medium',
    action_type:'股权冻结', event_category:'司法',
    text:'鑫达投资持有的华创地产10%股权被上海市金融法院冻结，系海通金融案件牵连。'
});
CREATE (e4:EVENT:Event {
    name:'证监会立案调查华创系', title:'证监会立案调查华创系', EVENT_TITLE:'证监会立案调查华创系',
    EVENT_DATE:'2024-12-05', EVENT_TYPE:'行政调查', IMPACT_LEVEL:'high',
    action_type:'行政调查', event_category:'监管',
    text:'因海通金融案件，中国证监会对华创系3家公司启动立案调查，涉及关联交易和信息披露问题。'
});
CREATE (e5:EVENT:Event {
    name:'华创地产债券违约', title:'华创地产债券违约', EVENT_TITLE:'华创地产债券违约',
    EVENT_DATE:'2025-01-18', EVENT_TYPE:'债务违约', IMPACT_LEVEL:'high',
    action_type:'债务违约', event_category:'金融',
    text:'华创地产发行的"20华创01"公司债未能按期兑付本息，违约金额8.5亿元，引发市场关注。'
});

// ── 子事件 ──
CREATE (se1:EVENT:Event {
    name:'张明远被限制高消费', title:'张明远被限制高消费', EVENT_TITLE:'张明远被限制高消费',
    EVENT_DATE:'2024-03-20', EVENT_TYPE:'限制消费', IMPACT_LEVEL:'medium',
    action_type:'限制消费令', event_category:'司法', parent_event:'华创集团被列入被执行人',
    text:'因华创集团被执行案件，实际控制人张明远被法院下达限制高消费令。'
});
CREATE (se2:EVENT:Event {
    name:'华创地产信用评级下调', title:'华创地产信用评级下调', EVENT_TITLE:'华创地产信用评级下调',
    EVENT_DATE:'2025-02-01', EVENT_TYPE:'评级下调', IMPACT_LEVEL:'medium',
    action_type:'信用评级下调', event_category:'金融', parent_event:'华创地产债券违约',
    text:'中诚信国际将华创地产主体信用等级由AA-下调至BBB，展望负面。'
});

// ── 事件→公司关系 ──
MATCH (e1:EVENT {name:'华创集团被列入被执行人'}), (c1:COMPANY {name:'华创控股集团有限公司'}) CREATE (e1)-[:MENTION]->(c1);
MATCH (e2:EVENT {name:'海通金融涉嫌非法集资'}), (c6:COMPANY {name:'海通金融服务有限公司'}) CREATE (e2)-[:MENTION]->(c6);
MATCH (e3:EVENT {name:'鑫达投资股权冻结'}), (c4:COMPANY {name:'鑫达投资管理有限公司'}) CREATE (e3)-[:MENTION]->(c4);
MATCH (e4:EVENT {name:'证监会立案调查华创系'}), (c1:COMPANY {name:'华创控股集团有限公司'}) CREATE (e4)-[:MENTION]->(c1);
MATCH (e4:EVENT {name:'证监会立案调查华创系'}), (c2:COMPANY {name:'华创地产股份有限公司'}) CREATE (e4)-[:MENTION]->(c2);
MATCH (e4:EVENT {name:'证监会立案调查华创系'}), (c6:COMPANY {name:'海通金融服务有限公司'}) CREATE (e4)-[:MENTION]->(c6);
MATCH (e5:EVENT {name:'华创地产债券违约'}), (c2:COMPANY {name:'华创地产股份有限公司'}) CREATE (e5)-[:MENTION]->(c2);
MATCH (se1:EVENT {name:'张明远被限制高消费'}), (p1:PERSON {name:'张明远'}) CREATE (se1)-[:MENTION]->(p1);
MATCH (se2:EVENT {name:'华创地产信用评级下调'}), (c2:COMPANY {name:'华创地产股份有限公司'}) CREATE (se2)-[:MENTION]->(c2);

// ── 事件→时间 ──
MATCH (e1:EVENT {name:'华创集团被列入被执行人'}), (t1:TIME {id:'2024-03-15'}) CREATE (e1)-[:BELONG]->(t1);
MATCH (e2:EVENT {name:'海通金融涉嫌非法集资'}), (t2:TIME {id:'2024-06-20'}) CREATE (e2)-[:BELONG]->(t2);
MATCH (e3:EVENT {name:'鑫达投资股权冻结'}), (t3:TIME {id:'2024-09-10'}) CREATE (e3)-[:BELONG]->(t3);
MATCH (e4:EVENT {name:'证监会立案调查华创系'}), (t4:TIME {id:'2024-12-05'}) CREATE (e4)-[:BELONG]->(t4);
MATCH (e5:EVENT {name:'华创地产债券违约'}), (t5:TIME {id:'2025-01-18'}) CREATE (e5)-[:BELONG]->(t5);
MATCH (se1:EVENT {name:'张明远被限制高消费'}), (t1:TIME {id:'2024-03-15'}) CREATE (se1)-[:BELONG]->(t1);
MATCH (se2:EVENT {name:'华创地产信用评级下调'}), (t6:TIME {id:'2025-03-22'}) CREATE (se2)-[:BELONG]->(t6);

// ── 事件因果链 ──
MATCH (e1:EVENT {name:'华创集团被列入被执行人'}), (se1:EVENT {name:'张明远被限制高消费'}) CREATE (e1)-[:CAUSE]->(se1);
MATCH (e2:EVENT {name:'海通金融涉嫌非法集资'}), (e3:EVENT {name:'鑫达投资股权冻结'}) CREATE (e2)-[:CAUSE]->(e3);
MATCH (e2:EVENT {name:'海通金融涉嫌非法集资'}), (e4:EVENT {name:'证监会立案调查华创系'}) CREATE (e2)-[:CAUSE]->(e4);
MATCH (e1:EVENT {name:'华创集团被列入被执行人'}), (e5:EVENT {name:'华创地产债券违约'}) CREATE (e1)-[:CAUSE]->(e5);
MATCH (e5:EVENT {name:'华创地产债券违约'}), (se2:EVENT {name:'华创地产信用评级下调'}) CREATE (e5)-[:CAUSE]->(se2);

// ── 事件层子事件关联 ──
MATCH (se1:EVENT {name:'张明远被限制高消费'}), (p1:PERSON {name:'张明远'}) CREATE (se1)-[:MENTION]->(p1);

// ============================================================================
// Layer 3: 特征层 (Feature) — 风险特征 + 风险因子
// ============================================================================

CREATE (rf1:RiskFeature:Feature {feature_type:'股权穿透异常', feature_nm:'交叉持股环路', id:'F001', e_id:'E001', e_text:'华创贸易持有鑫达投资15%股权，鑫达投资持有华创地产10%股权，华创地产为华创控股子公司，形成隐蔽的交叉持股闭环。'});
CREATE (rf2:RiskFeature:Feature {feature_type:'担保链风险', feature_nm:'连环担保', id:'F002', e_id:'E002', e_text:'华创地产为海通金融提供5亿元担保，海通金融为华创贸易提供1亿元担保，形成集团内连环担保网络。'});
CREATE (rf3:RiskFeature:Feature {feature_type:'高管交叉任职', feature_nm:'关键人兼职', id:'F003', e_id:'E003', e_text:'实际控制人张明远同时在华创控股、华创地产、鑫达投资担任董事/执行董事，财务总监王丽华同时服务华创控股和海通金融。'});
CREATE (rf4:RiskFeature:Feature {feature_type:'资金异常流动', feature_nm:'关联交易集中', id:'F004', e_id:'E004', e_text:'2024年度华创系内部关联交易额占营收比例超过60%，显著高于行业平均水平(15%)。'});
CREATE (rf5:RiskFeature:Feature {feature_type:'舆情负面', feature_nm:'媒体负面报道', id:'F005', e_id:'E005', e_text:'近6个月华创系相关负面舆情报道37篇，涉及债务违约、股权冻结、监管调查等关键词。'});

// ── 风险因子 ──
CREATE (rk1:RiskFactor:Feature {factor_nm:'股权层级>3',    e_id:'FK001', FACTOR:'1', RISK:'3', RISK_TYPE:'股权穿透风险', IMPORTANCE:'-2', NOTICE_DT:'2025-03-01'});
CREATE (rk2:RiskFactor:Feature {factor_nm:'担保金额/净资产>50%', e_id:'FK002', FACTOR:'2', RISK:'1', RISK_TYPE:'担保链风险', IMPORTANCE:'-3', NOTICE_DT:'2025-03-01'});
CREATE (rk3:RiskFactor:Feature {factor_nm:'高管兼任>=3家', e_id:'FK003', FACTOR:'3', RISK:'2', RISK_TYPE:'公司治理风险', IMPORTANCE:'-2', NOTICE_DT:'2025-03-01'});
CREATE (rk4:RiskFactor:Feature {factor_nm:'关联交易占比>50%', e_id:'FK004', FACTOR:'1', RISK:'3', RISK_TYPE:'财务异常风险', IMPORTANCE:'-2', NOTICE_DT:'2025-03-01'});
CREATE (rk5:RiskFactor:Feature {factor_nm:'司法被执行>=1次', e_id:'FK005', FACTOR:'2', RISK:'2', RISK_TYPE:'法律合规风险', IMPORTANCE:'-3', NOTICE_DT:'2025-03-01'});
CREATE (rk6:RiskFactor:Feature {factor_nm:'债券违约',       e_id:'FK006', FACTOR:'1', RISK:'1', RISK_TYPE:'信用风险',     IMPORTANCE:'-3', NOTICE_DT:'2025-03-01'});

// ── 特征→公司 ──
MATCH (rf1:RiskFeature {id:'F001'}), (c1:COMPANY {name:'华创控股集团有限公司'}) CREATE (rf1)-[:REFLECTS]->(c1);
MATCH (rf1:RiskFeature {id:'F001'}), (c3:COMPANY {name:'华创贸易有限责任公司'}) CREATE (rf1)-[:REFLECTS]->(c3);
MATCH (rf1:RiskFeature {id:'F001'}), (c4:COMPANY {name:'鑫达投资管理有限公司'}) CREATE (rf1)-[:REFLECTS]->(c4);

MATCH (rf2:RiskFeature {id:'F002'}), (c2:COMPANY {name:'华创地产股份有限公司'}) CREATE (rf2)-[:REFLECTS]->(c2);
MATCH (rf2:RiskFeature {id:'F002'}), (c6:COMPANY {name:'海通金融服务有限公司'}) CREATE (rf2)-[:REFLECTS]->(c6);

MATCH (rf3:RiskFeature {id:'F003'}), (c1:COMPANY {name:'华创控股集团有限公司'}) CREATE (rf3)-[:REFLECTS]->(c1);
MATCH (rf3:RiskFeature {id:'F003'}), (p1:PERSON {name:'张明远'}) CREATE (rf3)-[:REFLECTS]->(p1);
MATCH (rf3:RiskFeature {id:'F003'}), (p3:PERSON {name:'王丽华'}) CREATE (rf3)-[:REFLECTS]->(p3);

MATCH (rf4:RiskFeature {id:'F004'}), (c1:COMPANY {name:'华创控股集团有限公司'}) CREATE (rf4)-[:REFLECTS]->(c1);

MATCH (rf5:RiskFeature {id:'F005'}), (c2:COMPANY {name:'华创地产股份有限公司'}) CREATE (rf5)-[:REFLECTS]->(c2);
MATCH (rf5:RiskFeature {id:'F005'}), (c6:COMPANY {name:'海通金融服务有限公司'}) CREATE (rf5)-[:REFLECTS]->(c6);

// ── 风险因子→风险特征 ──
MATCH (rk1:RiskFactor {factor_nm:'股权层级>3'}), (rf1:RiskFeature {id:'F001'}) CREATE (rk1)-[:BELONG]->(rf1);
MATCH (rk2:RiskFactor {factor_nm:'担保金额/净资产>50%'}), (rf2:RiskFeature {id:'F002'}) CREATE (rk2)-[:BELONG]->(rf2);
MATCH (rk3:RiskFactor {factor_nm:'高管兼任>=3家'}), (rf3:RiskFeature {id:'F003'}) CREATE (rk3)-[:BELONG]->(rf3);
MATCH (rk4:RiskFactor {factor_nm:'关联交易占比>50%'}), (rf4:RiskFeature {id:'F004'}) CREATE (rk4)-[:BELONG]->(rf4);
MATCH (rk5:RiskFactor {factor_nm:'司法被执行>=1次'}), (rf1:RiskFeature {id:'F001'}) CREATE (rk5)-[:BELONG]->(rf1);
MATCH (rk6:RiskFactor {factor_nm:'债券违约'}), (rf5:RiskFeature {id:'F005'}) CREATE (rk6)-[:BELONG]->(rf5);

// ── 事件→特征 (事件触发特征提取) ──
MATCH (e1:EVENT {name:'华创集团被列入被执行人'}), (rf1:RiskFeature {id:'F001'}) CREATE (e1)-[:TRIGGERS]->(rf1);
MATCH (e2:EVENT {name:'海通金融涉嫌非法集资'}), (rf2:RiskFeature {id:'F002'}) CREATE (e2)-[:TRIGGERS]->(rf2);
MATCH (e3:EVENT {name:'鑫达投资股权冻结'}), (rf1:RiskFeature {id:'F001'}) CREATE (e3)-[:TRIGGERS]->(rf1);
MATCH (e4:EVENT {name:'证监会立案调查华创系'}), (rf3:RiskFeature {id:'F003'}) CREATE (e4)-[:TRIGGERS]->(rf3);
MATCH (e4:EVENT {name:'证监会立案调查华创系'}), (rf4:RiskFeature {id:'F004'}) CREATE (e4)-[:TRIGGERS]->(rf4);
MATCH (e5:EVENT {name:'华创地产债券违约'}), (rf5:RiskFeature {id:'F005'}) CREATE (e5)-[:TRIGGERS]->(rf5);

// ============================================================================
// Layer 4: 法规层 (Regulation) — 法规 + 处置动作
// ============================================================================

CREATE (l1:Law:Regulation {regulation_title:'中华人民共和国民法典', regulation_name:'民法典', regulation_id:'L001', regulation_text:''});
CREATE (l2:Law:Regulation {regulation_title:'中华人民共和国证券法', regulation_name:'证券法', regulation_id:'L002', regulation_text:''});
CREATE (l3:Law:Regulation {regulation_title:'中华人民共和国公司法', regulation_name:'公司法', regulation_id:'L003', regulation_text:''});
CREATE (l4:Law:Regulation {regulation_title:'中华人民共和国刑法', regulation_name:'刑法', regulation_id:'L004', regulation_text:''});
CREATE (l5:Law:Regulation {regulation_title:'最高人民法院关于适用<中华人民共和国公司法>若干问题的规定(五)', regulation_name:'公司法解释(五)', regulation_id:'L005', regulation_text:''});

CREATE (r1:Regulation:Regulation {regulation_title:'公司股东禁止滥用股东权利损害公司或者其他股东的利益', regulation_name:'公司法第20条', regulation_id:'R001'});
CREATE (r2:Regulation:Regulation {regulation_title:'上市公司董事、监事、高级管理人员应当保证上市公司所披露的信息真实、准确、完整', regulation_name:'证券法第82条', regulation_id:'R002'});
CREATE (r3:Regulation:Regulation {regulation_title:'公司股东应当遵守法律、行政法规和公司章程，依法行使股东权利，不得滥用股东权利损害公司或者其他股东的利益', regulation_name:'公司法第20条', regulation_id:'R003'});
CREATE (r4:Regulation:Regulation {regulation_title:'非法吸收公众存款或者变相吸收公众存款，扰乱金融秩序的，处三年以下有期徒刑或者拘役', regulation_name:'刑法第176条', regulation_id:'R004'});
CREATE (r5:Regulation:Regulation {regulation_title:'上市公司董事、监事和高级管理人员在任职期间每年转让的股份不得超过其所持有本公司股份总数的百分之二十五', regulation_name:'公司法第141条', regulation_id:'R005'});

// ── 处置动作 ──
CREATE (a1:Action:Regulation {action_type:'冻结', action_name:'冻结关联账户'});
CREATE (a2:Action:Regulation {action_type:'发函', action_name:'发送监管问询函'});
CREATE (a3:Action:Regulation {action_type:'现场检查', action_name:'安排现场核查'});
CREATE (a4:Action:Regulation {action_type:'司法移送', action_name:'移送司法机关'});
CREATE (a5:Action:Regulation {action_type:'持续监控', action_name:'纳入重点监控名单'});

// ── 法规→法律 ──
MATCH (r1:Regulation {regulation_id:'R001'}), (l3:Law {regulation_name:'公司法'}) CREATE (r1)-[:BELONG]->(l3);
MATCH (r2:Regulation {regulation_id:'R002'}), (l2:Law {regulation_name:'证券法'}) CREATE (r2)-[:BELONG]->(l2);
MATCH (r3:Regulation {regulation_id:'R003'}), (l3:Law {regulation_name:'公司法'}) CREATE (r3)-[:BELONG]->(l3);
MATCH (r4:Regulation {regulation_id:'R004'}), (l4:Law {regulation_name:'刑法'}) CREATE (r4)-[:BELONG]->(l4);
MATCH (r5:Regulation {regulation_id:'R005'}), (l3:Law {regulation_name:'公司法'}) CREATE (r5)-[:BELONG]->(l3);

// ── 法规→处置动作 ──
MATCH (r1:Regulation {regulation_id:'R001'}), (a1:Action {action_type:'冻结'}) CREATE (r1)-[:TRIGGERS]->(a1);
MATCH (r2:Regulation {regulation_id:'R002'}), (a2:Action {action_type:'发函'}) CREATE (r2)-[:TRIGGERS]->(a2);
MATCH (r3:Regulation {regulation_id:'R003'}), (a3:Action {action_type:'现场检查'}) CREATE (r3)-[:TRIGGERS]->(a3);
MATCH (r4:Regulation {regulation_id:'R004'}), (a4:Action {action_type:'司法移送'}) CREATE (r4)-[:TRIGGERS]->(a4);
MATCH (r5:Regulation {regulation_id:'R005'}), (a5:Action {action_type:'持续监控'}) CREATE (r5)-[:TRIGGERS]->(a5);

// ── 合规匹配 (事件→法规) ──
MATCH (e1:EVENT {name:'华创集团被列入被执行人'}), (r1:Regulation {regulation_id:'R001'}) CREATE (e1)-[:COMPLIES_WITH]->(r1);
MATCH (e2:EVENT {name:'海通金融涉嫌非法集资'}), (r4:Regulation {regulation_id:'R004'}) CREATE (e2)-[:COMPLIES_WITH]->(r4);
MATCH (e4:EVENT {name:'证监会立案调查华创系'}), (r2:Regulation {regulation_id:'R002'}) CREATE (e4)-[:COMPLIES_WITH]->(r2);
MATCH (e5:EVENT {name:'华创地产债券违约'}), (r3:Regulation {regulation_id:'R003'}) CREATE (e5)-[:COMPLIES_WITH]->(r3);

// ============================================================================
// Layer 源事件 (Source events for test data)
// ============================================================================

// ── 证监会处罚事件 ──
CREATE (ev1:EVENT:Event {
    name:'华创控股信披违规处罚', title:'华创控股信披违规处罚', EVENT_TITLE:'华创控股信披违规处罚',
    EVENT_DATE:'2025-03-22', EVENT_TYPE:'行政处罚', IMPACT_LEVEL:'high',
    action_type:'行政处罚', event_category:'监管',
    text:'因未及时披露关联交易及对外担保事项，华创控股被证监局处以责令改正并罚款200万元。'
});
CREATE (t_ev1:TIME:Event {id:'2025-03-22', normalized_time:'2025-03-22'});
MATCH (ev1:EVENT {name:'华创控股信披违规处罚'}), (c1:COMPANY {name:'华创控股集团有限公司'}) CREATE (ev1)-[:MENTION]->(c1);
MATCH (ev1:EVENT {name:'华创控股信披违规处罚'}), (t_ev1:TIME {id:'2025-03-22'}) CREATE (ev1)-[:BELONG]->(t_ev1);
MATCH (e4:EVENT {name:'证监会立案调查华创系'}), (ev1:EVENT {name:'华创控股信披违规处罚'}) CREATE (e4)-[:CAUSE]->(ev1);
MATCH (ev1:EVENT {name:'华创控股信披违规处罚'}), (r2:Regulation {regulation_id:'R002'}) CREATE (ev1)-[:COMPLIES_WITH]->(r2);

// ── 关联方占用资金事件 ──
CREATE (ev2:EVENT:Event {
    name:'华创贸易关联方资金占用', title:'华创贸易关联方资金占用', EVENT_TITLE:'华创贸易关联方资金占用',
    EVENT_DATE:'2025-04-30', EVENT_TYPE:'资金占用', IMPACT_LEVEL:'medium',
    action_type:'责令改正', event_category:'监管',
    text:'华创贸易被查出通过预付款方式向关联方鑫达投资累计拆借资金2.1亿元，未履行内部决策程序。'
});
CREATE (t_ev2:TIME:Event {id:'2025-04-30', normalized_time:'2025-04-30'});
MATCH (ev2:EVENT {name:'华创贸易关联方资金占用'}), (c3:COMPANY {name:'华创贸易有限责任公司'}) CREATE (ev2)-[:MENTION]->(c3);
MATCH (ev2:EVENT {name:'华创贸易关联方资金占用'}), (c4:COMPANY {name:'鑫达投资管理有限公司'}) CREATE (ev2)-[:MENTION]->(c4);
MATCH (ev2:EVENT {name:'华创贸易关联方资金占用'}), (t_ev2:TIME {id:'2025-04-30'}) CREATE (ev2)-[:BELONG]->(t_ev2);
MATCH (ev2:EVENT {name:'华创贸易关联方资金占用'}), (r3:Regulation {regulation_id:'R003'}) CREATE (ev2)-[:COMPLIES_WITH]->(r3);

// ============================================================================
// 交叉关系索引 — 连接四层
// ============================================================================

// 特征层 → 法规层
MATCH (rf1:RiskFeature {id:'F001'}), (r3:Regulation {regulation_id:'R003'}) CREATE (rf1)-[:COMPLIES_WITH]->(r3);
MATCH (rf2:RiskFeature {id:'F002'}), (r1:Regulation {regulation_id:'R001'}) CREATE (rf2)-[:COMPLIES_WITH]->(r1);
MATCH (rf3:RiskFeature {id:'F003'}), (r5:Regulation {regulation_id:'R005'}) CREATE (rf3)-[:COMPLIES_WITH]->(r5);
MATCH (rf4:RiskFeature {id:'F004'}), (r2:Regulation {regulation_id:'R002'}) CREATE (rf4)-[:COMPLIES_WITH]->(r2);
MATCH (rf5:RiskFeature {id:'F005'}), (r2:Regulation {regulation_id:'R002'}) CREATE (rf5)-[:COMPLIES_WITH]->(r2);

// ============================================================================
// 群体 2: 恒达科技集团 (科技赛道 — 通过鑫达投资战略持股+周文博任职天元科技与华创系关联)
// ============================================================================

// ── 企业 ──
CREATE (hd1:COMPANY:Subject {name: '恒达科技有限公司', COMPANY_NM: '恒达科技有限公司', ORGNUM: '91310000MA0000101', STATUS: '存续', REG_CAPITAL: '120000万', WARNING_NUM: 7, RISK_INFO: '[]'});
CREATE (hd2:COMPANY:Subject {name: '恒达云服务有限公司', COMPANY_NM: '恒达云服务有限公司', ORGNUM: '91310000MA0000102', STATUS: '存续', REG_CAPITAL: '50000万', WARNING_NUM: 4, RISK_INFO: '[]'});
CREATE (hd3:COMPANY:Subject {name: '恒达智能硬件有限公司', COMPANY_NM: '恒达智能硬件有限公司', ORGNUM: '91310000MA0000103', STATUS: '存续', REG_CAPITAL: '30000万', WARNING_NUM: 9, RISK_INFO: '[]'});

// ── 自然人 ──
CREATE (hp1:PERSON:Subject {name: '周文博', PERSON_NM: '周文博', POSITION: 'CEO', ID: '320000198504010006'});
CREATE (hp2:PERSON:Subject {name: '林志远', PERSON_NM: '林志远', POSITION: 'CTO', ID: '320000198808150007'});

// ── 投资与任职关系 ──
MATCH (hd1:COMPANY {name:'恒达科技有限公司'}), (hd2:COMPANY {name:'恒达云服务有限公司'}) CREATE (hd1)-[:INVEST {ratio:'100%', amount:'50000万'}]->(hd2);
MATCH (hd1:COMPANY {name:'恒达科技有限公司'}), (hd3:COMPANY {name:'恒达智能硬件有限公司'}) CREATE (hd1)-[:INVEST {ratio:'65%', amount:'19500万'}]->(hd3);
MATCH (hd2:COMPANY {name:'恒达云服务有限公司'}), (hd3:COMPANY {name:'恒达智能硬件有限公司'}) CREATE (hd2)-[:GUARANTEE {amount:'8000万', start_date:'2024-08-01'}]->(hd3);

MATCH (hp1:PERSON {name:'周文博'}), (hd1:COMPANY {name:'恒达科技有限公司'}) CREATE (hp1)-[:CONTROLLER]->(hd1);
MATCH (hp1:PERSON {name:'周文博'}), (hd2:COMPANY {name:'恒达云服务有限公司'}) CREATE (hp1)-[:WORK {position:'执行董事'}]->(hd2);
MATCH (hp2:PERSON {name:'林志远'}), (hd1:COMPANY {name:'恒达科技有限公司'}) CREATE (hp2)-[:WORK {position:'CTO'}]->(hd1);
MATCH (hp2:PERSON {name:'林志远'}), (hd3:COMPANY {name:'恒达智能硬件有限公司'}) CREATE (hp2)-[:WORK {position:'技术顾问'}]->(hd3);

// ── 时间节点 ──
CREATE (ht1:TIME:Event {id:'2024-07-14', normalized_time:'2024-07-14'});
CREATE (ht2:TIME:Event {id:'2024-11-08', normalized_time:'2024-11-08'});
CREATE (ht3:TIME:Event {id:'2025-02-20', normalized_time:'2025-02-20'});

// ── 事件 ──
CREATE (he1:EVENT:Event {
    name:'恒达科技数据泄露事件', title:'恒达科技数据泄露事件', EVENT_TITLE:'恒达科技数据泄露事件',
    EVENT_DATE:'2024-07-14', EVENT_TYPE:'数据安全', IMPACT_LEVEL:'high',
    action_type:'行政约谈', event_category:'安全',
    text:'恒达云服务因未对用户数据进行有效脱敏处理，导致约120万条用户个人信息被泄露至暗网，网信办介入约谈。'
});
CREATE (he2:EVENT:Event {
    name:'恒达智能硬件产品召回', title:'恒达智能硬件产品召回', EVENT_TITLE:'恒达智能硬件产品召回',
    EVENT_DATE:'2024-11-08', EVENT_TYPE:'产品召回', IMPACT_LEVEL:'medium',
    action_type:'责令召回', event_category:'质量',
    text:'恒达智能硬件生产的智能门锁因安全漏洞被监管部门责令召回，涉及产品数量3.2万台，直接经济损失约4800万元。'
});
CREATE (he3:EVENT:Event {
    name:'恒达科技对赌协议失败', title:'恒达科技对赌协议失败', EVENT_TITLE:'恒达科技对赌协议失败',
    EVENT_DATE:'2025-02-20', EVENT_TYPE:'对赌失败', IMPACT_LEVEL:'high',
    action_type:'股权回购', event_category:'金融',
    text:'恒达科技因2024年度净利润未达到B轮融资对赌承诺的80%，触发股权回购条款，需向投资方支付约2.8亿元回购款。'
});

// ── 事件→公司 ──
MATCH (he1:EVENT {name:'恒达科技数据泄露事件'}), (hd2:COMPANY {name:'恒达云服务有限公司'}) CREATE (he1)-[:MENTION]->(hd2);
MATCH (he2:EVENT {name:'恒达智能硬件产品召回'}), (hd3:COMPANY {name:'恒达智能硬件有限公司'}) CREATE (he2)-[:MENTION]->(hd3);
MATCH (he3:EVENT {name:'恒达科技对赌协议失败'}), (hd1:COMPANY {name:'恒达科技有限公司'}) CREATE (he3)-[:MENTION]->(hd1);

// ── 事件→时间 ──
MATCH (he1:EVENT {name:'恒达科技数据泄露事件'}), (ht1:TIME {id:'2024-07-14'}) CREATE (he1)-[:BELONG]->(ht1);
MATCH (he2:EVENT {name:'恒达智能硬件产品召回'}), (ht2:TIME {id:'2024-11-08'}) CREATE (he2)-[:BELONG]->(ht2);
MATCH (he3:EVENT {name:'恒达科技对赌协议失败'}), (ht3:TIME {id:'2025-02-20'}) CREATE (he3)-[:BELONG]->(ht3);

// ── 事件因果链 ──
MATCH (he1:EVENT {name:'恒达科技数据泄露事件'}), (he3:EVENT {name:'恒达科技对赌协议失败'}) CREATE (he1)-[:CAUSE]->(he3);

// ── 风险特征 ──
CREATE (hrf1:RiskFeature:Feature {feature_type:'数据安全漏洞', feature_nm:'用户数据脱敏缺失', id:'F101', e_id:'E101', e_text:'恒达云服务未实施有效的用户数据脱敏和加密措施，存在严重的数据安全漏洞。'});
CREATE (hrf2:RiskFeature:Feature {feature_type:'产品质量风险', feature_nm:'IoT安全缺陷', id:'F102', e_id:'E102', e_text:'恒达智能硬件产品存在固件安全缺陷，可被远程利用导致用户财产损失。'});
CREATE (hrf3:RiskFeature:Feature {feature_type:'对赌协议风险', feature_nm:'业绩承诺未达标', id:'F103', e_id:'E103', e_text:'恒达科技B轮融资签订的对赌协议中业绩目标设定过于激进，实际完成率仅为承诺的52%。'});

// ── 特征→公司 ──
MATCH (hrf1:RiskFeature {id:'F101'}), (hd2:COMPANY {name:'恒达云服务有限公司'}) CREATE (hrf1)-[:REFLECTS]->(hd2);
MATCH (hrf2:RiskFeature {id:'F102'}), (hd3:COMPANY {name:'恒达智能硬件有限公司'}) CREATE (hrf2)-[:REFLECTS]->(hd3);
MATCH (hrf3:RiskFeature {id:'F103'}), (hd1:COMPANY {name:'恒达科技有限公司'}) CREATE (hrf3)-[:REFLECTS]->(hd1);

// ── 事件→特征 ──
MATCH (he1:EVENT {name:'恒达科技数据泄露事件'}), (hrf1:RiskFeature {id:'F101'}) CREATE (he1)-[:TRIGGERS]->(hrf1);
MATCH (he2:EVENT {name:'恒达智能硬件产品召回'}), (hrf2:RiskFeature {id:'F102'}) CREATE (he2)-[:TRIGGERS]->(hrf2);
MATCH (he3:EVENT {name:'恒达科技对赌协议失败'}), (hrf3:RiskFeature {id:'F103'}) CREATE (he3)-[:TRIGGERS]->(hrf3);

// ── 法规匹配 ──
CREATE (hl1:Law:Regulation {regulation_title:'中华人民共和国网络安全法', regulation_name:'网络安全法', regulation_id:'L101', regulation_text:''});
CREATE (hl2:Law:Regulation {regulation_title:'中华人民共和国个人信息保护法', regulation_name:'个人信息保护法', regulation_id:'L102', regulation_text:''});

CREATE (hr1:Regulation:Regulation {regulation_title:'网络运营者应当采取技术措施和其他必要措施，保障网络安全、稳定运行', regulation_name:'网络安全法第21条', regulation_id:'R101'});
CREATE (hr2:Regulation:Regulation {regulation_title:'个人信息处理者应当对其个人信息处理活动负责，并采取必要措施保障所处理的个人信息的安全', regulation_name:'个人信息保护法第9条', regulation_id:'R102'});

// ── 法规→法律 ──
MATCH (hr1:Regulation {regulation_id:'R101'}), (hl1:Law {regulation_name:'网络安全法'}) CREATE (hr1)-[:BELONG]->(hl1);
MATCH (hr2:Regulation {regulation_id:'R102'}), (hl2:Law {regulation_name:'个人信息保护法'}) CREATE (hr2)-[:BELONG]->(hl2);

// ── 合规匹配 ──
MATCH (he1:EVENT {name:'恒达科技数据泄露事件'}), (hr1:Regulation {regulation_id:'R101'}) CREATE (he1)-[:COMPLIES_WITH]->(hr1);
MATCH (he1:EVENT {name:'恒达科技数据泄露事件'}), (hr2:Regulation {regulation_id:'R102'}) CREATE (he1)-[:COMPLIES_WITH]->(hr2);
MATCH (he2:EVENT {name:'恒达智能硬件产品召回'}), (hr1:Regulation {regulation_id:'R101'}) CREATE (he2)-[:COMPLIES_WITH]->(hr1);

// ── 特征→法规 ──
MATCH (hrf1:RiskFeature {id:'F101'}), (hr2:Regulation {regulation_id:'R102'}) CREATE (hrf1)-[:COMPLIES_WITH]->(hr2);
MATCH (hrf2:RiskFeature {id:'F102'}), (hr1:Regulation {regulation_id:'R101'}) CREATE (hrf2)-[:COMPLIES_WITH]->(hr1);

// ============================================================================
// 群体 3: 东方能源集团 (能源赛道 — 通过华创控股投资+马晓燕任职华创贸易+孙国栋与张明远合作与华创系关联)
// ============================================================================

// ── 企业 ──
CREATE (df1:COMPANY:Subject {name: '东方能源集团有限公司', COMPANY_NM: '东方能源集团有限公司', ORGNUM: '91140000MA0000201', STATUS: '存续', REG_CAPITAL: '300000万', WARNING_NUM: 11, RISK_INFO: '[]'});
CREATE (df2:COMPANY:Subject {name: '东方新能源开发有限公司', COMPANY_NM: '东方新能源开发有限公司', ORGNUM: '91140000MA0000202', STATUS: '存续', REG_CAPITAL: '80000万', WARNING_NUM: 6, RISK_INFO: '[]'});
CREATE (df3:COMPANY:Subject {name: '东方电力销售有限公司', COMPANY_NM: '东方电力销售有限公司', ORGNUM: '91140000MA0000203', STATUS: '存续', REG_CAPITAL: '40000万', WARNING_NUM: 14, RISK_INFO: '[]'});

// ── 自然人 ──
CREATE (fp1:PERSON:Subject {name: '孙国栋', PERSON_NM: '孙国栋', POSITION: '董事长', ID: '140000197203150008'});
CREATE (fp2:PERSON:Subject {name: '马晓燕', PERSON_NM: '马晓燕', POSITION: '财务总监', ID: '140000198111220009'});

// ── 投资与任职关系 ──
MATCH (df1:COMPANY {name:'东方能源集团有限公司'}), (df2:COMPANY {name:'东方新能源开发有限公司'}) CREATE (df1)-[:INVEST {ratio:'80%', amount:'64000万'}]->(df2);
MATCH (df1:COMPANY {name:'东方能源集团有限公司'}), (df3:COMPANY {name:'东方电力销售有限公司'}) CREATE (df1)-[:INVEST {ratio:'55%', amount:'22000万'}]->(df3);
MATCH (df2:COMPANY {name:'东方新能源开发有限公司'}), (df3:COMPANY {name:'东方电力销售有限公司'}) CREATE (df2)-[:GUARANTEE {amount:'12000万', start_date:'2024-05-10'}]->(df3);

MATCH (fp1:PERSON {name:'孙国栋'}), (df1:COMPANY {name:'东方能源集团有限公司'}) CREATE (fp1)-[:CONTROLLER]->(df1);
MATCH (fp1:PERSON {name:'孙国栋'}), (df2:COMPANY {name:'东方新能源开发有限公司'}) CREATE (fp1)-[:WORK {position:'董事长'}]->(df2);
MATCH (fp2:PERSON {name:'马晓燕'}), (df1:COMPANY {name:'东方能源集团有限公司'}) CREATE (fp2)-[:WORK {position:'财务总监'}]->(df1);
MATCH (fp2:PERSON {name:'马晓燕'}), (df3:COMPANY {name:'东方电力销售有限公司'}) CREATE (fp2)-[:WORK {position:'财务负责人'}]->(df3);

// ── 时间节点 ──
CREATE (ft1:TIME:Event {id:'2024-04-22', normalized_time:'2024-04-22'});
CREATE (ft2:TIME:Event {id:'2024-09-30', normalized_time:'2024-09-30'});
CREATE (ft3:TIME:Event {id:'2025-01-15', normalized_time:'2025-01-15'});

// ── 事件 ──
CREATE (fe1:EVENT:Event {
    name:'东方能源环保处罚事件', title:'东方能源环保处罚事件', EVENT_TITLE:'东方能源环保处罚事件',
    EVENT_DATE:'2024-04-22', EVENT_TYPE:'行政处罚', IMPACT_LEVEL:'high',
    action_type:'罚款停产', event_category:'环保',
    text:'东方能源集团因燃煤电厂脱硫设施运行异常导致二氧化硫排放超标3倍，被生态环境部门处以罚款1200万元并责令停产整顿3个月。'
});
CREATE (fe2:EVENT:Event {
    name:'东方新能源补贴被追回', title:'东方新能源补贴被追回', EVENT_TITLE:'东方新能源补贴被追回',
    EVENT_DATE:'2024-09-30', EVENT_TYPE:'补贴追回', IMPACT_LEVEL:'medium',
    action_type:'追回补贴', event_category:'监管',
    text:'东方新能源因光伏项目实际装机容量与申报材料不一致，被国家能源局追回可再生能源补贴资金约6500万元。'
});
CREATE (fe3:EVENT:Event {
    name:'东方电力销售电价垄断', title:'东方电力销售电价垄断', EVENT_TITLE:'东方电力销售电价垄断',
    EVENT_DATE:'2025-01-15', EVENT_TYPE:'反垄断调查', IMPACT_LEVEL:'high',
    action_type:'反垄断立案', event_category:'监管',
    text:'东方电力销售被举报与区域内其他售电公司达成价格同盟，操纵工商业用电价格，国家市场监管总局已立案调查。'
});

// ── 事件→公司 ──
MATCH (fe1:EVENT {name:'东方能源环保处罚事件'}), (df1:COMPANY {name:'东方能源集团有限公司'}) CREATE (fe1)-[:MENTION]->(df1);
MATCH (fe2:EVENT {name:'东方新能源补贴被追回'}), (df2:COMPANY {name:'东方新能源开发有限公司'}) CREATE (fe2)-[:MENTION]->(df2);
MATCH (fe3:EVENT {name:'东方电力销售电价垄断'}), (df3:COMPANY {name:'东方电力销售有限公司'}) CREATE (fe3)-[:MENTION]->(df3);

// ── 事件→时间 ──
MATCH (fe1:EVENT {name:'东方能源环保处罚事件'}), (ft1:TIME {id:'2024-04-22'}) CREATE (fe1)-[:BELONG]->(ft1);
MATCH (fe2:EVENT {name:'东方新能源补贴被追回'}), (ft2:TIME {id:'2024-09-30'}) CREATE (fe2)-[:BELONG]->(ft2);
MATCH (fe3:EVENT {name:'东方电力销售电价垄断'}), (ft3:TIME {id:'2025-01-15'}) CREATE (fe3)-[:BELONG]->(ft3);

// ── 事件因果链 ──
MATCH (fe1:EVENT {name:'东方能源环保处罚事件'}), (fe2:EVENT {name:'东方新能源补贴被追回'}) CREATE (fe1)-[:CAUSE]->(fe2);

// ── 风险特征 ──
CREATE (frf1:RiskFeature:Feature {feature_type:'环保合规风险', feature_nm:'排污超标', id:'F201', e_id:'E201', e_text:'东方能源集团燃煤发电项目环保设施运行不规范，存在持续性的废气排放超标问题。'});
CREATE (frf2:RiskFeature:Feature {feature_type:'补贴依赖风险', feature_nm:'补贴申报不实', id:'F202', e_id:'E202', e_text:'东方新能源可再生能源补贴收入占营收比例高达43%，且存在申报材料与实际情况不符的合规隐患。'});
CREATE (frf3:RiskFeature:Feature {feature_type:'市场垄断风险', feature_nm:'价格同盟操纵', id:'F203', e_id:'E203', e_text:'东方电力销售涉嫌与竞争对手达成横向垄断协议，固定工商业用电销售价格。'});

// ── 特征→公司 ──
MATCH (frf1:RiskFeature {id:'F201'}), (df1:COMPANY {name:'东方能源集团有限公司'}) CREATE (frf1)-[:REFLECTS]->(df1);
MATCH (frf2:RiskFeature {id:'F202'}), (df2:COMPANY {name:'东方新能源开发有限公司'}) CREATE (frf2)-[:REFLECTS]->(df2);
MATCH (frf3:RiskFeature {id:'F203'}), (df3:COMPANY {name:'东方电力销售有限公司'}) CREATE (frf3)-[:REFLECTS]->(df3);

// ── 事件→特征 ──
MATCH (fe1:EVENT {name:'东方能源环保处罚事件'}), (frf1:RiskFeature {id:'F201'}) CREATE (fe1)-[:TRIGGERS]->(frf1);
MATCH (fe2:EVENT {name:'东方新能源补贴被追回'}), (frf2:RiskFeature {id:'F202'}) CREATE (fe2)-[:TRIGGERS]->(frf2);
MATCH (fe3:EVENT {name:'东方电力销售电价垄断'}), (frf3:RiskFeature {id:'F203'}) CREATE (fe3)-[:TRIGGERS]->(frf3);

// ── 法规匹配 ──
CREATE (fl1:Law:Regulation {regulation_title:'中华人民共和国环境保护法', regulation_name:'环境保护法', regulation_id:'L201', regulation_text:''});
CREATE (fl2:Law:Regulation {regulation_title:'中华人民共和国反垄断法', regulation_name:'反垄断法', regulation_id:'L202', regulation_text:''});

CREATE (fr1_r:Regulation:Regulation {regulation_title:'排放污染物的企业事业单位和其他生产经营者，应当采取措施，防治在生产建设或者其他活动中产生的废气', regulation_name:'环境保护法第42条', regulation_id:'R201'});
CREATE (fr2_r:Regulation:Regulation {regulation_title:'禁止具有竞争关系的经营者达成垄断协议，包括固定或者变更商品价格', regulation_name:'反垄断法第13条', regulation_id:'R202'});

// ── 法规→法律 ──
MATCH (fr1_r:Regulation {regulation_id:'R201'}), (fl1:Law {regulation_name:'环境保护法'}) CREATE (fr1_r)-[:BELONG]->(fl1);
MATCH (fr2_r:Regulation {regulation_id:'R202'}), (fl2:Law {regulation_name:'反垄断法'}) CREATE (fr2_r)-[:BELONG]->(fl2);

// ── 合规匹配 ──
MATCH (fe1:EVENT {name:'东方能源环保处罚事件'}), (fr1_r:Regulation {regulation_id:'R201'}) CREATE (fe1)-[:COMPLIES_WITH]->(fr1_r);
MATCH (fe3:EVENT {name:'东方电力销售电价垄断'}), (fr2_r:Regulation {regulation_id:'R202'}) CREATE (fe3)-[:COMPLIES_WITH]->(fr2_r);

// ── 特征→法规 ──
MATCH (frf1:RiskFeature {id:'F201'}), (fr1_r:Regulation {regulation_id:'R201'}) CREATE (frf1)-[:COMPLIES_WITH]->(fr1_r);
MATCH (frf3:RiskFeature {id:'F203'}), (fr2_r:Regulation {regulation_id:'R202'}) CREATE (frf3)-[:COMPLIES_WITH]->(fr2_r);

// ============================================================================
// 跨群体连接 — 三个集团之间的公司与人物关系
// 使得整体图连通，但内部连接密度远高于跨群体连接，Louvain 可识别社区边界
// ============================================================================

// ── 华创系 ↔ 恒达科技 ──
// 鑫达投资 (华创系投资平台) 战略投资恒达科技
MATCH (c4:COMPANY {name:'鑫达投资管理有限公司'}), (hd1:COMPANY {name:'恒达科技有限公司'})
CREATE (c4)-[:INVEST {ratio:'12%', amount:'14400万'}]->(hd1);
// 恒达云服务为海通金融提供技术支持担保
MATCH (hd2:COMPANY {name:'恒达云服务有限公司'}), (c6:COMPANY {name:'海通金融服务有限公司'})
CREATE (hd2)-[:GUARANTEE {amount:'5000万', start_date:'2024-01-15'}]->(c6);
// 周文博 (恒达CEO) 曾任天元科技技术顾问
MATCH (hp1:PERSON {name:'周文博'}), (c7:COMPANY {name:'天元科技发展有限公司'})
CREATE (hp1)-[:WORK {position:'技术顾问'}]->(c7);

// ── 华创系 ↔ 东方能源 ──
// 华创控股战略投资东方新能源 (能源赛道布局)
MATCH (c1:COMPANY {name:'华创控股集团有限公司'}), (df2:COMPANY {name:'东方新能源开发有限公司'})
CREATE (c1)-[:INVEST {ratio:'18%', amount:'14400万'}]->(df2);
// 中远建设与东方电力销售互保
MATCH (c5:COMPANY {name:'中远建设工程有限公司'}), (df3:COMPANY {name:'东方电力销售有限公司'})
CREATE (c5)-[:GUARANTEE {amount:'6000万', start_date:'2024-07-01'}]->(df3);
// 马晓燕 (东方财务总监) 曾任华创贸易财务经理
MATCH (fp2:PERSON {name:'马晓燕'}), (c3:COMPANY {name:'华创贸易有限责任公司'})
CREATE (fp2)-[:WORK {position:'财务经理'}]->(c3);
// 孙国栋与张明远商业关联
MATCH (fp1:PERSON {name:'孙国栋'}), (p1:PERSON {name:'张明远'})
CREATE (fp1)-[:COOPERATE {relation:'联合投资'}]->(p1);

// ── 恒达科技 ↔ 东方能源 ──
// 恒达科技为东方能源提供数字化转型云服务
MATCH (hd1:COMPANY {name:'恒达科技有限公司'}), (df1:COMPANY {name:'东方能源集团有限公司'})
CREATE (hd1)-[:COOPERATE {type:'数字化转型合作', start_date:'2024-03-01'}]->(df1);
// 林志远 (恒达CTO) 兼任东方新能源技术顾问
MATCH (hp2:PERSON {name:'林志远'}), (df2:COMPANY {name:'东方新能源开发有限公司'})
CREATE (hp2)-[:WORK {position:'技术顾问'}]->(df2);

RETURN '样本数据导入完成！' AS status,
       '13家公司 + 9个自然人 + 13个事件 + 11个风险特征 + 6个风险因子 + 9条法规 + 5个处置动作 (3个群体通过战略投资+人物关系形成连通图)' AS summary;
