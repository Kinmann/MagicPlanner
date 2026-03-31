import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { load, Store } from "@tauri-apps/plugin-store";
import { Key, CheckCircle2, AlertCircle, Loader2, Info, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import "./SetupPage.scss";

interface SetupPageProps {
  onComplete: () => void;
}

export default function SetupPage({ onComplete }: SetupPageProps) {
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
        // 백엔드 DB에도 저장
        await invoke("save_api_key", { apiKey });
        
        await store.set("gemini_api_key", { value: apiKey });
        await store.save();
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
        <div className="icon-wrapper">
          <Key size={32} />
        </div>
        
        <h1>Magic Planner 시작하기</h1>
        <p>AI 엔진을 구동하기 위해 Google Gemini API 키가 필요합니다.</p>

        <form onSubmit={handleValidate} className="setup-form">
          <label className="input-label">Gemini API Key</label>
          <div className="input-wrapper">
            <div className="input-icon">
              <Key size={18} />
            </div>
            <input 
              type="password" 
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isValidating}
              autoComplete="off"
            />
          </div>

          <AnimatePresence>
            {status === "error" && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="error-message"
              >
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMsg}</span>
              </motion.div>
            )}

            {status === "success" && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="error-message" 
                style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}
              >
                <CheckCircle2 size={16} className="shrink-0" />
                <span>API 키가 확인되었습니다.</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            type="submit" 
            disabled={isValidating || !apiKey.trim()}
            className="submit-button"
          >
            {isValidating ? (
              <>
                <Loader2 size={18} className="spinner" />
                <span>검증 중...</span>
              </>
            ) : (
              <>
                <Save size={18} />
                <span>설정 저장 및 시작</span>
              </>
            )}
          </button>
        </form>

        <div className="info-box">
          <h3>
            <Info size={14} />
            발급 안내
          </h3>
          <ul>
            <li>Google AI Studio에서 발급 가능합니다.</li>
            <li>`gemini-2.5-flash` 모델 권한이 필요합니다.</li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
