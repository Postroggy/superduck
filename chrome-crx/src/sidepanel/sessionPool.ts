import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { DEFAULT_MODEL } from '../constants/models';
import {
  apiClient,
  getStorageValue,
  setStorageValue,
  StorageKeys,
} from "../SavedPromptsService";
import {
  base64ToBlob,
  blobToDataUrl,
  dataUrlToBlob,
  extractBase64FromDataUrl,
} from "../mcpServersStore";

// -----------------------------------------------------------------------------
// Account settings
// -----------------------------------------------------------------------------

export interface AccountSettings {
  enabled_mcp_tools?: Record<string, boolean>;
  [key: string]: unknown;
}

export function useAccountSettingsQuery(enabled = true) {
  return useQuery<AccountSettings>({
    queryKey: ["account-settings"],
    queryFn: async () =>
      apiClient.fetch("/api/oauth/account/settings", {
        headers: { "anthropic-beta": "oauth-2025-04-20" },
      }),
    enabled,
  });
}

export async function updateAccountSettings(payload: Record<string, unknown>) {
  return apiClient.fetch("/api/oauth/account/settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "anthropic-beta": "oauth-2025-04-20",
    },
    body: JSON.stringify(payload),
  });
}

export function useMcpToolToggles() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      await updateAccountSettings(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-settings"] });
    },
  });

  const toggleMcpToolEnabled = useCallback(
    (toolKeys: string | string[], enabled: boolean) => {
      const keys = Array.isArray(toolKeys) ? toolKeys : [toolKeys];
      const updates: Record<string, boolean> = {};
      for (const key of keys) updates[key] = enabled;

      // Optimistic update
      queryClient.setQueryData<AccountSettings | undefined>(
        ["account-settings"],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            enabled_mcp_tools: {
              ...(prev.enabled_mcp_tools ?? {}),
              ...updates,
            },
          };
        }
      );

      mutation.mutate({ enabled_mcp_tools: updates });
    },
    [mutation, queryClient]
  );

  return { toggleMcpToolEnabled };
}

// -----------------------------------------------------------------------------
// Model helpers
// -----------------------------------------------------------------------------

const FAST_MODEL_TAG_PATTERN = /^(.+)\[fast\]$/;

export function parseModelTag(model: string): {
  baseModel: string;
  hasFastTag: boolean;
} {
  const match = model.match(FAST_MODEL_TAG_PATTERN);
  return { baseModel: match ? match[1] : model, hasFastTag: Boolean(match) };
}

export function getBaseModel(model: string): string {
  return parseModelTag(model).baseModel;
}

function getStickyModelStorageKey(isQuickMode: boolean): StorageKeys {
  return isQuickMode
    ? StorageKeys.SELECTED_MODEL_QUICK_MODE
    : StorageKeys.SELECTED_MODEL;
}

export interface ModelOptionLike {
  model: string;
}

export function useStickyModelSelection() {
  const loadStickyModel = useCallback(
    async (
      availableModels: ModelOptionLike[],
      isQuickMode = false
    ): Promise<string | null> => {
      try {
        const storageKey = getStickyModelStorageKey(isQuickMode);
        const stored = await getStorageValue(storageKey);
        if (!stored) return null;

        const exists = availableModels.some((entry) => entry.model === stored);
        if (!exists) return null;

        // In normal mode, avoid using a quick-mode tagged model as sticky default.
        if (!isQuickMode && parseModelTag(stored).hasFastTag) return null;

        return stored;
      } catch {
        return null;
      }
    },
    []
  );

  const setStickyModel = useCallback(
    async (model: string | null, isQuickMode = false): Promise<void> => {
      try {
        const storageKey = getStickyModelStorageKey(isQuickMode);
        await setStorageValue(storageKey, model);
      } catch {
        // noop
      }
    },
    []
  );

  return { loadStickyModel, setStickyModel };
}

// -----------------------------------------------------------------------------
// Screenshot capture
// -----------------------------------------------------------------------------

export interface ScreenshotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface CapturedScreenshotAttachment {
  id: string;
  file: File;
  base64: string;
  url: string;
  isAnnotated?: boolean;
}

