import { calculateOptimalDimensions, screenshotContextManager } from './shared';
import { tabGroupManager, verifyDomainUnchanged } from './tabState';

// =============================================================================
// CDP Section - Chrome Debugger Protocol
// =============================================================================

// --- External dependencies (defined elsewhere in the codebase) ---
// indicatorManager is tabGroupManager (TabGroupManager singleton defined in Section 5 above)

// screenshotContextManager is defined earlier in this file (Section 2)

// --- checkDomainSecurity (bundle: L, lines 959-965) ---
// Delegates to verifyDomainUnchanged (same logic, defined in Section 2 above).
async function checkDomainSecurity(
  tabId: number,
  url: string | undefined,
  actionName: string
): Promise<{ error: string } | null> {
  if (!url) return null;
  return verifyDomainUnchanged(tabId, url, actionName);
}

// --- calculateTargetDimensions (bundle: B, lines 902-916) ---
// Delegates to calculateOptimalDimensions (same logic, defined in Section 2 above).
function calculateTargetDimensions(
  width: number,
  height: number,
  params: { pxPerToken: number; maxTargetPx: number; maxTargetTokens: number }
): [number, number] {
  return calculateOptimalDimensions(width, height, params);
}

// --- generateUniqueId (bundle: @lukeed/uuid v4, lines 179-189 of SavedPromptsService) ---
// Generates UUID v4 strings. Uses crypto.randomUUID if available, otherwise manual generation.
function generateUniqueId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: manual UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// PermissionTypes → PermissionActionType (imported from SavedPromptsService)

// --- Global CDP state initialization ---
if (!globalThis.__cdpDebuggerListenerRegistered) globalThis.__cdpDebuggerListenerRegistered = false;
if (!globalThis.__cdpConsoleMessagesByTab) globalThis.__cdpConsoleMessagesByTab = new Map();
if (!globalThis.__cdpNetworkRequestsByTab) globalThis.__cdpNetworkRequestsByTab = new Map();
if (!globalThis.__cdpNetworkTrackingEnabled) globalThis.__cdpNetworkTrackingEnabled = new Set();
if (!globalThis.__cdpConsoleTrackingEnabled) globalThis.__cdpConsoleTrackingEnabled = new Set();

