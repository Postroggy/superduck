(function () {
  document.body.addEventListener("click", (event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest(
      "#claude-onboarding-button",
    );
    if (button) {
      handleOnboardingClick(button as HTMLElement);
    }
  });

  async function handleOnboardingClick(element: HTMLElement): Promise<void> {
    const prompt = element.getAttribute("data-task-prompt");
    if (prompt) {
      await chrome.runtime.sendMessage({ type: "open_side_panel", prompt });
    }
  }
})();