class ScreenshotCaptureManager {
  private static instance: ScreenshotCaptureManager | null = null;

  static getInstance(): ScreenshotCaptureManager {
    if (!ScreenshotCaptureManager.instance) {
      ScreenshotCaptureManager.instance = new ScreenshotCaptureManager();
    }
    return ScreenshotCaptureManager.instance;
  }

  async captureVisibleTab(tabId?: number, forceTabActivation = true): Promise<string> {
    try {
      let targetWindowId: number | undefined;
      let resolvedTabId: number | undefined;

      if (tabId) {
        const tab = await chrome.tabs.get(tabId);
        resolvedTabId = tab.id;
        targetWindowId = tab.windowId;

        if (!tab.active && resolvedTabId && forceTabActivation) {
          await chrome.tabs.update(resolvedTabId, { active: true });
          await new Promise((resolve) => setTimeout(resolve, 200));
          await chrome.tabs.get(resolvedTabId);
        }
      } else {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab.id;
        targetWindowId = activeTab.windowId;
      }

      if (!targetWindowId) {
        throw new Error("No active window found");
      }

      const targetWindow = await chrome.windows.get(targetWindowId);
      if (!targetWindow.focused) {
        await chrome.windows.update(targetWindowId, { focused: true });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return await chrome.tabs.captureVisibleTab(targetWindowId, { format: "png" });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Cannot access")) {
        throw new Error(
          "Cannot capture screenshot: Tab might be on a restricted page (chrome://, chrome-extension://, etc.)"
        );
      }
      throw error;
    }
  }

  async captureRegion(
    tabId: number,
    region: ScreenshotRegion,
    forceTabActivation = true
  ): Promise<string> {
    const screenshotDataUrl = await this.captureVisibleTab(tabId, forceTabActivation);
    const screenshotBlob = dataUrlToBlob(screenshotDataUrl);
    const croppedBlob = await this.cropImage(screenshotBlob, region);
    return blobToDataUrl(croppedBlob);
  }

  async captureWithAnnotation(
    tabId: number,
    region: ScreenshotRegion,
    forceTabActivation = true
  ): Promise<string> {
    const screenshotDataUrl = await this.captureVisibleTab(tabId, forceTabActivation);
    const screenshotBlob = dataUrlToBlob(screenshotDataUrl);
    const annotatedBlob = await this.addAnnotationOutline(screenshotBlob, region);
    return blobToDataUrl(annotatedBlob);
  }

