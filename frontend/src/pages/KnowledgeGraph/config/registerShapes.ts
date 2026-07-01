/**
 * registerShapes.ts — G6 自定义节点形状注册（幂等，带 fallback）
 *
 * G6 内置形状: circle, rect, ellipse, diamond, triangle
 * 本文件注册: hexagon, invertedTriangle, roundRect, parallelogram, star
 *
 * 如果某个形状注册失败（G6 版本不支持相应 API），
 * 自动 fallback 到 circle，不阻塞页面渲染。
 */

import G6 from '@antv/g6';

let registered = false;

/** 记录哪些自定义形状注册成功 */
const registeredShapes = new Set<string>();

/**
 * 幂等注册所有自定义节点形状。
 * 调用多次安全 — 只在首次调用时执行注册。
 */
export function registerKnowledgeGraphShapes(): void {
  if (registered) return;
  registered = true;

  tryRegisterHexagon();
  tryRegisterInvertedTriangle();
  tryRegisterRoundRect();
  tryRegisterParallelogram();
  tryRegisterStar();
}

/**
 * 检查形状是否已成功注册（内置 + 自定义）。
 */
export function isShapeAvailable(shape: string): boolean {
  const builtin = new Set(['circle', 'rect', 'ellipse', 'diamond', 'triangle']);
  return builtin.has(shape) || registeredShapes.has(shape);
}

/**
 * 获取安全的形状名：如果目标形状不可用，fallback 到 'circle'。
 */
export function safeShape(shape: string): string {
  if (shape === 'circle') return 'circle';
  return isShapeAvailable(shape) ? shape : 'circle';
}

// ---------------------------------------------------------------------------
// 各形状注册（try-catch 包裹，失败时静默 fallback）
// ---------------------------------------------------------------------------

function tryRegisterHexagon(): void {
  try {
    G6.registerNode('hexagon', {
      draw(cfg: any, group: any) {
        const size = (cfg?.size as number) || 28;
        const r = size / 2;
        // 正六边形：6 个顶点，顶点在 30° + k*60°
        const points: number[] = [];
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 180) * (30 + 60 * i);
          points.push(Math.cos(angle) * r);
          points.push(Math.sin(angle) * r);
        }
        const keyShape = group.addShape('polygon', {
          attrs: {
            points,
            fill: cfg?.style?.fill || '#1677ff',
            stroke: cfg?.style?.stroke || '#fff',
            lineWidth: cfg?.style?.lineWidth ?? 2,
            cursor: 'pointer',
          },
          name: 'hexagon-shape',
        });
        return keyShape;
      },
      getAnchorPoints() {
        return [[0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]];
      },
    }, 'single-node');
    registeredShapes.add('hexagon');
  } catch {
    console.warn('[registerShapes] hexagon 注册失败，fallback 到 circle');
  }
}

function tryRegisterInvertedTriangle(): void {
  try {
    G6.registerNode('invertedTriangle', {
      draw(cfg: any, group: any) {
        const size = (cfg?.size as number) || 28;
        const r = size / 2;
        // 倒三角：顶点向下
        const points = [
          [0, -r],    // 顶部中点
          [r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6)],   // 右下
          [-r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6)],  // 左下
        ].flat();
        const keyShape = group.addShape('polygon', {
          attrs: {
            points,
            fill: cfg?.style?.fill || '#f5222d',
            stroke: cfg?.style?.stroke || '#fff',
            lineWidth: cfg?.style?.lineWidth ?? 2,
            cursor: 'pointer',
          },
          name: 'invertedTriangle-shape',
        });
        return keyShape;
      },
      getAnchorPoints() {
        return [[0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]];
      },
    }, 'single-node');
    registeredShapes.add('invertedTriangle');
  } catch {
    console.warn('[registerShapes] invertedTriangle 注册失败，fallback 到 circle');
  }
}

function tryRegisterRoundRect(): void {
  try {
    G6.registerNode('roundRect', {
      draw(cfg: any, group: any) {
        const size = (cfg?.size as number) || 28;
        const width = size * 1.35;
        const height = size * 0.82;
        const radius = 6;
        const keyShape = group.addShape('rect', {
          attrs: {
            x: -width / 2,
            y: -height / 2,
            width,
            height,
            radius,
            fill: cfg?.style?.fill || '#fa8c16',
            stroke: cfg?.style?.stroke || '#fff',
            lineWidth: cfg?.style?.lineWidth ?? 2,
            cursor: 'pointer',
          },
          name: 'roundRect-shape',
        });
        return keyShape;
      },
      getAnchorPoints() {
        return [[0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]];
      },
    }, 'single-node');
    registeredShapes.add('roundRect');
  } catch {
    console.warn('[registerShapes] roundRect 注册失败，fallback 到 circle');
  }
}

function tryRegisterParallelogram(): void {
  try {
    G6.registerNode('parallelogram', {
      draw(cfg: any, group: any) {
        const size = (cfg?.size as number) || 28;
        const w = size * 1.2;
        const h = size * 0.75;
        const skew = 8;
        const points = [
          [-w / 2 + skew, -h / 2],
          [w / 2 + skew, -h / 2],
          [w / 2 - skew, h / 2],
          [-w / 2 - skew, h / 2],
        ].flat();
        const keyShape = group.addShape('polygon', {
          attrs: {
            points,
            fill: cfg?.style?.fill || '#fa8c16',
            stroke: cfg?.style?.stroke || '#fff',
            lineWidth: cfg?.style?.lineWidth ?? 2,
            cursor: 'pointer',
          },
          name: 'parallelogram-shape',
        });
        return keyShape;
      },
      getAnchorPoints() {
        return [[0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]];
      },
    }, 'single-node');
    registeredShapes.add('parallelogram');
  } catch {
    console.warn('[registerShapes] parallelogram 注册失败，fallback 到 circle');
  }
}

function tryRegisterStar(): void {
  try {
    G6.registerNode('star', {
      draw(cfg: any, group: any) {
        const size = (cfg?.size as number) || 28;
        const outerR = size / 2;
        const innerR = outerR * 0.4;
        const points: number[] = [];
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI / 180) * (-90 + 36 * i);
          const r = i % 2 === 0 ? outerR : innerR;
          points.push(Math.cos(angle) * r);
          points.push(Math.sin(angle) * r);
        }
        const keyShape = group.addShape('polygon', {
          attrs: {
            points,
            fill: cfg?.style?.fill || '#52c41a',
            stroke: cfg?.style?.stroke || '#fff',
            lineWidth: cfg?.style?.lineWidth ?? 2,
            cursor: 'pointer',
          },
          name: 'star-shape',
        });
        return keyShape;
      },
      getAnchorPoints() {
        return [[0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]];
      },
    }, 'single-node');
    registeredShapes.add('star');
  } catch {
    console.warn('[registerShapes] star 注册失败，fallback 到 circle');
  }
}
