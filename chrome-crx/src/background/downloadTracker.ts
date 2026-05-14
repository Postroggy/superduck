export type DownloadStatus = 'started' | 'in_progress' | 'complete' | 'canceled' | 'failed';

export interface DownloadChangeEvent {
  id: string;
  filename: string;
  url: string;
  status: DownloadStatus;
  timestamp: number;
}

export interface DownloadTracker {
  handleDownloadCreated: (item: chrome.downloads.DownloadItem) => void;
  handleDownloadChanged: (delta: chrome.downloads.DownloadDelta) => void;
  getRecentDownloads: (limit?: number) => DownloadChangeEvent[];
  clearHistory: () => void;
}

const MAX_HISTORY = 200;

export function createDownloadTracker(deps: {
  isAgentActive: () => boolean;
  sendNotification: (method: string, params?: Record<string, unknown>) => boolean;
}): DownloadTracker {
  const filenamesById = new Map<number, string>();
  const urlsById = new Map<number, string>();
  const history: DownloadChangeEvent[] = [];

  function emitChange(event: DownloadChangeEvent): void {
    history.push(event);
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }
    deps.sendNotification('onDownloadChange', {
      id: event.id,
      filename: event.filename,
      url: event.url,
      status: event.status
    });
  }

  function handleDownloadCreated(item: chrome.downloads.DownloadItem): void {
    if (!Number.isInteger(item.id) || item.id < 0) return;
    if (!deps.isAgentActive()) return;

    if (typeof item.filename === 'string') {
      filenamesById.set(item.id, item.filename);
    }
    if (item.finalUrl) {
      urlsById.set(item.id, item.finalUrl);
    } else if (item.url) {
      urlsById.set(item.id, item.url);
    }

    emitChange({
      id: String(item.id),
      filename: item.filename || '',
      url: item.finalUrl || item.url || '',
      status: 'started',
      timestamp: Date.now()
    });
  }

  function resolveFilename(delta: chrome.downloads.DownloadDelta): string {
    if (delta.filename?.current) return delta.filename.current;
    return filenamesById.get(delta.id) || '';
  }

  function resolveStatus(delta: chrome.downloads.DownloadDelta): DownloadStatus | null {
    const state = delta.state?.current;
    if (!state) return null;
    if (state === 'complete') return 'complete';
    if (state === 'interrupted') {
      return delta.error?.current === 'USER_CANCELED' ? 'canceled' : 'failed';
    }
    if (state === 'in_progress') return 'in_progress';
    return null;
  }

  function handleDownloadChanged(delta: chrome.downloads.DownloadDelta): void {
    if (!Number.isInteger(delta.id) || delta.id < 0) return;

    if (delta.filename?.current) {
      filenamesById.set(delta.id, delta.filename.current);
    }

    const status = resolveStatus(delta);
    if (!status) return;

    if (deps.isAgentActive()) {
      const filename = resolveFilename(delta);
      const url = urlsById.get(delta.id) || '';
      emitChange({
        id: String(delta.id),
        filename,
        url,
        status,
        timestamp: Date.now()
      });
    }

    if (status === 'complete' || status === 'canceled' || status === 'failed') {
      filenamesById.delete(delta.id);
      urlsById.delete(delta.id);
    }
  }

  function getRecentDownloads(limit = 50): DownloadChangeEvent[] {
    const n = Math.min(limit, history.length);
    return history.slice(-n).reverse();
  }

  function clearHistory(): void {
    history.length = 0;
    filenamesById.clear();
    urlsById.clear();
  }

  return {
    handleDownloadCreated,
    handleDownloadChanged,
    getRecentDownloads,
    clearHistory
  };
}
