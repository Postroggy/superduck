import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { X, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '../components/SchedulingFields';
import { TextInput, TextArea, ErrorMessage } from '../components/SchedulingFields';
import { SchedulingFields } from '../components/SchedulingFields';

interface SavedPrompt {
  id: string;
  command: string;
  prompt: string;
  url?: string;
  repeatType?: string;
  specificTime?: string;
  specificDate?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  monthAndDay?: string;
  model?: string;
  createdAt: number;
  usageCount: number;
}

interface PromptToSave {
  prompt: string;
  command?: string;
}

interface CreateShortcutModalProps {
  prompt?: SavedPrompt | PromptToSave;
  onClose: () => void;
  onSave: (commandName: string) => void;
  onDelete?: () => void;
  sessionId: string | null;
  generateName?: (prompt: string) => Promise<string>;
  currentModel: string;
}

export function CreateShortcutModal({
  prompt,
  onClose,
  onSave,
  onDelete,
  sessionId,
  generateName,
  currentModel,
}: CreateShortcutModalProps) {
  const intl = useIntl();

  // Check if editing existing prompt
  const isEditing = !!(prompt && 'id' in prompt);
  const existingPrompt = isEditing ? (prompt as SavedPrompt) : null;

  // Form state
  const initialPromptText = existingPrompt?.prompt || (prompt && !('id' in prompt) ? (prompt as PromptToSave).prompt : '') || '';
  const initialCommand = existingPrompt?.command || (prompt && !('id' in prompt) ? (prompt as PromptToSave).command : '') || '';

  const [commandName, setCommandName] = useState(initialCommand);
  const [promptText, setPromptText] = useState(initialPromptText);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isGeneratingName, setIsGeneratingName] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const hasFocusedRef = useRef(false);
  const hasGeneratedNameRef = useRef(false);

  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(
    Boolean(existingPrompt?.repeatType && existingPrompt.repeatType !== 'none')
  );
  const [repeatType, setRepeatType] = useState<string>(
    existingPrompt?.repeatType && existingPrompt.repeatType !== 'none'
      ? existingPrompt.repeatType
      : 'once'
  );
  const [specificTime, setSpecificTime] = useState(existingPrompt?.specificTime || '09:00');
  const [dayOfWeek, setDayOfWeek] = useState(existingPrompt?.dayOfWeek ?? 0);
  const [dayOfMonth, setDayOfMonth] = useState(existingPrompt?.dayOfMonth || 1);
  const [month, setMonth] = useState(
    existingPrompt?.monthAndDay ? parseInt(existingPrompt.monthAndDay.split('-')[0]) : 1
  );
  const [day, setDay] = useState(
    existingPrompt?.monthAndDay ? parseInt(existingPrompt.monthAndDay.split('-')[1]) : 1
  );
  const [specificDate, setSpecificDate] = useState(() => {
    const date = existingPrompt?.specificDate;
    if (!date) return '';
    return date >= new Date().toISOString().split('T')[0] ? date : '';
  });
  const [url, setUrl] = useState(existingPrompt?.url || '');
  const [model, setModel] = useState(existingPrompt?.model || currentModel || 'claude-sonnet-4-6');

  // Auto-generate name when modal opens
  const generateShortcutName = useCallback(async () => {
    if (promptText && generateName && !isEditing && !hasGeneratedNameRef.current) {
      setIsGeneratingName(true);
      hasGeneratedNameRef.current = true;

      try {
        const generatedName = await generateName(promptText);
        if (generatedName && !commandName) {
          setCommandName(generatedName);
        }
      } catch (error) {
        console.error('Failed to generate name:', error);
      } finally {
        setIsGeneratingName(false);

        // Focus name input after generation
        if (!hasFocusedRef.current) {
          setTimeout(() => {
            nameInputRef.current?.focus();
            nameInputRef.current?.select();
            hasFocusedRef.current = true;
          }, 100);
        }
      }
    }
  }, [promptText, generateName, commandName, isEditing]);

  // Open animation and auto-generate name
  useEffect(() => {
    setTimeout(() => {
      setIsOpen(true);
    }, 10);

    if (!isEditing && !initialCommand && initialPromptText && generateName) {
      generateShortcutName();
    } else if (!hasFocusedRef.current) {
      setTimeout(() => {
        nameInputRef.current?.focus();
        hasFocusedRef.current = true;
      }, 50);
    }

    // Get current tab URL if creating new shortcut
    if (!isEditing) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          try {
            const tabUrl = tabs[0].url;
            if (tabUrl && tabUrl.startsWith('http')) {
              setUrl(tabUrl);
            }
          } catch (error) {
            // Ignore
          }
        }
      });
    }
  }, [isEditing, initialCommand, initialPromptText, generateName, generateShortcutName]);

  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };

    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoreMenu]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 200);
  }, [onClose]);

  const handleSave = useCallback(async () => {
    setHasAttemptedSubmit(true);

    if (commandName.trim() && promptText.trim()) {
      setIsSaving(true);
      setErrorMessage('');

      try {
        // Import SavedPromptsService dynamically
        const { SavedPromptsService } = await import('../SavedPromptsService');

        if (isEditing && existingPrompt) {
          // Update existing prompt
          const updates: Partial<SavedPrompt> = {
            prompt: promptText.trim(),
            command: commandName.trim(),
            url: url.trim() || undefined,
          };

          if (scheduleEnabled) {
            updates.repeatType = repeatType;
            updates.specificTime = specificTime;
            updates.model = model;

            if (repeatType === 'once') {
              updates.specificDate = specificDate;
            } else if (repeatType === 'weekly') {
              updates.dayOfWeek = dayOfWeek;
            } else if (repeatType === 'monthly') {
              updates.dayOfMonth = dayOfMonth;
            } else if (repeatType === 'annually') {
              updates.monthAndDay = `${month}-${day}`;
            }
          } else {
            updates.repeatType = 'none';
            updates.specificTime = undefined;
            updates.dayOfWeek = undefined;
            updates.dayOfMonth = undefined;
            updates.monthAndDay = undefined;
            updates.specificDate = undefined;
            updates.model = undefined;
          }

          await SavedPromptsService.updatePrompt(existingPrompt.id, updates);
          window.dispatchEvent(new Event('prompts-changed'));
        } else {
          // Create new prompt
          const newPrompt: Omit<SavedPrompt, 'id'> = {
            prompt: promptText.trim(),
            command: commandName.trim(),
            url: url.trim() || undefined,
            createdAt: Date.now(),
            usageCount: 0,
          };

          if (scheduleEnabled) {
            (newPrompt as any).repeatType = repeatType;
            (newPrompt as any).specificTime = specificTime;
            (newPrompt as any).model = model;

            if (repeatType === 'once') {
              (newPrompt as any).specificDate = specificDate;
            } else if (repeatType === 'weekly') {
              (newPrompt as any).dayOfWeek = dayOfWeek;
            } else if (repeatType === 'monthly') {
              (newPrompt as any).dayOfMonth = dayOfMonth;
            } else if (repeatType === 'annually') {
              (newPrompt as any).monthAndDay = `${month}-${day}`;
            }
          }

          await SavedPromptsService.savePrompt(newPrompt as any);
          window.dispatchEvent(new Event('prompts-changed'));
        }

        onSave(commandName.trim());
        handleClose();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to save');
        setIsSaving(false);
      }
    }
  }, [
    commandName,
    promptText,
    isEditing,
    existingPrompt,
    scheduleEnabled,
    repeatType,
    specificTime,
    specificDate,
    dayOfWeek,
    dayOfMonth,
    month,
    day,
    url,
    model,
    onSave,
    handleClose,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'Enter') {
        const target = document.activeElement;
        if (target?.tagName !== 'INPUT' && target?.tagName !== 'TEXTAREA' && !isSaving && !isDeleting) {
          e.preventDefault();
          handleSave();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, handleSave, isSaving, isDeleting]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${
          isOpen && !isClosing ? 'bg-black/20' : 'bg-black/0'
        }`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-bg-000 border-t-[0.5px] border-border-300 rounded-t-2xl shadow-xl transition-transform duration-200 ease-out ${
          isOpen && !isClosing ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="px-4 pb-4 pt-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-large-bold text-text-000">
              {isEditing ? (
                <FormattedMessage defaultMessage="Edit shortcut" id="edit_shortcut" />
              ) : (
                <FormattedMessage defaultMessage="Create shortcut" id="create_shortcut" />
              )}
            </h3>

            <div className="flex items-center gap-2">
              {/* More menu (only for editing) */}
              {isEditing && (
                <div className="relative" ref={moreMenuRef}>
                  <button
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    className="p-1 hover:bg-bg-200 rounded transition-colors"
                    aria-label={intl.formatMessage({ defaultMessage: 'More options', id: 'more_options' })}
                  >
                    <MoreHorizontal size={16} className="text-text-300" />
                  </button>

                  {showMoreMenu && (
                    <div className="absolute right-0 top-full mt-2 bg-bg-000 border-0.5 border-border-200 rounded-xl backdrop-blur-xl shadow-[0px_2px_8px_0px_hsl(var(--always-black)/8%)] p-1.5 min-w-[120px] z-dropdown">
                      <button
                        onClick={async () => {
                          setShowMoreMenu(false);
                          if (isEditing && existingPrompt) {
                            setIsDeleting(true);
                            try {
                              const { SavedPromptsService } = await import('../SavedPromptsService');
                              await SavedPromptsService.deletePrompt(existingPrompt.id);
                              window.dispatchEvent(new Event('prompts-changed'));
                              onDelete?.();
                              handleClose();
                            } catch (error) {
                              setErrorMessage(error instanceof Error ? error.message : 'Failed to delete prompt');
                              setIsDeleting(false);
                            }
                          }
                        }}
                        disabled={isDeleting}
                        className="w-full px-2 py-2 text-left rounded-lg hover:bg-bg-200 flex items-center gap-2 text-danger-100 hover:text-danger-000 transition-colors"
                      >
                        {isDeleting ? (
                          <div className="w-4 h-4 border-2 border-danger-100 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                        <span className="text-sm">
                          <FormattedMessage defaultMessage="Delete" id="delete" />
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Close button */}
              <button
                onClick={handleClose}
                className="p-1 hover:bg-bg-200 rounded transition-colors"
                aria-label={intl.formatMessage({ defaultMessage: 'Close', id: 'close' })}
              >
                <X size={16} className="text-text-300" />
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {/* Name field */}
            <div className="relative">
              <TextInput
                ref={nameInputRef}
                label={intl.formatMessage({ defaultMessage: 'Name', id: 'name' })}
                type="text"
                value={commandName}
                onChange={(e) => {
                  const sanitized = e.target.value
                    .replace(/\s/g, '-')
                    .replace(/[^a-zA-Z0-9-_]/g, '');
                  setCommandName(sanitized);
                  if (errorMessage) setErrorMessage('');
                }}
                prepend={<span className="text-text-300">/</span>}
                placeholder={
                  isGeneratingName
                    ? ''
                    : intl.formatMessage({ defaultMessage: 'e.g., summarize', id: 'eg_summarize' })
                }
                disabled={isGeneratingName}
                className="w-full text-sm"
                error={
                  (hasAttemptedSubmit && !commandName.trim()) ||
                  errorMessage?.includes('already in use')
                }
              />

              {/* Error message */}
              {((hasAttemptedSubmit && !commandName.trim()) || errorMessage?.includes('already in use')) && (
                <ErrorMessage className="mt-1">
                  {hasAttemptedSubmit && !commandName.trim() ? (
                    <FormattedMessage defaultMessage="Name is required" id="name_is_required" />
                  ) : (
                    errorMessage
                  )}
                </ErrorMessage>
              )}

              {/* Generating shimmer */}
              {isGeneratingName && !commandName && (
                <div className="absolute left-[24px] top-[31px] pointer-events-none">
                  <span
                    className="text-[14px] relative inline-block"
                    style={{
                      color: 'transparent',
                      background:
                        'linear-gradient(90deg, #9ca3af 0%, #9ca3af 35%, #6b7280 50%, #9ca3af 65%, #9ca3af 100%)',
                      backgroundSize: '200% 100%',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      animation: 'shimmerSweep 2s ease-in-out infinite',
                    }}
                  >
                    <FormattedMessage defaultMessage="Generating..." id="generating" />
                  </span>
                  <style>{`
                    @keyframes shimmerSweep {
                      0% { background-position: 200% 0; }
                      100% { background-position: -200% 0; }
                    }
                  `}</style>
                </div>
              )}
            </div>

            {/* Prompt field */}
            <TextArea
              label={intl.formatMessage({ defaultMessage: 'Prompt', id: 'prompt' })}
              required
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              className="min-h-32 max-h-64 overflow-y-auto font-large text-sm"
              placeholder={intl.formatMessage({
                defaultMessage: 'Enter your prompt text...',
                id: 'enter_your_prompt_text',
              })}
              error={
                hasAttemptedSubmit && !promptText.trim()
                  ? intl.formatMessage({ defaultMessage: 'Prompt is required', id: 'prompt_is_required' })
                  : undefined
              }
            />

            {/* Scheduling fields */}
            <SchedulingFields
              scheduleEnabled={scheduleEnabled}
              setScheduleEnabled={setScheduleEnabled}
              repeatType={repeatType}
              setRepeatType={setRepeatType}
              specificDate={specificDate}
              setSpecificDate={setSpecificDate}
              dayOfWeek={dayOfWeek}
              setDayOfWeek={setDayOfWeek}
              dayOfMonth={dayOfMonth}
              setDayOfMonth={setDayOfMonth}
              month={month}
              setMonth={setMonth}
              day={day}
              setDay={setDay}
              specificTime={specificTime}
              setSpecificTime={setSpecificTime}
              url={url}
              setUrl={setUrl}
              compact
              model={model}
              setModel={setModel}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-6">
            <Button onClick={handleClose} variant="secondary">
              <FormattedMessage defaultMessage="Cancel" id="cancel" />
            </Button>
            <Button onClick={handleSave} loading={isSaving}>
              {isEditing ? (
                <FormattedMessage defaultMessage="Save changes" id="save_changes" />
              ) : (
                <FormattedMessage defaultMessage="Create shortcut" id="create_shortcut" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
