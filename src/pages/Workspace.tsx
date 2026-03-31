import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Store } from '@tauri-apps/plugin-store';
import { save } from '@tauri-apps/plugin-dialog';
import { DocumentNode } from '../types/project';
import PipelineBoard from '../components/Project/PipelineBoard';
import { LayoutDashboard, FileText, ChevronLeft, RefreshCw, AlertCircle, ExternalLink, Download } from 'lucide-react';
import { convertToMarkdown } from '../utils/markdownConverter';
import "./Workspace.scss";

interface WorkspaceProps {
  projectId: string;
  onBack: () => void;
}

const Workspace: React.FC<WorkspaceProps> = ({ projectId, onBack }) => {
  const [nodes, setNodes] = useState<DocumentNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<DocumentNode | null>(null);
  const [nodeContent, setNodeContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'BOARD' | 'CONTENT'>('BOARD');
  const [showApiErrorModal, setShowApiErrorModal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // 1. 노드 상태 데이터 초기 로드 및 폴링
  const fetchNodes = useCallback(async () => {
    try {
      const result = await invoke<DocumentNode[]>('get_project_nodes', { projectId });
      setNodes(result);
      
      // API 에러 체크 (하나라도 있으면 모달 노출)
      const hasApiError = result.some(n => n.node_state === 'PAUSED_API_ERROR');
      if (hasApiError) {
        setShowApiErrorModal(true);
      }

      // 만약 현재 보고 있는 노드가 있다면 업데이트
      if (selectedNode) {
        const updated = result.find(n => n.node_id === selectedNode.node_id);
        if (updated) setSelectedNode(updated);
      }
    } catch (err: any) {
      console.error("Failed to fetch nodes:", err);
    }
  }, [projectId, selectedNode]);

  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 3000); // 3초마다 상태 갱신
    
    // Tauri 이벤트 수신 (실시간 파이프라인 상태)
    const unlistenPromise = listen<string>('pipeline-status', (event) => {
      setStatusMessage(event.payload);
      // 5초 후 메시지 자동 초기화
      setTimeout(() => setStatusMessage(null), 5000);
    });

    return () => {
      clearInterval(interval);
      unlistenPromise.then(u => u());
    };
  }, [fetchNodes]);

  // 2. 파이프라인 실행 (개별 노드)
  const handleRunNode = async (nodeType: string) => {
    setLoading(true);
    setError(null);

    try {
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      
      if (!apiKeyValue?.value) {
        throw new Error("API 키가 설정되지 않았습니다. 설정 페이지로 돌아가주세요.");
      }

      await invoke<string>('run_pipeline', {
        projectId,
        nodeType,
        apiKey: apiKeyValue.value
      });
      
      // 실행 성공 시 즉시 갱신
      fetchNodes();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  // 3. HITL 액션 처리
  const handleHITLAction = async (nodeId: string, action: 'APPROVE' | 'RETRY') => {
    setLoading(true);
    try {
      await invoke('handle_hitl_action', { nodeId, action });
      fetchNodes();
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  // 4. 노드 결과 보기
  const handleViewNode = async (node: DocumentNode) => {
    setSelectedNode(node);
    setViewMode('CONTENT');
    setNodeContent(null); // 로딩 표시용

    try {
      const iteration = await invoke<any>('get_latest_iteration', { nodeId: node.node_id });
      if (iteration) {
        setNodeContent(iteration.generated_draft_json);
      } else {
        setNodeContent("생성된 내용이 없습니다.");
      }
    } catch (err: any) {
      setNodeContent("데이터를 불러오는 중 오류가 발생했습니다: " + err.toString());
    }
  };

  // 5. 마크다운 다운로드
  const handleDownload = async () => {
    if (!selectedNode || !nodeContent) return;

    try {
      const markdown = convertToMarkdown(selectedNode, nodeContent);
      const defaultPath = `${selectedNode.target_node_type}_spec.md`;
      
      const filePath = await save({
        defaultPath,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      });

      if (filePath) {
        await invoke('save_file', { path: filePath, contents: markdown });
        alert('파일이 성공적으로 저장되었습니다.');
      }
    } catch (err: any) {
      alert('파일 저장 중 오류가 발생했습니다: ' + err.toString());
    }
  };

  return (
    <div className="workspace-layout">
      {/* LNB (Side Navigation) */}
      <aside className="workspace-sidebar">
        <div className="sidebar-header">
          <div className="logo-section">
            <button 
              onClick={onBack}
              className="back-button"
            >
              <ChevronLeft size={20} />
            </button>
            <h2>Magic Planner</h2>
          </div>

          <nav className="sidebar-nav">
            <button 
              onClick={() => setViewMode('BOARD')}
              className={`nav-button ${viewMode === 'BOARD' ? 'active' : ''}`}
            >
              <LayoutDashboard size={18} />
              파이프라인 보드
            </button>
            <div className="nav-label">Documents</div>
            {nodes.map((node) => (
              <button
                key={node.node_id}
                onClick={() => handleViewNode(node)}
                disabled={node.node_state !== 'COMPLETED' && node.node_state !== 'PAUSED_HITL'}
                className={`doc-button ${selectedNode?.node_id === node.node_id && viewMode === 'CONTENT' ? 'selected' : ''}`}
              >
                <div className="doc-info">
                  <FileText size={16} />
                  {node.target_node_type}
                </div>
                {(node.node_state === 'IN_PROGRESS' || node.node_state === 'PAUSED_HITL') && (
                  <RefreshCw size={12} className={`status-icon spinning ${node.node_state === 'PAUSED_HITL' ? 'hitl' : 'progress'}`} />
                )}
              </button>
            ))}
          </nav>
        </div>

        <div style={{ marginTop: 'auto', padding: '1.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
           <div style={{ borderRadius: '0.75rem', backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '0.25rem' }}>Project ID</p>
              <p style={{ fontSize: '12px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{projectId}</p>
           </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="workspace-main">
        <AnimatePresence mode="wait">
          {viewMode === 'BOARD' ? (
            <motion.div 
              key="board"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="board-container"
            >
              <header className="content-header">
                <h1>프로젝트 파이프라인</h1>
                <p>기획 문서 생성 및 품질 검증 프로세스 상태를 모니터링합니다.</p>
              </header>

              {error && (
                <div style={{ marginBottom: '2rem', padding: '1rem', borderRadius: '0.75rem', backgroundColor: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.2)', color: '#f87171', fontSize: '0.875rem', display: 'flex', gap: '0.75rem' }}>
                  <span style={{ fontWeight: 800 }}>Error:</span>
                  {error}
                </div>
              )}

              <PipelineBoard 
                nodes={nodes} 
                onRunNode={handleRunNode} 
                onViewNode={handleViewNode}
                onHITLAction={handleHITLAction}
              />
            </motion.div>
          ) : (
            <motion.div 
              key="content"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="document-view"
            >
              <header>
                <div>
                  <div className="breadcrumb">
                    <span className="tag">DOCUMENT</span>
                    <span className="separator">/</span>
                    <span className="sub">{selectedNode?.target_node_type}</span>
                  </div>
                  <h1>{selectedNode?.target_node_type} 명세서</h1>
                </div>
                <div className="header-actions">
                   <button 
                    onClick={handleDownload}
                    className="download-btn"
                   >
                     <Download size={16} />
                     다운로드 (.md)
                   </button>
                   <div className="score-badge">
                      <p className="label">최고 점수</p>
                      <p className="value">{selectedNode?.current_best_score}</p>
                   </div>
                </div>
              </header>

              <div className="document-card">
                <pre>
                  {nodeContent || "데이터를 불러오는 중입니다..."}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global API Error Modal */}
        <AnimatePresence>
          {showApiErrorModal && (
            <div className="modal-overlay">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="api-error-modal"
              >
                <div className="error-icon">
                  <AlertCircle size={32} />
                </div>
                <h2>API 장애 발생</h2>
                <p>
                  Gemini API 호출 중 오류가 발생했습니다. API 키가 만료되었거나 할당량이 초과되었을 수 있습니다. 설정 페이지에서 API 키를 재설정해 주세요.
                </p>
                <div className="modal-actions">
                  <button 
                    onClick={() => {
                      setShowApiErrorModal(false);
                      const errorNode = nodes.find(n => n.node_state === 'PAUSED_API_ERROR');
                      if (errorNode) handleRunNode(errorNode.target_node_type);
                    }}
                    className="btn primary"
                  >
                    지금 재시도
                    <RefreshCw size={18} />
                  </button>
                  <button 
                    onClick={onBack}
                    className="btn secondary"
                  >
                    설정 페이지로 이동
                    <ExternalLink size={18} />
                  </button>
                  <button 
                    onClick={() => {
                      setShowApiErrorModal(false);
                      fetchNodes();
                    }}
                    className="btn secondary"
                  >
                    일단 닫기
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {loading && (
          <div className="engine-status" style={{ height: 'auto', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RefreshCw size={12} className="spinner" />
              엔진 구동 중...
            </div>
            {statusMessage && (
               <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '0.5rem', backgroundColor: 'rgba(0,0,0,0.5)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}
               >
                 {statusMessage}
               </motion.div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Workspace;
