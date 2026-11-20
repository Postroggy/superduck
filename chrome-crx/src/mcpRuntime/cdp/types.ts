export interface KeyDefinition {
  key: string;
  code: string;
  keyCode: number;
  text?: string;
  isKeypad?: boolean;
  location?: number;
  windowsVirtualKeyCode?: number;
}

export interface ConsoleMessage {
  type: string;
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  args?: unknown[];
  stackTrace?: string;
}

export interface ConsoleTabData {
  domain: string;
  messages: ConsoleMessage[];
}

export interface WebSocketFrame {
  direction: 'sent' | 'received';
  timestamp: number;
  opcode?: number;
  payload: string;
  truncated?: boolean;
}

export interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  startedAt: number;
  status?: number;
  mimeType?: string;
  protocol?: string;
  responseTimeMs?: number;
  durationMs?: number;
  transferredBytes?: number;
  failure?: string;
  postData?: string;
  postDataFetched?: boolean;
  webSocketFrames?: WebSocketFrame[];
  webSocketFrameCount?: number;
  responseBody?: string;
  responseBodyBase64Encoded?: boolean;
  responseBodyError?: string;
}

export interface NetworkTabData {
  domain: string;
  requests: NetworkRequest[];
  requestMap: Map<string, NetworkRequest>;
}

export interface WindowOpenEvent {
  url: string;
  timestamp: number;
  windowName?: string;
  userGesture?: boolean;
}

