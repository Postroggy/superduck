/**
 * CDP AX Tree Snapshot Module
 *
 * 通过 Chrome DevTools Protocol 的 Accessibility.getFullAXTree 获取浏览器原生无障碍树，
 * 并应用剪枝/聚合/过滤策略压缩为 AI agent 可高效消费的紧凑文本表示。
 *
 * 核心策略来自 agent-browser 项目的 snapshot.rs：
 * - Ignored 节点过滤
 * - StaticText 聚合与去重
 * - Generic 节点扁平化
 * - 基于角色的 ref 分配
 * - Compact 模式后处理
 */

import { cdpDebugger } from './cdp';

// ============================================================================
// Types
// ============================================================================

interface AXValue {
  type: string;
  value?: string | number | boolean;
}

interface AXProperty {
  name: string;
  value: AXValue;
}

interface AXNode {
  nodeId: string | number;
  role?: AXValue;
  name?: AXValue;
  value?: AXValue;
  properties?: AXProperty[];
  childIds?: (string | number)[];
  backendDOMNodeId?: number;
  ignored?: boolean;
}

interface TreeNode {
  role: string;
  name: string;
  level: number | null;
  checked: string | null;
  expanded: boolean | null;
  selected: boolean | null;
  disabled: boolean | null;
  required: boolean | null;
  valueText: string | null;
  backendNodeId: number | null;
  children: number[];
  parentIdx: number | null;
  hasRef: boolean;
  refId: string | null;
  depth: number;
  cursorInteractive: boolean;
}

export interface SnapshotOptions {
  filter?: 'all' | 'interactive';
  compact?: boolean;
  depth?: number;
  maxChars?: number;
  startRef?: number;
}

export interface RefMapping {
  refId: string;
  backendNodeId: number;
  role: string;
  name: string;
  nth: number | null;
  isCursorInteractive: boolean;
  interactiveOnly: boolean;
}

export class SnapshotMaxCharsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotMaxCharsError';
  }
}

export interface SnapshotResult {
  content: string;
  refMappings: RefMapping[];
}

// ============================================================================
// Constants
// ============================================================================

export const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem',
]);

export const CONTENT_ROLES = new Set([
  'heading',
  'cell',
  'gridcell',
  'columnheader',
  'rowheader',
  'listitem',
  'article',
  'region',
  'main',
  'navigation',
]);

const INVISIBLE_CHARS = /[\uFEFF\u200B\u200C\u200D\u2060\u00A0]/g;

// ============================================================================
// Helpers
// ============================================================================

function extractAXString(value: AXValue | undefined): string {
  if (!value || value.value === undefined || value.value === null) return '';
  if (typeof value.value === 'string') return value.value;
  if (typeof value.value === 'number') return String(value.value);
  if (typeof value.value === 'boolean') return String(value.value);
  return '';
}

function extractProperties(props?: AXProperty[]): {
  level: number | null;
  checked: string | null;
  expanded: boolean | null;
  selected: boolean | null;
  disabled: boolean | null;
  required: boolean | null;
} {
  let level: number | null = null;
  let checked: string | null = null;
  let expanded: boolean | null = null;
  let selected: boolean | null = null;
  let disabled: boolean | null = null;
  let required: boolean | null = null;

  if (!props) return { level, checked, expanded, selected, disabled, required };

  for (const prop of props) {
    switch (prop.name) {
      case 'level':
        if (typeof prop.value.value === 'number') level = prop.value.value;
        break;
      case 'checked':
        if (typeof prop.value.value === 'string') checked = prop.value.value;
        else if (typeof prop.value.value === 'boolean') checked = String(prop.value.value);
        break;
      case 'expanded':
        if (typeof prop.value.value === 'boolean') expanded = prop.value.value;
        break;
      case 'selected':
        if (typeof prop.value.value === 'boolean') selected = prop.value.value;
        break;
      case 'disabled':
        if (typeof prop.value.value === 'boolean') disabled = prop.value.value;
        break;
      case 'required':
        if (typeof prop.value.value === 'boolean') required = prop.value.value;
        break;
    }
  }

  return { level, checked, expanded, selected, disabled, required };
}

function stripInvisibleChars(text: string): string {
  return text.replace(INVISIBLE_CHARS, '');
}

function createEmptyNode(): TreeNode {
  return {
    role: '',
    name: '',
    level: null,
    checked: null,
    expanded: null,
    selected: null,
    disabled: null,
    required: null,
    valueText: null,
    backendNodeId: null,
    children: [],
    parentIdx: null,
    hasRef: false,
    refId: null,
    depth: 0,
    cursorInteractive: false,
  };
}

