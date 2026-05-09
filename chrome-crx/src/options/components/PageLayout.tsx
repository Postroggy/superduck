import React from 'react';
import { useIntl } from 'react-intl';
import { cn } from '@/lib/utils';

interface PageContentProps {
  children: React.ReactNode;
  className?: string;
  narrow?: boolean;
}

const PageContent: React.FC<PageContentProps> = ({ children, className, narrow }) => (
  <main
    className={cn(
      'mx-auto mt-4 w-full flex-1 px-4 md:pl-8 lg:mt-6',
      narrow ? 'max-w-4xl' : 'max-w-7xl',
      className
    )}
  >
    {children}
  </main>
);

interface PageHeaderProps {
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  sticky?: boolean;
  fixed?: boolean;
  mdTitle?: string;
  large?: boolean;
  narrow?: boolean;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  children,
  className,
  contentClassName,
  sticky,
  fixed,
  mdTitle,
  large,
  narrow
}) => {
  const intl = useIntl();
  const isEmpty = !children && !mdTitle;
  const isLarge = large;

  return (
    <header
      className={cn(
        'flex w-full bg-bg-100',
        sticky && 'sticky top-0 z-header',
        fixed && 'fixed top-0 z-header',
        'h-12',
        isLarge && ['mx-auto md:h-24 md:items-end', narrow ? 'max-w-4xl' : 'max-w-7xl'],
        className
      )}
      aria-hidden={isEmpty}
    >
      <div
        className={cn(
          'flex w-full items-center justify-between gap-4',
          'pl-11 lg:pl-8',
          contentClassName,
          isLarge ? 'px-4 md:pl-8' : 'pr-3'
        )}
      >
        {mdTitle ? (
          <>
            <h1
              className={cn(
                'text-text-200 flex items-center gap-2 max-md:hidden min-w-0',
                'font-heading',
                isLarge ? 'text-2xl' : 'text-lg'
              )}
            >
              <span className="truncate">
                {mdTitle === 'Settings'
                  ? intl.formatMessage({ id: 'settings', defaultMessage: 'Settings' })
                  : mdTitle}
              </span>
            </h1>
            <div />
            {children}
          </>
        ) : (
          children
        )}
      </div>
    </header>
  );
};

interface NavItemProps {
  children: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  href?: string;
}

const NavItem: React.FC<NavItemProps> = ({ children, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'block w-full text-left whitespace-nowrap transition-all ease-in-out active:scale-95 cursor-pointer',
      'font-base rounded-lg px-3 py-3',
      isActive
        ? 'bg-bg-300 font-medium text-text-000'
        : 'text-text-200 hover:bg-bg-200 hover:text-text-100'
    )}
  >
    {children}
  </button>
);

export { NavItem, PageContent, PageHeader };
