declare namespace API {
  type DataType = 'risk_event' | 'risk_sentiment';
  type CrawlMode = 'quick' | 'complex' | 'template';

  interface CrawlTemplate {
    id: string;
    label: string;
    data_type: DataType;
  }

  interface CrawlTemplatesResult {
    templates: CrawlTemplate[];
    total: number;
  }

  interface CrawlSourceCapability {
    keywords: boolean;
    date_range: boolean;
    max_pages: number;
    label: string;
  }

  interface CrawlSourcesResult {
    sources: Record<string, Record<string, CrawlSourceCapability>>;
  }

  interface ParseResult {
    success: boolean;
    data: {
      data_type: DataType;
      sources: string[];
      date_start: string | null;
      date_end: string | null;
      keywords: string[];
      max_pages: number;
      confidence: number;
    };
  }

  interface CrawlStageEvent {
    stage: string;
    progress: number;
    message: string;
    source?: string;
  }

  interface CrawlStartEvent {
    task_id: string;
    mode: string;
    started_at: string;
    target_files?: number;
  }

  interface CrawlCollectedFile {
    source: string;
    sourceLabel?: string;
    fileName: string;
    savedName?: string;
    filePath?: string;
    sizeBytes?: number;
    sizeDisplay?: string;
    collectedAt?: string;
    validPdf?: boolean;
  }

  interface CrawlFileCollectedEvent {
    stage: string;
    progress: number;
    message: string;
    source: string;
    downloaded_count: number;
    target_count: number;
    file?: CrawlCollectedFile;
  }

  interface CrawlCompleteEvent {
    task_id: string;
    status: string;
    total_sources: number;
    total_files_downloaded: number;
    total_records: number;
    quality_score: number;
    etl_triggered: number;
    source_results: Array<{
      source: string;
      files_downloaded: number;
      records: number;
      save_dir: string;
      files?: CrawlCollectedFile[];
      error?: string;
    }>;
  }

  interface CrawlTaskItem {
    type: string;
    task_id: string;
    mode: string;
    data_type: string;
    completed_at: string;
  }

  interface CrawlTasksResult {
    tasks: CrawlTaskItem[];
    total: number;
  }
}
