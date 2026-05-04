import React, { useState, useEffect, useRef } from 'react';
import { 
  Info, Calendar, Hash, Tag, Activity, DollarSign, Clock, Zap,
  MessageSquare, Sparkles, Send, Trash2, Check, ChevronDown, 
  Cpu, AlertCircle, Layers, Target, ChevronRight, X, Loader2, Box
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
    startAnalysis, confirmRouting, approveValidation, confirmTaintCascade,
    comments, selectedCommentIds, toggleComment, reset, statusMessages,
    isCommentsListVisible, toggleCommentsList, fetchComments
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
            isCommentsListVisible={isCommentsListVisible}
            toggleCommentsList={toggleCommentsList}
          />
        )}
      </div>
    </div>
  );
};

// --- Sub-components ---

const PropertiesView = ({ selectedNode }: any) => {
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

      <Accordion title="Resources & Cost">
        <PropertyItem icon={<Clock size={14}/>} label="Time Elapsed" value="2m 45s" />
        <PropertyItem icon={<DollarSign size={14}/>} label="Estimated Cost" value={`$${(selectedNode.current_iteration * 0.02).toFixed(3)}`} />
      </Accordion>
    </div>
  );
};

const RefinementView = ({ 
  messages, scrollRef, isLoading, step, requestText, setRequestText, 
  onSend, onReset, projectId, comments, selectedCommentIds, toggleComment,
  statusMessages, confirmRouting, approveValidation, confirmTaintCascade,
  isCommentsListVisible, toggleCommentsList
}: any) => {
  const selectedCommentsList = comments.filter((c: any) => selectedCommentIds.has(c.comment_id));

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
              {step !== 'IDLE' && step !== 'INPUT' && (
                <Button variant="ghost" size="sm" onClick={onReset}><Trash2 size={14} /></Button>
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

const CommentsOverlay = ({ comments, selectedIds, onToggle, onClose }: any) => (
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
        comments.map((c: any) => (
          <div 
            key={c.comment_id} 
            className={`${styles.commentItem} ${selectedIds.has(c.comment_id) ? styles.selected : ''}`}
            onClick={() => onToggle(c.comment_id)}
          >
            <div className={styles.commentPath}>
              {c.module_name || c.node_category}:{c.node_type}:{c.json_path.includes('$') ? '$' + c.json_path.split('$')[1] : c.json_path}
            </div>
            <div className={styles.commentText}>{c.comment_text}</div>
          </div>
        ))
      )}
    </div>
  </div>
);

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
  const { nodes, currentProject } = useProjectStore();
  const { confirmTaintCascade, isLoading } = useRefinementStore();
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
            <ul>
              {data.impacts.slice(0, 5).map((impact: any, i: number) => {
                const node = nodes.find(n => n.node_id === impact.node_id);
                const displayName = node ? node.target_node_type : impact.node_id.split('-')[0];
                
                return (
                  <li key={i} className={styles.intentListItem}>
                    <div className={styles.intentHeaderLine}>
                      <span className={styles.chatCode}>{displayName}</span>
                      <span className="text-[10px] font-mono text-gray-600 opacity-50">{impact.node_id.split('-')[0]}</span>
                    </div>
                    
                    <div className={styles.intentDetails}>
                      <div className={styles.blockIdsRow} style={{ marginBottom: '4px' }}>
                        <Target size={10} />
                        <div className={styles.blockTags}>
                          {impact.block_ids.map((bid: string, bidx: number) => (
                            <span key={bidx} className={styles.blockTag}>{bid}</span>
                          ))}
                        </div>
                      </div>
                      <p className={styles.chatDesc}><strong>Reason:</strong> {impact.reason}</p>
                    </div>
                  </li>
                );
              })}
              {data.impacts.length > 5 && (
                <li className="text-[11px] text-gray-600 italic mt-2 opacity-50">
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
