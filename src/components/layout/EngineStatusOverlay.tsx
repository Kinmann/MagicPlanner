import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Spinner from "../common/Spinner";
import "./EngineStatusOverlay.scss";

interface ActiveNodeInfo {
  node_id: string;
  project_id: string;
  project_name: string;
  module_id: string | null;
  module_name: string | null;
  target_node_type: string;
  node_state: string;
  last_action: string | null;
}

const EngineStatusOverlay: React.FC = () => {
  const [activeNodes, setActiveNodes] = useState<ActiveNodeInfo[]>([]);
  
  const fetchActiveNodes = async () => {
    try {
      const result = await invoke<ActiveNodeInfo[]>("get_all_active_nodes");
      setActiveNodes(result);
    } catch (err) {
      console.error("Failed to fetch active nodes:", err);
    }
  };

  useEffect(() => {
    // 초기 로드 및 폴링
    fetchActiveNodes();
    const interval = setInterval(fetchActiveNodes, 3000);

    // 노드 업데이트 이벤트 수신 시 즉시 갱신
    const unlistenNodes = listen("nodes-updated", () => {
      fetchActiveNodes();
    });

    return () => {
      clearInterval(interval);
      unlistenNodes.then(fn => fn());
    };
  }, []);

  if (activeNodes.length === 0) return null;

  return (
    <div className="engine-status-overlay">
      <div className="status-row">
        <Spinner size="sm" />
        <span className="title">Engine Orchestrating...</span>
      </div>
      <div className="status-description custom-scrollbar">
        {activeNodes.map((node) => (
          <div key={node.node_id} className="status-item">
            <span className="project-tag">
              {node.project_name}
            </span>
            <span className="node-name">
              [{node.module_name || node.target_node_type}]
            </span>
            <span className="node-last-action">{node.last_action || "Initializing..."}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EngineStatusOverlay;
