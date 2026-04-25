import React from 'react';
import { motion } from 'framer-motion';
import Button from '../common/Button';
import FeedbackRenderer from '../common/FeedbackRenderer';
import BaseModal from '../common/BaseModal';
import SadSpecRenderer from './SadSpecRenderer';
import { PrdBentoRenderer, SadGlobalRenderer, renderJson } from './GlobalRenderers';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../store/uiStore';
import { DocumentNode } from '../../types/project';

interface WorkspaceContentProps {
  selectedNode: DocumentNode | null;
  iterations: any[];
  selectedIteration: any | null;
  bestIterationId: string | null;
  nodeContent: string | null;
  showRawSpec: boolean;
  showGuidance: boolean;
  loading: boolean;
  onSelectIteration: (it: any) => void;
  onDeleteIteration: (it: any) => void;
  setShowRawSpec: (show: boolean) => void;
  setShowGuidance: (show: boolean) => void;
}

const WorkspaceContent: React.FC<WorkspaceContentProps> = ({
  selectedNode,
  iterations,
  selectedIteration,
  bestIterationId,
  nodeContent,
  showRawSpec,
  showGuidance,
  loading,
  onSelectIteration,
  onDeleteIteration,
  setShowRawSpec,
  setShowGuidance
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { scrollPositions, setScrollPosition } = useUIStore(useShallow(state => ({
    scrollPositions: state.scrollPositions,
    setScrollPosition: state.setScrollPosition
  })));

  // Restore scroll position
  React.useEffect(() => {
    if (selectedNode && containerRef.current) {
      const savedPos = scrollPositions[selectedNode.node_id];
      if (savedPos) {
        containerRef.current.scrollTop = savedPos;
      }
    }
  }, [selectedNode?.node_id]);

  // Save scroll position on scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (selectedNode) {
      setScrollPosition(selectedNode.node_id, e.currentTarget.scrollTop);
    }
  };

  if (!selectedNode) return null;

  return (
    <motion.div 
      key={`content-${selectedNode.node_id}`}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="document-view"
    >
      <div className="document-view-container">
        <div className="revisions-horizontal">
          <div className="revisions-header">
            <div className="left">
              <span className="material-symbols-outlined">history</span>
              <span>Revision History</span>
            </div>
            <div className="right">
              <Button
                variant="ghost"
                className="ai-guidance-btn"
                onClick={() => setShowGuidance(true)}
                title="AI Guidance"
                leftIcon={<span className="material-symbols-outlined">auto_awesome</span>}
              />
              <button 
                className={`raw-spec-btn ${showRawSpec ? 'active' : ''}`}
                onClick={() => setShowRawSpec(!showRawSpec)}
              >
                <span className="material-symbols-outlined">
                  {showRawSpec ? 'account_tree' : 'data_object'}
                </span>
                {showRawSpec ? 'Visual' : 'RAW SPEC'}
              </button>
              <Button
                onClick={() => onDeleteIteration(selectedIteration)}
                disabled={loading || !selectedIteration}
                variant="ghost"
                className="delete-btn"
                title="이 리비전 삭제"
                iconOnly
                leftIcon={<span className="material-symbols-outlined" style={{ color: '#ef4444' }}>delete</span>}
              />
            </div>
          </div>
          <div className="revisions-list custom-scrollbar">
            {iterations.map((it) => {
              const isConfirmed = it.iteration_id === bestIterationId;
              return (
                <button
                  key={it.iteration_id}
                  className={`revision-btn ${selectedIteration?.iteration_id === it.iteration_id ? 'active' : ''} ${isConfirmed ? 'confirmed' : ''}`}
                  onClick={() => onSelectIteration(it)}
                >
                  <span className="iter-num">Draft #{it.iteration_number}</span>
                  {isConfirmed && (
                    <span className="material-symbols-outlined selected-icon">
                      check_circle
                    </span>
                  )}
                  <span className="iter-meta">{it.calculated_score}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="document-body" ref={containerRef} onScroll={handleScroll}>
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="content-header"
          >
            <div className="header-left">
              <h2>{selectedNode.target_node_type} Synthesis</h2>
              <p>Orchestrated intelligence output for precise software architecture and planning.</p>
            </div>
            <div className="header-right">
              <div className="pass-score-gauge">
                <span className="gauge-label">Score</span>
                <span className="gauge-value">{selectedIteration?.calculated_score || 0}</span>
                <div className="gauge-dots">
                  <div className="dot"></div><div className="dot"></div><div className="dot"></div>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="code-window">
            <div className={`code-content ${!showRawSpec ? 'visual-render' : ''}`}>
              {nodeContent ? (
                <>
                  {(() => {
                    try {
                      if (showRawSpec) {
                        return (
                          <pre>
                            {typeof nodeContent === 'string' ? nodeContent : JSON.stringify(nodeContent, null, 2)}
                          </pre>
                        );
                      }
                      const json = typeof nodeContent === 'string' ? JSON.parse(nodeContent) : nodeContent;
                      
                      // Visual Renderers
                      if (selectedNode.target_node_type === 'genesis-prd') {
                        return <PrdBentoRenderer content={json} />;
                      } else if (selectedNode.target_node_type === 'sad-global' || selectedNode.target_node_type === 'SAD_Global') {
                        return <SadGlobalRenderer content={json} />;
                      } else if (selectedNode.target_node_type === 'SAD_Module' || selectedNode.target_node_type === 'sad-module') {
                        return <SadGlobalRenderer content={json} />;
                      } else if (['PRD', 'FSD', 'IA', 'User Flow', 'ERD', 'Wireframe', 'API_Spec', 'TC'].includes(selectedNode.target_node_type)) {
                        return (
                          <div className="visual-view">
                            <div className="context-card single-card">
                              <div className="spec-card-top">
                                <span className="group-label">Module Specification</span>
                                <span className="file-name">{selectedNode.target_node_type.toUpperCase()}.JSON</span>
                              </div>
                              <div className="spec-card-inner">
                                <div className="card-header">
                                  <div className="title-group">
                                    <span className="material-symbols-outlined icon">
                                      {selectedNode.target_node_type === 'ERD' ? 'database' : 
                                       selectedNode.target_node_type === 'API_Spec' ? 'api' : 'description'}
                                    </span>
                                    <span className="name">{selectedNode.target_node_type} Specification</span>
                                  </div>
                                </div>
                                <div className="card-content-wrapper custom-scrollbar">
                                  <SadSpecRenderer type={selectedNode.target_node_type} data={json} />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      
                      return (
                        <pre>
                          {renderJson(json)}
                        </pre>
                      );
                    } catch (e) {
                      return <pre>{nodeContent}</pre>;
                    }
                  })()}
                </>
              ) : (
                <div className="opacity-30 italic">생성된 내용이 없습니다.</div>
              )}
            </div>
          </div>
        </div>

        {showGuidance && selectedIteration && (
          <BaseModal
            isOpen={showGuidance}
            onClose={() => setShowGuidance(false)}
            title="AI Intelligence Feedback"
            subtitle={`Draft #${selectedIteration.iteration_number} - Score: ${selectedIteration.calculated_score}`}
            size="md"
          >
            <div className="intelligence-feedback">
              {selectedIteration.critical_errors_array && (
                <div className="feedback-card error">
                  <div className="card-header">
                    <span className="material-symbols-outlined">error</span>
                    <h4>Critical Issues</h4>
                  </div>
                  <div className="card-content">
                    <FeedbackRenderer 
                      feedback={selectedIteration.critical_errors_array} 
                      type="error" 
                    />
                  </div>
                </div>
              )}
              {selectedIteration.actionable_feedback_text && (
                <div className="feedback-card info">
                  <div className="card-header">
                    <span className="material-symbols-outlined">tips_and_updates</span>
                    <h4>Optimization Guidance</h4>
                  </div>
                  <div className="card-content">
                    <FeedbackRenderer 
                      feedback={selectedIteration.actionable_feedback_text} 
                      type="info" 
                    />
                  </div>
                </div>
              )}
              {!selectedIteration.critical_errors_array && !selectedIteration.actionable_feedback_text && (
                <div className="feedback-card success">
                  <div className="card-header">
                    <span className="material-symbols-outlined">check_circle</span>
                    <h4>All Good</h4>
                  </div>
                  <div className="card-content">
                    <p>이 리비전에 특별한 결함이나 개선 제안이 없습니다.</p>
                  </div>
                </div>
              )}
            </div>
          </BaseModal>
        )}
      </div>
    </motion.div>
  );
};

export default WorkspaceContent;
