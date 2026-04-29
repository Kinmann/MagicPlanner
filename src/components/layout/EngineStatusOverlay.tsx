import React from "react";
import { Activity, Layers } from "lucide-react";
import { useEngineStore } from "../../store/engineStore";
import styles from "./EngineStatusOverlay.module.scss";

const NODE_TYPE_LABELS: Record<string, string> = {
  GPRD_Context_Goal: "Discovery Stage 1",
  GPRD_Capability_Actor: "Discovery Stage 2",
  GPRD_Architecture_Schema: "Discovery Stage 3",
  genesis_prd: "Genesis PRD",
  SAD_Global: "SAD Global",
  SAD_Module: "SAD Module",
  sad_global: "SAD Global",
  sad_module: "SAD Module",
  prd_module: "PRD",
  PRD: "PRD",
  FSD: "FSD",
  IA: "IA",
  ERD: "ERD",
  "User Flow": "User Flow",
  Wireframe: "Wireframe",
  API_Spec: "API Spec",
  TC: "TC",
};

const EngineStatusOverlay: React.FC = () => {
  const runningNodes = useEngineStore(state => state.runningNodes);

  if (runningNodes.length === 0) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <div className={styles.liveBadge}>
          <div className={styles.dot} />
          <span>LIVE ENGINE</span>
        </div>
        <span className={styles.title}>Orchestrating...</span>
        <Activity size={14} className="text-primary opacity-40" />
      </div>
      
      <div className={styles.list}>
        {runningNodes.map((node) => (
          <div key={node.nodeId} className={styles.item}>
            <div className={styles.projectInfo}>
              <span className={styles.projectTag}>{node.projectName}</span>
              <Layers size={10} className={styles.projectIcon} />
            </div>
            
            <div className={styles.divider} />
            
            <span className={styles.nodeName}>
              {NODE_TYPE_LABELS[node.nodeType] || node.nodeType}
            </span>
            
            <div className={styles.divider} />
            
            <span className={styles.action}>{node.lastAction || "Initializing..."}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EngineStatusOverlay;