// --- MAC_KEYBOARD_COMMANDS constant (Y) ---
const MAC_KEYBOARD_COMMANDS: Record<string, string | string[]> = {
  backspace: 'deleteBackward',
  enter: 'insertNewline',
  numpadenter: 'insertNewline',
  kp_enter: 'insertNewline',
  escape: 'cancelOperation',
  arrowup: 'moveUp',
  arrowdown: 'moveDown',
  arrowleft: 'moveLeft',
  arrowRight: 'moveRight',
  up: 'moveUp',
  down: 'moveDown',
  left: 'moveLeft',
  right: 'moveRight',
  f5: 'complete',
  delete: 'deleteForward',
  home: 'scrollToBeginningOfDocument',
  end: 'scrollToEndOfDocument',
  pageup: 'scrollPageUp',
  pagedown: 'scrollPageDown',
  'shift+backspace': 'deleteBackward',
  'shift+enter': 'insertNewline',
  'shift+escape': 'cancelOperation',
  'shift+arrowup': 'moveUpAndModifySelection',
  'shift+arrowdown': 'moveDownAndModifySelection',
  'shift+arrowleft': 'moveLeftAndModifySelection',
  'shift+arrowright': 'moveRightAndModifySelection',
  'shift+up': 'moveUpAndModifySelection',
  'shift+down': 'moveDownAndModifySelection',
  'shift+left': 'moveLeftAndModifySelection',
  'shift+right': 'moveRightAndModifySelection',
  'shift+f5': 'complete',
  'shift+delete': 'deleteForward',
  'shift+home': 'moveToBeginningOfDocumentAndModifySelection',
  'shift+end': 'moveToEndOfDocumentAndModifySelection',
  'shift+pageup': 'pageUpAndModifySelection',
  'shift+pagedown': 'pageDownAndModifySelection',
  'shift+numpad5': 'delete',
  'ctrl+tab': 'selectNextKeyView',
  'ctrl+enter': 'insertLineBreak',
  'ctrl+numpadenter': 'insertLineBreak',
  'ctrl+kp_enter': 'insertLineBreak',
  'ctrl+quote': 'insertSingleQuoteIgnoringSubstitution',
  "ctrl+'": 'insertSingleQuoteIgnoringSubstitution',
  'ctrl+a': 'moveToBeginningOfParagraph',
  'ctrl+b': 'moveBackward',
  'ctrl+d': 'deleteForward',
  'ctrl+e': 'moveToEndOfParagraph',
  'ctrl+f': 'moveForward',
  'ctrl+h': 'deleteBackward',
  'ctrl+k': 'deleteToEndOfParagraph',
  'ctrl+l': 'centerSelectionInVisibleArea',
  'ctrl+n': 'moveDown',
  'ctrl+p': 'moveUp',
  'ctrl+t': 'transpose',
  'ctrl+v': 'moveUp',
  'ctrl+y': 'yank',
  'ctrl+o': ['insertNewlineIgnoringFieldEditor', 'moveBackward'],
  'ctrl+backspace': 'deleteBackwardByDecomposingPreviousCharacter',
  'ctrl+arrowup': 'scrollPageUp',
  'ctrl+arrowdown': 'scrollPageDown',
  'ctrl+arrowleft': 'moveToLeftEndOfLine',
  'ctrl+arrowright': 'moveToRightEndOfLine',
  'ctrl+up': 'scrollPageUp',
  'ctrl+down': 'scrollPageDown',
  'ctrl+left': 'moveToLeftEndOfLine',
  'ctrl+right': 'moveToRightEndOfLine',
  'shift+ctrl+enter': 'insertLineBreak',
  'shift+control+numpadenter': 'insertLineBreak',
  'shift+control+kp_enter': 'insertLineBreak',
  'shift+ctrl+tab': 'selectPreviousKeyView',
  'shift+ctrl+quote': 'insertDoubleQuoteIgnoringSubstitution',
  "shift+ctrl+'": 'insertDoubleQuoteIgnoringSubstitution',
  'ctrl+"': 'insertDoubleQuoteIgnoringSubstitution',
  'shift+ctrl+a': 'moveToBeginningOfParagraphAndModifySelection',
  'shift+ctrl+b': 'moveBackwardAndModifySelection',
  'shift+ctrl+e': 'moveToEndOfParagraphAndModifySelection',
  'shift+ctrl+f': 'moveForwardAndModifySelection',
  'shift+ctrl+n': 'moveDownAndModifySelection',
  'shift+ctrl+p': 'moveUpAndModifySelection',
  'shift+ctrl+v': 'pageDownAndModifySelection',
  'shift+ctrl+backspace': 'deleteBackwardByDecomposingPreviousCharacter',
  'shift+ctrl+arrowup': 'scrollPageUp',
  'shift+ctrl+arrowdown': 'scrollPageDown',
  'shift+ctrl+arrowleft': 'moveToLeftEndOfLineAndModifySelection',
  'shift+ctrl+arrowright': 'moveToRightEndOfLineAndModifySelection',
  'shift+ctrl+up': 'scrollPageUp',
  'shift+ctrl+down': 'scrollPageDown',
  'shift+ctrl+left': 'moveToLeftEndOfLineAndModifySelection',
  'shift+ctrl+right': 'moveToRightEndOfLineAndModifySelection',
  'alt+backspace': 'deleteWordBackward',
  'alt+enter': 'insertNewlineIgnoringFieldEditor',
  'alt+numpadenter': 'insertNewlineIgnoringFieldEditor',
  'alt+kp_enter': 'insertNewlineIgnoringFieldEditor',
  'alt+escape': 'complete',
  'alt+arrowup': ['moveBackward', 'moveToBeginningOfParagraph'],
  'alt+arrowdown': ['moveForward', 'moveToEndOfParagraph'],
  'alt+arrowleft': 'moveWordLeft',
  'alt+arrowright': 'moveWordRight',
  'alt+up': ['moveBackward', 'moveToBeginningOfParagraph'],
  'alt+down': ['moveForward', 'moveToEndOfParagraph'],
  'alt+left': 'moveWordLeft',
  'alt+right': 'moveWordRight',
  'alt+delete': 'deleteWordForward',
  'alt+pageup': 'pageUp',
  'alt+pagedown': 'pageDown',
  'shift+alt+backspace': 'deleteWordBackward',
  'shift+alt+enter': 'insertNewlineIgnoringFieldEditor',
  'shift+alt+numpadenter': 'insertNewlineIgnoringFieldEditor',
  'shift+alt+kp_enter': 'insertNewlineIgnoringFieldEditor',
  'shift+alt+escape': 'complete',
  'shift+alt+arrowup': 'moveParagraphBackwardAndModifySelection',
  'shift+alt+arrowdown': 'moveParagraphForwardAndModifySelection',
  'shift+alt+arrowleft': 'moveWordLeftAndModifySelection',
  'shift+alt+arrowright': 'moveWordRightAndModifySelection',
  'shift+alt+up': 'moveParagraphBackwardAndModifySelection',
  'shift+alt+down': 'moveParagraphForwardAndModifySelection',
  'shift+alt+left': 'moveWordLeftAndModifySelection',
  'shift+alt+right': 'moveWordRightAndModifySelection',
  'shift+alt+delete': 'deleteWordForward',
  'shift+alt+pageup': 'pageUp',
  'shift+alt+pagedown': 'pageDown',
  'ctrl+alt+b': 'moveWordBackward',
  'ctrl+alt+f': 'moveWordForward',
  'ctrl+alt+backspace': 'deleteWordBackward',
  'shift+ctrl+alt+b': 'moveWordBackwardAndModifySelection',
  'shift+ctrl+alt+f': 'moveWordForwardAndModifySelection',
  'shift+ctrl+alt+backspace': 'deleteWordBackward',
  'cmd+numpadsubtract': 'cancel',
  'cmd+backspace': 'deleteToBeginningOfLine',
  'cmd+arrowup': 'moveToBeginningOfDocument',
  'cmd+arrowdown': 'moveToEndOfDocument',
  'cmd+arrowleft': 'moveToLeftEndOfLine',
  'cmd+arrowright': 'moveToRightEndOfLine',
  'cmd+home': 'moveToBeginningOfDocument',
  'cmd+up': 'moveToBeginningOfDocument',
  'cmd+down': 'moveToEndOfDocument',
  'cmd+left': 'moveToLeftEndOfLine',
  'cmd+right': 'moveToRightEndOfLine',
  'shift+cmd+numpadsubtract': 'cancel',
  'shift+cmd+backspace': 'deleteToBeginningOfLine',
  'shift+cmd+arrowup': 'moveToBeginningOfDocumentAndModifySelection',
  'shift+cmd+arrowdown': 'moveToEndOfDocumentAndModifySelection',
  'shift+cmd+arrowleft': 'moveToLeftEndOfLineAndModifySelection',
  'shift+cmd+arrowright': 'moveToRightEndOfLineAndModifySelection',
  'cmd+a': 'selectAll',
  'cmd+c': 'copy',
  'cmd+x': 'cut',
  'cmd+v': 'paste',
  'cmd+z': 'undo',
  'shift+cmd+z': 'redo'
};

// --- KEY_DEFINITIONS constant (V) ---
interface KeyDefinition {
  key: string;
  code: string;
  keyCode: number;
  text?: string;
  isKeypad?: boolean;
  location?: number;
  windowsVirtualKeyCode?: number;
}

