import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load, Store } from "@tauri-apps/plugin-store";
import { motion } from "framer-motion";
import Input from "./components/common/Input";
import Button from "./components/common/Button";
import "./SetupPage.scss";

interface SetupPageProps {
  onComplete: () => void;
  onBack?: () => void;
}

export default function SetupPage({ onComplete, onBack }: SetupPageProps) {
  const [apiKey, setApiKey] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [store, setStore] = useState<Store | null>(null);

  useEffect(() => {
    async function initStore() {
      const s = await load("settings.json");
      setStore(s);
      const savedKey = await s.get<{ value: string }>("gemini_api_key");
      if (savedKey) setApiKey(savedKey.value);
    }
    initStore();
  }, []);

  const handleValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;
    setIsValidating(true);
    setStatus("idle");
    
    try {
      const isValid = await invoke<boolean>("validate_api_key", { apiKey });
      if (isValid && store) {
        await invoke("save_api_key", { apiKey });
        await store.set("gemini_api_key", { value: apiKey });
        await store.save();
        
        // settingsStore 상태 즉시 업데이트
        const { useSettingsStore } = await import("./store/settingsStore");
        useSettingsStore.getState().setApiKey(apiKey);

        setStatus("success");
        setTimeout(onComplete, 1200);
      }
    } catch (e) {
      setStatus("error");
      setErrorMsg(String(e));
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="setup-container">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="setup-card"
      >
        <div className="setup-header">
          {onBack && (
            <button onClick={onBack} className="back-btn material-symbols-outlined" title="Back">
              arrow_back
            </button>
          )}
          <div className="icon-wrapper">
            <span className="material-symbols-outlined">key</span>
          </div>
        </div>
        
        <h1>{onBack ? "Gemini API Configuration" : "Initialize Engine"}</h1>
        <p>{onBack ? "Upgrade or reconfigure your orchestration engine's credentials." : "To power the AI orchestration pipelines, a valid Google Gemini API key is required."}</p>

        <form onSubmit={handleValidate} className="setup-form">
          <Input 
            type="password" 
            placeholder="AIzaSy... (Gemini API Key)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={isValidating}
            icon="vpn_key"
            error={status === "error" ? errorMsg : undefined}
            helperText={status === "success" ? "Key validated successfully." : undefined}
          />

          <Button 
            type="submit" 
            variant="primary" 
            size="lg"
            isLoading={isValidating}
            disabled={!apiKey.trim()}
          >
            {status === "success" ? "Authorized" : "Save & Initialize Pipeline"}
          </Button>
        </form>

        <div className="info-box">
          <h3>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>info</span>
            Quick Guide
          </h3>
          <ul>
            <li>Acquire from Google AI Studio.</li>
            <li>`gemini-1.5-flash` or higher required.</li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
