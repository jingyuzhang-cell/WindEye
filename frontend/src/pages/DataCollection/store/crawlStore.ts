import { create } from 'zustand';

interface CrawlState {
  mode: 'quick' | 'complex' | 'template';
  setMode: (mode: 'quick' | 'complex' | 'template') => void;

  dataType: API.DataType;
  setDataType: (t: API.DataType) => void;
  sources: string[];
  setSources: (s: string[]) => void;
  dateRange: [string | null, string | null];
  setDateRange: (range: [string | null, string | null]) => void;
  keywords: string[];
  setKeywords: (k: string[]) => void;
  maxPages: number;
  setMaxPages: (n: number) => void;
  maxFiles: number;
  setMaxFiles: (n: number) => void;

  nlQuery: string;
  setNlQuery: (q: string) => void;
  parsedIntent: API.ParseResult['data'] | null;
  setParsedIntent: (p: API.ParseResult['data'] | null) => void;

  templateId: string | null;
  setTemplateId: (id: string | null) => void;

  taskId: string | null;
  isRunning: boolean;
  progress: number;
  stage: string;
  stageMessage: string;
  logs: Array<{ time: string; level: string; message: string }>;
  result: API.CrawlCompleteEvent | null;
  error: string | null;
  totalFilesDownloaded: number;

  startTask: (taskId: string) => void;
  updateProgress: (data: API.CrawlStageEvent) => void;
  addLog: (level: string, message: string) => void;
  addSourceResult: (filesDownloaded: number) => void;
  completeTask: (result: API.CrawlCompleteEvent) => void;
  failTask: (error: string) => void;
  reset: () => void;
}

export const useCrawlStore = create<CrawlState>((set) => ({
  mode: 'quick',
  setMode: (mode) => set({ mode }),

  dataType: 'risk_event',
  setDataType: (dataType) => set({ dataType }),
  sources: [],
  setSources: (sources) => set({ sources }),
  dateRange: [null, null],
  setDateRange: (dateRange) => set({ dateRange }),
  keywords: [],
  setKeywords: (keywords) => set({ keywords }),
  maxPages: 5,
  setMaxPages: (maxPages) => set({ maxPages }),
  maxFiles: 0,
  setMaxFiles: (maxFiles) => set({ maxFiles }),

  nlQuery: '',
  setNlQuery: (nlQuery) => set({ nlQuery }),
  parsedIntent: null,
  setParsedIntent: (parsedIntent) => set({ parsedIntent }),

  templateId: null,
  setTemplateId: (templateId) => set({ templateId }),

  taskId: null,
  isRunning: false,
  progress: 0,
  stage: '',
  stageMessage: '',
  logs: [],
  result: null,
  error: null,
  totalFilesDownloaded: 0,

  startTask: (taskId) =>
    set({ taskId, isRunning: true, progress: 0, logs: [], result: null, error: null, totalFilesDownloaded: 0 }),
  updateProgress: (data) =>
    set((state) => ({
      progress: data.progress ?? state.progress,
      stage: data.stage ?? state.stage,
      stageMessage: data.message ?? state.stageMessage,
    })),
  addLog: (level, message) =>
    set((state) => ({
      logs: [
        { time: new Date().toLocaleTimeString(), level, message },
        ...state.logs,
      ].slice(0, 100),
    })),
  addSourceResult: (filesDownloaded) =>
    set((state) => ({
      totalFilesDownloaded: state.totalFilesDownloaded + filesDownloaded,
    })),
  completeTask: (result) =>
    set({ result, isRunning: false, progress: 100, stage: 'completed' }),
  failTask: (error) => set({ error, isRunning: false, stage: 'failed' }),
  reset: () =>
    set({
      taskId: null, isRunning: false, progress: 0, stage: '', stageMessage: '',
      logs: [], result: null, error: null,
    }),
}));
