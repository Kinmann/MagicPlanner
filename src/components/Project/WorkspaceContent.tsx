import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  History, 
  Sparkles, 
  Code, 
  Layers, 
  Trash2, 
  CheckCircle, 
  FileJson
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../store/uiStore';
import { DocumentNode } from '../../types/project';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Alert } from '../ui/Alert';
import SadSpecRenderer from './SadSpecRenderer';
import { PrdBentoRenderer, SadGlobalRenderer, renderJson } from './GlobalRenderers';
import styles from './WorkspaceContent.module.scss';

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
      className={styles.documentView}
    >
      <div className={styles.container}>
        {/* Revision History Strip */}
        <div className={styles.revisionsStrip}>
          <div className={styles.stripHeader}>
            <div className={styles.headerLeft}>
              <History size={14} className="opacity-60" />
              <span>REVISIONS</span>
            </div>
            <div className={styles.headerRight}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setShowGuidance(true)}
                title="AI Guidance"
                leftIcon={<Sparkles size={14} className="text-primary" />}
              />
              <Button 
                variant="outline"
                size="sm"
                className={`h-7 px-2 text-[10px] ${showRawSpec ? styles.active : ''}`}
                onClick={() => setShowRawSpec(!showRawSpec)}
                leftIcon={showRawSpec ? <Layers size={12} /> : <Code size={12} />}
              >
                {showRawSpec ? 'Visual' : 'RAW Spec'}
              </Button>
              <Button
                onClick={() => onDeleteIteration(selectedIteration)}
                disabled={loading || !selectedIteration}
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-danger hover:bg-danger/10"
                title="Delete Revision"
                leftIcon={<Trash2 size={14} />}
              />
            </div>
          </div>
          <div className={styles.revisionsList}>
            {iterations.map((it) => {
              const isConfirmed = it.iteration_id === bestIterationId;
              const isActive = selectedIteration?.iteration_id === it.iteration_id;
              return (
                <button
                  key={it.iteration_id}
                  className={`${styles.revisionBtn} ${isActive ? styles.active : ''} ${isConfirmed ? styles.confirmed : ''}`}
                  onClick={() => onSelectIteration(it)}
                >
                  <div className={styles.btnContent}>
                    <span className={styles.iterNum}>#{it.iteration_number}</span>
                    {isConfirmed && <CheckCircle size={10} className="text-primary" />}
                  </div>
                  <Badge variant={isActive ? "primary" : "outline"} className="text-[9px] h-4 px-1">
                    {it.calculated_score}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        {/* Document Body */}
        <div className={styles.documentBody} ref={containerRef} onScroll={handleScroll}>
          <div className={styles.contentHeader}>
            <div className={styles.headerTitle}>
              <Badge variant="outline" className="mb-2">{selectedNode.target_node_type}</Badge>
              <h2>{selectedNode.target_node_type} Synthesis</h2>
              <p>Generated by Orchestrator Intelligence v4.0</p>
            </div>
            <div className={styles.headerScore}>
              <div className={styles.scoreGauge}>
                <span className={styles.scoreLabel}>TRUST SCORE</span>
                <span className={styles.scoreValue}>{selectedIteration?.calculated_score || 0}</span>
              </div>
            </div>
          </div>

          <Card className={styles.mainCard}>
            <div className={`${styles.viewport} ${!showRawSpec ? styles.visual : ''}`}>
              {nodeContent ? (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={showRawSpec ? 'raw' : 'visual'}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                  >
                    {(() => {
                      try {
                        const json = typeof nodeContent === 'string' ? JSON.parse(nodeContent) : nodeContent;
                        if (showRawSpec) {
                          return (
                            <pre className={styles.code}>
                              {JSON.stringify(json, null, 2)}
                            </pre>
                          );
                        }
                        
                        // Visual Renderers
                        const nodeType = selectedNode.target_node_type.toLowerCase();
                        const isModuleSpec = [
                          'prd', 'fsd', 'ia', 'user flow', 'erd', 'wireframe', 'api_spec', 'tc'
                        ].includes(nodeType.replace('modules.', ''));

                        if (selectedNode.target_node_type === 'genesis-prd' || selectedNode.target_node_type.startsWith('GPRD_')) {
                          return <PrdBentoRenderer content={json} nodeId={selectedNode.node_id} currentIteration={selectedIteration} />;
                        } else if (selectedNode.target_node_type.includes('sad-global') || selectedNode.target_node_type.includes('SAD_Global')) {
                          return <SadGlobalRenderer content={json} nodeId={selectedNode.node_id} currentIteration={selectedIteration} />;
                        } else if (selectedNode.target_node_type.includes('SAD_Module') || selectedNode.target_node_type.includes('sad-module')) {
                          return <SadGlobalRenderer content={json} nodeId={selectedNode.node_id} currentIteration={selectedIteration} />;
                        } else if (isModuleSpec) {
                          return (
                            <div className={styles.specRenderer}>
                              <div className={styles.specHeader}>
                                <div className="flex items-center gap-2">
                                  <FileJson size={16} className="text-primary" />
                                  <span className="text-xs font-bold opacity-60 uppercase">{selectedNode.target_node_type} Specification</span>
                                </div>
                                <span className="text-[10px] font-mono opacity-30">{selectedNode.target_node_type.toUpperCase()}.JSON</span>
                              </div>
                              <SadSpecRenderer type={selectedNode.target_node_type} data={json} nodeId={selectedNode.node_id} currentIteration={selectedIteration} />
                            </div>
                          );
                        }
                        
                        return <pre className={styles.code}>{renderJson(json)}</pre>;
                      } catch (e) {
                        return <pre className={styles.code}>{nodeContent}</pre>;
                      }
                    })()}
                  </motion.div>
                </AnimatePresence>
              ) : (
                <div className={styles.emptyState}>No content generated for this iteration.</div>
              )}
            </div>
          </Card>
        </div>

        {/* Guidance Modal */}
        <Dialog 
          isOpen={showGuidance} 
          onClose={() => setShowGuidance(false)}
          title="AI Intelligence Feedback"
          size="md"
        >
          <div className="space-y-4 pt-4">
            {selectedIteration?.critical_errors_array?.length > 0 && (
              <Alert 
                variant="error"
                title="Critical Issues"
                description={selectedIteration.critical_errors_array.join('\n')}
              />
            )}
            {selectedIteration?.actionable_feedback_text && (
              <Alert 
                variant="info"
                title="Optimization Guidance"
                description={selectedIteration.actionable_feedback_text}
              />
            )}
            {!selectedIteration?.critical_errors_array?.length && !selectedIteration?.actionable_feedback_text && (
              <Alert 
                variant="success"
                title="Verification Passed"
                description="This iteration meets all architectural requirements."
              />
            )}
          </div>
        </Dialog>
      </div>
    </motion.div>
  );
};

export default WorkspaceContent;
