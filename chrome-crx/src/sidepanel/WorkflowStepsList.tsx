import React, { useRef, useState, useEffect } from 'react';
import { FormattedMessage } from 'react-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Mic } from 'lucide-react';
import { Button } from '../components/SchedulingFields';
import { ScreenshotPreview } from './ScreenshotPreview';

export interface WorkflowStep {
  action: 'click' | 'type' | 'navigate' | 'create_tab' | 'narration';
  selector?: string;
  value?: string;
  screenshot?: string;
  description: string;
  url: string;
  tabId?: number;
  elementText?: string;
  elementAttributes?: Record<string, string>;
  timestamp: number;
  viewportDimensions?: { width: number; height: number };
  clickPosition?: { x: number; y: number };
  isEnhancing?: boolean;
  speechTranscript?: string;
  isPending?: boolean;
}

interface WorkflowStepsListProps {
  steps: WorkflowStep[];
  isVisible: boolean;
  onRemoveStep?: (index: number) => void;
  onClose?: () => void;
  fullScreen?: boolean;
  currentInterimTranscript?: string;
  isSpeechRecording?: boolean;
}

export function WorkflowStepsList({
  steps,
  isVisible,
  onRemoveStep,
  onClose,
  fullScreen = false,
  currentInterimTranscript = '',
  isSpeechRecording = false,
}: WorkflowStepsListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastStepRef = useRef<HTMLDivElement>(null);
  const interimRef = useRef<HTMLDivElement>(null);
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<number>>(new Set());

  // Auto-scroll to latest step or interim transcript
  useEffect(() => {
    if (interimRef.current) {
      interimRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    } else if (lastStepRef.current) {
      lastStepRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
    }
  }, [steps.length, currentInterimTranscript]);

  if (!isVisible) return null;

  return (
    <motion.div
      initial={fullScreen ? { opacity: 0 } : { opacity: 0, x: 300 }}
      animate={fullScreen ? { opacity: 1 } : { opacity: 1, x: 0 }}
      exit={fullScreen ? { opacity: 0 } : { opacity: 0, x: 300 }}
      className={
        fullScreen
          ? 'flex flex-col h-full'
          : 'fixed right-0 top-[60px] bottom-0 w-80 bg-white shadow-xl z-40 border-l border-gray-200'
      }
    >
      {/* Header (only in non-fullscreen mode) */}
      {!fullScreen && (
        <div className="flex flex-col border-b border-gray-200">
          <div className="flex items-center justify-between p-4">
            <h3 className="font-base-bold text-text-100">
              <FormattedMessage
                defaultMessage="Steps ({count})"
                id="steps"
                values={{ count: steps.length }}
              />
            </h3>
            {onClose && (
              <Button
                variant="ghost"
                size="icon_sm"
                onClick={onClose}
                className="hover:bg-bg-500"
              >
                <X size={16} />
              </Button>
            )}
          </div>
          {/* Current interim transcript (non-fullscreen) */}
          {isSpeechRecording && currentInterimTranscript && (
            <div className="px-4 pb-3 flex items-start gap-2">
              <Mic size={12} className="text-accent-main-100 mt-1 flex-shrink-0 animate-pulse" />
              <p className="text-text-300 font-base-sm italic flex-1">
                <FormattedMessage
                  defaultMessage='"{transcript}"'
                  id="label"
                  values={{ transcript: currentInterimTranscript }}
                />
              </p>
            </div>
          )}
        </div>
      )}

      {/* Steps container */}
      <div
        ref={containerRef}
        className={
          fullScreen
            ? 'flex-1 overflow-y-auto p-2'
            : 'overflow-y-auto h-[calc(100%-60px)] overflow-x-hidden'
        }
      >
        <div className={fullScreen ? 'space-y-1 max-w-3xl mx-auto' : 'p-2 space-y-2'}>
          {/* Empty state */}
          {steps.length === 0 && (
            <div
              className={
                fullScreen
                  ? 'text-center text-text-400 font-base py-8'
                  : 'p-4 text-center text-text-400 font-base'
              }
            >
              <FormattedMessage
                defaultMessage="Click through your task to record each step"
                id="click_through_your_task_to_record"
              />
            </div>
          )}

          {/* Steps list */}
          {steps.length > 0 && (
            <AnimatePresence>
              {steps.map((step, index) => (
                <motion.div
                  key={step.timestamp}
                  ref={index === steps.length - 1 ? lastStepRef : null}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  className="group relative"
                >
                  <div className="rounded-2xl overflow-hidden transition-all hover:bg-bg-300">
                    {/* Step header */}
                    <div className="flex items-start justify-between px-3 py-3">
                      <div className="flex items-start gap-3">
                        {/* Step number */}
                        <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 font-small-bold text-text-100 bg-bg-500 rounded-full">
                          {index + 1}
                        </span>

                        {/* Step description */}
                        <div className="flex-1 pt-0.5">
                          <p className="text-text-100 font-base flex items-center gap-2">
                            {step.isEnhancing ? (
                              <span className="inline-block bg-gradient-to-r from-text-400 via-text-200 to-text-400 bg-clip-text text-transparent animate-shimmertext bg-[length:400%_100%]">
                                <FormattedMessage defaultMessage="Loading..." id="loading" />
                              </span>
                            ) : (
                              step.description
                            )}
                          </p>
                          {step.tabId && (
                            <p className="text-text-400 font-small text-xs mt-0.5">
                              <FormattedMessage
                                defaultMessage="Tab {tabId}"
                                id="tab"
                                values={{ tabId: step.tabId }}
                              />
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Remove button */}
                      {onRemoveStep && (
                        <Button
                          variant="ghost"
                          size="icon_sm"
                          onClick={() => onRemoveStep(index)}
                          className="opacity-0 group-hover:opacity-100 hover:bg-bg-500 !h-6 !w-6"
                        >
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </div>

                    {/* Screenshot with click position */}
                    {step.screenshot && step.clickPosition && (
                      <div className="px-3 pb-3">
                        <div className="relative w-full h-48 overflow-hidden rounded-xl border-[0.5px] border-border-200">
                          <ScreenshotPreview
                            screenshot={`data:image/jpeg;base64,${step.screenshot}`}
                            coordinates={[step.clickPosition.x, step.clickPosition.y]}
                            viewportDimensions={step.viewportDimensions}
                            zoomLevel={2.5}
                            className="w-full h-full"
                          />
                        </div>
                      </div>
                    )}

                    {/* Speech transcript */}
                    {step.speechTranscript && (
                      <div className="px-3 pb-3">
                        <button
                          onClick={() => {
                            setExpandedTranscripts((prev) => {
                              const next = new Set(prev);
                              if (next.has(index)) {
                                next.delete(index);
                              } else {
                                next.add(index);
                              }
                              return next;
                            });
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 bg-bg-200 hover:bg-bg-300 rounded-lg transition-colors text-left"
                        >
                          <Mic size={12} className="text-text-300 flex-shrink-0" />
                          <span className="text-text-200 font-base-sm flex-1">
                            {expandedTranscripts.has(index) ? (
                              <span className="italic">
                                <FormattedMessage
                                  defaultMessage='"{transcript}"'
                                  id="label"
                                  values={{ transcript: step.speechTranscript }}
                                />
                              </span>
                            ) : (
                              <>
                                <span className="italic">
                                  <FormattedMessage
                                    defaultMessage='"{transcript}"'
                                    id="label"
                                    values={{
                                      transcript:
                                        step.speechTranscript.length > 50
                                          ? `${step.speechTranscript.substring(0, 50)}...`
                                          : step.speechTranscript,
                                    }}
                                  />
                                </span>
                                {step.speechTranscript.length > 50 && (
                                  <span className="text-text-400 ml-1">
                                    <FormattedMessage
                                      defaultMessage="(click to expand)"
                                      id="click_to_expand"
                                    />
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {/* Current interim transcript (fullscreen mode) */}
          {fullScreen && isSpeechRecording && (
            <div
              ref={interimRef}
              className="group relative rounded-2xl overflow-hidden transition-all hover:bg-bg-300"
            >
              <div className="flex items-start justify-between px-3 py-3">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 font-small-bold text-text-100 bg-bg-500 rounded-full">
                    {steps.length + 1}
                  </span>
                  <div className="flex-1 pt-0.5">
                    <p className="text-text-100 font-base flex items-center gap-2">
                      {currentInterimTranscript ? (
                        <span className="inline-block bg-gradient-to-r from-text-400 via-text-200 to-text-400 bg-clip-text text-transparent animate-shimmertext bg-[length:400%_100%]">
                          <FormattedMessage
                            defaultMessage='"{transcript}"'
                            id="label"
                            values={{ transcript: currentInterimTranscript }}
                          />
                        </span>
                      ) : (
                        <span className="inline-block bg-gradient-to-r from-text-400 via-text-200 to-text-400 bg-clip-text text-transparent animate-shimmertext bg-[length:400%_100%]">
                          <FormattedMessage defaultMessage="Listening..." id="listening" />
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save button (non-fullscreen mode) */}
      {!fullScreen && steps.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200">
          <button className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-base-bold">
            <FormattedMessage defaultMessage="Save as Teach SuperDuck" id="save_as_teach_claude" />
          </button>
        </div>
      )}
    </motion.div>
  );
}
