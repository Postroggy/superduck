import { describe, it, expect } from 'vitest';
import {
  getTabSessionKey,
  TAB_SESSION_KEY_PREFIX,
  SESSION_INDEX_KEY,
  SESSION_CONVERSATION_MAP_KEY,
  SESSION_REMOTE_MAP_KEY,
  isSessionSnapshot,
  isChatMessage,
  isApiConversationMessage
} from './sidepanelGuards';
import {
  getHistoryStorageKey,
  getConversationStorageKey,
  extractTextFromContent,
  normalizeHistoricalMessage,
  pickEventMessage
} from './sessionHistory';
import { formatRelativeTime, truncatePreview } from './SessionHistoryPanel';
import type { SessionIndexEntry, SessionSnapshot, ChatMessage } from './types';

// ─── Tab-session key ──────────────────────────────────────────────────────────

describe('getTabSessionKey', () => {
  it('returns the correct storage key for a given tab ID', () => {
    expect(getTabSessionKey(123)).toBe(`${TAB_SESSION_KEY_PREFIX}123`);
    expect(getTabSessionKey(0)).toBe(`${TAB_SESSION_KEY_PREFIX}0`);
    expect(getTabSessionKey(999999)).toBe(`${TAB_SESSION_KEY_PREFIX}999999`);
  });

  it('uses the expected prefix', () => {
    expect(TAB_SESSION_KEY_PREFIX).toBe('sidepanel_tab_session_');
  });
});

// ─── Session storage keys ─────────────────────────────────────────────────────

describe('session storage keys', () => {
  it('generates correct history storage key', () => {
    expect(getHistoryStorageKey('abc-123')).toBe('sidepanel_session_abc-123');
  });

  it('generates correct conversation storage key', () => {
    expect(getConversationStorageKey('conv-456')).toBe('sidepanel_conversation_conv-456');
  });

  it('handles empty string session ID', () => {
    // This is the state before session ID is resolved
    expect(getHistoryStorageKey('')).toBe('sidepanel_session_');
  });
});

// ─── Session index constants ──────────────────────────────────────────────────

describe('session index constants', () => {
  it('has stable key values (changing these would break storage compatibility)', () => {
    expect(SESSION_INDEX_KEY).toBe('sidepanel_session_index_v1');
    expect(SESSION_CONVERSATION_MAP_KEY).toBe('sidepanel_conversation_map_v1');
    expect(SESSION_REMOTE_MAP_KEY).toBe('sidepanel_conversation_remote_map_v1');
  });
});

// ─── extractTextFromContent ───────────────────────────────────────────────────

describe('extractTextFromContent', () => {
  it('returns trimmed string content', () => {
    expect(extractTextFromContent('  hello  ')).toBe('hello');
  });

  it('returns empty string for non-string, non-array content', () => {
    expect(extractTextFromContent(null)).toBe('');
    expect(extractTextFromContent(undefined)).toBe('');
    expect(extractTextFromContent(42)).toBe('');
    expect(extractTextFromContent({})).toBe('');
  });

  it('extracts text blocks from array content', () => {
    const content = [
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'World' }
    ];
    expect(extractTextFromContent(content)).toBe('Hello \nWorld');
  });

  it('filters out non-text blocks', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'tool_use', id: '1', name: 'foo', input: {} },
      { type: 'text', text: 'World' }
    ];
    expect(extractTextFromContent(content)).toBe('Hello\nWorld');
  });

  it('skips content before turn_answer_start', () => {
    const content = [
      { type: 'text', text: 'Thinking...' },
      { type: 'tool_use', id: '1', name: 'turn_answer_start', input: {} },
      { type: 'text', text: 'Final answer' }
    ];
    expect(extractTextFromContent(content)).toBe('Final answer');
  });
});

// ─── normalizeHistoricalMessage ───────────────────────────────────────────────

