import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/global.scss";
import App from "./App";
import { initProjectEventListeners } from './store/projectStore';
import { useEngineStore } from './store/engineStore';
import { useSettingsStore } from './store/settingsStore';

// Initialize global event listeners
initProjectEventListeners();
const engineStore = useEngineStore.getState();
engineStore.initEngineEventListeners();
engineStore.syncRunningNodes();

// Load global settings
useSettingsStore.getState().loadSettings();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
