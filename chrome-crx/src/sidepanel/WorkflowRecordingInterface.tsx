import React, { useState, useMemo, useCallback } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { GlobeIcon } from './icons';
import { Button } from '../components/SchedulingFields';
import { Trash2, Play, Pause, Mic, MicOff, X } from 'lucide-react';
import { WorkflowStepsList, WorkflowStep } from './WorkflowStepsList';
import { Tooltip } from './Tooltip';

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  steps: WorkflowStep[];
}

interface WorkflowRecordingInterfaceProps {
  recordingState: RecordingState;
  isSpeechRecording: boolean;
  isSpeechSupported: boolean;
  hasSpeechPermission: boolean;
  currentInterimTranscript?: string;
  onStop: () => void;
  onTogglePause: () => void;
  onToggleSpeech: () => void;
  onRemoveStep: (index: number) => void;
  onSave: (steps: WorkflowStep[], summary: string) => void;
  createMessage: (message: any, signal?: AbortSignal, label?: string) => Promise<any>;
  isGeneratingSummary: boolean;
  setIsGeneratingSummary: (value: boolean) => void;
  currentUrl?: string;
  pageTitle?: string;
}

export function WorkflowRecordingInterface({
  recordingState,
  isSpeechRecording,
  isSpeechSupported,
  hasSpeechPermission,
  currentInterimTranscript,
  onStop,
  onTogglePause,
  onToggleSpeech,
  onRemoveStep,
  onSave,
  createMessage,
  isGeneratingSummary,
  setIsGeneratingSummary,
  currentUrl,
  pageTitle
}: WorkflowRecordingInterfaceProps) {
  const intl = useIntl();
  const [faviconError, setFaviconError] = useState(false);

  // Extract domain from URL
  const domain = useMemo(() => {
    if (!currentUrl) return '';
    try {
      return new URL(currentUrl).hostname;
    } catch {
      return '';
    }
  }, [currentUrl]);

  // Favicon URL
  const faviconUrl = useMemo(
    () => (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : ''),
    [domain]
  );

  // Handle save/done
  const handleSave = useCallback(async () => {
    setIsGeneratingSummary(true);
    let summary = '';

    if (recordingState.steps.length > 0) {
      try {
        // Dynamic import for generateWorkflowSummary
        const { generateWorkflowSummary } = await import('./sessionPool');
        summary = await generateWorkflowSummary(recordingState.steps, createMessage, true);
      } catch (error) {
        console.error('[WorkflowRecording] generateWorkflowSummary failed:', error);
      }

      // Fallback: if AI summary failed or returned empty, use step descriptions as prompt
      if (!summary) {
        console.warn('[WorkflowRecording] Summary is empty, using step descriptions as fallback');
        summary = recordingState.steps
          .map((step, index) => `${index + 1}. ${step.description}`)
          .join('\n');
      }
    }

    setIsGeneratingSummary(false);

    let steps = recordingState.steps;

    // Add interim transcript as final narration if exists
    if (currentInterimTranscript && currentInterimTranscript.trim()) {
      const narrationStep: WorkflowStep = {
        action: 'narration',
        description: `Note: "${currentInterimTranscript}"`,
        speechTranscript: currentInterimTranscript,
        timestamp: Date.now(),
        url: ''
      };
      steps = [...steps, narrationStep];
    }

    // Remove screenshots from steps before saving
    const stepsWithoutScreenshots = steps.map((step) => ({
      ...step,
      screenshot: undefined
    }));

    onSave(stepsWithoutScreenshots, summary);
  }, [
    recordingState.steps,
    createMessage,
    currentInterimTranscript,
    setIsGeneratingSummary,
    onSave
  ]);

  return (
    <div className="flex flex-col h-full bg-bg-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-3">
        <div className="flex items-center gap-2">
          {faviconUrl && !faviconError ? (
            <img
              src={faviconUrl}
              className="w-4 h-4"
              alt=""
              onError={() => setFaviconError(true)}
            />
          ) : (
            <GlobeIcon size={16} className="text-text-300" />
          )}
          <span className="text-text-200 font-base-sm truncate max-w-[200px]">
            {pageTitle || domain}
          </span>
        </div>
        <button
          onClick={onStop}
          className="p-1.5 rounded-md transition-colors text-text-300 hover:bg-bg-300 hover:text-text-100"
          aria-label={intl.formatMessage({ defaultMessage: 'Close', id: 'close' })}
        >
          <X size={12} />
        </button>
      </div>

      {/* Steps List */}
      <div className="flex-1 overflow-y-auto">
        <WorkflowStepsList
          steps={recordingState.steps}
          isVisible={true}
          onRemoveStep={onRemoveStep}
          fullScreen={true}
          currentInterimTranscript={currentInterimTranscript}
          isSpeechRecording={isSpeechRecording}
        />
      </div>

      {/* Control Buttons */}
      <div className="mx-auto mb-3 max-w-3xl w-full px-3">
        <div
          className="bg-bg-000 border-[0.5px] border-border-300 hover:border-border-200 rounded-[14px] relative z-30 transition-colors focus-within:outline-none"
          style={{ boxShadow: '0 4px 20px 0 rgba(0, 0, 0, 0.04)', outline: 'none' }}
        >
          <div className="flex flex-col gap-2 px-3 py-3">
            {/* Action buttons row */}
            <div className="grid grid-cols-3 gap-2">
              {/* Discard button */}
              <Tooltip
                tooltipContent={intl.formatMessage({ defaultMessage: 'Discard', id: 'discard' })}
                side="top"
              >
                <Button
                  variant="secondary"
                  size="default"
                  onClick={() => onStop()}
                  aria-label={intl.formatMessage({ defaultMessage: 'Discard', id: 'discard' })}
                  className="w-full px-0 min-w-0"
                >
                  <Trash2 size={20} />
                </Button>
              </Tooltip>

              {/* Pause/Resume button */}
              <Tooltip
                tooltipContent={
                  recordingState.isPaused
                    ? intl.formatMessage({ defaultMessage: 'Resume', id: 'resume' })
                    : intl.formatMessage({ defaultMessage: 'Pause', id: 'pause' })
                }
                side="top"
              >
                <Button
                  variant="secondary"
                  size="default"
                  onClick={onTogglePause}
                  aria-label={
                    recordingState.isPaused
                      ? intl.formatMessage({ defaultMessage: 'Resume', id: 'resume' })
                      : intl.formatMessage({ defaultMessage: 'Pause', id: 'pause' })
                  }
                  className="w-full px-0 min-w-0"
                >
                  {recordingState.isPaused ? <Play size={20} /> : <Pause size={20} />}
                </Button>
              </Tooltip>

              {/* Voice narration toggle (if supported) */}
              {isSpeechSupported && (
                <Tooltip
                  tooltipContent={
                    isSpeechRecording
                      ? intl.formatMessage({
                          defaultMessage: 'Turn off voice narration',
                          id: 'turn_off_voice_narration'
                        })
                      : hasSpeechPermission
                        ? intl.formatMessage({
                            defaultMessage: 'Turn on voice narration',
                            id: 'turn_on_voice_narration'
                          })
                        : intl.formatMessage({
                            defaultMessage: 'Microphone permission needed',
                            id: 'microphone_permission_needed'
                          })
                  }
                  side="top"
                >
                  <Button
                    variant="secondary"
                    size="default"
                    onClick={onToggleSpeech}
                    aria-label={intl.formatMessage({
                      defaultMessage: 'Toggle voice narration',
                      id: 'toggle_voice_narration'
                    })}
                    className={
                      'w-full px-0 min-w-0 ' +
                      (isSpeechRecording
                        ? 'bg-accent-main-100 text-oncolor-100 border-accent-main-100'
                        : '')
                    }
                  >
                    {isSpeechRecording ? <Mic size={20} /> : <MicOff size={20} />}
                  </Button>
                </Tooltip>
              )}
            </div>

            {/* Done button */}
            <Button
              variant="primary"
              size="default"
              onClick={handleSave}
              disabled={isGeneratingSummary || recordingState.steps.length === 0}
              aria-label={intl.formatMessage({ defaultMessage: 'Done', id: 'done' })}
              className="w-full"
            >
              {isGeneratingSummary ? (
                <FormattedMessage defaultMessage="Generating shortcut..." id="generating_shortcut" />
              ) : (
                <FormattedMessage defaultMessage="Done" id="done" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
