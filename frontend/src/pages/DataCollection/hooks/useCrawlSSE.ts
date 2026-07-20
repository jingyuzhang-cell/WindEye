import { useCallback, useRef } from 'react';
import { useCrawlStore } from '../store/crawlStore';

export function useCrawlSSE() {
  const store = useCrawlStore();
  const abortRef = useRef<AbortController | null>(null);

  const startCrawl = useCallback(
    async (payload: any) => {
      const controller = new AbortController();
      abortRef.current = controller;
      store.reset();
      if (Array.isArray(payload.sources)) {
        store.setSources(payload.sources);
      }
      store.startTask('pending', payload.max_files ?? 0);
      store.updateProgress({
        stage: 'parsing',
        progress: 0,
        message: '正在连接采集任务...',
      } as API.CrawlStageEvent);
      store.addLog('info', '正在创建采集任务...');

      try {
        const response = await fetch('/api/v1/pipeline/crawl/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WindEye-Dev-Auth': 'true',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          store.failTask(`HTTP ${response.status}`);
          store.addLog('error', `采集接口请求失败: HTTP ${response.status}`);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          store.failTask('No response stream');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                switch (currentEvent) {
                  case 'start':
                    store.startTask(
                      data.task_id,
                      data.target_files ?? payload.max_files ?? 0,
                    );
                    store.addLog('info', `Task started: ${data.task_id}`);
                    break;
                  case 'stage':
                    store.updateProgress(data);
                    store.addLog('info', `[${data.stage}] ${data.message}`);
                    break;
                  case 'file_collected':
                    store.recordCollectedFile(data);
                    if (data.file?.fileName) {
                      store.addLog('info', `[${data.source}] 已采集 ${data.file.fileName}`);
                    }
                    break;
                  case 'source_result':
                    store.addSourceResult(data);
                    if (data.message) {
                      store.updateProgress({
                        stage: 'crawling',
                        progress: data.files_downloaded > 0 ? 80 : 75,
                        message: data.message,
                      } as API.CrawlStageEvent);
                    }
                    store.addLog(
                      data.error ? 'error' : 'success',
                      `${data.source}: ${data.files_downloaded || 0} files, ${data.records || 0} records${data.error ? ' (error: ' + data.error + ')' : ''}`,
                    );
                    break;
                  case 'complete':
                    if ((data.total_files_downloaded || 0) === 0) {
                      const skipped = (data.source_results || []).reduce(
                        (sum: number, item: any) => sum + (item.existing_files_skipped || 0),
                        0,
                      );
                      store.updateProgress({
                        stage: 'completed',
                        progress: 100,
                        message: skipped > 0
                          ? `采集完成：命中 ${skipped} 份官方文件，均已存在，本次未重复下载。`
                          : '采集完成：所选日期范围内没有发现新的官方 PDF。',
                      } as API.CrawlStageEvent);
                    }
                    store.completeTask(data);
                    store.addLog('success', 'Crawl completed');
                    break;
                  case 'error':
                    store.addLog('error', data.message || data.error || 'Unknown error');
                    break;
                }
              } catch {
                // skip invalid JSON lines
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          store.failTask(err.message);
          store.addLog('error', `Connection failed: ${err.message}`);
        }
      }
    },
    [store],
  );

  const cancelCrawl = useCallback(() => {
    abortRef.current?.abort();
    store.reset();
  }, [store]);

  return { startCrawl, cancelCrawl, isRunning: store.isRunning };
}