const KEY_DEFINITIONS: Record<string, KeyDefinition> = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  return: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  kp_enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r', isKeypad: true },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  ' ': { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  f1: { key: 'F1', code: 'F1', keyCode: 112 },
  f2: { key: 'F2', code: 'F2', keyCode: 113 },
  f3: { key: 'F3', code: 'F3', keyCode: 114 },
  f4: { key: 'F4', code: 'F4', keyCode: 115 },
  f5: { key: 'F5', code: 'F5', keyCode: 116 },
  f6: { key: 'F6', code: 'F6', keyCode: 117 },
  f7: { key: 'F7', code: 'F7', keyCode: 118 },
  f8: { key: 'F8', code: 'F8', keyCode: 119 },
  f9: { key: 'F9', code: 'F9', keyCode: 120 },
  f10: { key: 'F10', code: 'F10', keyCode: 121 },
  f11: { key: 'F11', code: 'F11', keyCode: 122 },
  f12: { key: 'F12', code: 'F12', keyCode: 123 },
  ';': { key: ';', code: 'Semicolon', keyCode: 186, text: ';' },
  '=': { key: '=', code: 'Equal', keyCode: 187, text: '=' },
  ',': { key: ',', code: 'Comma', keyCode: 188, text: ',' },
  '-': { key: '-', code: 'Minus', keyCode: 189, text: '-' },
  '.': { key: '.', code: 'Period', keyCode: 190, text: '.' },
  '/': { key: '/', code: 'Slash', keyCode: 191, text: '/' },
  '`': { key: '`', code: 'Backquote', keyCode: 192, text: '`' },
  '[': { key: '[', code: 'BracketLeft', keyCode: 219, text: '[' },
  '\\': { key: '\\', code: 'Backslash', keyCode: 220, text: '\\' },
  ']': { key: ']', code: 'BracketRight', keyCode: 221, text: ']' },
  "'": { key: "'", code: 'Quote', keyCode: 222, text: "'" },
  '!': { key: '!', code: 'Digit1', keyCode: 49, text: '!' },
  '@': { key: '@', code: 'Digit2', keyCode: 50, text: '@' },
  '#': { key: '#', code: 'Digit3', keyCode: 51, text: '#' },
  $: { key: '$', code: 'Digit4', keyCode: 52, text: '$' },
  '%': { key: '%', code: 'Digit5', keyCode: 53, text: '%' },
  '^': { key: '^', code: 'Digit6', keyCode: 54, text: '^' },
  '&': { key: '&', code: 'Digit7', keyCode: 55, text: '&' },
  '*': { key: '*', code: 'Digit8', keyCode: 56, text: '*' },
  '(': { key: '(', code: 'Digit9', keyCode: 57, text: '(' },
  ')': { key: ')', code: 'Digit0', keyCode: 48, text: ')' },
  _: { key: '_', code: 'Minus', keyCode: 189, text: '_' },
  '+': { key: '+', code: 'Equal', keyCode: 187, text: '+' },
  '{': { key: '{', code: 'BracketLeft', keyCode: 219, text: '{' },
  '}': { key: '}', code: 'BracketRight', keyCode: 221, text: '}' },
  '|': { key: '|', code: 'Backslash', keyCode: 220, text: '|' },
  ':': { key: ':', code: 'Semicolon', keyCode: 186, text: ':' },
  '"': { key: '"', code: 'Quote', keyCode: 222, text: '"' },
  '<': { key: '<', code: 'Comma', keyCode: 188, text: '<' },
  '>': { key: '>', code: 'Period', keyCode: 190, text: '>' },
  '?': { key: '?', code: 'Slash', keyCode: 191, text: '?' },
  '~': { key: '~', code: 'Backquote', keyCode: 192, text: '~' },
  capslock: { key: 'CapsLock', code: 'CapsLock', keyCode: 20 },
  numlock: { key: 'NumLock', code: 'NumLock', keyCode: 144 },
  scrolllock: { key: 'ScrollLock', code: 'ScrollLock', keyCode: 145 },
  pause: { key: 'Pause', code: 'Pause', keyCode: 19 },
  insert: { key: 'Insert', code: 'Insert', keyCode: 45 },
  printscreen: { key: 'PrintScreen', code: 'PrintScreen', keyCode: 44 },
  numpad0: { key: '0', code: 'Numpad0', keyCode: 96, isKeypad: true },
  numpad1: { key: '1', code: 'Numpad1', keyCode: 97, isKeypad: true },
  numpad2: { key: '2', code: 'Numpad2', keyCode: 98, isKeypad: true },
  numpad3: { key: '3', code: 'Numpad3', keyCode: 99, isKeypad: true },
  numpad4: { key: '4', code: 'Numpad4', keyCode: 100, isKeypad: true },
  numpad5: { key: '5', code: 'Numpad5', keyCode: 101, isKeypad: true },
  numpad6: { key: '6', code: 'Numpad6', keyCode: 102, isKeypad: true },
  numpad7: { key: '7', code: 'Numpad7', keyCode: 103, isKeypad: true },
  numpad8: { key: '8', code: 'Numpad8', keyCode: 104, isKeypad: true },
  numpad9: { key: '9', code: 'Numpad9', keyCode: 105, isKeypad: true },
  numpadmultiply: { key: '*', code: 'NumpadMultiply', keyCode: 106, isKeypad: true },
  numpadadd: { key: '+', code: 'NumpadAdd', keyCode: 107, isKeypad: true },
  numpadsubtract: { key: '-', code: 'NumpadSubtract', keyCode: 109, isKeypad: true },
  numpaddecimal: { key: '.', code: 'NumpadDecimal', keyCode: 110, isKeypad: true },
  numpaddivide: { key: '/', code: 'NumpadDivide', keyCode: 111, isKeypad: true }
};

// --- Interfaces for CDP types ---
interface ConsoleMessage {
  type: string;
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  args?: any[];
  stackTrace?: string;
}

interface ConsoleTabData {
  domain: string;
  messages: ConsoleMessage[];
}

interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  status?: number;
}

interface NetworkTabData {
  domain: string;
  requests: NetworkRequest[];
  requestMap: Map<string, NetworkRequest>;
}

interface MouseEventParams {
  type: string;
  x: number;
  y: number;
  button?: string;
  buttons?: number;
  clickCount?: number;
  modifiers?: number;
  deltaX?: number;
  deltaY?: number;
}

interface KeyEventParams {
  type: string;
  key?: string;
  code?: string;
  windowsVirtualKeyCode?: number;
  modifiers?: number;
  text?: string;
  unmodifiedText?: string;
  location?: number;
  commands?: string[];
  isKeypad?: boolean;
}

