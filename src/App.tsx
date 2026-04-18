import { useState, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { motion, AnimatePresence } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import { message } from "@tauri-apps/plugin-dialog";
import SetupPage from "./SetupPage";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import PromptView from "./pages/PromptView";
import CreateProject from "./pages/CreateProject";
import EngineStatusOverlay from "./components/layout/EngineStatusOverlay";
import RagErrorModal from "./components/common/RagErrorModal";
import "./App.scss";

interface RagErrorInfo {
  project_id: string;
  node_id: string;
  node_type: string;
  error_message: string;
}

function App() {
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [viewingPromptProjectId, setViewingPromptProjectId] = useState<string | null>(null);

  // RAG Error state
  const [ragError, setRagError] = useState<RagErrorInfo | null>(null);
  const [isRagModalOpen, setIsRagModalOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

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

  useEffect(() => {
    const unlisten = listen<RagErrorInfo>("rag-error", (event) => {
      setRagError(event.payload);
      setIsRagModalOpen(true);
    });
    return () => {
      unlisten.then(f => f());
    };
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

  return (
    <div className="app-container">
      <AnimatePresence mode="wait">
        {(!isSetup || showSettings) ? (
          <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="page-wrapper">
            <SetupPage 
              onComplete={() => {
                setIsSetup(true);
                setShowSettings(false);
              }} 
              onBack={isSetup ? () => setShowSettings(false) : undefined}
            />
          </motion.div>
        ) : isCreatingProject ? (
          <motion.div key="create-project" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="page-wrapper">
             <CreateProject 
               onBack={() => setIsCreatingProject(false)} 
               onSuccess={(projectId: string) => {
                 setIsCreatingProject(false);
                 setCurrentProjectId(projectId);
               }}
             />
          </motion.div>
        ) : !currentProjectId ? (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="page-wrapper">
            <Dashboard 
              onSelectProject={setCurrentProjectId} 
              onOpenSettings={() => setShowSettings(true)}
              onCreateProject={() => setIsCreatingProject(true)}
            />
          </motion.div>
        ) : viewingPromptProjectId ? (
          <motion.div key="prompt-view" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="page-wrapper">
            <PromptView 
              projectId={viewingPromptProjectId} 
              onBack={() => setViewingPromptProjectId(null)} 
              onHome={() => {
                setViewingPromptProjectId(null);
                setCurrentProjectId(null);
              }}
            />
          </motion.div>
        ) : (
          <motion.div key="workspace" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="page-wrapper">
            <Workspace 
              projectId={currentProjectId} 
              onBack={() => setCurrentProjectId(null)} 
              onOpenSettings={() => setShowSettings(true)}
              onViewPrompt={() => setViewingPromptProjectId(currentProjectId)}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <EngineStatusOverlay />
      <RagErrorModal 
        isOpen={isRagModalOpen} 
        onClose={() => setIsRagModalOpen(false)} 
        errorInfo={ragError} 
      />
    </div>
  );
}

export default App;
