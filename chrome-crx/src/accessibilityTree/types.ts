export type TreeFilter = 'all' | 'interactive' | string;

export interface ViewportSize {
  width: number;
  height: number;
}

export interface AccessibilityTreeResult {
  error?: string;
  pageContent: string;
  viewport: ViewportSize;
}

export interface TraversalOptions {
  filter: TreeFilter;
  refId: string | null;
}

export interface TreeLineContext {
  lines: string[];
  maxDepth: number;
  options: TraversalOptions;
}

declare global {
  interface Window {
    __superduckElementMap?: Record<string, WeakRef<Element>>;
    __superduckRefCounter?: number;
    __generateAccessibilityTree?: (
      filter?: TreeFilter,
      depth?: number,
      maxChars?: number,
      refId?: string | null
    ) => AccessibilityTreeResult;
  }
}
