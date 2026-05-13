import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LayoutContextType {
  isLeftSidebarOpen: boolean;
  isRightSidebarOpen: boolean;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  return (
    <LayoutContext.Provider value={{
      isLeftSidebarOpen,
      isRightSidebarOpen,
      toggleLeftSidebar: () => setIsLeftSidebarOpen(p => !p),
      toggleRightSidebar: () => setIsRightSidebarOpen(p => !p)
    }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}
