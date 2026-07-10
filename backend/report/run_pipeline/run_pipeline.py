#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GNN多视角社区发现与因果映射 - 统一运行入口
================================================================
顺序执行：
  Step1: GNN聚类 (step1_gnn_clustering.py)
  Step2: 社区报告生成 (step2_community_reports.py)
  Step3: 层级映射 (step3_hierarchy_mapping.py)

用法：
  python run_pipeline.py                    # 完整流程
  python run_pipeline.py --steps 1         # 仅Step1
  python run_pipeline.py --steps 1,2       # Step1+2
  python run_pipeline.py --steps 2,3       # 仅Step2+3（聚类已完成）
  python run_pipeline.py --no-bert         # 不用BERT（用TF-IDF）
  python run_pipeline.py --no-deepseek     # 不调用DeepSeek API
================================================================
"""

import argparse
import sys
import time


def parse_args():
    parser = argparse.ArgumentParser(description="GNN社区发现流水线")
    parser.add_argument(
        "--steps", type=str, default="1,2,3",
        help="要运行的步骤，如 1,2,3 或 1 或 2,3"
    )
    parser.add_argument(
        "--no-bert", action="store_true",
        help="跳过BERT嵌入，使用TF-IDF替代"
    )
    parser.add_argument(
        "--no-deepseek", action="store_true",
        help="跳过所有DeepSeek API调用"
    )
    parser.add_argument(
        "--input", type=str, default="data/merged_regulatory_unified.txt",
        help="知识图谱输入文件路径"
    )
    parser.add_argument(
        "--output", type=str, default="weighted_leiden_results",
        help="聚类结果输出目录"
    )
    parser.add_argument(
        "--fusion", type=str, default="concat", choices=["concat", "weighted_avg"],
        help="嵌入融合方式"
    )
    return parser.parse_args()


def run_step1(args):
    print("\n" + "="*70)
    print("  STEP 1: GNN多视角社区发现 + Leiden聚类")
    print("="*70)
    t0 = time.time()

    from step1_gnn_clustering import run_gnn_community_discovery
    results = run_gnn_community_discovery(
        input_file=args.input,
        output_dir=args.output,
        use_bert=not args.no_bert,
        fusion_mode=args.fusion,
    )
    print(f"\n  Step1 耗时: {time.time()-t0:.1f}s")
    return results


def run_step2(args):
    print("\n" + "="*70)
    print("  STEP 2: 社区报告生成")
    print("="*70)
    t0 = time.time()

    # 动态修改配置
    import step2_community_reports as s2
    s2.CLUSTERING_RESULT_DIR = args.output
    s2.GRAPH_DATA_FILE = args.input

    if args.no_deepseek:
        s2.API_KEY = ""

    reports = s2.main()
    print(f"\n  Step2 耗时: {time.time()-t0:.1f}s")
    return reports


def run_step3(args):
    print("\n" + "="*70)
    print("  STEP 3: 社区质量验证 + 因果层级映射")
    print("="*70)
    t0 = time.time()

    import step3_hierarchy_mapping as s3
    s3.CLUSTERING_RESULT_DIR = args.output

    if args.no_deepseek:
        s3.DEEPSEEK_API_KEY = ""

    result = s3.main(use_deepseek=not args.no_deepseek)
    print(f"\n  Step3 耗时: {time.time()-t0:.1f}s")
    return result


def main():
    args = parse_args()
    steps = [int(s.strip()) for s in args.steps.split(",") if s.strip().isdigit()]

    print("="*70)
    print("  GNN多视角社区发现与因果映射流水线")
    print(f"  执行步骤: {steps}")
    print(f"  输入文件: {args.input}")
    print(f"  输出目录: {args.output}")
    print(f"  使用BERT: {not args.no_bert}")
    print(f"  使用DeepSeek: {not args.no_deepseek}")
    print("="*70)

    total_start = time.time()
    results = {}

    try:
        if 1 in steps:
            results["step1"] = run_step1(args)
        if 2 in steps:
            results["step2"] = run_step2(args)
        if 3 in steps:
            results["step3"] = run_step3(args)
    except KeyboardInterrupt:
        print("\n⚠ 用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    total_time = time.time() - total_start
    print(f"\n{'='*70}")
    print(f"  全部步骤完成！总耗时: {total_time:.1f}s ({total_time/60:.1f}min)")
    print(f"{'='*70}")
    return results


if __name__ == "__main__":
    main()
