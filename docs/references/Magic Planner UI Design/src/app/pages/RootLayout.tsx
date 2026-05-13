import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { ActivityBar } from '../components/ActivityBar';
import { Header } from '../components/Header';
import { StatusBar } from '../components/StatusBar';
import { ViewType } from '../App';
import { LayoutProvider } from '../context/LayoutContext';

export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current view for ActivityBar styling
  let currentView: ViewType = 'dashboard';
  let activeProjectId: string | null = null;
  
  if (location.pathname.startsWith('/project/')) {
    currentView = 'project';
    activeProjectId = location.pathname.split('/')[2];
  }

  const handleViewChange = (view: ViewType) => {
    if (view === 'dashboard') navigate('/');
    // For switching to settings/profile, it's handled differently, but we can pass routing callbacks.
  };

  const handleOpenProject = (projectId: string) => {
    navigate(`/project/${projectId}`);
  };

  return (
    <LayoutProvider>
      <div className="flex flex-col h-screen w-screen bg-[#1e1e24] text-[#cccccc] font-sans overflow-hidden">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <ActivityBar 
            currentView={currentView} 
            onViewChange={handleViewChange} 
            activeProjectId={activeProjectId}
            onOpenProject={handleOpenProject}
          />
          
          {/* Main content area */}
          <Outlet />
        </div>
        <StatusBar />
      </div>
    </LayoutProvider>
  );
}
