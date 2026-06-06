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

      try {
        const response = await fetch('/api/v1/pipeline/crawl/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

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
                    store.startTask(data.task_id);
                    store.addLog('info', `Task started: ${data.task_id}`);
                    break;
                  case 'stage':
                    store.updateProgress(data);
                    store.addLog('info', `[${data.stage}] ${data.message}`);
                    break;
                  case 'source_result':
                    store.addSourceResult(data.files_downloaded || 0);
                    store.addLog(
                      data.error ? 'error' : 'success',
                      `${data.source}: ${data.files_downloaded || 0} files, ${data.records || 0} records${data.error ? ' (error: ' + data.error + ')' : ''}`,
                    );
                    break;
                  case 'complete':
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
