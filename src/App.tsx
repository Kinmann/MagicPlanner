import { useState, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from 'zustand/react/shallow';
import SetupPage from "./SetupPage";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import PromptView from "./pages/PromptView";
import CreateProject from "./pages/CreateProject";
import RootLayout from "./components/layout/RootLayout";
import EngineStatusOverlay from "./components/layout/EngineStatusOverlay";
import CriticalErrorModal from "./components/Project/CriticalErrorModal";
import { Spinner } from "./components/ui/Spinner";
import { ProjectInfoModal } from "./components/Project/ProjectInfoModal";
import { useUIStore } from "./store/uiStore";

import { useEngineStore } from "./store/engineStore";
import { initProjectEventListeners } from "./store/projectStore";
import { initLogEventListeners } from "./store/logStore";
import "./App.scss";

function App() {
  // Event listeners initialization
  useEffect(() => {
    initProjectEventListeners();
    initLogEventListeners();
  }, []);

  const { 
    currentView, 
    currentProjectId, 
    viewingPromptProjectId, 
    isSettingsOpen,
    navigateTo,
    toggleSettings,
  } = useUIStore(useShallow(state => ({
    currentView: state.currentView,
    currentProjectId: state.currentProjectId,
    viewingPromptProjectId: state.viewingPromptProjectId,
    isSettingsOpen: state.isSettingsOpen,
    navigateTo: state.navigateTo,
    toggleSettings: state.toggleSettings,
  })));

  const { lastError, isErrorModalOpen, toggleErrorModal } = useEngineStore();

  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const isTauri = !!(window as any).__TAURI_INTERNALS__;
        if (isTauri) {
          const store = await load("settings.json");
          const apiKey = await store.get<{ value: string }>("gemini_api_key");
          setIsSetup(!!apiKey?.value);
        } else {
          const apiKey = localStorage.getItem('gemini_api_key');
          setIsSetup(!!apiKey);
        }
      } catch (e) {
        setIsSetup(false);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/30">
              <Spinner size={24} />
            </div>
            <span className="text-2xl font-black tracking-tighter text-white">
              MAGIC <span className="text-emerald-500">PLANNER</span>
            </span>
          </motion.div>
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: 200 }}
            className="h-0.5 bg-emerald-500/10 rounded-full overflow-hidden"
          >
            <motion.div 
              animate={{ x: [-200, 200] }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="h-full w-20 bg-emerald-500"
            />
          </motion.div>
        </div>
      </div>
    );
  }

  // Routing Logic
  const renderView = () => {
    // 1. Initial Setup (Full Screen)
    if (isSetup === false) {
      return (
        <motion.div key="initial-setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="page-wrapper">
          <SetupPage 
            onComplete={() => {
              setIsSetup(true);
              navigateTo('DASHBOARD');
            }} 
          />
        </motion.div>
      );
    }

    // 2. App Content (Inside RootLayout)
    const viewContent = (() => {
      // If settings is open, it takes precedence in the content area
      if (isSettingsOpen) {
        return (
          <motion.div key="settings" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="page-wrapper">
            <SetupPage 
              onComplete={() => {
                toggleSettings(false);
              }} 
            />
          </motion.div>
        );
      }

      switch (currentView) {
        case 'CREATE_PROJECT':
          return (
            <motion.div key="create-project" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="page-wrapper">
              <CreateProject />
            </motion.div>
          );
        
        case 'WORKSPACE':
          if (!currentProjectId) {
            navigateTo('DASHBOARD');
            return null;
          }
          return (
            <motion.div key="workspace" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="page-wrapper">
              <Workspace projectId={currentProjectId} />
            </motion.div>
          );

        case 'PROMPT_VIEW':
          if (!viewingPromptProjectId) {
            navigateTo('DASHBOARD');
            return null;
          }
          return (
            <motion.div key="prompt-view" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="page-wrapper">
              <PromptView projectId={viewingPromptProjectId} />
            </motion.div>
          );

        case 'DASHBOARD':
        default:
          return (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="page-wrapper">
              <Dashboard />
            </motion.div>
          );
      }
    })();

    return (
      <RootLayout>
        {viewContent}
      </RootLayout>
    );
  };

  return (
    <div className="app-container">
      <AnimatePresence mode="popLayout">
        {renderView()}
      </AnimatePresence>
      <EngineStatusOverlay />
      <CriticalErrorModal 
        isOpen={isErrorModalOpen} 
        onClose={() => toggleErrorModal(false)} 
        onRetry={() => toggleErrorModal(false)}
        onSettings={() => {
          toggleErrorModal(false);
          toggleSettings(true);
        }}
        errorInfo={lastError} 
      />
      <ProjectInfoModal />
    </div>

  );
}

export default App;
