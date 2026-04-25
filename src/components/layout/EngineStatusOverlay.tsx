import React from "react";
import { useEngineStore } from "../../store/engineStore";
import "./EngineStatusOverlay.scss";

const NODE_TYPE_LABELS: Record<string, string> = {
  // Genesis PRD Stages
  GPRD_Context_Goal: "Stage 1: Context & Goal",
  GPRD_Capability_Actor: "Stage 2: Capability & Actor",
  GPRD_Architecture_Schema: "Stage 3: Arch & Schema",
  genesis_prd: "Genesis PRD",
  
  // SAD Stages
  SAD_Global: "SAD-Global Context",
  SAD_Module: "SAD-Module Split",
  sad_global: "SAD-Global Context",
  sad_module: "SAD-Module Split",
  
  // Module Nodes
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
    <div className="engine-status-overlay">
      <div className="status-row">
        <div className="status-badge-inline animate-pulse">LIVE</div>
        <div className="title-group">
          <span className="title">Engine Orchestrating...</span>
        </div>
      </div>
      <div className="status-description custom-scrollbar">
        {runningNodes.map((node) => (
          <div key={node.nodeId} className="status-item">
            <span className="project-tag">
              {node.projectName}
            </span>
            <span className="node-name">
              [{NODE_TYPE_LABELS[node.nodeType] || node.nodeType}]
            </span>
            <span className="node-last-action">{node.lastAction || "Initializing..."}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EngineStatusOverlay;
