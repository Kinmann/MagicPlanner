import React, { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { 
  Info, Calendar, Hash, Tag, Activity, DollarSign, Clock, Zap,
  MessageSquare, Sparkles, Send, Trash2, Check, ChevronDown, 
  Cpu, AlertCircle, Layers, Target, ChevronRight, X, Loader2, Box,
  RotateCcw, Eye
} from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useRefinementStore, RefinementMessage } from '../../store/refinementStore';
import { Accordion } from '../ui/Card';
import { LineChart } from '../ui/Chart';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { ImpactReportModal } from '../Project/ImpactReportModal';
import styles from './RightPanel.module.scss';

export const RightPanel: React.FC = () => {
  const { selectedNodeId } = useUIStore();
  const { nodes, currentProject } = useProjectStore();
  const { 
    messages, mode, setMode, isLoading, step, requestText, setRequestText,
    startAnalysis, confirmRouting, approveValidation, confirmTaintCascade, finalizeRefinement, cancelRefinement,
    comments, selectedCommentIds, toggleComment, reset, statusMessages,
    isCommentsListVisible, toggleCommentsList, fetchComments, initListeners
  } = useRefinementStore();

  const selectedNode = nodes.find(n => n.node_id === selectedNodeId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, statusMessages]);

  // Fetch comments when switching to refinement mode or when project changes
  useEffect(() => {
    if (mode === 'REFINEMENT' && currentProject) {
      fetchComments(currentProject.project_id);
    }
  }, [mode, currentProject?.project_id]);

  // Initialize refinement listeners
  useEffect(() => {
    if (currentProject) {
      const unlistenPromise = initListeners(currentProject.project_id);
      return () => {
        unlistenPromise.then(f => f());
      };
    }
  }, [currentProject?.project_id, initListeners]);

  const handleSend = () => {
    if (currentProject) {
      startAnalysis(currentProject.project_id);
    }
  };

  const handleReset = () => {
    reset();
  };

  return (
    <div className={styles.rightPanel}>
      <div className={styles.tabs}>
        <div 
          className={`${styles.tab} ${mode === 'PROPERTIES' ? styles.active : ''}`}
          onClick={() => setMode('PROPERTIES')}
        >
          <Tag size={12} />
          Properties
        </div>
        <div 
          className={`${styles.tab} ${mode === 'REFINEMENT' ? styles.active : ''}`}
          onClick={() => setMode('REFINEMENT')}
        >
          <Sparkles size={12} />
          Refine
        </div>
      </div>

      <div className={styles.content}>
        {mode === 'PROPERTIES' ? (
          <PropertiesView selectedNode={selectedNode} />
        ) : (
          <RefinementView 
            messages={messages}
            scrollRef={scrollRef}
            isLoading={isLoading}
            step={step}
            requestText={requestText}
            setRequestText={setRequestText}
            onSend={handleSend}
            onReset={handleReset}
            projectId={currentProject?.project_id}
            comments={comments}
            selectedCommentIds={selectedCommentIds}
            toggleComment={toggleComment}
            statusMessages={statusMessages}
            confirmRouting={confirmRouting}
            approveValidation={approveValidation}
            confirmTaintCascade={confirmTaintCascade}
            finalizeRefinement={finalizeRefinement}
            cancelRefinement={cancelRefinement}
            isCommentsListVisible={isCommentsListVisible}
            toggleCommentsList={toggleCommentsList}
            targetNodes={useRefinementStore.getState().targetNodes}
            taintCascadeResult={useRefinementStore.getState().taintCascadeResult}
          />
        )}
      </div>
    </div>
  );
};

// --- Sub-components ---