interface ResizeParams {
  pxPerToken: number;
  maxTargetPx: number;
  maxTargetTokens: number;
}

interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
  format: string;
  viewportWidth: number;
  viewportHeight: number;
}

interface ScreenshotOptions {
  format?: string;
  quality?: number;
  skipIndicator?: boolean;
}

interface ClickOptions {
  skipIndicator?: boolean;
}

// --- ChromeDebuggerProtocol class (J) ---
class ChromeDebuggerProtocol {
  static MAX_LOGS_PER_TAB: number = 10000;
  static MAX_REQUESTS_PER_TAB: number = 1000;

  static get debuggerListenerRegistered(): boolean {
    return globalThis.__cdpDebuggerListenerRegistered;
  }

  static set debuggerListenerRegistered(value: boolean) {
    globalThis.__cdpDebuggerListenerRegistered = value;
  }

  static get consoleMessagesByTab(): Map<number, ConsoleTabData> {
    return globalThis.__cdpConsoleMessagesByTab;
  }

  static get networkRequestsByTab(): Map<number, NetworkTabData> {
    return globalThis.__cdpNetworkRequestsByTab;
  }

  static get networkTrackingEnabled(): Set<number> {
    return globalThis.__cdpNetworkTrackingEnabled;
  }

  static get consoleTrackingEnabled(): Set<number> {
    return globalThis.__cdpConsoleTrackingEnabled;
  }

  isMac: boolean = false;

  constructor() {
    this.isMac =
      navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
      navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    this.initializeDebuggerEventListener();
  }

  registerDebuggerEventHandlers(): void {
    if (!globalThis.__cdpDebuggerEventHandler) {
      globalThis.__cdpDebuggerEventHandler = (
        source: chrome.debugger.Debuggee,
        method: string,
        params: any
      ) => {
        const tabId = source.tabId;
        if (!tabId) return;

        if ('Runtime.consoleAPICalled' === method) {
          const message: ConsoleMessage = {
            type: params.type || 'log',
            text: params.args
              ?.map((arg: any) =>
                void 0 !== arg.value ? String(arg.value) : arg.description || ''
              )
              .join(' '),
            timestamp: params.timestamp || Date.now(),
            url: params.stackTrace?.callFrames?.[0]?.url,
            lineNumber: params.stackTrace?.callFrames?.[0]?.lineNumber,
            columnNumber: params.stackTrace?.callFrames?.[0]?.columnNumber,
            args: params.args
          };
          const domain = this.extractDomain(message.url);
          this.addConsoleMessage(tabId, domain, message);
        } else if ('Runtime.exceptionThrown' === method) {
          const exceptionDetails = params.exceptionDetails;
          const exceptionMessage: ConsoleMessage = {
            type: 'exception',
            text:
              exceptionDetails?.exception?.description ||
              exceptionDetails?.text ||
              'Unknown exception',
            timestamp: exceptionDetails?.timestamp || Date.now(),
            url: exceptionDetails?.url,
            lineNumber: exceptionDetails?.lineNumber,
            columnNumber: exceptionDetails?.columnNumber,
            stackTrace: exceptionDetails?.stackTrace?.callFrames
              ?.map(
                (frame: any) =>
                  `    at ${frame.functionName || '<anonymous>'} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`
              )
              .join('\n')
          };
          const domain = this.extractDomain(exceptionMessage.url);
          this.addConsoleMessage(tabId, domain, exceptionMessage);
        } else if ('Network.requestWillBeSent' === method) {
          const requestId = params.requestId;
          const request = params.request;
          const documentURL = params.documentURL;
          const networkRequest: NetworkRequest = {
            requestId,
            url: request.url,
            method: request.method
          };
          const pageUrl = documentURL || request.url;
          const domain = this.extractDomain(pageUrl);
          this.addNetworkRequest(tabId, domain, networkRequest);
        } else if ('Network.responseReceived' === method) {
          const requestId = params.requestId;
          const response = params.response;
          const tabData = ChromeDebuggerProtocol.networkRequestsByTab.get(tabId);
          if (tabData) {
            const matchingRequest = tabData.requestMap.get(requestId);
            if (matchingRequest) {
              matchingRequest.status = response.status;
            }
          }
        } else if ('Network.loadingFailed' === method) {
          const requestId = params.requestId;
          const tabData = ChromeDebuggerProtocol.networkRequestsByTab.get(tabId);
          if (tabData) {
            const matchingRequest = tabData.requestMap.get(requestId);
            if (matchingRequest) {
              matchingRequest.status = 503;
            }
          }
        }
      };
      chrome.debugger.onEvent.addListener(globalThis.__cdpDebuggerEventHandler);
    }
  }

  initializeDebuggerEventListener(): void {
    if (!ChromeDebuggerProtocol.debuggerListenerRegistered) {
      ChromeDebuggerProtocol.debuggerListenerRegistered = true;
      this.registerDebuggerEventHandlers();
      this.registerDebuggerDetachHandler();
    }
  }

  /**
   * Listen for debugger detach events.  When the user clicks "Cancel" on
   * Chrome's "… has started debugging this browser" info-bar, Chrome detaches
   * the debugger with reason "canceled_by_user".  We treat this the same as
   * clicking the stop button – broadcast STOP_AGENT so the sidepanel aborts,
   * and hide the visual indicators on the affected tab.
   */
  registerDebuggerDetachHandler(): void {
    chrome.debugger.onDetach.addListener(
      (source: chrome.debugger.Debuggee, reason: string) => {
        if (reason !== 'canceled_by_user') return;
        const tabId = source.tabId;
        if (!tabId) return;

        console.log('[CDP] Debugger detached by user for tab', tabId, '– stopping agent');

        // Immediately hide indicators on the page via content script
        chrome.tabs.sendMessage(tabId, { type: 'HIDE_AGENT_INDICATORS' }).catch(() => {});

        // Broadcast STOP_AGENT so the sidepanel (if open) aborts the request
        chrome.runtime.sendMessage({ type: 'STOP_AGENT', targetTabId: tabId }).catch(() => {});

        // Update group metadata for consistency
        tabGroupManager.setTabIndicatorState(tabId, 'none').catch(() => {});
      }
    );
  }