// ============================================================================
// Tree Building
// ============================================================================

function buildTree(nodes: AXNode[]): { treeNodes: TreeNode[]; rootIndices: number[] } {
  const treeNodes: TreeNode[] = [];
  const idToIdx = new Map<string, number>();

  // Phase 1: Create tree nodes
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const role = extractAXString(node.role);
    const name = extractAXString(node.name);

    // nodeId 可能是 string 或 number，统一转 string
    const nodeId = String(node.nodeId);
    idToIdx.set(nodeId, i);

    // Skip ignored nodes (except RootWebArea) and InlineTextBox
    if ((node.ignored && role !== 'RootWebArea') || role === 'InlineTextBox') {
      treeNodes.push(createEmptyNode());
      continue;
    }

    const { level, checked, expanded, selected, disabled, required } = extractProperties(
      node.properties
    );
    const valueText = extractAXString(node.value) || null;

    treeNodes.push({
      role,
      name,
      level,
      checked,
      expanded,
      selected,
      disabled,
      required,
      valueText,
      backendNodeId: node.backendDOMNodeId ?? null,
      children: [],
      parentIdx: null,
      hasRef: false,
      refId: null,
      depth: 0,
      cursorInteractive: false,
    });
  }

  // Phase 2: Build parent-child relationships
  for (let i = 0; i < nodes.length; i++) {
    const childIds = nodes[i].childIds;
    if (!childIds) continue;
    for (const cid of childIds) {
      // childIds 的元素可能是 string 或 number，统一转 string
      const childIdx = idToIdx.get(String(cid));
      if (childIdx !== undefined) {
        treeNodes[i].children.push(childIdx);
        treeNodes[childIdx].parentIdx = i;
      }
    }
  }

  // Phase 3: Aggregate StaticText nodes
  aggregateStaticText(treeNodes);

  // Phase 4: Compute depths and find roots
  const isChild = new Array(treeNodes.length).fill(false);
  for (const node of treeNodes) {
    for (const childIdx of node.children) {
      isChild[childIdx] = true;
    }
  }

  const rootIndices: number[] = [];
  for (let i = 0; i < isChild.length; i++) {
    if (!isChild[i]) rootIndices.push(i);
  }

  function setDepth(idx: number, depth: number) {
    treeNodes[idx].depth = depth;
    for (const childIdx of treeNodes[idx].children) {
      setDepth(childIdx, depth + 1);
    }
  }

  for (const root of rootIndices) {
    setDepth(root, 0);
  }

  return { treeNodes, rootIndices };
}

function aggregateStaticText(treeNodes: TreeNode[]): void {
  for (let i = 0; i < treeNodes.length; i++) {
    const node = treeNodes[i];
    if (!node.role || node.children.length === 0) continue;

    const childrenIndices = [...node.children];

    // Merge consecutive StaticText children
    let start = 0;
    while (start < childrenIndices.length) {
      if (treeNodes[childrenIndices[start]].role !== 'StaticText') {
        start++;
        continue;
      }

      let end = start + 1;
      while (end < childrenIndices.length && treeNodes[childrenIndices[end]].role === 'StaticText') {
        end++;
      }

      if (end > start + 1) {
        // Aggregate names into the first node
        let aggregated = '';
        for (let j = start; j < end; j++) {
          aggregated += treeNodes[childrenIndices[j]].name;
        }
        treeNodes[childrenIndices[start]].name = aggregated;
        // Clear the rest
        for (let j = start + 1; j < end; j++) {
          const idx = childrenIndices[j];
          treeNodes[idx].role = '';
          treeNodes[idx].name = '';
          treeNodes[idx].children = [];
        }
      }

      start = end;
    }

    // Deduplicate single StaticText child with same name as parent
    if (
      childrenIndices.length === 1 &&
      treeNodes[childrenIndices[0]].role === 'StaticText' &&
      node.name === treeNodes[childrenIndices[0]].name
    ) {
      const idx = childrenIndices[0];
      treeNodes[idx].role = '';
      treeNodes[idx].name = '';
      treeNodes[idx].children = [];
    }
  }
}

// ============================================================================
// Cursor Interactive Element Detection
// ============================================================================

/**
 * 注入 JS 扫描页面，找出通过 cursor:pointer / onclick / tabindex / contenteditable
 * 实现交互但在无障碍树中只是 generic 角色的元素。
 * 返回这些元素的 backendNodeId 集合。
 *
 * 大页面跳过扫描：querySelectorAll('*') + 每节点 getComputedStyle 在几千节点的页面上
 * 会明显卡顿。超过 MAX_SCAN_NODES 时直接返回空集。
 */
