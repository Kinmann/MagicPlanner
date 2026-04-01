import { useState, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { motion, AnimatePresence } from "framer-motion";
import SetupPage from "./SetupPage";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import "./App.scss";

function App() {
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
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
        ) : !currentProjectId ? (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="page-wrapper">
            <Dashboard 
              onSelectProject={setCurrentProjectId} 
              onOpenSettings={() => setShowSettings(true)}
            />
          </motion.div>
        ) : (
          <motion.div key="workspace" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="page-wrapper">
            <Workspace 
              projectId={currentProjectId} 
              onBack={() => setCurrentProjectId(null)} 
              onOpenSettings={() => setShowSettings(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
