import React from "react";
import { FormattedMessage } from "react-intl";
import { Button } from "@/components/SchedulingFields";
import { DownloadIcon, ExternalLinkIcon } from "./icons";

interface AntBuildUpsellProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AntBuildUpsell: React.FC<AntBuildUpsellProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="w-full h-screen bg-bg-100 flex items-center justify-center p-5 absolute inset-0 z-50">
      <div className="max-w-[520px] w-full">
        <h1
          className="text-center text-text-000 mb-3"
          style={{
            fontFamily: "Anthropic Sans, var(--font-ui-serif)",
            fontSize: "26px",
            fontWeight: 500,
            lineHeight: "140%",
          }}
        >
          <FormattedMessage
            defaultMessage="Test the newest{br}SuperDuck experience"
            id="test_the_newestclaude_experience"
            values={{ br: <br /> }}
          />
        </h1>

        <p
          className="text-center text-text-300 mb-[22px] px-4"
          style={{ fontSize: "14px", lineHeight: "140%" }}
        >
          <FormattedMessage
            defaultMessage="Please help us Antfood the latest version of SuperDuck. Your testing accelerates our development."
            id="please_help_us_antfood_the_latest"
          />
        </p>

        <div className="border border-border-300 rounded-[24px] mb-[22px]">
          <div className="flex gap-3 pt-5 pb-4 px-4">
            <div className="mt-0.5">
              <DownloadIcon size={20} className="text-text-100" />
            </div>
            <div className="flex-1">
              <h3 className="text-[14px] text-text-100 font-medium mb-1">
                <FormattedMessage
                  defaultMessage="Step 1: Download the Ant-only version"
                  id="step_1_download_the_antonly_version"
                />
              </h3>
              <p className="text-[12px] text-text-300 leading-[140%]">
                <FormattedMessage
                  defaultMessage="Click below to get the latest internal build from the Chrome Web Store."
                  id="click_below_to_get_the_latest"
                />
              </p>
            </div>
          </div>

          <div className="border-t-[0.5px] border-border-300 px-4" />

          <div className="flex gap-3 pt-4 pb-5 px-4">
            <div className="mt-0.5">
              <ExternalLinkIcon size={20} className="text-text-100" />
            </div>
            <div className="flex-1">
              <h3 className="text-[14px] text-text-100 font-medium mb-1">
                <FormattedMessage
                  defaultMessage="Step 2: Remove this extension"
                  id="step_2_remove_this_extension"
                />
              </h3>
              <p className="text-[12px] text-text-300 leading-[140%]">
                <FormattedMessage
                  defaultMessage="Uninstall this version after installing the new one to avoid conflicts."
                  id="uninstall_this_version_after_installing_the"
                />
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              window.open(
                "https://chromewebstore.google.com/detail/claude/dngcpimnedloihjnnfngkgjoidhnaolf",
                "_blank"
              );
            }}
            className="w-full px-4 py-2.5 rounded-[14px] bg-text-100 hover:bg-text-200 active:bg-text-000 text-bg-100 font-button transition-all hover:shadow-md"
          >
            <FormattedMessage defaultMessage="Get the Ant-only extension" id="get_the_antonly_extension" />
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-[14px] bg-transparent hover:bg-bg-200 text-text-300 hover:text-text-100 font-button transition-colors"
          >
            <FormattedMessage defaultMessage="Later" id="later" />
          </button>
        </div>
      </div>
    </div>
  );
};