export interface MouseEventParams {
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

export interface KeyEventParams {
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

export interface ResizeParams {
  pxPerToken: number;
  maxTargetPx: number;
  maxTargetTokens: number;
}

export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
  format: string;
  viewportWidth: number;
  viewportHeight: number;
}

export interface ScreenshotOptions {
  skipIndicator?: boolean;
}

export interface ClickOptions {
  skipIndicator?: boolean;
}

export interface CdpRemoteObject {
  type?: string;
  subtype?: string;
  value?: unknown;
  description?: string;
  objectId?: string;
}

export interface CdpExceptionCallFrame {
  functionName?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface CdpExceptionDetails {
  exception?: {
    description?: string;
    value?: unknown;
  };
  text?: string;
  timestamp?: number;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  stackTrace?: {
    callFrames?: CdpExceptionCallFrame[];
  };
}

export interface CdpRuntimeEvaluateResult {
  result?: CdpRemoteObject;
  exceptionDetails?: CdpExceptionDetails;
}

export interface CdpDomNode {
  nodeName?: string;
  nodeType?: number;
  nodeId?: number;
  backendNodeId?: number;
  frameId?: string;
  children?: CdpDomNode[];
  contentDocument?: CdpDomNode & { frameId?: string };
}

export interface CdpDomGetDocumentResult {
  root?: CdpDomNode;
}

export interface CdpDomDescribeNodeResult {
  node?: CdpDomNode;
}

export interface CdpDomQuerySelectorAllResult {
  nodeIds?: number[];
}

export interface CdpDomQuerySelectorResult {
  nodeId?: number;
}

export interface CdpDomAttributesResult {
  attributes?: string[];
}

export interface CdpDomResolveNodeResult {
  object?: CdpRemoteObject;
}

export interface CdpPageFrameTreeNode {
  frame?: { id?: string };
  childFrames?: CdpPageFrameTreeNode[];
}

export interface CdpPageGetFrameTreeResult {
  frameTree?: CdpPageFrameTreeNode;
}

export interface CdpDomGetFrameOwnerResult {
  backendNodeId?: number;
}

export interface CdpDomGetContentQuadsResult {
  quads?: number[][];
}

export interface CdpAccessibilityTreeResult<TNode = unknown> {
  nodes?: TNode[];
}

export interface CdpCaptureScreenshotResult {
  data?: string;
}

export interface DebuggerRemoteObject {
  value?: unknown;
  description?: string;
}

export interface DebuggerCallFrame {
  functionName?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface ConsoleApiCalledParams {
  type?: string;
  args?: DebuggerRemoteObject[];
  timestamp?: number;
  stackTrace?: {
    callFrames?: DebuggerCallFrame[];
  };
}

export interface ExceptionDetails {
  exception?: {
    description?: string;
  };
  text?: string;
  timestamp?: number;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  stackTrace?: {
    callFrames?: DebuggerCallFrame[];
  };
}

export interface ExceptionThrownParams {
  exceptionDetails?: ExceptionDetails;
}

export interface RequestWillBeSentParams {
  requestId: string;
  timestamp: number;
  redirectResponse?: NetworkResponse;
  request: {
    url: string;
    method: string;
    postData?: string;
  };
  documentURL?: string;
}

export interface NetworkResponse {
  status: number;
  mimeType?: string;
  protocol?: string;
}

export interface ResponseReceivedParams {
  requestId: string;
  timestamp: number;
  response: NetworkResponse;
}

export interface LoadingFinishedParams {
  requestId: string;
  timestamp: number;
  encodedDataLength: number;
}

export interface LoadingFailedParams {
  requestId: string;
  timestamp: number;
  errorText?: string;
  canceled?: boolean;
}

export type DispatchMouseEventParams = {
  type: string;
  x: number;
  y: number;
  modifiers: number;
  button?: string;
  clickCount?: number;
  buttons?: number;
  deltaX?: number;
  deltaY?: number;
};

export type SendCommand = (
  tabId: number,
  method: string,
  params?: Record<string, unknown>
) => Promise<object | undefined>;

export interface WebSocketCreatedParams {
  requestId: string;
  url: string;
}

export interface WebSocketFrameParams {
  requestId: string;
  timestamp: number;
  response?: {
    opcode?: number;
    payloadData?: string;
  };
}

export interface WebSocketClosedParams {
  requestId: string;
  timestamp: number;
}

export interface ResponseBodyResult {
  body?: string;
  base64Encoded?: boolean;
}

export interface BufferedCdpEvent {
  seq: number;
  method: string;
  params: unknown;
  timestamp: number;
  bytes: number;
}

export interface CdpTabEventBuffer {
  nextSeq: number;
  events: BufferedCdpEvent[];
  bytes: number;
  capturing: boolean;
}

export interface CdpPausedFrame {
  functionName?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  callFrameId?: string;
}

export interface CdpPausedState {
  reason?: string;
  since: number;
  hitBreakpoints?: string[];
  frames: CdpPausedFrame[];
}

export interface CdpBreakpointRecord {
  id: string;
  url?: string;
  urlRegex?: string;
  lineNumber?: number;
  columnNumber?: number;
  scriptId?: string;
  createdAt: number;
}

// SuperDuck's own bookkeeping around a chrome.debugger session. Chrome stays the
// source of truth for the protocol; this only mirrors what the extension needs
// to answer "what is this tab doing right now" without a round trip.
export interface CdpTabSessionState {
  enabledDomains: Set<string>;
  breakpoints: Map<string, CdpBreakpointRecord>;
  paused?: CdpPausedState;
  lastCommand?: string;
  lastCommandAt?: number;
  lastError?: string;
}

export interface CdpSessionReport {
  attached: boolean;
  enabledDomains: string[];
  attachedTargets?: string[];
  paused?: {
    reason?: string;
    sinceMs: number;
    hitBreakpoints?: string[];
    topFrame?: CdpPausedFrame;
    frameCount: number;
    frames: CdpPausedFrame[];
  };
  breakpoints: CdpBreakpointRecord[];
  lastCommand?: string;
  lastCommandAgeMs?: number;
  lastError?: string;
  events: { capturing: boolean; buffered: number; nextSeq: number };
  network: { tracking: boolean; requests: number };
}

export interface CdpTargetSummary {
  targetId: string;
  type: string;
  title?: string;
  url?: string;
  attached: boolean;
}
