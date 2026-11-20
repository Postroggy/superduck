import type { ToolDefinition } from '../pageToolsSupport/types';

const NAME = 'superduck_download_file';
const DESCRIPTION =
  'Save a same-origin URL to Chrome Downloads, or check a download started by this tab session.';
const PARAMETERS = {
  tabId: { type: 'number', required: true, description: 'The source tab in this browser session.' },
  url: { type: 'string', description: 'Same-origin HTTP(S) URL or relative link.' },
  filename: { type: 'string', description: 'Path relative to Chrome Downloads.' },
  id: {
    type: 'number',
    description: 'Download ID returned by a previous call in the same session and tab.'
  }
};

interface DownloadFileInput {
  tabId: number;
  url?: string;
  filename?: string;
  id?: number;
}

function validFilename(filename: string): boolean {
  if (
    filename.length === 0 ||
    filename.length > 240 ||
    /[\\:*?"<>|]/.test(filename) ||
    [...filename].some((char) => char.charCodeAt(0) < 32)
  )
    return false;
  return filename.split('/').every((part) => part.trim() !== '' && !/[.\s]$/.test(part));
}

async function getDownload(id: number, waitMs: number) {
  const deadline = Date.now() + waitMs;
  let [item] = await chrome.downloads.search({ id });
  while (
    Date.now() < deadline &&
    (!item || (item.state === 'in_progress' && item.danger === 'safe'))
  ) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    [item] = await chrome.downloads.search({ id });
  }
  if (!item) return { id, state: 'pending' };
  return {
    id,
    state: item.state,
    filename: item.filename || undefined,
    bytesReceived: item.bytesReceived,
    fileSize: item.fileSize >= 0 ? item.fileSize : undefined,
    danger: item.danger !== 'safe' ? item.danger : undefined,
    error: item.error
  };
}

export const superduckDownloadFileTool: ToolDefinition<DownloadFileInput> = {
  name: NAME,
  description: DESCRIPTION,
  parameters: PARAMETERS,
  tabAccess: 'write',
  execute: async (input, context) => {
    if (!Number.isSafeInteger(input?.tabId) || input.tabId <= 0)
      return { error: 'A tab ID is required.' };
    const tabId = await context.resolveTabId(input.tabId);
    const sessionId = context.browserSessionScope.sessionId;
    const owner = { sessionId, tabId };
    const storageKey = (id: number) => `superduck.download.${id}`;
    if (input.id !== undefined) {
      if (
        !Number.isSafeInteger(input.id) ||
        input.id <= 0 ||
        input.url !== undefined ||
        input.filename !== undefined
      )
        return { error: 'Specify only the download ID for a status check.' };
      const key = storageKey(input.id);
      const existing = (await chrome.storage.session.get(key))[key] as typeof owner | undefined;
      if (existing?.sessionId !== sessionId || existing.tabId !== tabId)
        return { error: 'Download does not belong to this tab session.' };
      return { output: JSON.stringify(await getDownload(input.id, 0)) };
    }

    if (typeof input.filename !== 'string' || !validFilename(input.filename))
      return { error: 'Provide a valid path relative to Chrome Downloads.' };
    if (typeof input.url !== 'string' || !input.url.trim())
      return { error: 'A download URL is required.' };
    const tabUrl = (await chrome.tabs.get(tabId)).url;
    if (!tabUrl || !/^https?:\/\//.test(tabUrl))
      return { error: 'Downloads require an HTTP or HTTPS source tab.' };
    let target: URL;
    try {
      target = new URL(input.url, tabUrl);
    } catch {
      return { error: 'Invalid download URL.' };
    }
    if (
      target.origin !== new URL(tabUrl).origin ||
      !/^https?:$/.test(target.protocol) ||
      target.username ||
      target.password
    )
      return { error: 'Use an HTTP or HTTPS link from the same origin as the source tab.' };

    const permission = await context.permissionManager.checkPermission(tabUrl, context.toolUseId);
    if (!permission.allowed) {
      if (!permission.needsPrompt) return { error: 'Permission denied for this tab.' };
      const { PermissionTools } = await import('../domainPermissions');
      return {
        type: 'permission_required',
        tool: PermissionTools.READ_PAGE_CONTENT,
        url: tabUrl,
        toolUseId: context.toolUseId
      };
    }
    if ((await chrome.tabs.get(tabId)).url !== tabUrl)
      return { error: 'The tab navigated. Retry the download.' };

    const id = await chrome.downloads.download({
      url: target.href,
      filename: input.filename,
      saveAs: false,
      conflictAction: 'uniquify'
    });
    await chrome.storage.session.set({ [storageKey(id)]: owner });
    return { output: JSON.stringify(await getDownload(id, 10000)) };
  },
  toProviderSchema: () => ({
    name: NAME,
    description: DESCRIPTION,
    input_schema: { type: 'object', properties: PARAMETERS, required: ['tabId'] }
  })
};
