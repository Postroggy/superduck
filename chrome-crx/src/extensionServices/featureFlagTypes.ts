export interface ModelOptionConfig {
  model: string;
  name?: string;
  effort_options?: string[];
  [key: string]: unknown;
}

export interface ModelFallbackConfig {
  fallbackModelName?: string;
  currentModelName?: string;
  fallbackDisplayName?: string;
  learnMoreUrl?: string;
  [key: string]: unknown;
}

export interface ModelsConfigFeatureValue {
  default?: string;
  options?: Array<string | ModelOptionConfig>;
  small_fast_model?: string;
  modelFallbacks?: Record<string, ModelFallbackConfig>;
  [key: string]: unknown;
}

export interface VersionInfoFeatureValue {
  min_supported_version?: string;
  [key: string]: unknown;
}

export interface AnnouncementFeatureValue {
  enabled?: boolean;
  text?: string;
  id?: string;
  [key: string]: unknown;
}

export interface PurlConfigFeatureValue {
  systemPrompt?: string;
  apiBaseUrl?: string;
  modelOverride?: string;
  effort?: string;
  pageSettleMs?: number;
  imageFormat?: 'jpeg' | 'png' | 'webp';
  imageQuality?: number;
  maxImageDimension?: number;
  screenshotHistory?: number;
  [key: string]: unknown;
}
