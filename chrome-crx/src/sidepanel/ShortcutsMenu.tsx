import React, { useState, useEffect, useCallback } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Workflow, Calendar, Slash, Pencil } from 'lucide-react';

interface SavedPrompt {
  id: string;
  command: string;
  prompt: string;
  url?: string;
  usageCount: number;
  createdAt: number;
}

interface SpecialCommand {
  command: string;
  description: string;
}

interface ShortcutsMenuProps {
  searchTerm: string;
  onSelect: (command: string) => void;
  onEditShortcut?: (shortcut: SavedPrompt) => void;
  onRecordWorkflow: () => void;
  onScheduleTask: () => void;
  onClose: () => void;
}

export function ShortcutsMenu({
  searchTerm,
  onSelect,
  onEditShortcut,
  onRecordWorkflow,
  onScheduleTask,
  onClose
}: ShortcutsMenuProps) {
  const intl = useIntl();
  const [shortcuts, setShortcuts] = useState<SavedPrompt[]>([]);
  const [specialCommands, setSpecialCommands] = useState<SpecialCommand[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const untitledLabel = intl.formatMessage({ defaultMessage: 'untitled', id: 'untitled' });

  // Load shortcuts and special commands
  useEffect(() => {
    (async () => {
      try {
        const { SavedPromptsService } = await import('../SavedPromptsService');
        const { getSpecialCommands } = await import('./sessionPool');

        const allPrompts = await SavedPromptsService.getAllPrompts();

        // Sort by usage count and creation date
        const sorted = allPrompts.sort((a, b) => {
          if (a.usageCount !== b.usageCount) {
            return b.usageCount - a.usageCount;
          }
          return b.createdAt - a.createdAt;
        });

        setShortcuts(sorted);
        setSpecialCommands(getSpecialCommands(intl));
      } catch (error) {
        console.error('Failed to load shortcuts:', error);
      }
    })();
  }, [intl]);

  // Filter shortcuts and special commands based on search term
  const filteredSpecialCommands = specialCommands.filter((cmd) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return cmd.command.toLowerCase().includes(term) || cmd.description.toLowerCase().includes(term);
  });

  const filteredShortcuts = shortcuts.filter((shortcut) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      shortcut.command?.toLowerCase().includes(term) ||
      shortcut.prompt?.toLowerCase().includes(term)
    );
  });

  const totalItems = filteredSpecialCommands.length + filteredShortcuts.length + 2; // +2 for actions

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, totalItems - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const specialCommandsCount = filteredSpecialCommands.length;
        const shortcutsCount = filteredShortcuts.length;

        if (selectedIndex < specialCommandsCount) {
          // Select special command
          const selected = filteredSpecialCommands[selectedIndex];
          onSelect(selected.command);
        } else if (selectedIndex < specialCommandsCount + shortcutsCount) {
          // Select shortcut
          const selected = filteredShortcuts[selectedIndex - specialCommandsCount];
          onSelect(selected.command);
        } else if (selectedIndex === specialCommandsCount + shortcutsCount) {
          // Record workflow
          onRecordWorkflow();
        } else if (selectedIndex === specialCommandsCount + shortcutsCount + 1) {
          // Schedule task
          onScheduleTask();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedIndex,
    filteredSpecialCommands,
    filteredShortcuts,
    totalItems,
    onSelect,
    onRecordWorkflow,
    onScheduleTask,
    onClose
  ]);

  // Reset selected index when search term changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  if (filteredSpecialCommands.length === 0 && filteredShortcuts.length === 0 && !searchTerm) {
    return null;
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-bg-000 border border-border-300 rounded-xl shadow-xl max-h-[400px] overflow-y-auto z-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-300">
        <h3 className="text-sm font-medium text-text-200">
          <FormattedMessage defaultMessage="Shortcuts" id="shortcuts" />
        </h3>
      </div>

      {/* Special commands */}
      {filteredSpecialCommands.length > 0 && (
        <div className="py-2">
          {filteredSpecialCommands.map((cmd, index) => (
            <button
              key={cmd.command}
              onClick={() => onSelect(cmd.command)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full px-4 py-2 text-left hover:bg-bg-200 transition-colors ${
                selectedIndex === index ? 'bg-bg-200' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-bg-300 flex items-center justify-center">
                  <Slash size={16} className="text-text-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-100 truncate">/{cmd.command}</div>
                  <div className="text-xs text-text-300 truncate">{cmd.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Separator between special commands and shortcuts */}
      {filteredSpecialCommands.length > 0 && filteredShortcuts.length > 0 && (
        <div className="border-t border-border-300" />
      )}

      {/* Shortcuts list */}
      {filteredShortcuts.length > 0 && (
        <div className="py-2">
          {filteredShortcuts.map((shortcut, index) => {
            const itemIndex = filteredSpecialCommands.length + index;
            return (
              <div
                key={shortcut.id}
                onMouseEnter={() => setSelectedIndex(itemIndex)}
                className={`group flex items-center gap-1 px-2.5 py-2 rounded-lg transition-colors hover:bg-bg-200 ${
                  selectedIndex === itemIndex ? 'bg-bg-200' : ''
                }`}
              >
                <button
                  onClick={() => onSelect(shortcut.command)}
                  className={`flex-1 min-w-0 text-left flex items-center gap-2 hover:text-text-000 ${
                    selectedIndex === itemIndex ? 'text-text-000' : 'text-text-300'
                  }`}
                >
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <span className="text-text-500/50 font-mono text-sm">/</span>
                  </div>
                  <span className="flex-1 truncate text-sm">
                    {shortcut.command || untitledLabel}
                  </span>
                </button>
                {onEditShortcut && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditShortcut(shortcut);
                    }}
                    className={`p-1 rounded transition-all hover:bg-bg-300 ${
                      selectedIndex === itemIndex
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                    aria-label={intl.formatMessage(
                      { defaultMessage: 'Edit {name}', id: 'edit' },
                      { name: shortcut.command || untitledLabel }
                    )}
                  >
                    <Pencil size={12} className="text-text-400" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Separator */}
      {(filteredSpecialCommands.length > 0 || filteredShortcuts.length > 0) && (
        <div className="border-t border-border-300" />
      )}

      {/* Actions */}
      <div className="py-2">
        <button
          onClick={onRecordWorkflow}
          onMouseEnter={() =>
            setSelectedIndex(filteredSpecialCommands.length + filteredShortcuts.length)
          }
          className={`w-full px-4 py-2 text-left hover:bg-bg-200 transition-colors ${
            selectedIndex === filteredSpecialCommands.length + filteredShortcuts.length
              ? 'bg-bg-200'
              : ''
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-bg-300 flex items-center justify-center">
              <Workflow size={16} className="text-text-300" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-text-100">
                <FormattedMessage defaultMessage="Record workflow" id="record_workflow" />
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={onScheduleTask}
          onMouseEnter={() =>
            setSelectedIndex(filteredSpecialCommands.length + filteredShortcuts.length + 1)
          }
          className={`w-full px-4 py-2 text-left hover:bg-bg-200 transition-colors ${
            selectedIndex === filteredSpecialCommands.length + filteredShortcuts.length + 1
              ? 'bg-bg-200'
              : ''
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-bg-300 flex items-center justify-center">
              <Calendar size={16} className="text-text-300" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-text-100">
                <FormattedMessage defaultMessage="Schedule task" id="KL/gQqGUU1" />
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Empty state */}
      {filteredSpecialCommands.length === 0 && filteredShortcuts.length === 0 && searchTerm && (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-text-300">
            <FormattedMessage
              defaultMessage="No shortcuts found for '{searchTerm}'"
              id="noShortcutsFound"
              values={{ searchTerm }}
            />
          </p>
        </div>
      )}
    </div>
  );
}
