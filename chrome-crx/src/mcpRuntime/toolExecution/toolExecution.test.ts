import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  beginTool: vi.fn(),
  endTool: vi.fn(),
  getSelectedModel: vi.fn(),
  getTabForMcp: vi.fn(),
  getOrCreateToolExecutor: vi.fn(),
  getToolTabAccess: vi.fn(),
  hasTool: vi.fn(),
  trackEvent: vi.fn(),
  isTabPaused: vi.fn(),
  describeTabPause: vi.fn()
}));

vi.mock('../agentActivity', () => ({
  beginTool: fixtures.beginTool,
  endTool: fixtures.endTool
}));

vi.mock('../analytics', () => ({
  trackEvent: fixtures.trackEvent
}));

vi.mock('../browserAutomation', () => ({
  cdpDebugger: {
    isDebuggerAttached: vi.fn(),
    attachDebugger: vi.fn()
  },
  isTabPaused: fixtures.isTabPaused,
  describeTabPause: fixtures.describeTabPause
}));

vi.mock('../core/tools', () => ({
  getToolTabAccess: fixtures.getToolTabAccess,
  hasTool: fixtures.hasTool,
  mcpToolNames: []
}));

vi.mock('../providerClient', () => ({
  getSelectedModel: fixtures.getSelectedModel,
  invalidateCachedClient: vi.fn()
}));

vi.mock('../tabState', () => ({
  tabGroupManager: {
    getTabForMcp: fixtures.getTabForMcp
  }
}));

vi.mock('../tabState/tabLeases', () => ({
  BrowserSessionConflictError: class BrowserSessionConflictError extends Error {}
}));

vi.mock('./permissionPrompt', () => ({
  showPermissionPrompt: vi.fn()
}));

vi.mock('../domainPermissions', () => ({
  createBridgePermissionManager: vi.fn()
}));

vi.mock('./toolContextState', () => ({
  startToolContext: vi.fn(),
  cleanupAfterToolExecution: vi.fn()
}));

vi.mock('./toolExecutor', () => ({
  MCP_NATIVE_SESSION_ID: 'native',
  createErrorResponse: (text: string) => ({
    content: [{ type: 'text', text }],
    is_error: true
  }),
  getOrCreateToolExecutor: fixtures.getOrCreateToolExecutor
}));

const { executeTool } = await import('./toolExecution');

describe('executeTool', () => {
  beforeEach(() => {
    for (const fn of Object.values(fixtures)) fn.mockReset();
    fixtures.getSelectedModel.mockResolvedValue('test-model');
    fixtures.getToolTabAccess.mockReturnValue('read');
    fixtures.hasTool.mockReturnValue(true);
  });

  it('rejects unknown tools before resolving or claiming a tab', async () => {
    fixtures.hasTool.mockReturnValueOnce(false);

    const result = await executeTool({
      toolName: 'missing_tool',
      args: { tabId: 7 },
      tabId: 7,
      browserSessionId: 'session-a'
    });

    expect(result).toMatchObject({
      is_error: true,
      content: [{ type: 'text', text: 'Unknown tool: missing_tool' }]
    });
    expect(fixtures.getToolTabAccess).not.toHaveBeenCalled();
    expect(fixtures.getTabForMcp).not.toHaveBeenCalled();
    expect(fixtures.getOrCreateToolExecutor).not.toHaveBeenCalled();
    expect(fixtures.trackEvent).toHaveBeenCalledWith(
      'superduck.mcp.tool_called',
      expect.objectContaining({
        tool_name: 'missing_tool',
        success: false,
        error_type: 'unknown_tool'
      })
    );
  });

  it('answers page tools with the paused frame instead of letting them hang', async () => {
    fixtures.getTabForMcp.mockResolvedValue({
      tabId: 9,
      domain: 'example.test',
      url: 'https://example.test/'
    });
    fixtures.isTabPaused.mockReturnValue(true);
    fixtures.describeTabPause.mockReturnValue(
      'tab 9 is paused at https://example.test/app.js:3 in pickUser (other)'
    );

    const result = await executeTool({
      toolName: 'javascript_tool',
      args: { tabId: 9 },
      tabId: 9,
      browserSessionId: 'session-a'
    });

    expect(result).toMatchObject({ is_error: true });
    expect(JSON.stringify(result.content)).toContain('is paused at https://example.test/app.js:3');
    expect(JSON.stringify(result.content)).toContain('Debugger.resume');
    expect(fixtures.getOrCreateToolExecutor).not.toHaveBeenCalled();
  });

  it('leaves debugger-driven tools available while paused', async () => {
    fixtures.getTabForMcp.mockResolvedValue({
      tabId: 9,
      domain: 'example.test',
      url: 'https://example.test/'
    });
    fixtures.isTabPaused.mockReturnValue(true);
    fixtures.getOrCreateToolExecutor.mockResolvedValue({
      processToolResults: vi.fn().mockResolvedValue([{ content: [{ type: 'text', text: 'ok' }] }])
    });

    await executeTool({
      toolName: 'superduck_cdp',
      args: { tabId: 9 },
      tabId: 9,
      browserSessionId: 'session-a'
    });

    expect(fixtures.getOrCreateToolExecutor).toHaveBeenCalled();
  });
});