const PropertiesView = ({ selectedNode }: any) => {
  const { archivedIterations, fetchArchivedIterations, restoreIteration, deleteIteration } = useProjectStore();
  const [isArchivedLoading, setIsArchivedLoading] = useState(false);

  useEffect(() => {
    if (selectedNode?.node_id) {
      loadArchived();
    }
  }, [selectedNode?.node_id]);

  useEffect(() => {
    const unlisten = listen('nodes-updated', () => {
      if (selectedNode?.node_id) {
        loadArchived();
      }
    });
    return () => {
      unlisten.then(f => f());
    };
  }, [selectedNode?.node_id]);

  const loadArchived = async () => {
    if (!selectedNode) return;
    setIsArchivedLoading(true);
    try {
      await fetchArchivedIterations(selectedNode.node_id);
    } finally {
      setIsArchivedLoading(false);
    }
  };

  if (!selectedNode) {
    return (
      <div className={styles.emptyState}>
        <Info size={32} />
        <p>Select a node to view properties</p>
      </div>
    );
  }

  const mockHistory = [
    { x: 1, y: 45 }, { x: 2, y: 52 }, { x: 3, y: 48 },
    { x: 4, y: 65 }, { x: 5, y: 72 }, { x: 6, y: selectedNode.current_best_score || 0 }
  ];

  return (
    <div className={styles.properties}>
      <Accordion title="General Info" defaultOpen>
        <PropertyItem icon={<Hash size={14}/>} label="Node ID" value={selectedNode.node_id} />
        <PropertyItem 
          icon={<Activity size={14}/>} 
          label="Status" 
          value={
            <Badge variant={selectedNode.node_state === 'COMPLETED' ? 'success' : 'primary'}>
              {selectedNode.node_state}
            </Badge>
          } 
        />
        <PropertyItem icon={<Calendar size={14}/>} label="Created" value={new Date(selectedNode.created_at).toLocaleDateString()} />
      </Accordion>

      <Accordion title="Performance & Scoring" defaultOpen>
        <div className={styles.scoreSection}>
          <div className={styles.scoreHeader}>
            <span className={styles.scoreLabel}>Best Score</span>
            <span className={styles.scoreValue}>{selectedNode.current_best_score.toFixed(1)}</span>
          </div>
          <div className={styles.chartArea}>
            <LineChart data={mockHistory} height={60} />
          </div>
        </div>
        <PropertyItem icon={<Zap size={14}/>} label="Iterations" value={`${selectedNode.current_iteration} / ${selectedNode.max_iterations}`} />
      </Accordion>

      <Accordion title={`Archived Drafts (${archivedIterations.length})`}>
        {isArchivedLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={16} className="animate-spin opacity-50" />
          </div>
        ) : archivedIterations.length === 0 ? (
          <div className="text-[11px] text-zinc-500 italic py-4 text-center">
            No archived drafts for this node.
          </div>
        ) : (
          <div className={styles.archivedList}>
            {archivedIterations.map((it) => (
              <div key={it.iteration_id} className={styles.archivedItem}>
                <div className={styles.itemLeft}>
                  <span className={styles.draftInfo}>Draft #{it.iteration_number}</span>
                  <span className={styles.scoreInfo}>
                    Score: <strong>{it.calculated_score}</strong> pt
                  </span>
                </div>
                <div className={styles.itemRight}>
                  <button 
                    className={`${styles.actionIconBtn} ${styles.restore}`}
                    onClick={() => restoreIteration(it.iteration_id)}
                    title="Restore to active drafts"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button 
                    className={`${styles.actionIconBtn} ${styles.delete}`}
                    onClick={() => {
                      if (confirm('Permanently delete this iteration?')) {
                        deleteIteration(it.iteration_id);
                      }
                    }}
                    title="Permanently delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Accordion>
    </div>
  );
};

const RefinementView = ({ 
  messages, scrollRef, isLoading, step, requestText, setRequestText, 
  onSend, onReset, projectId, comments, selectedCommentIds, toggleComment,
  statusMessages, confirmRouting, approveValidation, confirmTaintCascade, finalizeRefinement, cancelRefinement,
  isCommentsListVisible, toggleCommentsList,
  targetNodes, taintCascadeResult
}: any) => {
  const { nodes } = useProjectStore();
  const selectedCommentsList = comments.filter((c: any) => selectedCommentIds.has(c.comment_id));

  // 모든 영향 노드가 REVIEWED 상태인지 확인
  const impactedNodeIds = Array.from(new Set([
    ...targetNodes,
    ...(taintCascadeResult?.impacts.map((i: any) => i.node_id) || [])
  ]));

  const pendingNodes = impactedNodeIds.filter(id => {
    const node = nodes.find(n => n.node_id === id);
    return node && node.node_state !== 'REVIEWED' && node.node_state !== 'COMPLETED';
  });

  const isAllReviewed = pendingNodes.length === 0;

  return (
    <div className={styles.chatContainer}>
      {step !== 'ANALYZING' && (
        <div className={`${styles.reviewBtn} ${isCommentsListVisible ? styles.active : ''}`} onClick={() => toggleCommentsList()}>
          <MessageSquare size={12} />
          <span>Review Comments</span>
          {comments.length > 0 && <span className={styles.count}>{comments.length}</span>}
        </div>
      )}

      {isCommentsListVisible && step !== 'ANALYZING' && (
        <CommentsOverlay 
          comments={comments} 
          selectedIds={selectedCommentIds} 
          onToggle={toggleComment} 
          onClose={() => toggleCommentsList(false)} 
          intent={useRefinementStore.getState().intent}
        />
      )}

      <div className={styles.messageList} ref={scrollRef}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <Sparkles size={40} className="text-emerald-500/20" />
            <p>Start refining your architecture.<br/>Select comments or describe changes below.</p>
          </div>
        )}
        
        {messages.map((msg: RefinementMessage, idx: number) => (
          <div key={msg.id} className={`${styles.messageGroup} ${styles[msg.role]}`}>
            {msg.type === 'thinking' ? (
              <ThinkingMessage 
                content={msg.content} 
                statusMessages={statusMessages} 
                hideLogs={msg.data?.hideLogs || idx !== messages.length - 1} 
              />
            ) : msg.type === 'analysis' ? (
              <AnalysisMessage data={msg.data} />
            ) : msg.type === 'validation' ? (
              <ValidationMessage data={msg.data} />
            ) : msg.type === 'cascade_analysis' ? (
              <CascadeAnalysisMessage data={msg.data} />
            ) : (
              <div className={styles.bubble}>{msg.content}</div>
            )}
          </div>
        ))}
      </div>

      <div className={styles.inputArea}>
        {selectedCommentIds.size > 0 && step !== 'ANALYZING' && (
          <div className={styles.contextBar}>
            {selectedCommentsList.map((c: any) => (
              <div key={c.comment_id} className={styles.contextPill}>
                <MessageSquare size={10} />
                <span>{c.module_name || c.node_category}:{c.node_type}:{c.json_path.includes('$') ? '$' + c.json_path.split('$')[1] : c.json_path}</span>
                <X size={10} className={styles.remove} onClick={() => toggleComment(c.comment_id)} />
              </div>
            ))}
          </div>
        )}

        <div className={styles.textareaWrapper}>
          <textarea
            className={styles.promptTextarea}
            placeholder="What should we refine today?"
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            disabled={isLoading || step === 'SUCCESS'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <div className={styles.inputActions}>
            <span className={styles.tokens}>~2.4k context</span>
            <div className="flex gap-2">
              {step !== 'IDLE' && step !== 'INPUT' && step !== 'SUCCESS' && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    if (confirm('모든 진행 중인 수정을 취소하고 이전 상태로 롤백하시겠습니까?')) {
                      cancelRefinement(projectId);
                    }
                  }}
                  title="Cancel and Rollback Refinement"
                >
                  <RotateCcw size={14} className="text-rose-500" />
                </Button>
              )}
              <Button 
                size="sm" 
                onClick={onSend} 
                isLoading={isLoading}
                disabled={!requestText.trim() || step === 'SUCCESS'}
              >
                <Send size={14} />
              </Button>
            </div>
          </div>
        </div>
        
        {step === 'SUCCESS' && (
          <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 text-emerald-500 mb-2">
              <Check size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">Refinement Session Finalized</span>
            </div>
            <p className="text-[11px] text-emerald-200/70 leading-relaxed mb-4">
              All changes have been successfully reviewed and acknowledged. The architectural evolution is now part of the canonical specification.
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={onReset}>
              Start New Intent
            </Button>
          </div>
        )}

        {step === 'AWAITING_UPDATE' && (
          <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl border-dashed">
            <div className="flex items-center gap-2 text-amber-500 mb-2">
              <Zap size={16} className="animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider">Awaiting Artifact Update</span>
            </div>
            <p className="text-[11px] text-amber-200/70 leading-relaxed">
              Impact analysis confirmed. Please click the <span className="text-amber-500 font-bold">[Update]</span> button in the editor for the stale artifacts to generate the "To-Be" specifications.
            </p>
          </div>
        )}

        {step === 'REVIEWING_RESULT' && (
          <div className="mt-4 p-4 bg-primary/10 border border-primary/20 rounded-xl">
            <div className="flex items-center gap-2 text-primary mb-2">
              <Eye size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">Review New Specifications</span>
            </div>
            <p className="text-[11px] text-primary-200/70 leading-relaxed mb-4">
              {isAllReviewed 
                ? '모든 영향 노드가 검토 및 확정되었습니다. 이제 세션을 종료하고 변경 사항을 영구적으로 반영할 수 있습니다.'
                : `아직 검토가 필요한 노드가 ${pendingNodes.length}개 있습니다. 에디터에서 [Confirm] 또는 [Retry]를 클릭하여 모든 노드를 확정해 주세요.`}
            </p>
            <Button 
              variant="primary" 
              size="sm" 
              className="w-full" 
              onClick={() => finalizeRefinement(projectId)}
              disabled={!isAllReviewed || isLoading}
              leftIcon={isAllReviewed ? <Check size={14} /> : <Loader2 size={14} className="animate-spin" />}
            >
              {isAllReviewed ? 'Acknowledge & Finalize' : 'Awaiting Review & Confirm...'}
            </Button>
          </div>
        )}

        {/* Action Buttons for pipeline steps */}
        <div className="mt-2 flex flex-col gap-2">
          {step === 'CONFIRMATION' && (
            <Button 
              variant="primary" 
              onClick={() => confirmRouting(projectId)} 
              isLoading={isLoading}
              fullWidth
              rightIcon={<ChevronRight size={16}/>}
            >
              Validate Constraints
            </Button>
          )}
          {step === 'VALIDATION_RESULT' && (
            <Button 
              variant="primary" 
              onClick={() => approveValidation(projectId)} 
              isLoading={isLoading}
              fullWidth
              leftIcon={<Check size={16}/>}
            >
              Confirm & Cascade
            </Button>
          )}
          {step === 'CASCADE_CONFIRMATION' && (
            <Button 
              variant="primary" 
              onClick={() => confirmTaintCascade(projectId)} 
              isLoading={isLoading}
              fullWidth
              leftIcon={<Check size={16}/>}
            >
              Approve Impact & Apply
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const CommentsOverlay = ({ comments, selectedIds, onToggle, onClose, intent }: any) => {
  // 코멘트 ID별 리다이렉션된 경로 맵 생성
  const redirectedMap = React.useMemo(() => {
    const map = new Map<string, string>();
    if (intent?.intents) {
      intent.intents.forEach((item: any) => {
        if (item.is_context_mismatch && item.resolved_comment_ids) {
          const mainTarget = item.target_block_ids?.[0] || item.target_node_ids?.[0];
          if (mainTarget) {
            item.resolved_comment_ids.forEach((cid: string) => {
              map.set(cid, mainTarget);
            });
          }
        }
      });
    }
    return map;
  }, [intent]);

  return (
    <div className={styles.commentsOverlay}>
      <div className={styles.overlayHeader}>
        <h3>Architecture Comments ({comments.length})</h3>
        <X size={14} className={styles.closeBtn} onClick={onClose} />
      </div>
      <div className={styles.commentList}>
        {comments.length === 0 ? (
          <div className={styles.emptyState} style={{ padding: '20px' }}>
            <p>No comments found for this project.</p>
          </div>
        ) : (
          comments.map((c: any) => {
            const redirectedPath = redirectedMap.get(c.comment_id);
            const originalPath = `${c.module_name || c.node_category}:${c.node_type}:${c.json_path.includes('$') ? '$' + c.json_path.split('$')[1] : c.json_path}`;
            
            return (
              <div 
                key={c.comment_id} 
                className={`${styles.commentItem} ${selectedIds.has(c.comment_id) ? styles.selected : ''}`}
                onClick={() => onToggle(c.comment_id)}
              >
                <div className={styles.commentPath}>
                  {redirectedPath ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] line-through opacity-40">{originalPath}</span>
                      <div className="flex items-center gap-1 text-emerald-500">
                        <Zap size={10} />
                        <span className="font-bold">{redirectedPath}</span>
                      </div>
                    </div>
                  ) : (
                    originalPath
                  )}
                </div>
                <div className={styles.commentText}>{c.comment_text}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const ThinkingMessage = ({ content, statusMessages, hideLogs }: any) => (
  <div className={styles.thinkingMessage}>
    <div className={styles.thinkingHeader}>
      <Loader2 size={12} className={styles.spinner} />
      <span>{content}</span>
    </div>
    {!hideLogs && statusMessages.length > 0 && (
      <div className={styles.processList}>
        {statusMessages.map((msg: any, i: number) => (
          <div key={i} className={styles.processItem}>
            <Check size={10} className={styles.check} />
            {msg.message}
          </div>
        ))}
      </div>
    )}
  </div>
);

const AnalysisMessage = ({ data }: any) => (
  <div className={styles.chatStyleMessage}>
    <div className={styles.chatHeader}>🖋️ 주요 변경 사항</div>
    
    <ul className={styles.chatList}>
      <li>
        <strong>Impact Analysis (텍스트 로그 형식):</strong>
        <ul>
          {data.intent.intents.map((item: any, idx: number) => (
            <li key={idx} className={styles.intentListItem}>
              <div className={styles.intentHeaderLine}>
                <span className={styles.chatCode} data-type={item.action_type}>{item.action_type.toUpperCase()}</span>
                <span className={styles.intentTitleText}>{item.target_feature}</span>
                <span className={styles.scopeBadge} data-scope={item.impact_scope}>{item.impact_scope}</span>
              </div>
              
              <div className={styles.intentDetails}>
                <p className={styles.chatDesc}><strong>Reasoning:</strong> {item.reasoning}</p>
                <p className={styles.chatDesc}><strong>Description:</strong> {item.action_description}</p>
                
                {item.conflict_resolution && (
                  <div className={styles.conflictBox}>
                    <AlertCircle size={10} />
                    <span><strong>Conflict Resolution:</strong> {item.conflict_resolution}</span>
                  </div>
                )}

                {item.target_block_ids && item.target_block_ids.length > 0 && (
                  <div className={styles.blockIdsRow}>
                    <Target size={10} />
                    <div className={styles.blockTags}>
                      {item.target_block_ids.map((bid: string, bidx: number) => (
                        <span key={bidx} className={styles.blockTag}>{bid}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </li>
    </ul>

    {data.targets && data.targets.length > 0 && (
      <div className={styles.chatFooter}>
        <div className={styles.footerLabel}>Files Modified</div>
        <div className={styles.footerFiles}>
          {data.targets.map((target: string, i: number) => (
            <div key={i} className={styles.fileBadge}>
              <Box size={12} />
              {target}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

const ValidationMessage = ({ data }: any) => (
  <div className={styles.chatStyleMessage}>
    <div className={styles.markdownHeader}>⚖️ 설계 정합성 검증 결과</div>
    
    <div className={`${styles.markdownAlert} ${data.decision === 'PASS' ? styles.pass : styles.fail}`}>
      <div className={styles.alertHeader}>
        {data.decision === 'PASS' ? <Check size={14} /> : <AlertCircle size={14} />}
        <span>{data.decision === 'PASS' ? 'ARCHITECTURE PASS' : 'ARCHITECTURE REFACTORING'}</span>
      </div>
      <div className={styles.alertBody}>
        {data.rationale}
      </div>
    </div>

  </div>
);

const CascadeAnalysisMessage = ({ data }: any) => {
  const { nodes, currentProject, runNode } = useProjectStore();
  const { confirmTaintCascade, isLoading, intent } = useRefinementStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  return (
    <>
      <div className={styles.chatStyleMessage}>
        <div className={styles.chatHeader}>⚡ Taint Cascade Simulation Analysis</div>

        <ul className={styles.chatList}>
          <li>
            <strong>Impact Radius Summary:</strong>
            <div className="mt-2 space-y-1 ml-1">
              <p className="text-xs">
                <span className="text-gray-500">• </span>
                <strong className="text-rose-500">To be Stale</strong>: {data.stale_count}
              </p>
              <p className="text-xs">
                <span className="text-gray-500">• </span>
                <strong className="text-amber-500">Impacted Blocks</strong>: {data.impact_count}
              </p>
            </div>
            <p className={styles.chatDesc} style={{ opacity: 0.6, fontStyle: 'italic', marginTop: '8px' }}>
              {"> "} {data.stale_count}개의 아티팩트가 변경의 직접적인 영향을 받아 'STALE' 상태로 전환될 예정입니다.
            </p>
          </li>

          <li>
            <strong>Cascaded Artifact Details:</strong>
            <ul className="space-y-3 mt-3">
              {data.impacts.slice(0, 5).map((impact: any, i: number) => {
                const node = nodes.find(n => n.node_id === impact.node_id);
                const displayName = node ? node.target_node_type : impact.node_id.split('-')[0];
                const isNodeStale = node?.node_state === 'STALE';
                
                return (
                  <li key={i} className={styles.intentListItem} style={{ padding: '12px', background: 'rgba(255,255,255,0.02)' }}>
                    <div className={styles.intentHeaderLine}>
                      <span className={styles.chatCode}>{displayName}</span>
                      <span className="text-[10px] font-mono text-gray-600 opacity-50">{impact.node_id.split('-')[0]}</span>
                      {(() => {
                        const addresses = [...(impact.block_ids || []), ...(impact.block_paths || [])]
                          .filter(a => !!a && a.trim().length > 0);
                        
                        if (addresses.length === 0) {
                          return (
                            <span className={styles.blockAddressChip} style={{ opacity: 0.5, background: 'transparent' }}>
                              @NODE
                            </span>
                          );
                        }
                        
                        const mainAddress = addresses[0];
                        const displayAddress = mainAddress.includes('$') 
                          ? mainAddress.split('.').pop() || mainAddress
                          : mainAddress;

                        return (
                          <span 
                            className={styles.blockAddressChip} 
                            title={addresses.join('\n')}
                          >
                            @{displayAddress}
                            {addresses.length > 1 && ` (+${addresses.length - 1})`}
                          </span>
                        );
                      })()}
                    </div>
                    
                    <div className={styles.intentDetails}>
                      {impact.block_ids.filter(id => !!id).length > 0 && (
                        <div className={styles.blockIdsRow} style={{ marginBottom: '4px' }}>
                          <Target size={10} />
                          <div className={styles.blockTags}>
                            {impact.block_ids.filter(id => !!id).map((bid: string, bidx: number) => (
                              <span key={bidx} className={styles.blockTag}>{bid}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className={styles.chatDesc}><strong>Reason:</strong> {impact.reason}</p>
                      
                      {/* Refine Action */}
                      <div className="mt-3 flex justify-end">
                        <button 
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-gray-400 hover:text-primary hover:border-primary/30 transition-all"
                          onClick={() => {
                            if (node) runNode(node.node_id);
                          }}
                        >
                          <Zap size={10} />
                          {isNodeStale ? 'Update Now' : 'Mark Stale'}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
              {data.impacts.length > 5 && (
                <li className="text-[11px] text-gray-600 italic mt-2 opacity-50 px-2">
                  ...and {data.impacts.length - 5} more artifacts detected in cascade.
                </li>
              )}
            </ul>
          </li>
        </ul>

        <div className={styles.chatFooter}>
          <div className="flex items-center justify-between w-full">
            <div className={styles.footerLabel}>Simulation Report</div>
            <button 
              className="text-[10px] font-black text-sky-500/60 hover:text-sky-400 transition-colors uppercase tracking-widest flex items-center gap-1"
              onClick={() => setIsModalOpen(true)}
            >
              Open Full Report <ChevronRight size={10} />
            </button>
          </div>
        </div>
      </div>

      <ImpactReportModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        data={data}
        isLoading={isLoading}
        onConfirm={() => {
          if (currentProject) {
            confirmTaintCascade(currentProject.project_id);
            setIsModalOpen(false);
          }
        }}
      />
    </>
  );
};

const PropertyItem = ({ icon, label, value }: any) => (
  <div className={styles.propertyItem}>
    <div className={styles.propLabel}>
      {icon}
      <span>{label}</span>
    </div>
    <div className={styles.propValue}>{value}</div>
  </div>
);