const MAX_SCAN_NODES = 3000;

async function findCursorInteractiveElements(tabId: number): Promise<Set<number>> {
  const result = new Set<number>();
  let scanDispatched = false;

  try {
    const scanFunc = (maxNodes: number) => {
      var nativeTags: Record<string, number> = {A:1,BUTTON:1,INPUT:1,SELECT:1,TEXTAREA:1,DETAILS:1,SUMMARY:1};
      var interactiveRoles: Record<string, number> = {button:1,link:1,textbox:1,checkbox:1,radio:1,combobox:1,
        listbox:1,menuitem:1,menuitemcheckbox:1,menuitemradio:1,option:1,searchbox:1,
        slider:1,spinbutton:1,switch:1,tab:1,treeitem:1};
      var all = document.body ? document.body.querySelectorAll('*') : [];
      // 大页面跳过，避免 getComputedStyle N 次导致的 reflow/style 重算阻塞
      if (all.length > maxNodes) return { count: 0, skipped: true };
      var count = 0;
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.closest('[hidden],[aria-hidden="true"]')) continue;
        if (nativeTags[el.tagName]) continue;
        var role = el.getAttribute('role');
        if (role && interactiveRoles[role]) continue;
        var cs = getComputedStyle(el);
        var hasCursor = cs.cursor === 'pointer';
        var hasOnClick = el.hasAttribute('onclick') || (el as any).onclick !== null;
        var ti = el.getAttribute('tabindex');
        var hasTabIndex = ti !== null && ti !== '-1';
        var ce = el.getAttribute('contenteditable');
        var isEditable = ce === '' || ce === 'true';
        if (!hasCursor && !hasOnClick && !hasTabIndex && !isEditable) continue;
        if (hasCursor && !hasOnClick && !hasTabIndex && !isEditable) {
          var parent = el.parentElement;
          if (parent && getComputedStyle(parent).cursor === 'pointer') continue;
        }
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        el.setAttribute('data-__sd-ci', String(count));
        count++;
      }
      return { count: count, skipped: false };
    };

    // Step 1: 在所有框架中扫描并打标记
    scanDispatched = true;
    const scanResults = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: scanFunc,
      args: [MAX_SCAN_NODES],
    });

    const totalCount = scanResults?.reduce(
      (sum, r) => sum + (((r.result as any)?.count as number) || 0),
      0
    ) ?? 0;
    if (totalCount === 0) return result;

    // Step 2: 通过 DOM.getDocument (pierce iframes) + DOM.querySelectorAll 获取标记元素
    const docResult = await cdpDebugger.sendCommand(tabId, 'DOM.getDocument', { depth: -1, pierce: true });
    if (!docResult?.root) return result;

    // 收集所有 document 节点（主文档 + iframe 内文档）的 nodeId
    const documentNodeIds: number[] = [];
    const collectDocumentNodes = (node: any) => {
      if (node.nodeName === '#document' || node.nodeType === 9) {
        documentNodeIds.push(node.nodeId);
      }
      if (node.children) {
        for (const child of node.children) collectDocumentNodes(child);
      }
      if (node.contentDocument) {
        collectDocumentNodes(node.contentDocument);
      }
    };
    collectDocumentNodes(docResult.root);

    // 在每个 document 中并发查询标记元素
    const allNodeIds: number[] = [];
    const queryResults = await Promise.all(
      documentNodeIds.map(async (docNodeId) => {
        try {
          const r = await cdpDebugger.sendCommand(tabId, 'DOM.querySelectorAll', {
            nodeId: docNodeId,
            selector: '[data-__sd-ci]',
          });
          return r?.nodeIds ?? [];
        } catch {
          return [];
        }
      })
    );
    for (const ids of queryResults) allNodeIds.push(...ids);

    // 并发 describeNode 获取 backendNodeId
    const BATCH = 30;
    for (let i = 0; i < allNodeIds.length; i += BATCH) {
      const batch = allNodeIds.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (nid) => {
          try {
            const desc = await cdpDebugger.sendCommand(tabId, 'DOM.describeNode', { nodeId: nid });
            return desc?.node?.backendNodeId ?? null;
          } catch {
            return null;
          }
        })
      );
      for (const bid of results) {
        if (bid !== null) result.add(bid);
      }
    }
  } catch (err) {
    console.warn('[axSnapshot] findCursorInteractiveElements failed:', err);
  } finally {
    // 只要发起过扫描就必须清理标记，避免中途 CDP 失败导致页面 DOM 残留属性
    if (scanDispatched) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: () => {
            var els = document.querySelectorAll('[data-__sd-ci]');
            for (var i = 0; i < els.length; i++) els[i].removeAttribute('data-__sd-ci');
          },
        });
      } catch {
        // 清理失败不影响主流程
      }
    }
  }

  return result;
}

