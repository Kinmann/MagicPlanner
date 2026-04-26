import React from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';

export type ViewType = 'dashboard' | 'project';

export default function App() {
  // Application entry point with React Router
  return <RouterProvider router={router} />;
}
