import { PermissionTools } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import { cdpDebugger } from '../cdp';
import type { NetworkRequest, WebSocketFrame } from '../cdp';
import type { ToolDefinition, ToolResult } from '../pageToolsSupport/types';
import type { ReadNetworkRequestsToolInput } from './types';

const DEFAULT_MAX_BODY_CHARS = 4000;
const MAX_LISTED_WS_FRAMES = 10;

function clip(text: string, limit: number): string {
  if (limit <= 0 || text.length <= limit) return text;
  return `${text.slice(0, limit)}… [+${text.length - limit} chars]`;
}

function formatFrames(frames: WebSocketFrame[], limit: number): string[] {
  const shown = frames.slice(-MAX_LISTED_WS_FRAMES);
  const lines = shown.map(
    (frame) => `ws ${'sent' === frame.direction ? '->' : '<-'} ${clip(frame.payload, limit)}`
  );
  if (frames.length > shown.length)
    lines.unshift(`... ${frames.length - shown.length} earlier frames omitted`);
  return lines;
}

export const readNetworkRequestsTool: ToolDefinition<ReadNetworkRequestsToolInput> = {
  name: 'read_network_requests',
  description:
    "Read HTTP network requests (XHR, Fetch, documents, images, etc.) from a specific tab. Useful for debugging API calls, monitoring network activity, or understanding what requests a page is making. Returns all network requests made by the current page, including cross-origin requests. Requests are automatically cleared when the page navigates to a different domain. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
  tabAccess: 'read',
  parameters: {
    tabId: {
      type: 'number',
      description:
        "Tab ID to read network requests from. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID.",
      required: true
    },
    urlPattern: {
      type: 'string',
      description:
        "Optional URL pattern to filter requests. Only requests whose URL contains this string will be returned (e.g., '/api/' to filter API calls, 'example.com' to filter by domain).",
      required: false
    },
    clear: {
      type: 'boolean',
      description:
        'If true, clear the network requests after reading to avoid duplicates on subsequent calls. Default is false.',
      required: false
    },
    limit: {
      type: 'number',
      description:
        'Maximum number of requests to return. Defaults to 100. Increase only if you need more results.',
      required: false
    },
    includeBodies: {
      type: 'boolean',
      description:
        'Include request bodies (postData), response bodies (fetched through Network.getResponseBody) and WebSocket frame payloads. Bodies are clipped by maxBodyChars.',
      required: false
    },
    maxBodyChars: {
      type: 'number',
      description:
        'Clip each body/frame payload to this many characters when includeBodies is set. Defaults to 4000, 0 = no clip.',
      required: false
    }
  },
  execute: async (input, context): Promise<ToolResult> => {
    try {
      const {
        tabId,
        urlPattern,
        clear = false,
        limit = 100,
        includeBodies = false,
        maxBodyChars = DEFAULT_MAX_BODY_CHARS
      } = input;
      if (!context?.tabId) throw new Error('No active tab found');

      const effectiveTabId = await context.resolveTabId(tabId);
      const tab = await chrome.tabs.get(effectiveTabId);
      if (!tab.id) throw new Error('Active tab has no ID');
      const trackedTabId = tab.id;
      const tabUrl = tab.url;
      if (!tabUrl) throw new Error('No URL available for active tab');

      const toolUseId = context?.toolUseId;
      const permissionResult = await context.permissionManager.checkPermission(tabUrl, toolUseId);
      if (!permissionResult.allowed) {
        if (permissionResult.needsPrompt) {
          return {
            type: 'permission_required',
            tool: PermissionTools.READ_NETWORK_REQUESTS,
            url: tabUrl,
            toolUseId
          };
        }
        return { error: 'Permission denied for reading network requests on this domain' };
      }

      try {
        await cdpDebugger.enableNetworkTracking(trackedTabId);
      } catch (err) {
        return {
          error: `Could not enable network tracking: ${err instanceof Error ? err.message : String(err)}. Try refreshing the page and calling this tool again.`
        };
      }

      const requests = cdpDebugger.getNetworkRequests(trackedTabId, urlPattern);
      if (clear) cdpDebugger.clearNetworkRequests(trackedTabId);

      if (0 === requests.length) {
        let requestType = 'network requests';
        if (urlPattern) requestType = `requests matching "${urlPattern}"`;
        const validTabs = await tabGroupManager.getValidTabsWithMetadataForContext(
          context.tabId,
          context
        );
        return {
          output: `No ${requestType} found for this tab.\n\nNote: Network tracking starts when this tool is first called. If the page loaded before calling this tool, you may need to refresh the page or perform actions that trigger network requests.`,
          tabContext: {
            currentTabId: context.tabId,
            executedOnTabId: effectiveTabId,
            availableTabs: validTabs,
            tabCount: validTabs.length
          }
        };
      }

      const limitedRequests = requests.slice(0, limit);
      const hasMore = requests.length > limit;

      if (includeBodies) {
        for (const request of limitedRequests) {
          if ('WEBSOCKET' === request.method) continue;
          if (
            undefined === request.postData ||
            (undefined === request.responseBody && !request.responseBodyError && !request.failure)
          )
            await cdpDebugger.readNetworkBodies(trackedTabId, request.requestId);
        }
      }

      const formatted = limitedRequests
        .map((req: NetworkRequest, idx: number) => {
          const lines = [
            `${idx + 1}. url: ${req.url}`,
            `method: ${req.method}`,
            `statusCode: ${req.status ?? (req.failure ? 'unavailable' : 'pending')}`
          ];
          if (req.mimeType) lines.push(`mimeType: ${req.mimeType}`);
          if (req.protocol) lines.push(`protocol: ${req.protocol}`);
          if (req.responseTimeMs !== undefined) lines.push(`responseTimeMs: ${req.responseTimeMs}`);
          if (req.durationMs !== undefined) lines.push(`durationMs: ${req.durationMs}`);
          if (req.transferredBytes !== undefined)
            lines.push(`transferredBytes: ${req.transferredBytes}`);
          if (req.failure) lines.push(`failure: ${req.failure}`);
          if (includeBodies && req.postData)
            lines.push(`requestBody: ${clip(req.postData, maxBodyChars)}`);
          if (includeBodies && req.responseBody !== undefined)
            lines.push(
              `responseBody${req.responseBodyBase64Encoded ? ' (base64)' : ''}: ${clip(req.responseBody, maxBodyChars)}`
            );
          if (includeBodies && req.responseBodyError)
            lines.push(`responseBodyError: ${req.responseBodyError}`);
          if (req.webSocketFrames?.length) {
            lines.push(`webSocketFrames: ${req.webSocketFrameCount ?? req.webSocketFrames.length}`);
            if (includeBodies) lines.push(...formatFrames(req.webSocketFrames, maxBodyChars));
          }
          return lines.join('\n   ');
        })
        .join('\n\n');

      const filters: string[] = [];
      if (urlPattern) filters.push(`URL pattern: "${urlPattern}"`);
      const filterNote = filters.length > 0 ? ` (filtered by ${filters.join(', ')})` : '';
      const truncationNote = hasMore ? ` (showing first ${limit} of ${requests.length})` : '';
      const header = `Found ${requests.length} network request${1 === requests.length ? '' : 's'}${filterNote}${truncationNote}:`;
      const validTabs = await tabGroupManager.getValidTabsWithMetadataForContext(
        context.tabId,
        context
      );

      return {
        output: `${header}\n\n${formatted}`,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: effectiveTabId,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      };
    } catch (err) {
      return {
        error: `Failed to read network requests: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'read_network_requests',
    description:
      "Read HTTP network requests (XHR, Fetch, documents, images, etc.) from a specific tab. Useful for debugging API calls, monitoring network activity, or understanding what requests a page is making. Returns all network requests made by the current page, including cross-origin requests. Requests are automatically cleared when the page navigates to a different domain. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
    input_schema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description:
            "Tab ID to read network requests from. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        },
        urlPattern: {
          type: 'string',
          description:
            "Optional URL pattern to filter requests. Only requests whose URL contains this string will be returned (e.g., '/api/' to filter API calls, 'example.com' to filter by domain)."
        },
        clear: {
          type: 'boolean',
          description:
            'If true, clear the network requests after reading to avoid duplicates on subsequent calls. Default is false.'
        },
        limit: {
          type: 'number',
          description:
            'Maximum number of requests to return. Defaults to 100. Increase only if you need more results.'
        },
        includeBodies: {
          type: 'boolean',
          description:
            'Include request bodies (postData), response bodies (fetched through Network.getResponseBody) and WebSocket frame payloads. Bodies are clipped by maxBodyChars.'
        },
        maxBodyChars: {
          type: 'number',
          description:
            'Clip each body/frame payload to this many characters when includeBodies is set. Defaults to 4000, 0 = no clip.'
        }
      },
      required: ['tabId']
    }
  })
};