  private async cropImage(imageBlob: Blob, region: ScreenshotRegion): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(imageBlob);

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        const dpr = window.devicePixelRatio || 1;
        canvas.width = region.width;
        canvas.height = region.height;
        context.drawImage(
          image,
          region.x * dpr,
          region.y * dpr,
          region.width * dpr,
          region.height * dpr,
          0,
          0,
          region.width,
          region.height
        );

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error("Failed to create blob from canvas"));
        }, "image/png");
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image"));
      };

      image.src = objectUrl;
    });
  }

  private async addAnnotationOutline(imageBlob: Blob, region: ScreenshotRegion): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(imageBlob);

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        canvas.width = image.width;
        canvas.height = image.height;
        context.drawImage(image, 0, 0);

        const viewportWidth = region.viewportWidth || image.width;
        const viewportHeight = region.viewportHeight || image.height;
        const scaleX = image.width / viewportWidth;
        const scaleY = image.height / viewportHeight;

        const x = region.x * scaleX;
        const y = region.y * scaleY;
        const width = region.width * scaleX;
        const height = region.height * scaleY;

        context.imageSmoothingEnabled = false;
        const accent = "#2D87D6";
        const scale = (scaleX + scaleY) / 2;

        context.shadowColor = accent;
        context.shadowBlur = 8 * scale;
        context.strokeStyle = accent;
        context.lineWidth = 3.5 * scale;
        context.globalAlpha = 0.6;
        context.strokeRect(x, y, width, height);

        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        context.strokeStyle = "#FFFFFF";
        context.lineWidth = 4.5 * scale;
        context.globalAlpha = 1;
        context.strokeRect(x, y, width, height);

        context.strokeStyle = accent;
        context.lineWidth = 3.5 * scale;
        context.globalAlpha = 1;
        context.strokeRect(x, y, width, height);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error("Failed to create blob from canvas"));
        }, "image/png");
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image"));
      };

      image.src = objectUrl;
    });
  }

  async injectSelectionOverlay(
    tabId: number,
    instructionText = "Click to capture screen or drag to select an area"
  ): Promise<ScreenshotRegion | null> {
    return new Promise((resolve) => {
      const onMessage = (
        message: any,
        sender: chrome.runtime.MessageSender
      ) => {
        if (sender.tab?.id === tabId && message.type === "SCREENSHOT_SELECTION") {
          chrome.runtime.onMessage.removeListener(onMessage);
          if (message.cancelled) {
            resolve(null);
            return;
          }

          if (message.fullPage) {
            resolve({ x: 0, y: 0, width: -1, height: -1 });
            return;
          }

          resolve(message.region as ScreenshotRegion);
          return;
        }

        if (message.type === "CANCEL_SCREENSHOT_OVERLAY") {
          chrome.runtime.onMessage.removeListener(onMessage);
          resolve(null);
        }
      };

      chrome.runtime.onMessage.addListener(onMessage);

      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(onMessage);
        resolve(null);
      }, 60_000);

      chrome.scripting.executeScript(
        {
          target: { tabId },
          args: [instructionText],
          func: (text: string) => {
            const existing = document.getElementById("claude-screenshot-overlay");
            if (existing) existing.remove();

            const overlay = document.createElement("div");
            overlay.id = "claude-screenshot-overlay";
            overlay.style.cssText = [
              "position: fixed",
              "top: 0",
              "left: 0",
              "width: 100vw",
              "height: 100vh",
              "background: transparent",
              "z-index: 2147483647",
              "cursor: crosshair",
              "user-select: none",
              "outline: none",
            ].join(";");
            overlay.setAttribute("tabindex", "0");

            const hint = document.createElement("div");
            hint.style.cssText = [
              "position: absolute",
              "top: 50%",
              "left: 50%",
              "transform: translate(-50%, -50%)",
              "background: rgba(0, 0, 0, 0.8)",
              "color: white",
              "padding: 12px 24px",
              "border-radius: 8px",
              "font-family: system-ui, -apple-system, sans-serif",
              "font-size: 16px",
              "z-index: 4",
              "display: flex",
              "align-items: center",
              "gap: 12px",
              "pointer-events: none",
              "white-space: nowrap",
              "max-width: 90vw",
            ].join(";");

            const label = document.createElement("span");
            label.textContent = text;
            label.style.cssText = [
              "pointer-events: none",
              "white-space: nowrap",
              "overflow: hidden",
              "text-overflow: ellipsis",
            ].join(";");

            hint.appendChild(label);
            overlay.appendChild(hint);

            const shadeTop = document.createElement("div");
            const shadeBottom = document.createElement("div");
            const shadeLeft = document.createElement("div");
            const shadeRight = document.createElement("div");
            const selection = document.createElement("div");

            selection.style.cssText = [
              "position: absolute",
              "border: 1px dashed hsl(210, 70.9%, 51.6%)",
              "background: transparent",
              "pointer-events: none",
              "display: none",
              "z-index: 3",
            ].join(";");

            const shadeBase = [
              "position: absolute",
              "background: rgba(0, 0, 0, 0.3)",
              "pointer-events: none",
              "z-index: 2",
            ].join(";");

            shadeTop.style.cssText = `${shadeBase};top:0;left:0;width:100%;height:100%`;
            shadeBottom.style.cssText = `${shadeBase};bottom:0;left:0;width:100%;height:0;display:none`;
            shadeLeft.style.cssText = `${shadeBase};top:0;left:0;width:0;height:100%;display:none`;
            shadeRight.style.cssText = `${shadeBase};top:0;right:0;width:0;height:100%;display:none`;

            overlay.appendChild(shadeTop);
            overlay.appendChild(shadeBottom);
            overlay.appendChild(shadeLeft);
            overlay.appendChild(shadeRight);
            overlay.appendChild(selection);

            let startX = 0;
            let startY = 0;
            let isDragging = false;

            overlay.onmousedown = (event: MouseEvent) => {
              if (event.button !== 0) return;

              isDragging = true;
              startX = event.clientX;
              startY = event.clientY;

              selection.style.display = "block";
              selection.style.left = `${startX}px`;
              selection.style.top = `${startY}px`;
              selection.style.width = "0";
              selection.style.height = "0";

              hint.style.display = "none";

              shadeTop.style.height = `${startY}px`;
              shadeBottom.style.display = "block";
              shadeBottom.style.height = `${window.innerHeight - startY}px`;

              shadeLeft.style.display = "block";
              shadeLeft.style.width = `${startX}px`;
              shadeLeft.style.top = `${startY}px`;
              shadeLeft.style.height = "0";

              shadeRight.style.display = "block";
              shadeRight.style.width = `${window.innerWidth - startX}px`;
              shadeRight.style.top = `${startY}px`;
              shadeRight.style.height = "0";
            };

            overlay.onmousemove = (event: MouseEvent) => {
              if (!isDragging) return;

              const currentX = event.clientX;
              const currentY = event.clientY;
              const x = Math.min(startX, currentX);
              const y = Math.min(startY, currentY);
              const width = Math.abs(currentX - startX);
              const height = Math.abs(currentY - startY);

              selection.style.left = `${x}px`;
              selection.style.top = `${y}px`;
              selection.style.width = `${width}px`;
              selection.style.height = `${height}px`;

              shadeTop.style.height = `${y}px`;
              shadeBottom.style.height = `${window.innerHeight - (y + height)}px`;
              shadeLeft.style.width = `${x}px`;
              shadeLeft.style.top = `${y}px`;
              shadeLeft.style.height = `${height}px`;
              shadeRight.style.width = `${window.innerWidth - (x + width)}px`;
              shadeRight.style.top = `${y}px`;
              shadeRight.style.height = `${height}px`;
            };

            overlay.onmouseup = (event: MouseEvent) => {
              if (!isDragging) return;

              const currentX = event.clientX;
              const currentY = event.clientY;

              const x = Math.min(startX, currentX);
              const y = Math.min(startY, currentY);
              const width = Math.abs(currentX - startX);
              const height = Math.abs(currentY - startY);

              selection.style.display = "none";
              shadeTop.style.display = "none";
              shadeBottom.style.display = "none";
              shadeLeft.style.display = "none";
              shadeRight.style.display = "none";
              hint.style.display = "none";

              setTimeout(() => {
                if (width > 10 && height > 10) {
                  chrome.runtime.sendMessage({
                    type: "SCREENSHOT_SELECTION",
                    region: {
                      x,
                      y,
                      width,
                      height,
                      viewportWidth: window.innerWidth,
                      viewportHeight: window.innerHeight,
                    },
                  });
                } else {
                  chrome.runtime.sendMessage({
                    type: "SCREENSHOT_SELECTION",
                    fullPage: true,
                  });
                }
                overlay.remove();
              }, 10);
            };

            overlay.onkeydown = (event: KeyboardEvent) => {
              if (event.key !== "Escape") return;

              chrome.runtime.sendMessage({
                type: "SCREENSHOT_SELECTION",
                cancelled: true,
              });
              overlay.remove();
            };

            document.body.appendChild(overlay);
            overlay.focus();
          },
        },
        () => {
          if (chrome.runtime.lastError) {
            chrome.runtime.onMessage.removeListener(onMessage);
            resolve(null);
          }
        }
      );
    });
  }
}

