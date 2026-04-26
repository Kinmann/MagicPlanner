import React from 'react';
import { createBrowserRouter } from 'react-router';
import { RootLayout } from './pages/RootLayout';
import { Dashboard } from './components/Dashboard';
import { ProjectIDE } from './pages/ProjectIDE';
import { Settings } from './pages/Settings';
import { Profile } from './pages/Profile';
import { CreateProject } from './pages/CreateProject';
import { useNavigate } from 'react-router';

// Wrapper for Dashboard to provide navigation
function DashboardWrapper() {
  const navigate = useNavigate();
  return <Dashboard onOpenProject={(id) => navigate(`/project/${id}`)} />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardWrapper /> },
      { path: 'project/:id', element: <ProjectIDE /> },
      { path: 'settings', element: <Settings /> },
      { path: 'profile', element: <Profile /> },
      { path: 'create', element: <CreateProject /> },
    ],
  },
]);