  defaultResizeParams: ResizeParams = {
    pxPerToken: 28,
    maxTargetPx: 1568,
    maxTargetTokens: 1568
  };
  static MAX_BASE64_CHARS: number = 1398100;
  static INITIAL_JPEG_QUALITY: number = 0.85;
  static JPEG_QUALITY_STEP: number = 0.05;
  static MIN_JPEG_QUALITY: number = 0.1;

  async attachDebugger(tabId: number): Promise<void> {
    const target: chrome.debugger.Debuggee = { tabId };
    const wasNetworkTracking = ChromeDebuggerProtocol.networkTrackingEnabled.has(tabId);
    const wasConsoleTracking = ChromeDebuggerProtocol.consoleTrackingEnabled.has(tabId);

    try {
      await this.detachDebugger(tabId);
    } catch {
      // ignore detach errors
    }

    await new Promise<void>((resolve, reject) => {
      chrome.debugger.attach(target, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    this.registerDebuggerEventHandlers();

    if (wasConsoleTracking) {
      try {
        await this.sendCommand(tabId, 'Runtime.enable');
      } catch (_err) {
        // ignore
      }
    }

    if (wasNetworkTracking) {
      try {
        await this.sendCommand(tabId, 'Network.enable', { maxPostDataSize: 65536 });
      } catch (_err) {
        // ignore
      }
    }
  }

  async detachDebugger(tabId: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      chrome.debugger.detach({ tabId }, () => {
        if (chrome.runtime.lastError) {
          // Only reject if it's not "Debugger is not attached" error
          const errorMsg = chrome.runtime.lastError.message || '';
          if (!errorMsg.toLowerCase().includes('not attached')) {
            console.warn(`[CDP] Detach warning for tab ${tabId}:`, errorMsg);
          }
          // Always resolve to avoid blocking
          resolve();
        } else {
          resolve();
        }
      });
    });
  }

  async isDebuggerAttached(tabId: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      chrome.debugger.getTargets((targets) => {
        const target = targets.find((t) => t.tabId === tabId);
        resolve(target?.attached ?? false);
      });
    });
  }

  async sendCommand(tabId: number, method: string, params?: any): Promise<any> {
    try {
      return await new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('debugger is not attached')) {
        await this.attachDebugger(tabId);
        return new Promise((resolve, reject) => {
          chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        });
      }
      throw error;
    }
  }

  async dispatchMouseEvent(tabId: number, eventParams: MouseEventParams): Promise<void> {
    const params: any = {
      type: eventParams.type,
      x: Math.round(eventParams.x),
      y: Math.round(eventParams.y),
      modifiers: eventParams.modifiers || 0
    };

    if (
      eventParams.type === 'mousePressed' ||
      eventParams.type === 'mouseReleased' ||
      eventParams.type === 'mouseMoved'
    ) {
      params.button = eventParams.button || 'none';
      if (eventParams.type === 'mousePressed' || eventParams.type === 'mouseReleased') {
        params.clickCount = eventParams.clickCount || 1;
      }
    }

    if (eventParams.type !== 'mouseWheel') {
      params.buttons = void 0 !== eventParams.buttons ? eventParams.buttons : 0;
    }

    if (
      eventParams.type === 'mouseWheel' &&
      (void 0 !== eventParams.deltaX || void 0 !== eventParams.deltaY)
    ) {
      Object.assign(params, {
        deltaX: eventParams.deltaX || 0,
        deltaY: eventParams.deltaY || 0
      });
    }

    await this.sendCommand(tabId, 'Input.dispatchMouseEvent', params);
  }

  async dispatchKeyEvent(tabId: number, eventParams: KeyEventParams): Promise<void> {
    const params = { modifiers: 0, ...eventParams };
    await this.sendCommand(tabId, 'Input.dispatchKeyEvent', params);
  }

  async insertText(tabId: number, text: string): Promise<void> {
    await this.sendCommand(tabId, 'Input.insertText', { text });
  }

  async click(
    tabId: number,
    x: number,
    y: number,
    button: string = 'left',
    clickCount: number = 1,
    modifiers: number = 0,
    options?: ClickOptions
  ): Promise<void> {
    if (!options?.skipIndicator) {
      await tabGroupManager.hideIndicatorForToolUse(tabId);
    }
    try {
      let buttonsBitmask = 0;
      if (button === 'left') {
        buttonsBitmask = 1;
      } else if (button === 'right') {
        buttonsBitmask = 2;
      } else if (button === 'middle') {
        buttonsBitmask = 4;
      }

      await this.dispatchMouseEvent(tabId, {
        type: 'mouseMoved',
        x,
        y,
        button: 'none',
        buttons: 0,
        modifiers
      });

      if (!options?.skipIndicator) {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }

      for (let i = 1; i <= clickCount; i++) {
        await this.dispatchMouseEvent(tabId, {
          type: 'mousePressed',
          x,
          y,
          button,
          buttons: buttonsBitmask,
          clickCount: i,
          modifiers
        });

        if (!options?.skipIndicator) {
          await new Promise<void>((resolve) => setTimeout(resolve, 12));
        }

        await this.dispatchMouseEvent(tabId, {
          type: 'mouseReleased',
          x,
          y,
          button,
          buttons: 0,
          modifiers,
          clickCount: i
        });

        if (i < clickCount && !options?.skipIndicator) {
          await new Promise<void>((resolve) => setTimeout(resolve, 100));
        }
      }
    } finally {
      if (!options?.skipIndicator) {
        await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
      }
    }
  }

  async type(tabId: number, text: string): Promise<void> {
    for (const char of text) {
      let key = char;
      if (char === '\n' || char === '\r') {
        key = 'Enter';
      }
      const keyCode = this.getKeyCode(key);
      if (keyCode) {
        const modifiers = this.requiresShift(char) ? 8 : 0;
        await this.pressKey(tabId, keyCode, modifiers);
      } else {
        await this.insertText(tabId, char);
      }
    }
  }

  async keyDown(
    tabId: number,
    keyDef: KeyDefinition,
    modifiers: number = 0,
    commands?: string[]
  ): Promise<void> {
    await this.dispatchKeyEvent(tabId, {
      type: keyDef.text ? 'keyDown' : 'rawKeyDown',
      key: keyDef.key,
      code: keyDef.code,
      windowsVirtualKeyCode: keyDef.windowsVirtualKeyCode || keyDef.keyCode,
      modifiers,
      text: keyDef.text ?? '',
      unmodifiedText: keyDef.text ?? '',
      location: keyDef.location ?? 0,
      commands: commands ?? [],
      isKeypad: keyDef.isKeypad ?? false
    });
  }

  async keyUp(tabId: number, keyDef: KeyDefinition, modifiers: number = 0): Promise<void> {
    await this.dispatchKeyEvent(tabId, {
      type: 'keyUp',
      key: keyDef.key,
      modifiers,
      windowsVirtualKeyCode: keyDef.windowsVirtualKeyCode || keyDef.keyCode,
      code: keyDef.code,
      location: keyDef.location ?? 0
    });
  }

  async pressKey(
    tabId: number,
    keyDef: KeyDefinition,
    modifiers: number = 0,
    commands?: string[]
  ): Promise<void> {
    await this.keyDown(tabId, keyDef, modifiers, commands);
    await this.keyUp(tabId, keyDef, modifiers);
  }

  async pressKeyChord(tabId: number, chord: string): Promise<void> {
    const parts = chord.toLowerCase().split('+');
    const modifierKeys: string[] = [];
    let mainKey = '';

    for (const part of parts) {
      if (
        ['ctrl', 'control', 'alt', 'shift', 'cmd', 'meta', 'command', 'win', 'windows'].includes(
          part
        )
      ) {
        modifierKeys.push(part);
      } else {
        mainKey = part;
      }
    }

    let modifiersBitmask = 0;
    const modifierMap: Record<string, number> = {
      alt: 1,
      ctrl: 2,
      control: 2,
      meta: 4,
      cmd: 4,
      command: 4,
      win: 4,
      windows: 4,
      shift: 8
    };

    for (const mod of modifierKeys) {
      modifiersBitmask |= modifierMap[mod] || 0;
    }

    const commands: string[] = [];
    if (this.isMac) {
      const macCommand = MAC_KEYBOARD_COMMANDS[chord.toLowerCase()];
      if (macCommand && Array.isArray(macCommand)) {
        commands.push(...macCommand);
      } else if (macCommand) {
        commands.push(macCommand as string);
      }
    }

    if (mainKey) {
      const keyCode = this.getKeyCode(mainKey);
      if (!keyCode) throw new Error(`Unknown key: ${chord}`);
      await this.pressKey(tabId, keyCode, modifiersBitmask, commands);
    }
  }

  async scrollWheel(
    tabId: number,
    x: number,
    y: number,
    deltaX: number,
    deltaY: number
  ): Promise<void> {
    await this.dispatchMouseEvent(tabId, {
      type: 'mouseWheel',
      x,
      y,
      deltaX,
      deltaY
    });
  }

  getKeyCode(key: string): KeyDefinition | undefined {
    const lowerKey = key.toLowerCase();
    const definition = KEY_DEFINITIONS[lowerKey];
    if (definition) return definition;

    if (key.length === 1) {
      const upper = key.toUpperCase();
      let code: string;
      if (upper >= 'A' && upper <= 'Z') {
        code = `Key${upper}`;
      } else if (key >= '0' && key <= '9') {
        code = `Digit${key}`;
      } else {
        return undefined;
      }
      return { key, code, keyCode: upper.charCodeAt(0), text: key };
    }
    return undefined;
  }

  requiresShift(char: string): boolean {
    return '~!@#$%^&*()_+{}|:"<>?'.includes(char) || (char >= 'A' && char <= 'Z');
  }

  extractDomain(url?: string): string {
    if (!url) return 'unknown';
    try {
      return new URL(url).hostname || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  addConsoleMessage(tabId: number, domain: string, message: ConsoleMessage): void {
    let tabData = ChromeDebuggerProtocol.consoleMessagesByTab.get(tabId);

    if (tabData && tabData.domain !== domain) {
      tabData = { domain, messages: [] };
      ChromeDebuggerProtocol.consoleMessagesByTab.set(tabId, tabData);
    } else if (!tabData) {
      tabData = { domain, messages: [] };
      ChromeDebuggerProtocol.consoleMessagesByTab.set(tabId, tabData);
    }

    if (tabData.messages.length > 0) {
      const lastTimestamp = tabData.messages[tabData.messages.length - 1].timestamp;
      if (message.timestamp < lastTimestamp) {
        message.timestamp = lastTimestamp;
      }
    }

    tabData.messages.push(message);

    if (tabData.messages.length > ChromeDebuggerProtocol.MAX_LOGS_PER_TAB) {
      const excess = tabData.messages.length - ChromeDebuggerProtocol.MAX_LOGS_PER_TAB;
      tabData.messages.splice(0, excess);
    }
  }

  async enableConsoleTracking(tabId: number): Promise<void> {
    try {
      await this.sendCommand(tabId, 'Runtime.enable');
      ChromeDebuggerProtocol.consoleTrackingEnabled.add(tabId);
    } catch (error) {
      throw error;
    }
  }

  getConsoleMessages(
    tabId: number,
    errorsOnly: boolean = false,
    filterPattern?: string
  ): ConsoleMessage[] {
    const tabData = ChromeDebuggerProtocol.consoleMessagesByTab.get(tabId);
    if (!tabData) return [];

    let messages = tabData.messages;

    if (errorsOnly) {
      messages = messages.filter((msg) => msg.type === 'error' || msg.type === 'exception');
    }

    if (filterPattern) {
      try {
        const regex = new RegExp(filterPattern, 'i');
        messages = messages.filter((msg) => regex.test(msg.text));
      } catch {
        messages = messages.filter((msg) =>
          msg.text.toLowerCase().includes(filterPattern.toLowerCase())
        );
      }
    }

    return messages;
  }

  clearConsoleMessages(tabId: number): void {
    ChromeDebuggerProtocol.consoleMessagesByTab.delete(tabId);
  }

  addNetworkRequest(tabId: number, domain: string, request: NetworkRequest): void {
    let tabData = ChromeDebuggerProtocol.networkRequestsByTab.get(tabId);

    if (tabData) {
      if (tabData.domain !== domain) {
        tabData.domain = domain;
        tabData.requests = [];
        tabData.requestMap = new Map();
      }
    } else {
      tabData = { domain, requests: [], requestMap: new Map() };
      ChromeDebuggerProtocol.networkRequestsByTab.set(tabId, tabData);
    }

    tabData.requests.push(request);
    tabData.requestMap.set(request.requestId, request);

    if (tabData.requests.length > ChromeDebuggerProtocol.MAX_REQUESTS_PER_TAB) {
      const excess = tabData.requests.length - ChromeDebuggerProtocol.MAX_REQUESTS_PER_TAB;
      const removed = tabData.requests.splice(0, excess);
      for (const req of removed) {
        tabData.requestMap.delete(req.requestId);
      }
    }
  }

  async enableNetworkTracking(tabId: number): Promise<void> {
    try {
      if (!ChromeDebuggerProtocol.debuggerListenerRegistered) {
        this.initializeDebuggerEventListener();
      }
      try {
        await this.sendCommand(tabId, 'Network.disable');
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      } catch {
        // ignore
      }
      await this.sendCommand(tabId, 'Network.enable', { maxPostDataSize: 65536 });
      ChromeDebuggerProtocol.networkTrackingEnabled.add(tabId);
    } catch (error) {
      throw error;
    }
  }

  getNetworkRequests(tabId: number, urlFilter?: string): NetworkRequest[] {
    const tabData = ChromeDebuggerProtocol.networkRequestsByTab.get(tabId);
    if (!tabData) return [];

    let requests = tabData.requests;
    if (urlFilter) {
      requests = requests.filter((req) => req.url.includes(urlFilter));
    }
    return requests;
  }

  clearNetworkRequests(tabId: number): void {
    ChromeDebuggerProtocol.networkRequestsByTab.delete(tabId);
  }

  isNetworkTrackingEnabled(tabId: number): boolean {
    return ChromeDebuggerProtocol.networkTrackingEnabled.has(tabId);
  }

  async screenshot(
    tabId: number,
    resizeParams?: ResizeParams,
    options?: ScreenshotOptions
  ): Promise<ScreenshotResult> {
    const resize = resizeParams || this.defaultResizeParams;
    const format = options?.format ?? 'png';
    const quality = options?.quality ?? 100 * ChromeDebuggerProtocol.INITIAL_JPEG_QUALITY;

    if (!options?.skipIndicator) {
      await tabGroupManager.hideIndicatorForToolUse(tabId);
    }

    try {
      const scriptResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio
        })
      });

      if (!scriptResults || !scriptResults[0]?.result) {
        throw new Error('Failed to get viewport information');
      }

      const {
        width: viewportWidth,
        height: viewportHeight,
        devicePixelRatio
      } = scriptResults[0].result;

      const captureResult = await this.sendCommand(tabId, 'Page.captureScreenshot', {
        format,
        ...((format === 'jpeg' || format === 'webp') && { quality }),
        captureBeyondViewport: false,
        fromSurface: true
      });

      if (!captureResult || !captureResult.data) {
        throw new Error('Failed to capture screenshot via CDP');
      }

      const rawBase64: string = captureResult.data;

      if (typeof Image === 'undefined') {
        return await this.processScreenshotInContentScript(
          tabId,
          rawBase64,
          viewportWidth,
          viewportHeight,
          devicePixelRatio,
          resize
        );
      }

      const dataUrl = `data:image/${format};base64,${rawBase64}`;

      const result = await new Promise<ScreenshotResult>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          let imgWidth = img.width;
          let imgHeight = img.height;

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return void reject(new Error('Failed to create 2D context for screenshot processing'));
          }

          const needsDownscale = devicePixelRatio > 1;
          if (needsDownscale) {
            imgWidth = Math.round(img.width / devicePixelRatio);
            imgHeight = Math.round(img.height / devicePixelRatio);
          }

          const [targetWidth, targetHeight] = calculateTargetDimensions(
            imgWidth,
            imgHeight,
            resize
          );
          const needsResize = imgWidth !== targetWidth || imgHeight !== targetHeight;

          if (!needsDownscale && !needsResize) {
            return void resolve({
              base64: rawBase64,
              width: imgWidth,
              height: imgHeight,
              format,
              viewportWidth,
              viewportHeight
            });
          }

          canvas.width = imgWidth;
          canvas.height = imgHeight;

          if (needsDownscale) {
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, imgWidth, imgHeight);
          } else {
            ctx.drawImage(img, 0, 0);
          }

          if (!needsResize) {
            const base64 = canvas.toDataURL(`image/${format}`).split(',')[1];
            return void resolve({
              base64,
              width: imgWidth,
              height: imgHeight,
              format,
              viewportWidth,
              viewportHeight
            });
          }

          const targetCanvas = document.createElement('canvas');
          const targetCtx = targetCanvas.getContext('2d');
          if (!targetCtx) {
            return void reject(new Error('Failed to create 2D context for target resizing'));
          }

          targetCanvas.width = targetWidth;
          targetCanvas.height = targetHeight;
          targetCtx.drawImage(canvas, 0, 0, imgWidth, imgHeight, 0, 0, targetWidth, targetHeight);

          const resizedBase64 = targetCanvas.toDataURL(`image/${format}`).split(',')[1];
          resolve({
            base64: resizedBase64,
            width: targetWidth,
            height: targetHeight,
            format,
            viewportWidth,
            viewportHeight
          });
        };
        img.onerror = () => {
          reject(new Error('Failed to load screenshot image'));
        };
        img.src = dataUrl;
      });

      screenshotContextManager.setContext(tabId, result);
      return result;
    } finally {
      if (!options?.skipIndicator) {
        await tabGroupManager.restoreIndicatorAfterToolUse(tabId);
      }
    }
  }

  async processScreenshotInContentScript(
    tabId: number,
    base64Data: string,
    viewportWidth: number,
    viewportHeight: number,
    devicePixelRatio: number,
    resizeParams: ResizeParams
  ): Promise<ScreenshotResult> {
    const scriptResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: (
        imgBase64: string,
        vpWidth: number,
        vpHeight: number,
        dpr: number,
        resize: ResizeParams,
        maxBase64Chars: number,
        initialJpegQuality: number,
        jpegQualityStep: number,
        minJpegQuality: number
      ) => {
        const dataUrl = `data:image/png;base64,${imgBase64}`;
        return new Promise<ScreenshotResult>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            let imgWidth = img.width;
            let imgHeight = img.height;

            if (dpr > 1) {
              imgWidth = Math.round(img.width / dpr);
              imgHeight = Math.round(img.height / dpr);
            }

            const canvas = document.createElement('canvas');
            canvas.width = imgWidth;
            canvas.height = imgHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              return void reject(new Error('Failed to get canvas context'));
            }

            if (dpr > 1) {
              ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, imgWidth, imgHeight);
            } else {
              ctx.drawImage(img, 0, 0);
            }

            const aspectRatio = imgWidth / imgHeight;
            const pxPerToken = resize.pxPerToken || 28;
            const maxTargetTokens = resize.maxTargetTokens || 1568;
            const currentTokens = Math.ceil((imgWidth / pxPerToken) * (imgHeight / pxPerToken));

            let targetWidth = imgWidth;
            let targetHeight = imgHeight;

            if (currentTokens > maxTargetTokens) {
              const scaleFactor = Math.sqrt(maxTargetTokens / currentTokens);
              targetWidth = Math.round(imgWidth * scaleFactor);
              targetHeight = Math.round(targetWidth / aspectRatio);
            }

            const compressToFit = (sourceCanvas: HTMLCanvasElement): string => {
              let quality = initialJpegQuality;
              let result = sourceCanvas.toDataURL('image/jpeg', quality).split(',')[1];
              while (result.length > maxBase64Chars && quality > minJpegQuality) {
                quality -= jpegQualityStep;
                result = sourceCanvas.toDataURL('image/jpeg', quality).split(',')[1];
              }
              return result;
            };

            if (targetWidth >= imgWidth && targetHeight >= imgHeight) {
              const compressed = compressToFit(canvas);
              return void resolve({
                base64: compressed,
                width: imgWidth,
                height: imgHeight,
                format: 'jpeg',
                viewportWidth: vpWidth,
                viewportHeight: vpHeight
              });
            }

            const targetCanvas = document.createElement('canvas');
            targetCanvas.width = targetWidth;
            targetCanvas.height = targetHeight;
            const targetCtx = targetCanvas.getContext('2d');
            if (!targetCtx) {
              return void reject(new Error('Failed to get target canvas context'));
            }

            targetCtx.drawImage(canvas, 0, 0, imgWidth, imgHeight, 0, 0, targetWidth, targetHeight);

            const compressed = compressToFit(targetCanvas);
            resolve({
              base64: compressed,
              width: targetWidth,
              height: targetHeight,
              format: 'jpeg',
              viewportWidth: vpWidth,
              viewportHeight: vpHeight
            });
          };
          img.onerror = () => {
            reject(new Error('Failed to load screenshot image'));
          };
          img.src = dataUrl;
        });
      },
      args: [
        base64Data,
        viewportWidth,
        viewportHeight,
        devicePixelRatio,
        resizeParams,
        ChromeDebuggerProtocol.MAX_BASE64_CHARS,
        ChromeDebuggerProtocol.INITIAL_JPEG_QUALITY,
        ChromeDebuggerProtocol.JPEG_QUALITY_STEP,
        ChromeDebuggerProtocol.MIN_JPEG_QUALITY
      ]
    });

    if (!scriptResults || !scriptResults[0]?.result) {
      throw new Error('Failed to process screenshot in content script');
    }

    const result = scriptResults[0].result as ScreenshotResult;
    screenshotContextManager.setContext(tabId, result);
    return result;
  }
}