const screenshotCaptureManager = ScreenshotCaptureManager.getInstance();

interface ScreenshotCaptureParams {
  tabId?: number;
  onCapture: (attachment: CapturedScreenshotAttachment) => void;
  forceTabActivation?: boolean;
}

export function useScreenshotCapture({
  tabId,
  onCapture,
  forceTabActivation = true,
}: ScreenshotCaptureParams) {
  const intl = useIntl();
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelCapture, setCancelCapture] = useState<(() => void) | null>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isCapturing && cancelCapture) {
        event.preventDefault();
        event.stopPropagation();
        cancelCapture();
        setCancelCapture(null);
      }
    };

    if (isCapturing) {
      document.addEventListener("keydown", handleEscape, true);
      window.addEventListener("keydown", handleEscape, true);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape, true);
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [cancelCapture, isCapturing]);

  const capture = useCallback(
    async (withSelection = true) => {
      if (isCapturing) return;

      setIsCapturing(true);
      setError(null);

      let wasCancelled = false;
      const cancel = () => {
        wasCancelled = true;
        setIsCapturing(false);

        if (tabId) {
          chrome.runtime.sendMessage({ type: "CANCEL_SCREENSHOT_OVERLAY" }).catch(() => {});
          chrome.scripting
            .executeScript({
              target: { tabId },
              func: () => {
                const overlay = document.getElementById("claude-screenshot-overlay");
                if (overlay) overlay.remove();
              },
            })
            .catch(() => {});
        }
      };

      setCancelCapture(() => cancel);

      try {
        let screenshotDataUrl: string;
        let isAnnotated = false;

        if (withSelection && tabId) {
          const overlayText = intl.formatMessage({
            defaultMessage: "Click to capture screen or drag to select an area",
            id: "jbEJHKa0PR",
          });

          const region = await screenshotCaptureManager.injectSelectionOverlay(tabId, overlayText);
          if (wasCancelled) return;
          if (!region) return;

          if (region.width === -1 && region.height === -1) {
            screenshotDataUrl = await screenshotCaptureManager.captureVisibleTab(
              tabId,
              forceTabActivation
            );
          } else {
            screenshotDataUrl = await screenshotCaptureManager.captureWithAnnotation(
              tabId,
              region,
              forceTabActivation
            );
            isAnnotated = true;
          }
        } else {
          screenshotDataUrl = await screenshotCaptureManager.captureVisibleTab(
            tabId,
            forceTabActivation
          );
        }

        if (wasCancelled) return;

        const base64 = extractBase64FromDataUrl(screenshotDataUrl);
        const blob = base64ToBlob(base64, "image/png");
        const fileName = `screenshot-${Date.now()}.png`;
        const file = new File([blob], fileName, { type: "image/png" });

        onCapture({
          id: crypto.randomUUID(),
          file,
          base64,
          url: screenshotDataUrl,
          isAnnotated,
        });
      } catch {
        setError("Failed to capture screenshot");
      } finally {
        setIsCapturing(false);
        setCancelCapture(null);
      }
    },
    [forceTabActivation, intl, isCapturing, onCapture, tabId]
  );

  const captureFullScreen = useCallback(() => capture(false), [capture]);
  const captureSelection = useCallback(() => capture(true), [capture]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden" || !isCapturing || !tabId) return;

      chrome.scripting
        .executeScript({
          target: { tabId },
          func: () => {
            const overlay = document.getElementById("claude-screenshot-overlay");
            if (overlay) overlay.remove();
          },
        })
        .catch(() => {});

      setIsCapturing(false);
      setCancelCapture(null);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (isCapturing && tabId) {
        chrome.scripting
          .executeScript({
            target: { tabId },
            func: () => {
              const overlay = document.getElementById("claude-screenshot-overlay");
              if (overlay) overlay.remove();
            },
          })
          .catch(() => {});
      }
    };
  }, [isCapturing, tabId]);

  return {
    isCapturing,
    error,
    captureFullScreen,
    captureSelection,
  };
}

