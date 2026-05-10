import { getOrCreateElementMap, getOrCreateRefCounter } from './accessibilityTree/refStore';
import { generateAccessibilityTree } from './accessibilityTree/treeBuilder';
import type { AccessibilityTreeResult, TreeFilter } from './accessibilityTree/types';

(() => {
  getOrCreateElementMap();
  getOrCreateRefCounter();

  window.__generateAccessibilityTree = function (
    filter?: TreeFilter,
    depth?: number,
    maxChars?: number,
    refId?: string | null
  ): AccessibilityTreeResult {
    try {
      return generateAccessibilityTree(filter, depth, maxChars, refId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Error generating accessibility tree: ${message}`, {
        cause: error
      });
    }
  };
})();

export {};