// ============================================================================
// Role-Name Tracker (for nth disambiguation)
// ============================================================================

class RoleNameTracker {
  private counts = new Map<string, number>();

  track(role: string, name: string): number {
    const key = `${role}:${name}`;
    const nth = this.counts.get(key) ?? 0;
    this.counts.set(key, nth + 1);
    return nth;
  }

  getDuplicateKeys(): Set<string> {
    const dups = new Set<string>();
    for (const [key, count] of this.counts) {
      if (count > 1) dups.add(key);
    }
    return dups;
  }
}

// ============================================================================
// Ref Assignment
// ============================================================================

function assignRefs(treeNodes: TreeNode[], interactiveOnly: boolean, startRef: number = 1): RefMapping[] {
  const refMappings: RefMapping[] = [];
  const tracker = new RoleNameTracker();
  const nodesWithRefs: Array<{ idx: number; nth: number }> = [];
  let nextRef = startRef;

  // Pass 1: identify which nodes get refs and track role:name occurrences
  for (let i = 0; i < treeNodes.length; i++) {
    const node = treeNodes[i];
    const role = node.role;
    let shouldRef = false;

    if (INTERACTIVE_ROLES.has(role)) {
      shouldRef = true;
    } else if (!interactiveOnly && CONTENT_ROLES.has(role) && node.name) {
      shouldRef = true;
    } else if (node.cursorInteractive) {
      shouldRef = true;
    }

    if (shouldRef) {
      const nth = tracker.track(role, node.name);
      nodesWithRefs.push({ idx: i, nth });
    }
  }

  // Pass 2: assign refs with nth disambiguation
  const duplicates = tracker.getDuplicateKeys();

  for (const { idx, nth } of nodesWithRefs) {
    const node = treeNodes[idx];
    const key = `${node.role}:${node.name}`;
    const actualNth = duplicates.has(key) ? nth : null;

    const refId = `ref_${nextRef}`;
    nextRef++;
    node.hasRef = true;
    node.refId = refId;

    if (node.backendNodeId !== null) {
      refMappings.push({
        refId,
        backendNodeId: node.backendNodeId,
        role: node.role,
        name: node.name,
        nth: actualNth,
        isCursorInteractive: node.cursorInteractive,
        interactiveOnly,
      });
    }
  }

  return refMappings;
}

// ============================================================================
// Rendering
// ============================================================================

function renderTree(
  treeNodes: TreeNode[],
  rootIndices: number[],
  options: SnapshotOptions
): string {
  let output = '';

  for (const rootIdx of rootIndices) {
    output += renderNode(treeNodes, rootIdx, 0, options);
  }

  return output;
}

function renderNode(
  treeNodes: TreeNode[],
  idx: number,
  indent: number,
  options: SnapshotOptions
): string {
  const node = treeNodes[idx];

  const passthrough = () => {
    let out = '';
    for (const childIdx of node.children) {
      out += renderNode(treeNodes, childIdx, indent, options);
    }
    return out;
  };

  if (!node.role) return passthrough();
  if (node.role === 'StaticText' && !stripInvisibleChars(node.name)) return passthrough();
  if (node.role === 'generic' && !node.hasRef && node.children.length <= 1) return passthrough();
  if (node.role === 'RootWebArea' || node.role === 'WebArea') return passthrough();

  // Depth limit
  if (options.depth !== undefined && indent > options.depth) {
    return '';
  }

  // Interactive-only mode: skip non-ref nodes but traverse children
  if (options.filter === 'interactive' && !node.hasRef) return passthrough();

  // Build line
  const prefix = '  '.repeat(indent);
  let line = `${prefix}- ${node.role}`;

  // Name
  const displayName = stripInvisibleChars(node.name);
  if (displayName) {
    const escaped = JSON.stringify(displayName);
    line += ` ${escaped}`;
  }

  // Attributes
  const attrs: string[] = [];
  if (node.level !== null) attrs.push(`level=${node.level}`);
  if (node.checked !== null) attrs.push(`checked=${node.checked}`);
  if (node.expanded !== null) attrs.push(`expanded=${node.expanded}`);
  if (node.selected === true) attrs.push('selected');
  if (node.disabled === true) attrs.push('disabled');
  if (node.required === true) attrs.push('required');
  if (node.refId) attrs.push(`ref=${node.refId}`);
  if (attrs.length > 0) line += ` [${attrs.join(', ')}]`;

  // Value
  if (node.valueText && node.valueText !== node.name) {
    line += `: ${node.valueText}`;
  }

  let output = line + '\n';

  // Render children
  for (const childIdx of node.children) {
    output += renderNode(treeNodes, childIdx, indent + 1, options);
  }

  return output;
}