// -----------------------------------------------------------------------------
// Conversation list API
// -----------------------------------------------------------------------------

export interface ChatConversationListParams {
  limit?: number;
  offset?: number;
  searchQuery?: string;
  platforms?: string[];
}

export async function fetchChatConversations(params: ChatConversationListParams) {
  const query = new URLSearchParams();

  if (params.limit) query.append("limit", params.limit.toString());
  if (params.offset) query.append("offset", params.offset.toString());
  if (params.searchQuery) query.append("searchQuery", params.searchQuery);
  if (params.platforms) {
    params.platforms.forEach((platform) => query.append("platforms", platform));
  }

  const path = `/api/oauth/chat_conversations${query.toString() ? `?${query.toString()}` : ""}`;
  return apiClient.fetch(path, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

export async function deleteChatConversation(params: { conversationUuid: string }) {
  await apiClient.fetch(`/api/oauth/chat_conversations/${params.conversationUuid}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

// -----------------------------------------------------------------------------
// Generation helpers for workflow/session UX
// -----------------------------------------------------------------------------

export type AssistantRole = "user" | "assistant";

export interface ModelTextBlock {
  type: string;
  text?: string;
}

export interface ModelResult {
  content?: ModelTextBlock[];
}

export interface ModelRequest {
  maxTokens?: number;
  messages: Array<{ role: AssistantRole; content: any }>;
  system?: string;
  modelClass?: "small_fast" | string;
  model?: string;
}

export type ModelInvoker = (request: ModelRequest) => Promise<ModelResult>;

function readTextBlocks(response: ModelResult): string {
  if (!response.content || response.content.length === 0) return "";
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}

function parseTaggedValue(text: string, tag: string): string {
  const fullTagMatch = text.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
  if (fullTagMatch?.[1]) return fullTagMatch[1].trim();

  const partialTagMatch = text.match(new RegExp(`^(.*?)</${tag}>`, "s"));
  if (partialTagMatch?.[1]) return partialTagMatch[1].trim();

  return "";
}

export async function generateConversationTitle(
  message: { content: string | Array<{ type: string; text?: string }> },
  invoke: ModelInvoker
): Promise<string> {
  try {
    const inputText =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .filter((item) => item.type === "text")
              .map((item) => item.text ?? "")
              .join("\n")
          : "";

    if (!inputText.trim()) return "";

    const prompt = `<conversation>\n\n${inputText}\n\n</conversation>\n\nThink about it, then suggest a title based on the first message, putting it between <title> tags.`;

    const result = await invoke({
      maxTokens: 128,
      messages: [
        { role: "user", content: prompt },
        {
          role: "assistant",
          content:
            "Here is a clear, concise title for this browser automation conversation:\n\n<title>",
        },
      ],
      system:
        "Act as an accurate and concise title generator for browser automation conversations. Generate a <title> based on the first message in the conversation.",
      modelClass: "small_fast",
    });

    return parseTaggedValue(readTextBlocks(result), "title");
  } catch {
    return "";
  }
}

export async function generateShortcutName(prompt: string, invoke: ModelInvoker): Promise<string> {
  try {
    if (!prompt.trim()) return "";

    const result = await invoke({
      maxTokens: 64,
      messages: [
        {
          role: "user",
          content: `<prompt>\n${prompt}\n</prompt>\n\nThink about the main action in this prompt, then suggest a short command name, putting it between <name> tags.`,
        },
        {
          role: "assistant",
          content: "Here is a concise command name for this shortcut:\n\n<name>",
        },
      ],
      system:
        "Act as a concise command name generator for browser automation shortcuts. Use lowercase kebab-case and keep the command short.",
      modelClass: "small_fast",
    });

    return parseTaggedValue(readTextBlocks(result), "name")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
  } catch {
    return "";
  }
}

export async function generateQuote(invoke: ModelInvoker): Promise<string> {
  try {
    const result = await invoke({
      maxTokens: 150,
      messages: [
        {
          role: "user",
          content:
            "Generate a very short fortune cookie style quote (5-10 words max, one sentence). Be whimsical, diverse, and unexpectedly wise.",
        },
      ],
      system:
        "Generate short whimsical quotes that are playful, memorable, and concise.",
      modelClass: "small_fast",
    });

    return readTextBlocks(result);
  } catch {
    return "";
  }
}

export async function generateDailySummary(
  titles: string[],
  invoke: ModelInvoker
): Promise<string> {
  try {
    if (titles.length === 0) return "";

    const deduped = Array.from(new Set(titles.map((title) => title.toLowerCase())))
      .map((normalized) => titles.find((title) => title.toLowerCase() === normalized))
      .filter((title): title is string => Boolean(title));

    const result = await invoke({
      maxTokens: 200,
      messages: [
        {
          role: "user",
          content: `Here are the conversation titles from today:\n\n${deduped.map((title, index) => `${index + 1}. ${title}`).join("\n")}\n\nTransform these titles into a narrative daily summary (1-2 sentences) in first person as Claude. Rewrite into past tense actions with natural flow. If completely meaningless, return \"SKIP\".`,
        },
      ],
      system:
        "Transform conversation titles into a concise first-person daily summary with natural narrative flow.",
      modelClass: "small_fast",
    });

    const text = readTextBlocks(result);
    if (!text) return "";

    const lowered = text.toLowerCase();
    if (
      text === "SKIP" ||
      lowered.includes("skip") ||
      lowered.includes("insufficient") ||
      lowered.includes("not enough information") ||
      lowered.includes("unable to")
    ) {
      return "";
    }

    return text;
  } catch {
    return "";
  }
}

