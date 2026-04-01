import React, { useRef, useCallback, useImperativeHandle, useLayoutEffect } from "react";
import { cn, useComposedRefs } from "@/components/SchedulingFields";

interface PinToBottomConfig {
  disabled: boolean;
  initialValue: boolean;
}

export interface ScrollContainerHandle {
  getScrollContainer: () => HTMLDivElement | null;
  scrollToBottom: (behavior?: ScrollBehavior, options?: { onlyIfPinned?: boolean }) => void;
  setPinToBottom: (pinned: boolean) => void;
  innerRef: React.RefObject<HTMLDivElement | null>;
}

interface ScrollContainerProps {
  ref?: React.Ref<ScrollContainerHandle>;
  children: React.ReactNode;
  parentClassName?: string;
  innerClassName?: string;
  pinToBottomConfig?: PinToBottomConfig;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function ScrollContainer({
  ref,
  children,
  parentClassName,
  innerClassName,
  pinToBottomConfig = { disabled: false, initialValue: false },
  containerRef,
}: ScrollContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(containerRef?.current || null);
  const composedRef = useComposedRefs(containerRef as React.Ref<HTMLDivElement>, scrollRef);
  const innerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(pinToBottomConfig.initialValue);
  const isNearBottomRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);

  const getScrollContainer = useCallback(() => scrollRef.current, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto", options?: { onlyIfPinned?: boolean }) => {
      if (!scrollRef.current) return;
      if (options?.onlyIfPinned && !pinnedRef.current) return;

      const { scrollHeight, scrollTop, clientHeight } = scrollRef.current;
      if (scrollTop > scrollHeight - clientHeight) return;

      programmaticScrollRef.current = true;
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior,
      });

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = window.setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 0);
    },
    []
  );

  const setPinToBottom = useCallback((pinned: boolean) => {
    pinnedRef.current = pinned;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getScrollContainer,
      scrollToBottom,
      setPinToBottom,
      innerRef,
    }),
    [getScrollContainer, scrollToBottom, setPinToBottom]
  );

  useLayoutEffect(() => {
    const container = scrollRef.current;
    const inner = innerRef.current;
    if (!container || !inner || pinToBottomConfig.disabled) return;

    const handleScroll = () => {
      if (programmaticScrollRef.current) return;

      const { scrollHeight, scrollTop, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const isAtBottom = Math.floor(distanceFromBottom) < 8;

      isNearBottomRef.current = isAtBottom;
      const isScrollingUp = scrollTop < lastScrollTopRef.current;
      lastScrollTopRef.current = scrollTop;

      if (!isAtBottom && isScrollingUp) {
        pinnedRef.current = false;
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToBottom();
    });

    container.addEventListener("scroll", handleScroll);
    resizeObserver.observe(inner);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [innerRef, pinToBottomConfig.disabled, scrollToBottom]);

  return (
    <div className={cn("u-hidden-scrollbar overflow-y-auto overflow-x-hidden", parentClassName)} ref={composedRef}>
      <div className={cn("relative w-full min-h-full", innerClassName)} ref={innerRef}>
        {children}
      </div>
    </div>
  );
}
