import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Key, Sparkles, ArrowRight, ShieldCheck, Cpu, Info } from 'lucide-react';
import { safeInvoke, isTauri } from './utils/tauri';
import { useSettingsStore } from './store/settingsStore';
import styles from './SetupPage.module.scss';

interface SetupPageProps {
  onComplete: () => void;
  onBack?: () => void;
}

export const SetupPage: React.FC<SetupPageProps> = ({ onComplete, onBack }) => {
  const [key, setKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const setApiKeyInStore = useSettingsStore(state => state.setApiKey);

  useEffect(() => {
    async function init() {
      try {
        if (isTauri()) {
          const { load } = await import("@tauri-apps/plugin-store");
          const store = await load("settings.json");
          const savedKey = await store.get<{ value: string }>("gemini_api_key");
          if (savedKey) setKey(savedKey.value);
        } else {
          const savedKey = localStorage.getItem('gemini_api_key');
          if (savedKey) setKey(savedKey);
        }
      } catch (e) {
        console.error("Failed to load settings", e);
      }
    }
    init();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    setIsSaving(true);
    setErrorMsg(null);
    try {
      // 1. Backend Validation
      if (isTauri()) {
        const isValid = await safeInvoke<boolean>("validate_api_key", { apiKey: key.trim() });
        if (!isValid) {
          throw new Error("Invalid API key. Please check and try again.");
        }

        // 2. Persistent Storage (Tauri)
        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("settings.json");
        await store.set("gemini_api_key", { value: key.trim() });
        await store.save();
      }

      // Always save to localStorage for browser view support
      localStorage.setItem('gemini_api_key', key.trim());
      
      // 3. Local State Update
      setApiKeyInStore(key.trim());
      
      // 4. Navigation
      onComplete();
    } catch (err: any) {
      setErrorMsg(err.message || String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.setupPage}>
      <div className={styles.backgroundEffects}>
        <div className={styles.glow1} />
        <div className={styles.glow2} />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={styles.setupCard}
      >
        <div className={styles.header}>
          <div className={styles.logoWrapper}>
            <Sparkles className={styles.logoIcon} size={32} />
          </div>
          <h1 className={styles.title}>Initialize Magic Planner</h1>
          <p className={styles.subtitle}>
            To power the AI orchestration pipelines, a valid Google Gemini API key is required.
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label><Key size={14} /> Gemini API Key</label>
            <div className={styles.inputWrapper}>
              <input 
                type="password" 
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="AIzaSy..."
                required
              />
              <div className={styles.inputFocus} />
            </div>
            {errorMsg && <p className={styles.errorHint}>{errorMsg}</p>}
            <p className={styles.hint}>Your key is stored securely on your local device.</p>
          </div>

          <div className={styles.featureRow}>
            <div className={styles.feature}><Cpu size={14} /> <span>Smart Node Gen</span></div>
            <div className={styles.feature}><ShieldCheck size={14} /> <span>Local Isolation</span></div>
          </div>

          <button 
            type="submit" 
            className={styles.submitBtn}
            disabled={isSaving || !key.trim()}
          >
            {isSaving ? 'Validating...' : (onBack ? 'Update Configuration' : 'Get Started')} 
            {!isSaving && <ArrowRight size={18} />}
          </button>
        </form>

        {onBack && (
          <button className={styles.backLink} onClick={onBack}>
            Cancel and return
          </button>
        )}

        <div className={styles.guideBox}>
          <h3><Info size={14} /> Quick Guide</h3>
          <ul>
            <li>Acquire a key from Google AI Studio.</li>
            <li>Gemini 1.5 Flash or Pro recommended.</li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
};

export default SetupPage;