export interface WorkflowStepDescriptionInput {
  action?: string;
  tagName: string;
  text?: string;
  attributes: Record<string, string>;
  pageTitle?: string;
  url?: string;
  screenshot?: string;
  speechTranscript?: string;
}

export function detectImageMediaType(base64: string):
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif" {
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return "image/png";
}

export async function generateWorkflowStepDescription(
  step: WorkflowStepDescriptionInput,
  userActionText: string,
  invoke: ModelInvoker
): Promise<string> {
  try {
    const classes = step.attributes.class || "";
    const semanticClasses = classes
      .split(/\s+/)
      .filter(Boolean)
      .filter((className) =>
        [
          "btn",
          "button",
          "menu",
          "nav",
          "submit",
          "close",
          "icon",
          "toggle",
          "dropdown",
          "modal",
          "search",
          "login",
          "save",
          "delete",
        ].some((keyword) => className.includes(keyword))
      )
      .join(", ");

    const narration = step.speechTranscript
      ? `\n\nUSER NARRATION:\n\"${step.speechTranscript}\"\n\nUse this narration as the primary intent signal.`
      : "";

    const prompt = `<element_clicked>
HTML Element: ${step.tagName.toUpperCase()}
Visible Text: "${step.text || ""}"${narration}

Current Page Context:
- Page Title: ${step.pageTitle || "unknown"}
- Page URL: ${step.url || "unknown"}

Attributes:
- ID: ${step.attributes.id || "none"}
- Classes: ${classes || "none"}
${semanticClasses ? `- Semantic Classes Found: ${semanticClasses}` : ""}
- Name: ${step.attributes.name || "none"}
- Type: ${step.attributes.type || "none"}
- Role: ${step.attributes.role || "none"}
- Href: ${step.attributes.href || "none"}
- Aria-Label: "${step.attributes["aria-label"] || ""}"
- Title: "${step.attributes.title || ""}"
- Placeholder: "${step.attributes.placeholder || ""}"
- Alt: "${step.attributes.alt || ""}"

User Action: ${userActionText}

Generate an action instruction starting with "Click on" (or "Type"/"Select" when applicable).`;

    const userContent: any = step.screenshot
      ? [
          {
            type: "text",
            text:
              `${prompt}\n\nIMPORTANT: Look at the screenshot with the blue highlight box. ` +
              "Describe what the user is clicking based on what is visible.",
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: detectImageMediaType(step.screenshot),
              data: step.screenshot,
            },
          },
        ]
      : prompt;

    const result = await invoke({
      maxTokens: 64,
      messages: [
        { role: "user", content: userContent },
        {
          role: "assistant",
          content: "Here is the action instruction:\n\n<description>",
        },
      ],
      system:
        "Generate concise, screenshot-grounded action instructions for browser automation. Avoid HTML tag names in the final instruction.",
      modelClass: "small_fast",
    });

    return parseTaggedValue(readTextBlocks(result), "description");
  } catch {
    return "";
  }
}