// ============================================================================
// Compact Mode
// ============================================================================

function compactTree(tree: string, interactive: boolean): string {
  const lines = tree.split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return '';

  const keep = new Array(lines.length).fill(false);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('ref=') || lines[i].includes(': ')) {
      keep[i] = true;
      // Mark ancestors by indent
      const myIndent = countIndent(lines[i]);
      for (let j = i - 1; j >= 0; j--) {
        const ancestorIndent = countIndent(lines[j]);
        if (ancestorIndent < myIndent) {
          keep[j] = true;
          if (ancestorIndent === 0) break;
        }
      }
    }
  }

  const result = lines.filter((_, i) => keep[i]).join('\n');

  if (!result.trim() && interactive) {
    return '(no interactive elements)';
  }

  return result;
}

function countIndent(line: string): number {
  const trimmed = line.trimStart();
  return (line.length - trimmed.length) / 2;
}

// ============================================================================
// Main Entry
// ============================================================================

/**
 * 按 tabId 串行化 AX 扫描 + cursor-interactive 扫描。
 * 即便上层调度是串行的，也能防止未来引入并发（或 resolveStaleRef 与 takeSnapshot
 * 同时跑）时 data-__sd-ci 标记、__claudeRefCounter 等共享状态互相踩。
 */
const snapshotLocks = new Map<number, Promise<unknown>>();

chrome.tabs.onRemoved.addListener((tabId) => {
  snapshotLocks.delete(tabId);
});

export async function withSnapshotLock<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  const prev = snapshotLocks.get(tabId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const chained = prev.then(() => gate);
  snapshotLocks.set(tabId, chained);
  try {
    await prev;
    return await fn();
  } finally {
    release();
    // 若当前链尾仍是自己，说明没有后继任务排队，清理 map 避免长期持有已完成 promise
    if (snapshotLocks.get(tabId) === chained) {
      snapshotLocks.delete(tabId);
    }
  }
}

async function fetchAXTree(tabId: number): Promise<AXNode[]> {
  await cdpDebugger.sendCommand(tabId, 'DOM.enable');
  await cdpDebugger.sendCommand(tabId, 'Accessibility.enable');

  const result = await cdpDebugger.sendCommand(tabId, 'Accessibility.getFullAXTree');
  return result?.nodes ?? [];
}

export async function takeSnapshot(
  tabId: number,
  options: SnapshotOptions = {}
): Promise<SnapshotResult> {
  return withSnapshotLock(tabId, () => takeSnapshotUnlocked(tabId, options));
}

/**
 * 免锁版本：调用方已经持有 withSnapshotLock 时使用，避免嵌套死锁。
 */
export async function takeSnapshotUnlocked(
  tabId: number,
  options: SnapshotOptions
): Promise<SnapshotResult> {
  const [axNodes, cursorInteractiveIds] = await Promise.all([
    fetchAXTree(tabId),
    findCursorInteractiveElements(tabId)
  ]);

  if (!axNodes.length) {
    return { content: '(empty page)', refMappings: [] };
  }

  const { treeNodes, rootIndices } = buildTree(axNodes);

  if (cursorInteractiveIds.size > 0) {
    for (const node of treeNodes) {
      if (node.backendNodeId !== null && cursorInteractiveIds.has(node.backendNodeId)) {
        node.cursorInteractive = true;
      }
    }
  }

  const refMappings = assignRefs(treeNodes, options.filter === 'interactive', (options.startRef ?? 0) + 1);

  let content = renderTree(treeNodes, rootIndices, options);

  if (options.compact) {
    content = compactTree(content, options.filter === 'interactive');
  }

  content = content.trim();

  if (!content) {
    if (options.filter === 'interactive') {
      return { content: '(no interactive elements)', refMappings: [] };
    }
    return { content: '(empty page)', refMappings: [] };
  }

  // Check maxChars limit
  if (options.maxChars && content.length > options.maxChars) {
    const prefix = `Output exceeds ${options.maxChars} character limit (${content.length} characters). `;

    if (options.depth !== undefined) {
      throw new SnapshotMaxCharsError(
        `${prefix}Try specifying an even smaller depth parameter or use ref_id to focus on a specific element.`
      );
    }

    throw new SnapshotMaxCharsError(
      `${prefix}Try specifying a depth parameter (e.g., depth: 5) or use ref_id to focus on a specific element from the page.`
    );
  }

  return { content, refMappings };
}
