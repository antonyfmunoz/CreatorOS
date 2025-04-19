import { useId } from 'react';
import { useAccessibility } from '@/hooks/use-accessibility';

export function SkipLinks() {
  const { state } = useAccessibility();
  const { enabled } = state;
  const id = useId();
  
  if (!enabled) return null;
  
  return (
    <div className="skip-links" role="navigation" aria-label="Skip links navigation">
      <a 
        href={`#main-content-${id}`} 
        className="skip-to-content" 
        id={`skip-to-content-${id}`}
      >
        Skip to main content
      </a>
      
      <a 
        href={`#navigation-${id}`} 
        className="skip-to-content" 
        id={`skip-to-nav-${id}`}
      >
        Skip to navigation
      </a>
      
      <a 
        href={`#search-${id}`} 
        className="skip-to-content" 
        id={`skip-to-search-${id}`}
      >
        Skip to search
      </a>
    </div>
  );
}

// Helper components to mark regions with skip link targets
export const MainContentRegion = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => {
  const id = useId();
  
  return (
    <main id={`main-content-${id}`} tabIndex={-1} className={className}>
      {children}
    </main>
  );
};

export const NavigationRegion = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => {
  const id = useId();
  
  return (
    <nav id={`navigation-${id}`} tabIndex={-1} className={className}>
      {children}
    </nav>
  );
};

export const SearchRegion = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => {
  const id = useId();
  
  return (
    <div id={`search-${id}`} tabIndex={-1} className={className}>
      {children}
    </div>
  );
};