describe('normalizeHistoricalMessage', () => {
  it('normalizes a simple string content message', () => {
    const result = normalizeHistoricalMessage({ role: 'user', content: 'Hello' });
    expect(result).toEqual({ role: 'user', content: 'Hello' });
  });

  it('normalizes an array content message', () => {
    const content = [{ type: 'text', text: 'Hello' }];
    const result = normalizeHistoricalMessage({ role: 'assistant', content });
    expect(result).toEqual({ role: 'assistant', content });
  });

  it('preserves id and usage fields for array content', () => {
    const result = normalizeHistoricalMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'Hi' }],
      id: 'msg_123',
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null
      }
    });
    expect(result?.id).toBe('msg_123');
    expect(result?.usage).toEqual({
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null
    });
  });

  it('does not preserve id/usage for string content', () => {
    const result = normalizeHistoricalMessage({
      role: 'user',
      content: 'Hello',
      id: 'msg_456',
      usage: {
        input_tokens: 5,
        output_tokens: 10,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null
      }
    });
    // String content path returns a minimal message without id/usage
    expect(result).toEqual({ role: 'user', content: 'Hello' });
  });

  it('rejects invalid roles', () => {
    expect(normalizeHistoricalMessage({ role: 'system', content: 'Hello' })).toBeNull();
    expect(normalizeHistoricalMessage({ role: 'unknown', content: 'Hello' })).toBeNull();
  });

  it('rejects non-record inputs', () => {
    expect(normalizeHistoricalMessage(null)).toBeNull();
    expect(normalizeHistoricalMessage('string')).toBeNull();
    expect(normalizeHistoricalMessage(42)).toBeNull();
  });
});

// ─── pickEventMessage ─────────────────────────────────────────────────────────

describe('pickEventMessage', () => {
  it('extracts message from event.message', () => {
    const event = { message: { role: 'user', content: 'Hello' } };
    const result = pickEventMessage(event);
    expect(result).toEqual({ role: 'user', content: 'Hello' });
  });

  it('extracts message from event.data.message', () => {
    const event = { data: { message: { role: 'assistant', content: 'Hi' } } };
    const result = pickEventMessage(event);
    expect(result).toEqual({ role: 'assistant', content: 'Hi' });
  });

  it('extracts message from event.payload.message', () => {
    const event = { payload: { message: { role: 'user', content: 'Test' } } };
    const result = pickEventMessage(event);
    expect(result).toEqual({ role: 'user', content: 'Test' });
  });

  it('extracts message from event.item.message', () => {
    const event = { item: { message: { role: 'assistant', content: 'Response' } } };
    const result = pickEventMessage(event);
    expect(result).toEqual({ role: 'assistant', content: 'Response' });
  });

  it('falls back to direct normalization', () => {
    const event = { role: 'user', content: 'Direct' };
    const result = pickEventMessage(event);
    expect(result).toEqual({ role: 'user', content: 'Direct' });
  });

  it('returns null for unrecognized events', () => {
    expect(pickEventMessage(null)).toBeNull();
    expect(pickEventMessage({})).toBeNull();
    expect(pickEventMessage({ type: 'unknown' })).toBeNull();
  });
});

// ─── formatRelativeTime ───────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  const NOW = 1_700_000_000_000; // Fixed reference time

  it('returns "刚刚" for timestamps less than 60 seconds ago', () => {
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe('刚刚');
    expect(formatRelativeTime(NOW - 59_000, NOW)).toBe('刚刚');
  });

  it('returns minutes for timestamps less than 60 minutes ago', () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe('1 分钟前');
    expect(formatRelativeTime(NOW - 30 * 60_000, NOW)).toBe('30 分钟前');
    expect(formatRelativeTime(NOW - 59 * 60_000, NOW)).toBe('59 分钟前');
  });

  it('returns hours for timestamps less than 24 hours ago', () => {
    expect(formatRelativeTime(NOW - 60 * 60_000, NOW)).toBe('1 小时前');
    expect(formatRelativeTime(NOW - 12 * 60 * 60_000, NOW)).toBe('12 小时前');
    expect(formatRelativeTime(NOW - 23 * 60 * 60_000, NOW)).toBe('23 小时前');
  });

  it('returns days for timestamps less than 7 days ago', () => {
    expect(formatRelativeTime(NOW - 24 * 60 * 60_000, NOW)).toBe('1 天前');
    expect(formatRelativeTime(NOW - 6 * 24 * 60 * 60_000, NOW)).toBe('6 天前');
  });

  it('returns a formatted date for timestamps 7 or more days ago', () => {
    const result = formatRelativeTime(NOW - 7 * 24 * 60 * 60_000, NOW);
    // Should be a date string, not "X 天前"
    expect(result).not.toMatch(/^\d+ 天前$/);
  });

  it('handles future timestamps gracefully', () => {
    expect(formatRelativeTime(NOW + 60_000, NOW)).toBe('刚刚');
  });
});

// ─── truncatePreview ──────────────────────────────────────────────────────────

