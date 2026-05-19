export function extractDomain(url: string): string {
  if (!url.startsWith('http')) url = `https://${url}`;
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export async function verifyDomainUnchanged(
  tabId: number,
  url: string,
  operation: string
): Promise<{ error: string } | null> {
  if (!url) return null;
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) return { error: 'Unable to verify current URL for security check' };
  const originalDomain = extractDomain(url);
  const currentDomain = extractDomain(tab.url);
  if (originalDomain !== currentDomain)
    return {
      error: `Security check failed: Domain changed from ${originalDomain} to ${currentDomain} during ${operation}`
    };
  return null;
}

interface DomainCategoryCacheEntry {
  category: string | undefined;
  timestamp: number;
}

export class DomainCategoryCache {
  static cache = new Map<string, DomainCategoryCacheEntry>();
  static pendingRequests = new Map<string, Promise<string | undefined>>();

  static async getCategory(_url: string): Promise<string | undefined> {
    return undefined;
  }

  static clearCache(): void {
    this.cache.clear();
  }

  static evictFromCache(_domain: string): void {
    // no-op
  }

  static getCacheSize(): number {
    return this.cache.size;
  }
}

export const domainCategoryCache = {
  getCategory: (url: string) => DomainCategoryCache.getCategory(url)
};

export const categoryChecker = {
  getCategory: (url: string) => DomainCategoryCache.getCategory(url)
};
