import { useState, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { motion, AnimatePresence } from "framer-motion";
import { useShallow } from 'zustand/react/shallow';
import SetupPage from "./SetupPage";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import PromptView from "./pages/PromptView";
import CreateProject from "./pages/CreateProject";
import EngineStatusOverlay from "./components/layout/EngineStatusOverlay";
import RagErrorModal from "./components/common/RagErrorModal";
import { useUIStore } from "./store/uiStore";
import { useEngineStore } from "./store/engineStore";
import "./App.scss";

function App() {
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
        const store = await load("settings.json");
        const apiKey = await store.get<{ value: string }>("gemini_api_key");
        setIsSetup(!!apiKey);
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
      <div className="loading-screen">
        <motion.div 
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="loading-text"
        >
          MAGIC PLANNER_
        </motion.div>
      </div>
    );
  }

  // Routing Logic
  const renderView = () => {
    if (!isSetup || isSettingsOpen) {
      return (
        <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="page-wrapper">
          <SetupPage 
            onComplete={() => {
              setIsSetup(true);
              toggleSettings(false);
              navigateTo('DASHBOARD');
            }} 
            onBack={isSetup ? () => toggleSettings(false) : undefined}
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
  };

  return (
    <div className="app-container">
      <AnimatePresence mode="popLayout">
        {renderView()}
      </AnimatePresence>
      <EngineStatusOverlay />
      <RagErrorModal 
        isOpen={isErrorModalOpen} 
        onClose={() => toggleErrorModal(false)} 
        errorInfo={lastError} 
      />
    </div>
  );
}

export default App;
