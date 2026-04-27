import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings2, 
  Save, 
  Bell, 
  Shield, 
  Key, 
  Cpu, 
  Sparkles, 
  Info,
  ChevronRight,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { safeInvoke, isTauri } from './utils/tauri';
import { useSettingsStore } from './store/settingsStore';
import styles from './SetupPage.module.scss';

interface SetupPageProps {
  onComplete: () => void;
}

export const SetupPage: React.FC<SetupPageProps> = ({ onComplete }) => {
  const [key, setKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const setApiKeyInStore = useSettingsStore(state => state.setApiKey);

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);

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

  const handleTest = async () => {
    if (!key.trim()) return;
    setTestStatus('testing');
    setTestMessage(null);
    try {
      if (isTauri()) {
        const isValid = await safeInvoke<boolean>("validate_api_key", { apiKey: key.trim() });
        if (isValid) {
          setTestStatus('success');
          setTestMessage('API Key is valid. Connection successful.');
        } else {
          setTestStatus('error');
          setTestMessage('Invalid API Key. Please check and try again.');
        }
      } else {
        // Mock success for non-tauri (browser preview)
        setTimeout(() => {
          setTestStatus('success');
          setTestMessage('Browser mode: Connection simulation successful.');
        }, 800);
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.message || String(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;

    setIsSaving(true);
    setErrorMsg(null);
    try {
      if (isTauri()) {
        const isValid = await safeInvoke<boolean>("validate_api_key", { apiKey: key.trim() });
        if (!isValid) {
          throw new Error("Invalid API key. Please check and try again.");
        }

        const { load } = await import("@tauri-apps/plugin-store");
        const store = await load("settings.json");
        await store.set("gemini_api_key", { value: key.trim() });
        await store.save();
      }

      localStorage.setItem('gemini_api_key', key.trim());
      setApiKeyInStore(key.trim());
      onComplete();
    } catch (err: any) {
      setErrorMsg(err.message || String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.setupPage}>
      <div className={styles.container}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.titleSection}>
            <div className={styles.iconWrapper}>
              <Settings2 className={styles.primaryIcon} size={32} />
            </div>
            <div>
              <h1 className={styles.title}>Settings</h1>
              <p className={styles.subtitle}>Configure your Magic Planner environment and AI orchestration preferences.</p>
            </div>
          </div>
        </header>

        <div className={styles.content}>
          {/* AI Configuration Section */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <Cpu size={20} className={styles.sectionIcon} />
              AI Core Configuration
            </h2>
            <div className={styles.sectionBody}>
              <div className={styles.inputGroup}>
                <div className={styles.labelRow}>
                  <label><Key size={14} /> Gemini API Key</label>
                  <span className={styles.requiredBadge}>Required</span>
                </div>
                <div className={styles.inputWrapper}>
                  <input 
                    type="password" 
                    value={key}
                    onChange={(e) => {
                      setKey(e.target.value);
                      if (testStatus !== 'idle') setTestStatus('idle');
                    }}
                    placeholder="AIzaSy..."
                    required
                  />
                  <button 
                    type="button"
                    className={styles.testBtn}
                    onClick={handleTest}
                    disabled={testStatus === 'testing' || !key.trim()}
                  >
                    {testStatus === 'testing' ? (
                      <RefreshCw size={14} className={styles.spinning} />
                    ) : (
                      'Test'
                    )}
                  </button>
                  <div className={styles.inputFocus} />
                </div>
                {errorMsg && <p className={styles.errorMsg}>{errorMsg}</p>}
                <p className={styles.hint}>
                  Acquire your API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>.
                </p>
              </div>

              <div className={`${styles.testResultBox} ${styles[testStatus]}`}>
                {testStatus === 'idle' && (
                  <>
                    <Info size={16} />
                    <p>Enter your API key and click 'Test' to verify connection.</p>
                  </>
                )}
                {testStatus === 'testing' && (
                  <>
                    <RefreshCw size={16} className={styles.spinning} />
                    <p>Validating API key connection...</p>
                  </>
                )}
                {testStatus === 'success' && (
                  <>
                    <CheckCircle2 size={16} />
                    <p>{testMessage}</p>
                  </>
                )}
                {testStatus === 'error' && (
                  <>
                    <AlertCircle size={16} />
                    <p>{testMessage}</p>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Notifications Section (UI Placeholder) */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <Bell size={20} className={styles.sectionIcon} />
              Notifications
            </h2>
            <div className={styles.sectionBody}>
              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <p className={styles.settingLabel}>AI Node Generation Alerts</p>
                  <p className={styles.settingDesc}>Notify when the engine finishes generating complex SAD/PRD nodes.</p>
                </div>
                <div className={`${styles.toggle} ${styles.active}`}>
                  <div className={styles.toggleCircle} />
                </div>
              </div>
              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <p className={styles.settingLabel}>System Health Updates</p>
                  <p className={styles.settingDesc}>Receive alerts regarding pipeline execution errors or stalls.</p>
                </div>
                <div className={styles.toggle}>
                  <div className={styles.toggleCircle} />
                </div>
              </div>
            </div>
          </section>

          {/* Security & Privacy Section (UI Placeholder) */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <Shield size={20} className={styles.sectionIcon} />
              Privacy & Security
            </h2>
            <div className={styles.sectionBody}>
              <div className={styles.actionRow}>
                <button className={styles.secondaryBtn} type="button">
                  <Shield size={16} />
                  <span>Manage Data Isolation</span>
                </button>
                <p className={styles.settingDesc}>All project data and API keys are stored exclusively on your local device.</p>
              </div>
            </div>
          </section>

          {/* Save Action */}
          <div className={styles.footer}>
            <button 
              className={styles.saveBtn} 
              onClick={handleSubmit}
              disabled={isSaving || !key.trim() || testStatus !== 'success'}
            >
              {isSaving ? (
                <>Saving...</>
              ) : (
                <>
                  <Save size={18} />
                  <span>Save Preferences</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupPage;