export interface RecordedWorkflowStep {
  description: string;
  speechTranscript?: string;
  screenshot?: string;
}

function buildReusablePrompt(parsed: {
  inputs: Array<{ name: string; description: string }>;
  prompt: string;
}): string {
  if (parsed.inputs.length === 0) return parsed.prompt;
  return `Before running this workflow, please provide the following information:\n${parsed.inputs
    .map((item) => `- ${item.name}: ${item.description}`)
    .join("\n")}\n\n${parsed.prompt}`;
}

export async function generateWorkflowSummary(
  steps: RecordedWorkflowStep[],
  invoke: ModelInvoker,
  includeHighlyDetailedFallback = false
): Promise<string> {
  try {
    if (!steps || steps.length === 0) return "";

    const stepList = steps.map((step, index) => `${index + 1}. ${step.description}`).join("\n");
    const spokenNarration = steps
      .map((step) => step.speechTranscript)
      .filter((value): value is string => Boolean(value))
      .join(" ");

    const narrationSection = spokenNarration
      ? `\n\nUSER SPOKEN NARRATION:\n\"${spokenNarration}\"\n\nUse this as the primary signal for intent.`
      : "";

    const userContent: any[] = [
      {
        type: "text",
        text: `Here is a sequence of browser automation steps that were just recorded:\n\n${stepList}${narrationSection}${
          includeHighlyDetailedFallback
            ? "\n\nScreenshots are available now but will not be saved. Include enough visual detail to make the workflow reproducible without screenshots."
            : "\n\nScreenshots are available for context."
        }\n\nGenerate a reusable prompt that captures the task intent and goal.`,
      },
    ];

    for (const step of steps) {
      if (!step.screenshot) continue;
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: detectImageMediaType(step.screenshot),
          data: step.screenshot,
        },
      });
    }

    const result = await invoke({
      maxTokens: 512,
      messages: [
        { role: "user", content: userContent },
        {
          role: "assistant",
          content: "I will analyze this workflow and create a reusable prompt.\n\n<inputs>",
        },
      ],
      system:
        "You are analyzing a recorded browser automation workflow. Capture semantic intent, extract dynamic inputs, and return structured <inputs> and <prompt> tags.",
      model: DEFAULT_MODEL,
    });

    const text = readTextBlocks(result);
    if (!text) return "";

    const inputsBlock = text.match(/<inputs>([\s\S]*?)<\/inputs>/)?.[1] || "";
    const promptBlock =
      text.match(/<prompt>([\s\S]*?)<\/prompt>/)?.[1]?.trim() ||
      text.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() ||
      text.replace(/<inputs>[\s\S]*?<\/inputs>/g, "").replace(/<\/?prompt>/g, "").trim();

    const inputs = inputsBlock
      .split("\n")
      .filter((line) => line.trim().startsWith("-"))
      .map((line) => line.match(/-\s*([^:]+):\s*(.*)/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => ({ name: match[1].trim(), description: match[2].trim() }));

    return buildReusablePrompt({ inputs, prompt: promptBlock });
  } catch {
    return "";
  }
}

export const workflowGeneration = Object.freeze({
  generateConversationTitle,
  generateDailySummary,
  generateQuote,
  generateShortcutName,
  generateWorkflowStepDescription,
  generateWorkflowSummary,
});

// -----------------------------------------------------------------------------
// Compact-command helper (special slash-like command used by this session flow)
// -----------------------------------------------------------------------------

const COMPACT_COMMAND = "compact";

export function getSpecialCommands(intl?: ReturnType<typeof useIntl>) {
  return [
    {
      command: COMPACT_COMMAND,
      description: intl
        ? intl.formatMessage({
            defaultMessage: "Clear history and keep summary",
            id: "AtUwwM+FWM",
          })
        : "Clear history and keep summary",
    },
  ];
}

export function isSpecialCommand(command: string): boolean {
  return getSpecialCommands().some((entry) => entry.command === command);
}
