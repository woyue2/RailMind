import { useEffect } from 'react';

export const SYSTEM_BACK_EVENT = 'railmind:system-back';

type SystemBackEvent = CustomEvent<{ handled: boolean }>;

export const useSystemBack = (isActive: boolean, onBack: () => void) => {
  useEffect(() => {
    if (!isActive) return;

    const handleSystemBack = (event: Event) => {
      const backEvent = event as SystemBackEvent;
      if (backEvent.detail?.handled) return;
      backEvent.detail.handled = true;
      onBack();
    };

    window.addEventListener(SYSTEM_BACK_EVENT, handleSystemBack);
    return () => window.removeEventListener(SYSTEM_BACK_EVENT, handleSystemBack);
  }, [isActive, onBack]);
};
