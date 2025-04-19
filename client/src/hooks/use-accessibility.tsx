import React, { createContext, useContext, useState, useEffect } from 'react';

type AccessibilityLevel = 'standard' | 'enhanced' | 'maximum';
type TextSize = 'normal' | 'large' | 'extra-large';
type ContrastMode = 'normal' | 'high' | 'maximum';

interface AccessibilityState {
  enabled: boolean;
  textSize: TextSize;
  highContrast: ContrastMode;
  reduceMotion: boolean;
  screenReaderOptimized: boolean;
  accessibilityLevel: AccessibilityLevel;
}

interface AccessibilityContextType {
  state: AccessibilityState;
  toggleAccessibilityMode: () => void;
  setTextSize: (size: TextSize) => void;
  setHighContrast: (mode: ContrastMode) => void;
  toggleReduceMotion: () => void;
  toggleScreenReaderOptimized: () => void;
  setAccessibilityLevel: (level: AccessibilityLevel) => void;
  resetToDefaults: () => void;
}

const defaultState: AccessibilityState = {
  enabled: false,
  textSize: 'normal',
  highContrast: 'normal',
  reduceMotion: false,
  screenReaderOptimized: false,
  accessibilityLevel: 'standard',
};

// Create context with defaults
const AccessibilityContext = createContext<AccessibilityContextType>({
  state: defaultState,
  toggleAccessibilityMode: () => {},
  setTextSize: () => {},
  setHighContrast: () => {},
  toggleReduceMotion: () => {},
  toggleScreenReaderOptimized: () => {},
  setAccessibilityLevel: () => {},
  resetToDefaults: () => {},
});

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  // Try to load settings from localStorage or use defaults
  const [state, setState] = useState<AccessibilityState>(() => {
    const savedSettings = localStorage.getItem('accessibility-settings');
    return savedSettings ? JSON.parse(savedSettings) : defaultState;
  });

  // Store settings in localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('accessibility-settings', JSON.stringify(state));
    
    // Apply CSS classes to the root element based on accessibility settings
    const root = document.documentElement;
    
    // Text size classes
    root.classList.remove('text-size-normal', 'text-size-large', 'text-size-extra-large');
    root.classList.add(`text-size-${state.textSize}`);
    
    // Contrast mode classes
    root.classList.remove('contrast-normal', 'contrast-high', 'contrast-maximum');
    root.classList.add(`contrast-${state.highContrast}`);
    
    // Reduce motion class
    if (state.reduceMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
    
    // Screen reader optimized class
    if (state.screenReaderOptimized) {
      root.classList.add('screen-reader-optimized');
    } else {
      root.classList.remove('screen-reader-optimized');
    }
    
    // Apply accessibility level
    root.dataset.accessibilityLevel = state.accessibilityLevel;
    
    // Main enabled/disabled state
    if (state.enabled) {
      root.classList.add('accessibility-mode');
    } else {
      root.classList.remove('accessibility-mode');
    }
  }, [state]);

  const toggleAccessibilityMode = () => {
    setState(prev => ({
      ...prev,
      enabled: !prev.enabled
    }));
  };

  const setTextSize = (textSize: TextSize) => {
    setState(prev => ({
      ...prev,
      textSize
    }));
  };

  const setHighContrast = (highContrast: ContrastMode) => {
    setState(prev => ({
      ...prev,
      highContrast
    }));
  };

  const toggleReduceMotion = () => {
    setState(prev => ({
      ...prev,
      reduceMotion: !prev.reduceMotion
    }));
  };

  const toggleScreenReaderOptimized = () => {
    setState(prev => ({
      ...prev,
      screenReaderOptimized: !prev.screenReaderOptimized
    }));
  };

  const setAccessibilityLevel = (accessibilityLevel: AccessibilityLevel) => {
    // Apply preset combinations based on level
    switch (accessibilityLevel) {
      case 'standard':
        setState(prev => ({
          ...prev,
          accessibilityLevel,
          textSize: 'normal',
          highContrast: 'normal',
          reduceMotion: false,
          screenReaderOptimized: false
        }));
        break;
      case 'enhanced':
        setState(prev => ({
          ...prev,
          accessibilityLevel,
          textSize: 'large',
          highContrast: 'high',
          reduceMotion: true,
          screenReaderOptimized: false
        }));
        break;
      case 'maximum':
        setState(prev => ({
          ...prev,
          accessibilityLevel,
          textSize: 'extra-large',
          highContrast: 'maximum',
          reduceMotion: true,
          screenReaderOptimized: true
        }));
        break;
    }
  };

  const resetToDefaults = () => {
    setState(defaultState);
  };

  return (
    <AccessibilityContext.Provider
      value={{
        state,
        toggleAccessibilityMode,
        setTextSize,
        setHighContrast,
        toggleReduceMotion,
        toggleScreenReaderOptimized,
        setAccessibilityLevel,
        resetToDefaults
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export const useAccessibility = () => useContext(AccessibilityContext);