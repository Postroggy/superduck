import { afterEach, expect, it, vi } from 'vitest';
import { superduckDownloadFileTool as tool } from './downloadFileTool';
import type { ToolContext } from '../pageToolsSupport/types';

function setup() {
  const storage = new Map<string, unknown>();
  const download = vi.fn().mockResolvedValue(81);
  const search = vi.fn().mockResolvedValue([
    {
      id: 81,
      state: 'complete',
      filename: 'C:/Downloads/OpenMuse/report.pdf',
      bytesReceived: 90,
      fileSize: 90,
      danger: 'safe'
    }
  ]);
  vi.stubGlobal('chrome', {
    tabs: { get: vi.fn().mockResolvedValue({ url: 'https://example.test/app' }) },
    downloads: { download, search },
    storage: {
      session: {
        set: async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values)) storage.set(key, value);
        },
        get: async (key: string) => ({ [key]: storage.get(key) })
      }
    }
  });
  const context = {
    resolveTabId: vi.fn().mockResolvedValue(42),
    browserSessionScope: { sessionId: 'task-a' },
    permissionManager: { checkPermission: vi.fn().mockResolvedValue({ allowed: true }) }
  } as unknown as ToolContext;
  return { context, download, search };
}

afterEach(() => vi.unstubAllGlobals());

it('saves into Chrome Downloads without prompting or overwriting and reports the actual path', async () => {
  const { context, download } = setup();
  const result = await tool.execute(
    { tabId: 42, url: '/report.pdf', filename: 'OpenMuse/report.pdf' },
    context
  );
  expect(download).toHaveBeenCalledWith({
    url: 'https://example.test/report.pdf',
    filename: 'OpenMuse/report.pdf',
    saveAs: false,
    conflictAction: 'uniquify'
  });
  const receipt = { id: 81, state: 'complete', filename: 'C:/Downloads/OpenMuse/report.pdf' };
  expect(JSON.parse(result.output!)).toMatchObject(receipt);
  expect(JSON.parse((await tool.execute({ tabId: 42, id: 81 }, context)).output!)).toMatchObject(
    receipt
  );
  const other = { ...context, browserSessionScope: { sessionId: 'task-b' } };
  expect(await tool.execute({ tabId: 42, id: 81 }, other)).toHaveProperty('error');
});

it('refuses outside paths or links and does not expose other Chrome downloads', async () => {
  const { context, download, search } = setup();
  for (const filename of ['../report.txt', 'C:/report.txt', '/report.txt', 'a\\..\\report.txt']) {
    expect(await tool.execute({ tabId: 42, url: '/report.txt', filename }, context)).toHaveProperty(
      'error'
    );
  }
  expect(
    await tool.execute(
      { tabId: 42, url: 'https://other.test/report.txt', filename: 'report.txt' },
      context
    )
  ).toHaveProperty('error');
  expect(await tool.execute({ tabId: 42, id: 81 }, context)).toHaveProperty('error');
  expect(download).not.toHaveBeenCalled();
  expect(search).not.toHaveBeenCalled();
});

it('reports a Chrome danger state without accepting it', async () => {
  const { context, search } = setup();
  search.mockResolvedValue([
    { state: 'in_progress', danger: 'uncommon', fileSize: -1, bytesReceived: 42 }
  ]);
  const result = await tool.execute(
    { tabId: 42, url: '/report.txt', filename: 'report.txt' },
    context
  );
  expect(JSON.parse(result.output!)).toMatchObject({
    id: 81,
    state: 'in_progress',
    danger: 'uncommon'
  });
});
