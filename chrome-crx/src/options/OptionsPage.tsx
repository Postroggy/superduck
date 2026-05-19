import React, { useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { T as TasksTab } from '@/components/TasksTab';
import { MicrophonePermissionModal } from './components/MicrophonePermissionModal';
import { PermissionsTab } from './components/PermissionsTab';
import { NavItem, PageContent, PageHeader } from './components/PageLayout';

function OptionsPage() {
  const [activeTab, setActiveTab] = useState<string>('permissions');
  const [showMicModal, setShowMicModal] = useState(false);
  const [returnTabId, setReturnTabId] = useState<number>();

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      const [section, queryString] = hash.split('?');
      const nextTab = ['permissions', 'prompts', 'internal'].includes(section)
        ? section
        : 'permissions';

      let nextReturnTabId: number | undefined;
      let requestMicrophone = false;

      if (queryString) {
        const params = new URLSearchParams(queryString);
        requestMicrophone = params.get('requestMicrophone') === 'true';
        const returnTab = params.get('returnTabId');
        if (returnTab) {
          nextReturnTabId = parseInt(returnTab, 10);
        }
      }

      setActiveTab(nextTab);
      if (requestMicrophone) {
        setShowMicModal(true);
        setReturnTabId(nextReturnTabId);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTab = (tab: string) => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  return (
    <div className="min-h-screen bg-bg-100">
      <PageHeader large mdTitle="Settings" />

      <PageContent>
        <div className="mb-4 md:hidden pl-3">
          <h1 className="font-heading text-text-200 flex items-center gap-1.5">
            <FormattedMessage defaultMessage="Settings" id="settings" />
          </h1>
        </div>

        <div className="grid md:grid-cols-[220px_minmax(0px,_1fr)] gap-x-8 w-full max-w-6xl my-4 md:my-8">
          <nav className="w-full overflow-x-auto -m-2 p-2 self-start md:sticky md:top-4 relative z-10 mb-4 md:mb-0">
            <ul className="flex gap-1 md:flex-col mb-0">
              <li>
                <NavItem
                  href="/settings/permissions"
                  isActive={activeTab === 'permissions'}
                  onClick={() => navigateTab('permissions')}
                >
                  <FormattedMessage
                    defaultMessage="Model Config & Permissions"
                    id="model_config_permissions"
                  />
                </NavItem>
              </li>
              <li>
                <NavItem
                  href="/settings/prompts"
                  isActive={activeTab === 'prompts'}
                  onClick={() => navigateTab('prompts')}
                >
                  <FormattedMessage defaultMessage="Shortcuts" id="shortcuts" />
                </NavItem>
              </li>
            </ul>
          </nav>

          <div>
            {activeTab === 'permissions' && <PermissionsTab />}
            {activeTab === 'prompts' && <TasksTab />}
          </div>
        </div>
      </PageContent>

      <MicrophonePermissionModal
        isOpen={showMicModal}
        returnTabId={returnTabId}
        onClose={() => setShowMicModal(false)}
      />
    </div>
  );
}

export { OptionsPage };