describe('truncatePreview', () => {
  it('returns "空对话" for undefined or empty text', () => {
    expect(truncatePreview(undefined, 60)).toBe('空对话');
    expect(truncatePreview('', 60)).toBe('空对话');
    expect(truncatePreview('   ', 60)).toBe('空对话');
  });

  it('returns the full text when shorter than maxLen', () => {
    expect(truncatePreview('Hello world', 60)).toBe('Hello world');
  });

  it('truncates text longer than maxLen with ellipsis', () => {
    const longText = 'A'.repeat(100);
    const result = truncatePreview(longText, 60);
    expect(result.length).toBe(61); // 60 chars + '…'
    expect(result.endsWith('…')).toBe(true);
  });

  it('trims leading/trailing whitespace before truncation', () => {
    expect(truncatePreview('  hello  ', 60)).toBe('hello');
  });
});

// ─── SessionIndexEntry type safety ────────────────────────────────────────────

describe('SessionIndexEntry', () => {
  it('can be constructed with required fields', () => {
    const entry: SessionIndexEntry = {
      sessionId: 'test-id',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    expect(entry.sessionId).toBe('test-id');
  });

  it('can include optional fields', () => {
    const entry: SessionIndexEntry = {
      sessionId: 'test-id',
      conversationUuid: 'conv-uuid',
      remoteSessionId: 'remote-id',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: 'claude-sonnet-4-6',
      preview: 'Hello, how are you?'
    };
    expect(entry.conversationUuid).toBe('conv-uuid');
    expect(entry.model).toBe('claude-sonnet-4-6');
    expect(entry.preview).toBe('Hello, how are you?');
  });

  it('sorts by updatedAt descending for most-recent-first display', () => {
    const entries: SessionIndexEntry[] = [
      { sessionId: 'old', createdAt: 1000, updatedAt: 1000 },
      { sessionId: 'new', createdAt: 2000, updatedAt: 3000 },
      { sessionId: 'mid', createdAt: 1500, updatedAt: 2000 }
    ];
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    expect(entries[0].sessionId).toBe('new');
    expect(entries[1].sessionId).toBe('mid');
    expect(entries[2].sessionId).toBe('old');
  });
});

// ─── isChatMessage type guard ─────────────────────────────────────────────────

describe('isChatMessage', () => {
  it('validates a proper ChatMessage', () => {
    const msg: ChatMessage = { id: 'abc', role: 'user', text: 'Hello' };
    expect(isChatMessage(msg)).toBe(true);
  });

  it('accepts system/assistant roles', () => {
    expect(isChatMessage({ id: 'a', role: 'assistant', text: 'Hi' })).toBe(true);
    expect(isChatMessage({ id: 'b', role: 'system', text: 'Sys' })).toBe(true);
  });

  it('rejects messages missing required fields', () => {
    expect(isChatMessage({ role: 'user', text: 'Hi' })).toBe(false); // missing id
    expect(isChatMessage({ id: 'a', text: 'Hi' })).toBe(false); // missing role
    expect(isChatMessage({ id: 'a', role: 'user' })).toBe(false); // missing text
  });

  it('rejects non-objects', () => {
    expect(isChatMessage(null)).toBe(false);
    expect(isChatMessage('string')).toBe(false);
    expect(isChatMessage(42)).toBe(false);
  });
});

// ─── isApiConversationMessage type guard ───────────────────────────────────────

describe('isApiConversationMessage', () => {
  it('validates string content messages', () => {
    expect(isApiConversationMessage({ role: 'user', content: 'Hello' })).toBe(true);
  });

  it('validates array content messages', () => {
    expect(
      isApiConversationMessage({ role: 'assistant', content: [{ type: 'text', text: 'Hi' }] })
    ).toBe(true);
  });

  it('rejects invalid roles', () => {
    expect(isApiConversationMessage({ role: 'tool', content: 'data' })).toBe(false);
    expect(isApiConversationMessage({ role: 'unknown', content: 'x' })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isApiConversationMessage(null)).toBe(false);
    expect(isApiConversationMessage('string')).toBe(false);
  });
});

// ─── isSessionSnapshot type guard ─────────────────────────────────────────────

describe('isSessionSnapshot', () => {
  const validSnapshot: SessionSnapshot = {
    uiMessages: [{ id: 'm1', role: 'user', text: 'Hello' }],
    apiMessages: [{ role: 'user', content: 'Hello' }],
    selectedModel: 'claude-sonnet-4-6',
    permissionMode: 'skip_all_permission_checks',
    createdAt: Date.now(),
    conversationUuid: 'conv-123',
    remoteSessionId: 'remote-456'
  };

  it('validates a proper snapshot', () => {
    expect(isSessionSnapshot(validSnapshot)).toBe(true);
  });

  it('validates a minimal snapshot (optional fields omitted)', () => {
    const minimal = {
      uiMessages: [],
      apiMessages: [],
      selectedModel: 'claude-haiku-4-5-20251001',
      permissionMode: 'follow_a_plan'
    };
    expect(isSessionSnapshot(minimal)).toBe(true);
  });

  it('rejects snapshots with invalid uiMessages', () => {
    expect(
      isSessionSnapshot({
        ...validSnapshot,
        uiMessages: [{ role: 'user', text: 'missing id' }] // no id
      })
    ).toBe(false);
  });

  it('rejects snapshots with invalid apiMessages', () => {
    expect(
      isSessionSnapshot({
        ...validSnapshot,
        apiMessages: [{ role: 'unknown', content: 'x' }] // invalid role
      })
    ).toBe(false);
  });

  it('rejects snapshots with non-string selectedModel', () => {
    expect(
      isSessionSnapshot({
        ...validSnapshot,
        selectedModel: 123
      })
    ).toBe(false);
  });

  it('rejects snapshots with invalid permissionMode', () => {
    expect(
      isSessionSnapshot({
        ...validSnapshot,
        permissionMode: 'invalid_mode'
      })
    ).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isSessionSnapshot(null)).toBe(false);
    expect(isSessionSnapshot('string')).toBe(false);
    expect(isSessionSnapshot(42)).toBe(false);
    expect(isSessionSnapshot([])).toBe(false);
  });

  it('rejects corrupted storage data (e.g. from storage migration)', () => {
    // Simulate corrupted data that might be read from chrome.storage
    expect(isSessionSnapshot({ uiMessages: 'not-an-array', apiMessages: [] })).toBe(false);
    expect(isSessionSnapshot({ uiMessages: [], apiMessages: 'not-an-array' })).toBe(false);
    expect(isSessionSnapshot({ uiMessages: null, apiMessages: null })).toBe(false);
  });
});