// --- CDP instance (X) ---
export const cdpDebugger = new ChromeDebuggerProtocol();

// --- CDP helper functions ---

/**
 * Convert screenshot-space coordinates to viewport-space coordinates (Q).
 */
function screenshotToViewportCoords(
  screenshotX: number,
  screenshotY: number,
  context: {
    viewportWidth: number;
    viewportHeight: number;
    screenshotWidth: number;
    screenshotHeight: number;
  }
): [number, number] {
  const scaleX = context.viewportWidth / context.screenshotWidth;
  const scaleY = context.viewportHeight / context.screenshotHeight;
  return [Math.round(screenshotX * scaleX), Math.round(screenshotY * scaleY)];
}

/**
 * Scroll using content script injection for cases where CDP scroll doesn't work (Z).
 */
async function scrollViaContentScript(
  tabId: number,
  pointX: number,
  pointY: number,
  deltaX: number,
  deltaY: number
): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (scrollDeltaX: number, scrollDeltaY: number, x: number, y: number) => {
      const elementAtPoint = document.elementFromPoint(x, y);
      if (
        elementAtPoint &&
        elementAtPoint !== document.body &&
        elementAtPoint !== document.documentElement
      ) {
        const isScrollable = (el: Element): boolean => {
          const style = window.getComputedStyle(el);
          const overflowY = style.overflowY;
          const overflowX = style.overflowX;
          return (
            (overflowY === 'auto' ||
              overflowY === 'scroll' ||
              overflowX === 'auto' ||
              overflowX === 'scroll') &&
            (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
          );
        };

        let current: Element | null = elementAtPoint;
        while (current && !isScrollable(current)) {
          current = current.parentElement;
        }

        if (current && isScrollable(current)) {
          return void current.scrollBy({
            left: scrollDeltaX,
            top: scrollDeltaY,
            behavior: 'instant'
          });
        }
      }
      window.scrollBy({ left: scrollDeltaX, top: scrollDeltaY, behavior: 'instant' });
    },
    args: [deltaX, deltaY, pointX, pointY]
  });
}

// --- Computer tool definition (ee) ---

export {
  checkDomainSecurity,
  generateUniqueId,
  screenshotToViewportCoords,
  scrollViaContentScript
};
