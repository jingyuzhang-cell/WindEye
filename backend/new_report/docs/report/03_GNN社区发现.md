# GNN 社区发现

## 对应代码

- [step1_gnn_clustering.py](/D:/Code/WindEye/backend/new_report/code/run_pipeline/step1_gnn_clustering.py:1)
- [weighted_leiden_clustering.py](/D:/Code/WindEye/backend/new_report/code/weighted_leiden_clustering.py:1)

## 流程说明

Step1 负责完成三件事：

1. 从统一知识图谱抽取三种业务视角子图
2. 使用 GNN 或降级 TF-IDF 生成节点表示
3. 用 Leiden 算法完成社区划分并导出结果

## 主要能力

- 支持 BERT/SentenceTransformer 与 TF-IDF 双模式
- 支持自监督对比学习增强嵌入
- 支持嵌入融合和相似边补充
- 输出节点聚类、关系聚类、社区摘要、跨社区关系、可视化 JSON

## 默认输出

输出写入 `backend/report_outputs/gnn_leiden_results`，每个视角产出 5 个文件，共 15 个核心文件。

## 运行方式

可直接运行：

```bash
python backend/new_report/code/run_pipeline/run_pipeline.py --steps 1
```

也可以使用 `--no-bert` 降级到传统特征模式。
