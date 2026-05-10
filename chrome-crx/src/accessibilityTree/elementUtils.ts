import { EXCLUDED_TAGS, INTERACTIVE_TAGS, ROLE_BY_TAG, SEMANTIC_TAGS } from './constants';
import type { TraversalOptions, ViewportSize } from './types';

export function getViewport(): ViewportSize {
  return {
    height: window.innerHeight,
    width: window.innerWidth
  };
}

export function getElementRole(element: Element): string {
  const role = element.getAttribute('role');
  if (role) {
    return role;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input') {
    const inputType = element.getAttribute('type');
    if (inputType === 'submit' || inputType === 'button') {
      return 'button';
    }
    if (inputType === 'checkbox') {
      return 'checkbox';
    }
    if (inputType === 'radio') {
      return 'radio';
    }
    if (inputType === 'file') {
      return 'button';
    }
    return 'textbox';
  }

  return ROLE_BY_TAG[tagName] ?? 'generic';
}

function getDirectTextContent(element: Element): string {
  let textContent = '';

  for (let index = 0; index < element.childNodes.length; index += 1) {
    const child = element.childNodes[index];
    if (child.nodeType === Node.TEXT_NODE) {
      textContent += child.textContent ?? '';
    }
  }

  return textContent;
}

export function getElementName(element: Element): string {
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'select') {
    const selectElement = element as HTMLSelectElement;
    const selectedOption =
      selectElement.querySelector('option[selected]') ||
      selectElement.options[selectElement.selectedIndex];

    if (selectedOption?.textContent) {
      return selectedOption.textContent.trim();
    }
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel?.trim()) {
    return ariaLabel.trim();
  }

  const placeholder = element.getAttribute('placeholder');
  if (placeholder?.trim()) {
    return placeholder.trim();
  }

  const title = element.getAttribute('title');
  if (title?.trim()) {
    return title.trim();
  }

  const alt = element.getAttribute('alt');
  if (alt?.trim()) {
    return alt.trim();
  }

  if (element.id) {
    const labelElement = document.querySelector<HTMLLabelElement>(`label[for="${element.id}"]`);
    if (labelElement?.textContent?.trim()) {
      return labelElement.textContent.trim();
    }
  }

  if (tagName === 'input') {
    const inputElement = element as HTMLInputElement;
    const inputType = element.getAttribute('type') ?? '';
    const inputValue = element.getAttribute('value');

    if (inputType === 'submit' && inputValue?.trim()) {
      return inputValue.trim();
    }

    if (inputElement.value?.length < 50 && inputElement.value.trim()) {
      return inputElement.value.trim();
    }
  }

  if (['button', 'a', 'summary'].includes(tagName)) {
    const directText = getDirectTextContent(element);
    if (directText.trim()) {
      return directText.trim();
    }
  }

  if (/^h[1-6]$/.test(tagName)) {
    const headingText = element.textContent;
    if (headingText?.trim()) {
      return headingText.trim().substring(0, 100);
    }
  }

  if (tagName === 'img') {
    return '';
  }

  const fallbackText = getDirectTextContent(element).trim();
  if (fallbackText.length >= 3) {
    if (fallbackText.length > 100) {
      return `${fallbackText.substring(0, 100)}...`;
    }
    return fallbackText;
  }

  return '';
}

function isVisible(element: Element): boolean {
  const computedStyle = window.getComputedStyle(element);
  const htmlElement = element as HTMLElement;

  return (
    computedStyle.display !== 'none' &&
    computedStyle.visibility !== 'hidden' &&
    computedStyle.opacity !== '0' &&
    htmlElement.offsetWidth > 0 &&
    htmlElement.offsetHeight > 0
  );
}

function isInteractive(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();

  return (
    INTERACTIVE_TAGS.has(tagName) ||
    element.getAttribute('onclick') !== null ||
    element.getAttribute('tabindex') !== null ||
    element.getAttribute('role') === 'button' ||
    element.getAttribute('role') === 'link' ||
    element.getAttribute('contenteditable') === 'true'
  );
}

function isSemantic(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();

  return SEMANTIC_TAGS.has(tagName) || element.getAttribute('role') !== null;
}

export function shouldIncludeElement(element: Element, options: TraversalOptions): boolean {
  const tagName = element.tagName.toLowerCase();

  if (EXCLUDED_TAGS.has(tagName)) {
    return false;
  }

  if (options.filter !== 'all' && element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  if (options.filter !== 'all' && !isVisible(element)) {
    return false;
  }

  if (options.filter !== 'all' && !options.refId) {
    const rect = element.getBoundingClientRect();
    if (
      !(
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      )
    ) {
      return false;
    }
  }

  if (options.filter === 'interactive') {
    return isInteractive(element);
  }

  if (isInteractive(element)) {
    return true;
  }

  if (isSemantic(element)) {
    return true;
  }

  if (getElementName(element).length > 0) {
    return true;
  }

  const role = getElementRole(element);
  return role !== 'generic' && role !== 'image';
}

export function normalizeTextForTree(rawText: string): string {
  return rawText.replace(/\s+/g, ' ').substring(0, 100).replace(/"/g, '\\"');
}
