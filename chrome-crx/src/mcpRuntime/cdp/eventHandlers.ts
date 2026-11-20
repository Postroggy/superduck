import { extractDomain } from './helpers';
import { addConsoleMessage } from './consoleTracking';
import { recordCdpEvent } from './eventBuffer';
import {
  addNetworkRequest,
  appendWebSocketFrame,
  finishNetworkRequest,
  recordNetworkResponse,
  registerWebSocketRequest
} from './networkTracking';
import { getWindowOpenEventsByTab } from './state';
import { noteCdpEvent } from './sessionState';
import type {
  ConsoleApiCalledParams,
  ConsoleMessage,
  ExceptionThrownParams,
  LoadingFailedParams,
  LoadingFinishedParams,
  NetworkRequest,
  RequestWillBeSentParams,
  ResponseReceivedParams,
  WebSocketClosedParams,
  WebSocketCreatedParams,
  WebSocketFrameParams,
  WindowOpenEvent
} from './types';

interface PageWindowOpenParams {
  url?: string;
  windowName?: string;
  userGesture?: boolean;
}

function addWindowOpenEvent(tabId: number, event: WindowOpenEvent): void {
  const events = getWindowOpenEventsByTab().get(tabId) ?? [];
  events.push(event);
  if (events.length > 20) events.shift();
  getWindowOpenEventsByTab().set(tabId, events);
}

export function registerDebuggerEventHandlers(): void {
  if (!globalThis.__cdpDebuggerEventHandler) {
    globalThis.__cdpDebuggerEventHandler = (
      source: chrome.debugger.Debuggee,
      method: string,
      params: unknown
    ) => {
      const tabId = source.tabId;
      if (!tabId) return;

      // Raw feed for `superduck_cdp` `events` reads; a no-op unless capture is on.
      recordCdpEvent(tabId, method, params);
      // Pause/breakpoint bookkeeping for `cdp status` and the paused-tab guard.
      noteCdpEvent(tabId, method, params);

      if ('Runtime.consoleAPICalled' === method) {
        const consoleParams = params as ConsoleApiCalledParams;
        const message: ConsoleMessage = {
          type: consoleParams.type || 'log',
          text:
            consoleParams.args
              ?.map((arg) => (void 0 !== arg.value ? String(arg.value) : arg.description || ''))
              .join(' ') || '',
          timestamp: consoleParams.timestamp || Date.now(),
          url: consoleParams.stackTrace?.callFrames?.[0]?.url,
          lineNumber: consoleParams.stackTrace?.callFrames?.[0]?.lineNumber,
          columnNumber: consoleParams.stackTrace?.callFrames?.[0]?.columnNumber,
          args: consoleParams.args
        };
        const domain = extractDomain(message.url);
        addConsoleMessage(tabId, domain, message);
      } else if ('Runtime.exceptionThrown' === method) {
        const exceptionDetails = (params as ExceptionThrownParams).exceptionDetails;
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
              (frame) =>
                `    at ${frame.functionName || '<anonymous>'} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`
            )
            .join('\n')
        };
        const domain = extractDomain(exceptionMessage.url);
        addConsoleMessage(tabId, domain, exceptionMessage);
      } else if ('Network.requestWillBeSent' === method) {
        const requestParams = params as RequestWillBeSentParams;
        const requestId = requestParams.requestId;
        const request = requestParams.request;
        const documentURL = requestParams.documentURL;
        if (requestParams.redirectResponse) {
          recordNetworkResponse(
            tabId,
            requestId,
            requestParams.timestamp,
            requestParams.redirectResponse
          );
          finishNetworkRequest(tabId, requestId, requestParams.timestamp);
        }
        const networkRequest: NetworkRequest = {
          requestId,
          url: request.url,
          method: request.method,
          startedAt: requestParams.timestamp
        };
        if (request.postData) networkRequest.postData = request.postData;
        const pageUrl = documentURL || request.url;
        const domain = extractDomain(pageUrl);
        addNetworkRequest(tabId, domain, networkRequest);
      } else if ('Network.responseReceived' === method) {
        const responseParams = params as ResponseReceivedParams;
        recordNetworkResponse(
          tabId,
          responseParams.requestId,
          responseParams.timestamp,
          responseParams.response
        );
      } else if ('Network.loadingFinished' === method) {
        const { requestId, timestamp, encodedDataLength } = params as LoadingFinishedParams;
        finishNetworkRequest(tabId, requestId, timestamp, { transferredBytes: encodedDataLength });
      } else if ('Network.loadingFailed' === method) {
        const { requestId, timestamp, canceled, errorText } = params as LoadingFailedParams;
        const failure = canceled
          ? 'canceled'
          : (errorText?.match(/^net::ERR_[A-Z0-9_]+$/)?.[0] ?? 'failed');
        finishNetworkRequest(tabId, requestId, timestamp, { failure });
      } else if ('Network.webSocketCreated' === method) {
        const { requestId, url } = params as WebSocketCreatedParams;
        registerWebSocketRequest(tabId, requestId, url, extractDomain(url));
      } else if ('Network.webSocketFrameSent' === method) {
        const { requestId, timestamp, response } = params as WebSocketFrameParams;
        appendWebSocketFrame(tabId, requestId, {
          direction: 'sent',
          timestamp,
          opcode: response?.opcode,
          payload: response?.payloadData ?? ''
        });
      } else if ('Network.webSocketFrameReceived' === method) {
        const { requestId, timestamp, response } = params as WebSocketFrameParams;
        appendWebSocketFrame(tabId, requestId, {
          direction: 'received',
          timestamp,
          opcode: response?.opcode,
          payload: response?.payloadData ?? ''
        });
      } else if ('Network.webSocketClosed' === method) {
        const { requestId, timestamp } = params as WebSocketClosedParams;
        finishNetworkRequest(tabId, requestId, timestamp);
      } else if ('Page.windowOpen' === method) {
        const windowOpenParams = params as PageWindowOpenParams;
        if (windowOpenParams.url) {
          addWindowOpenEvent(tabId, {
            url: windowOpenParams.url,
            timestamp: Date.now(),
            windowName: windowOpenParams.windowName,
            userGesture: windowOpenParams.userGesture
          });
        }
      }
    };
    chrome.debugger.onEvent.addListener(globalThis.__cdpDebuggerEventHandler);
  }
}