// ─── Snapshot round-trip integrity ────────────────────────────────────────────

describe('snapshot round-trip integrity', () => {
  it('a snapshot constructed from state passes validation (simulates beforeunload save)', () => {
    // This simulates what the beforeunload handler does:
    // construct a snapshot from current React state and validate it
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', text: 'What is 2+2?' },
      { id: 'a1', role: 'assistant', text: '4' }
    ];
    const apiMessages = [
      { role: 'user' as const, content: 'What is 2+2?' },
      { role: 'assistant' as const, content: '4' }
    ];

    const snapshot: SessionSnapshot = {
      uiMessages: messages,
      apiMessages,
      selectedModel: 'claude-sonnet-4-6',
      permissionMode: 'skip_all_permission_checks',
      createdAt: 1700000000000,
      conversationUuid: 'conv-abc',
      remoteSessionId: 'remote-def'
    };

    expect(isSessionSnapshot(snapshot)).toBe(true);
    expect(snapshot.uiMessages).toHaveLength(2);
    expect(snapshot.apiMessages).toHaveLength(2);
  });

  it('JSON serialization preserves snapshot integrity', () => {
    const snapshot: SessionSnapshot = {
      uiMessages: [{ id: 'm1', role: 'user', text: 'Hello' }],
      apiMessages: [{ role: 'user', content: 'Hello' }],
      selectedModel: 'claude-sonnet-4-6',
      permissionMode: 'skip_all_permission_checks',
      createdAt: 1700000000000
    };

    // chrome.storage.local serializes via JSON internally
    const serialized = JSON.stringify(snapshot);
    const deserialized = JSON.parse(serialized);
    expect(isSessionSnapshot(deserialized)).toBe(true);
    expect(deserialized.uiMessages[0].text).toBe('Hello');
    expect(deserialized.selectedModel).toBe('claude-sonnet-4-6');
  });

  it('handles empty messages array (brand new session)', () => {
    const snapshot: SessionSnapshot = {
      uiMessages: [],
      apiMessages: [],
      selectedModel: 'claude-sonnet-4-6',
      permissionMode: 'skip_all_permission_checks'
    };
    expect(isSessionSnapshot(snapshot)).toBe(true);
  });

  it('handles complex apiMessages with tool use blocks', () => {
    const snapshot: SessionSnapshot = {
      uiMessages: [{ id: 'u1', role: 'user', text: 'Click the button' }],
      apiMessages: [
        { role: 'user', content: 'Click the button' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will click it.' },
            { type: 'tool_use', id: 'tu_1', name: 'computer', input: { action: 'click' } }
          ]
        }
      ],
      selectedModel: 'claude-sonnet-4-6',
      permissionMode: 'skip_all_permission_checks'
    };
    expect(isSessionSnapshot(snapshot)).toBe(true);
  });
});
