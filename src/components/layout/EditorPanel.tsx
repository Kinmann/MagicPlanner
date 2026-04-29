import React from 'react';
import { 
  ChevronRight, 
  X, 
  Info, 
  Folder, 
  FileText, 
  Zap, 
  Play,
  RotateCcw,
  RefreshCw,
  Settings2,
  GitBranch,
  Lock,
  Sparkles,
  Square,
  Layers
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useEngineStore } from '../../store/engineStore';
import { useLogStore } from '../../store/logStore';
import { useCommentStore } from '../../store/commentStore';
import { mapNodesToTree, TreeItem } from '../../utils/treeMapper';
import { ErrorBoundary } from '../ui/Layout';
import { NodeRenderer } from '../Project/Renderer/NodeRenderer';
import { NodeActionHeader } from '../Project/NodeActionHeader';
import { CommentPopover } from '../ui/CommentPopover';
import { ReviewPopover } from '../ui/ReviewPopover';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog } from '../ui/Dialog';
import { MessageSquare, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import styles from './EditorPanel.module.scss';

export const EditorPanel: React.FC = () => {
  const [iterations, setIterations] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [iterToDelete, setIterToDelete] = React.useState<string | null>(null);
  const { 
    selectedNodeId, 
    openNodeIds, 
    setSelectedNode,
    closeTab,
    workspaceViewMode,
    selectedIterationId,
    setSelectedIteration,
    toggleProjectInfo,
    isRawMode,
    toggleRawMode
  } = useUIStore();
  
  const [isReviewOpen, setIsReviewOpen] = React.useState(false);

  
  const { 
    currentProject, 
    nodes, 
    runNode, 
    stopNode,
    updateMaxIterations,
    updateTargetCount,
    confirmGenesisIteration,
    unconfirmIteration,
    deleteIteration
  } = useProjectStore();
  
  const { isProcessing, isEmbedding, runningNodes } = useEngineStore();
  const { addLog } = useLogStore();
  const comments = useCommentStore(state => state.comments);

  const selectedNode = React.useMemo(() => {
    const node = nodes.find(n => n.node_id === selectedNodeId);
    if (node) return node;
    
    // Virtual Node (Folder/Phase)
    if (selectedNodeId?.startsWith('phase-') || selectedNodeId?.startsWith('group-') || selectedNodeId?.startsWith('stage-') || selectedNodeId?.startsWith('module-')) {
      return {
        node_id: selectedNodeId,
        target_node_type: selectedNodeId.split('-').slice(1).join(' ').toUpperCase(), // Fallback label
        node_category: 'Integrated View',
        node_state: 'COMPLETED',
        is_virtual: true
      } as any;
    }

    // Mock Node (Not created yet in DB)
    if (selectedNodeId?.startsWith('mock-')) {
      const mockType = selectedNodeId.replace('mock-', '');
      return {
        node_id: selectedNodeId,
        target_node_type: mockType,
        node_category: mockType.startsWith('SAD_') ? 'System Architecture' : 'Module Specification',
        node_state: 'READY',
        current_iteration: 0,
        max_iterations: 10,
        is_locked: false
      } as any;
    }
    return null;
  }, [selectedNodeId, nodes]);

  const openNodes = React.useMemo(() => {
    return openNodeIds.map(id => {
      const node = nodes.find(n => n.node_id === id);
      if (node) return node;
      
      if (id.startsWith('phase-') || id.startsWith('group-') || id.startsWith('stage-') || id.startsWith('module-')) {
        return {
          node_id: id,
          target_node_type: id.split('-').slice(1).join(' ').toUpperCase(),
          node_category: 'Integrated View',
          is_virtual: true
        } as any;
      }
      return null;
    }).filter(Boolean);
  }, [openNodeIds, nodes]);

  React.useEffect(() => {
    if (selectedNode && !selectedNode.is_virtual) {
      console.log(`>>> [EditorPanel] Selected Node: ${selectedNode.target_node_type}, Locked: ${selectedNode.is_locked}`);
    }
  }, [selectedNode]);

  React.useEffect(() => {
    if (selectedNodeId) {
      loadIterations();
    } else {
      setIterations([]);
    }
  }, [selectedNodeId, selectedNode?.current_iteration]);

  React.useEffect(() => {
    const unlisten = listen('nodes-updated', () => {
      if (selectedNodeId) {
        loadIterations();
        if (currentProject?.project_id) fetchNodes(currentProject.project_id);
      }
    });
    return () => {
      unlisten.then(f => f());
    };
  }, [selectedNodeId]);

  const goToNextNode = () => {
    const tree = mapNodesToTree(nodes, modules);
    const flatten = (items: TreeItem[]): string[] => {
      let ids: string[] = [];
      items.forEach(item => {
        ids.push(item.id);
        if (item.children) {
          ids = [...ids, ...flatten(item.children)];
        }
      });
      return ids;
    };
    
    const allIds = flatten(tree);
    const currentIndex = allIds.indexOf(selectedNodeId || '');
    if (currentIndex >= 0 && currentIndex < allIds.length - 1) {
      setSelectedNode(allIds[currentIndex + 1]);
    }
  };

  const handleStop = async () => {
    if (!selectedNodeId) return;
    try {
      await stopNode(selectedNodeId);
    } catch (e) {
      console.error("Failed to stop node:", e);
    }
  };

  React.useEffect(() => {
    const unlistenEvent = listen('pipeline-event', (event: any) => {
      const { node_id, state } = event.payload;
      if (node_id === selectedNodeId && state === 'PAUSED_HITL') {
        addLog('SUCCESS', `초안 생성 완료`, selectedNode?.target_node_type);
        loadIterations();
      }
    });

    const unlistenStatus = listen('pipeline-status', (event: any) => {
      const payload = event.payload;
      if (payload && typeof payload === 'object') {
        const status = payload.status || payload.event;
        const nodeId = payload.node_id || payload.nodeId;
        if ((status === 'ITERATION_COMPLETED' || status === 'iteration_completed' || payload.message?.includes('완료')) && nodeId === selectedNodeId) {
          loadIterations();
        }
      }
    });

    return () => {
      unlistenEvent.then(u => u());
      unlistenStatus.then(u => u());
    };
  }, [selectedNodeId, selectedNode]);

  const loadIterations = async () => {
    if (!selectedNodeId) return;
    setLoading(true);
    try {
      const iters = await invoke<any[]>('get_node_iterations', { nodeId: selectedNodeId });
      // 생성 일자(created_at) 기준으로 오름차순 정렬
      const sorted = [...iters].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setIterations(sorted);
      
      // Auto-select pass or latest if nothing selected
      if (!selectedIterationId) {
        const passIdx = sorted.findIndex(it => it.is_pass);
        const initial = passIdx >= 0 ? sorted[passIdx] : sorted[sorted.length - 1];
        if (initial) setSelectedIteration(initial.iteration_id);
      }
    } catch (e) {
      console.error("Failed to load iterations in EditorPanel:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmIteration = async (idx: number) => {
    const it = iterations[idx];
    if (!it || !currentProject) return;
    setLoading(true);
    try {
      if (it.is_pass) {
        addLog('WARN', `Unconfirming iteration - Iteration #${it.iteration_number}`, selectedNode?.target_node_type);
        await unconfirmIteration(it.iteration_id);
      } else {
        addLog('SUCCESS', `Confirming iteration - Iteration #${it.iteration_number}`, selectedNode?.target_node_type);
        await confirmGenesisIteration(it.iteration_id);
      }
      await loadIterations();
      // Ensure it stays selected
      setSelectedIteration(it.iteration_id);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteIteration = (iterId: string) => {
    setIterToDelete(iterId);
  };

  const confirmDelete = async () => {
    if (!iterToDelete || !currentProject) return;
    setLoading(true);
    try {
      await deleteIteration(iterToDelete);
      addLog('WARN', `Iteration deleted`, selectedNode?.target_node_type);
      await loadIterations();
      setSelectedIteration(null);
    } finally {
      setLoading(false);
      setIterToDelete(null);
    }
  };

  // Breadcrumb logic
  const renderBreadcrumb = () => {
    if (!selectedNode) return null;
    
    const isVirtual = (selectedNode as any).is_virtual;
    const label = isVirtual ? 
      (selectedNodeId === 'phase-gprd' ? 'Phase 1: Genesis PRD' : 
       selectedNodeId === 'phase-sad' ? 'Phase 2: System Architecture' :
       selectedNodeId?.startsWith('group-') ? 'Stage Context' :
       selectedNodeId?.startsWith('module-') ? 'Module Specification' : selectedNode.target_node_type) 
      : selectedNode.target_node_type;

    return (
      <div className={styles.breadcrumb}>
        <span className={styles.breadcrumbItem}>{currentProject?.project_name || 'Project'}</span>
        <ChevronRight size={12} className={styles.breadcrumbSep} />
        <span className={styles.breadcrumbItem}>
          <Folder size={12} className="opacity-60" />
          {selectedNode.node_category}
        </span>
        <ChevronRight size={12} className={styles.breadcrumbSep} />
        <span className={`${styles.breadcrumbItem} ${styles.active}`}>
          {isVirtual ? <Sparkles size={12} className="text-primary" /> : <FileText size={12} className="opacity-60" />}
          {label}
        </span>
        
        <button 
          className={styles.reviewBtn}
          onClick={() => setIsReviewOpen(true)}
        >
          <MessageSquare size={12} />
          <span>Review</span>
          {comments.length > 0 && (
            <span className={styles.reviewBtnCount}>{comments.length}</span>
          )}
          {selectedNode?.node_state === 'PAUSED_HITL' && (
            <span className={styles.reviewBadge} />
          )}
        </button>
      </div>
    );
  };

  const renderHeaderRow = () => {
    if (!selectedNode) return null;

    const isVirtual = (selectedNode as any).is_virtual;

    if (isVirtual) {
      const title = selectedNodeId === 'phase-gprd' ? 'Phase 1: Genesis PRD' : 
                    selectedNodeId === 'phase-sad' ? 'Phase 2: System Architecture' : 
                    selectedNode.target_node_type;
      return (
        <div className={styles.headerRow}>
          <div className={styles.headerMain}>
            <div className={styles.headerInfo}>
              <h1>
                <Sparkles size={24} className="text-primary" />
                {title}
              </h1>
              <p className="text-sm opacity-50 font-medium">
                Integrated view of all completed specifications in this section.
              </p>
            </div>
          </div>
        </div>
      );
    }

    const getIcon = () => {
      const type = selectedNode.target_node_type;
      if (type === 'Genesis_PRD' || type.startsWith('GPRD_')) return <FileText size={24} />;
      if (type === 'SAD_Global' || type === 'SAD_Module') return <GitBranch size={24} />;
      return <Zap size={24} />;
    };

    const isRunning = selectedNode.node_state === 'IN_PROGRESS' || selectedNode.is_active;
    const hasPassedIter = (selectedNode.current_best_score > 0) || iterations.some(it => it.is_pass);
    const isCompleted = selectedNode.node_state === 'COMPLETED';

    const runningNode = runningNodes.find(n => n.nodeId === selectedNode.node_id);
    const isStopping = !!runningNode?.lastAction?.includes('종료 중');

    const isMaxReached = selectedNode.current_iteration >= selectedNode.max_iterations;
    const isDagLocked = selectedNode.is_locked;
    const isExecutionDisabled = isEmbedding || isRunning || loading || isDagLocked || isStopping || (!isCompleted && isMaxReached);

    return (
      <div className={styles.headerRow}>
        <div className={styles.headerMain}>
          <div className={styles.headerInfo}>
            <h1>
              <FileText size={24} className="text-[#10b981]" />
              {selectedNode.target_node_type}
            </h1>
            <p className="text-sm opacity-50 font-medium">
              Document node for detailed technical specification.
            </p>
          </div>

          {/* Determine if stopping */}
          {(() => {
            return (
              <div className={styles.controls}>
                {selectedNode.target_node_type === 'SAD_Module_List' && (
                  <div className={styles.iterationBox} style={{ marginRight: '8px' }}>
                    <Layers size={14} className={styles.label} />
                    <span className={styles.label}>Modules</span>
                    <div className={styles.controlGroup}>
                      <input 
                        type="number" 
                        value={selectedNode.target_count || 5} 
                        onChange={(e) => updateTargetCount(selectedNode.node_id, parseInt(e.target.value) || 1)}
                        min={1}
                        max={20}
                        title="생성할 모듈 개수를 지정합니다."
                      />
                    </div>
                  </div>
                )}
                <div className={styles.iterationBox}>
                  <Settings2 size={14} className={styles.label} />
                  <span className={styles.label}>Iteration</span>
                  <div className={styles.controlGroup}>
                    <span className={styles.current}>{selectedNode.current_iteration}</span>
                    <span className={styles.sep}>/</span>
                    <input 
                      type="number" 
                      value={selectedNode.max_iterations} 
                      onChange={(e) => updateMaxIterations(selectedNode.node_id, parseInt(e.target.value) || 1)}
                      min={1}
                      max={10}
                    />
                  </div>
                </div>

                <div className={styles.actionGroup}>
                  <button 
                    className={styles.startBtn}
                    onClick={() => {
                      addLog('INFO', `Starting node execution`, selectedNode.target_node_type);
                      runNode(selectedNode.node_id);
                    }}
                    // isProcessing(글로벌 잠금)을 제거하여 병렬 노드 실행 허용
                    // DAG 의존성 및 최대 반복 횟수 도달 시 처리
                    disabled={isExecutionDisabled}
                  >
                    {isDagLocked ? (
                      <Lock size={16} />
                    ) : isRunning ? (
                      <RotateCcw size={16} className="animate-spin" />
                    ) : isCompleted ? (
                      <RefreshCw size={16} />
                    ) : (
                      <Play size={16} fill="currentColor" />
                    )}
                    <span>{isDagLocked ? 'Locked' : (isRunning ? 'Running' : (isCompleted ? 'Regenerate' : 'Start'))}</span>
                  </button>

                  {isRunning && (
                    <button 
                      className={styles.stopBtn}
                      onClick={handleStop}
                      disabled={isStopping}
                      style={isStopping ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                    >
                      <Square size={16} />
                      <span>{isStopping ? 'Stopping...' : 'Stop'}</span>
                    </button>
                  )}
                </div>

                {hasPassedIter && !isCompleted && (
                  <button 
                    className={styles.nextStepBtn}
                    onClick={async () => {
                      addLog('SUCCESS', `Approving node and moving to next step`, selectedNode.target_node_type);
                      const store = useProjectStore.getState();
                      if (selectedNode.target_node_type === 'GPRD_Architecture_Schema') {
                        await store.approveGenesisPrd();
                      } else if (selectedNode.target_node_type.startsWith('SAD_')) {
                        await store.approveSadNode(selectedNode.node_id);
                      } else if (selectedNode.node_category === 'MODULE') {
                        await store.handleHITLAction(selectedNode.node_id, 'APPROVE');
                      } else {
                        await store.approveGenesisNode(selectedNode.node_id);
                      }
                      goToNextNode();
                    }}
                    disabled={loading}
                  >
                    <span>Next Step</span>
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* Drafts Section Integrated into Header */}
        {iterations.length > 0 && (
          <div className={styles.draftsWrapper}>
            <NodeActionHeader 
              iterations={iterations}
              selectedIterationId={selectedIterationId}
              onSelectIteration={setSelectedIteration}
              onConfirmIteration={(id) => {
                const idx = iterations.findIndex(it => it.iteration_id === id);
                if (idx >= 0) handleConfirmIteration(idx);
              }}
              onDeleteIteration={handleDeleteIteration}
              isRawMode={isRawMode}
              onToggleRawMode={toggleRawMode}
              isLocked={selectedNode.is_locked}
              title={selectedNode.target_node_type}
              countLabel="Draft"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.editorPanel}>
      {/* Tab Bar */}
      <div className={styles.tabs}>
        <div className={`${styles.tabList} tab-scrollbar`}>
          {openNodes.map((node) => (
            node && (
                <div 
                  key={node.node_id}
                  className={`${styles.tab} ${selectedNodeId === node.node_id ? styles.active : ''}`}
                  onClick={() => setSelectedNode(node.node_id)}
                >
                  {(node as any).is_virtual ? <Sparkles size={14} className={selectedNodeId === node.node_id ? 'text-primary' : 'opacity-70'} /> : <FileText size={14} className={selectedNodeId === node.node_id ? 'text-[#10b981]' : 'opacity-70'} />}
                  <span className={styles.tabTitle}>
                    {(node as any).is_virtual ? 
                      (node.node_id === 'phase-gprd' ? 'Genesis PRD' : 
                       node.node_id === 'phase-sad' ? 'System Architecture' : node.target_node_type) 
                      : node.target_node_type}
                  </span>
                  <div 
                    className={styles.closeTabBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(node.node_id);
                    }}
                  >
                    <X size={12} />
                  </div>
                </div>
            )
          ))}
        </div>
        
        <div className={styles.headerActions}>
          <div className={styles.projectInfoBtn} onClick={() => {
            addLog('INFO', `Viewing project info: ${currentProject?.project_name}`);
            toggleProjectInfo(true);
          }}>
            <Info size={14} />
            <span>Project Info</span>
          </div>

        </div>
      </div>

      {/* Toolbar / Breadcrumb */}
      <div className={styles.toolbar}>
        {renderBreadcrumb()}
      </div>

      {/* Main Content Area */}
      <div className={styles.content}>
        {workspaceViewMode === 'BOARD' || !selectedNodeId ? (
          <div className={styles.emptyState}>
            <div className={styles.logoWatermark}>MAGIC PLANNER</div>
            <p>프로젝트를 선택하고 보드 또는 노드를 확인하세요.</p>
          </div>
        ) : (
          <>
            <div className={styles.scrollContainer}>
              {renderHeaderRow()}
              <div className={styles.contentWrapper}>
                <ErrorBoundary>
                  <NodeRenderer />
                </ErrorBoundary>
              </div>
            </div>
          </>
        )}
      </div>
      {/* 삭제 확인 모달 (IDE Style) */}
      <Dialog
        isOpen={!!iterToDelete}
        onClose={() => setIterToDelete(null)}
        title="Confirm Delete"
        size="sm"
      >
        <div className={styles.confirmModal}>
          <p className={styles.message}>
            This iteration will be permanently removed. This action cannot be undone and may affect the project's dependency graph.
          </p>
          <div className={styles.actions}>
            <button 
              onClick={() => setIterToDelete(null)}
              className={styles.cancelBtn}
            >
              Cancel
            </button>
            <button 
              onClick={confirmDelete}
              className={styles.deleteBtn}
            >
              Delete Iteration
            </button>
          </div>
        </div>
      </Dialog>
      <AnimatePresence>
        {isReviewOpen && selectedNode && (
          <ReviewPopover 
            nodeId={selectedNode.node_id}
            iterationId={iterations.find(it => it.is_pass || it.iteration_id === selectedIterationId)?.iteration_id || ''}
            onClose={() => setIsReviewOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default EditorPanel;
