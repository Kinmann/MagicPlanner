import React from 'react';
import { MessageSquare, Sparkles, Info, Loader2 } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useCommentStore } from '../../store/commentStore';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useRefinementStore } from '../../store/refinementStore';
import styles from './CommentableRow.module.scss';
import { CommentPopover } from './CommentPopover';

interface CommentableRowProps {
  jsonPath: string;
  nodeId: string;
  blockId?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  currentIteration?: any;
  isStale?: boolean;
  isRefined?: boolean;
  _internal?: boolean;
}

export const CommentableRow: React.FC<CommentableRowProps> = (props) => {
  const {
    jsonPath,
    nodeId,
    blockId,
    children,
    className = '',
    disabled = false,
    currentIteration: propIteration,
    isStale = false,
    isRefined = false,
    _internal = false,
  } = props;

  const count = useCommentStore(state => 
    state.comments.filter(c => c.json_path === jsonPath).length
  );
  const { setActiveJsonPath, setCommentPanelOpen, isCommentPanelOpen, activeJsonPath } = useCommentStore();
  const selectedIterationId = useUIStore(state => state.selectedIterationId);
  const node = useProjectStore(state => state.nodes.find(n => n.node_id === nodeId));
  
  const { intent, taintCascadeResult, step } = useRefinementStore();
  
  const isTargeted = (() => {
    if (!intent || !nodeId) return false;
    return intent.intents.some(i => {
      const isNodeMatch = i.target_node_ids.some(tnid => {
        const tnidUpper = tnid.toUpperCase();
        const nodeIdUpper = nodeId.toUpperCase();
        if (tnidUpper === nodeIdUpper) return true;
        let canonicalId = node ? `${node.node_category}:${node.target_node_type}` : "";
        if (!canonicalId && nodeId.startsWith('mock-')) {
          const mockType = nodeId.replace('mock-', '').toUpperCase();
          canonicalId = `ARCHITECTURE:${mockType}`;
        }
        return tnidUpper === canonicalId.toUpperCase();
      });
      if (!isNodeMatch) return false;
      if (!i.target_block_ids || i.target_block_ids.length === 0) return true;
      return i.target_block_ids.some(tbid => {
        const tbidUpper = tbid.toUpperCase();
        if (tbid.includes('$')) {
          const targetPathClean = tbid.replace(/^\$\./, '').toUpperCase();
          const currentPathClean = jsonPath.replace(/^\$\./, '').toUpperCase();
          if (targetPathClean === currentPathClean ||
              targetPathClean.endsWith(`.${currentPathClean}`) ||
              currentPathClean.endsWith(`.${targetPathClean}`)) return true;
        }
        if (blockId) {
          const bid = blockId.toUpperCase();
          return tbidUpper === bid || tbidUpper.endsWith(`.${bid}`) || tbidUpper.endsWith(`:${bid}`);
        }
        return false;
      });
    });
  })();

  const isTainted = (() => {
    if (!taintCascadeResult) return false;
    return taintCascadeResult.impacts.some(impact => {
      if (impact.node_id !== nodeId) return false;
      if (impact.block_paths && impact.block_paths.includes(jsonPath)) return true;
      if (blockId) {
        const bid = blockId.toUpperCase();
        return impact.block_ids.some(tid => {
          const targetId = tid.toUpperCase();
          return targetId === bid || targetId.endsWith(`.${bid}`) || targetId.endsWith(`:${bid}`);
        });
      }
      return false;
    });
  })();
  
  const intentItem = intent?.intents.find(i => i.target_node_ids.some(tnid => tnid === nodeId));
  const impactItem = taintCascadeResult?.impacts.find(imp => imp.node_id === nodeId);
  
  const intentDescription = intentItem?.action_description;
  const impactReason = impactItem?.reason;

  const activeIteration = propIteration || node?.iterations?.find(it => 
    selectedIterationId ? it.iteration_id === selectedIterationId : it.is_pass
  );
  
  const isConfirmed = activeIteration && Number(activeIteration.is_pass) === 1;
  const isActive = activeJsonPath === jsonPath;

  const isApplied = step === 'SUCCESS';

  const isRefining = node?.node_state === 'REFINING';

  if (!_internal && (isTargeted || isTainted) && !isStale && !isRefined && isApplied) {
    return (
      <>
        <CommentableRow 
          {...props} 
          isStale={true} 
          _internal 
        >
          {children}
        </CommentableRow>
        <CommentableRow 
          {...props} 
          isRefined={true} 
          _internal 
        >
          {isRefining ? (
            <div className={styles.generatingPlaceholder}>
              <div className={styles.pulseBar} />
              <div className={styles.generatingInfo}>
                <Loader2 size={14} className="animate-spin text-emerald-500" />
                <span>AI is generating refined architectural blocks...</span>
              </div>
            </div>
          ) : children}
          
          <div className={styles.proposedContentHunk}>
            <div className={styles.hunkHeader}>
              <Sparkles size={12} className="text-emerald-500" />
              <span>{isTargeted ? 'Proposed Evolution' : 'Cascade Impact'}</span>
            </div>
            <div className={styles.hunkBody}>
              {isTargeted ? intentDescription : impactReason}
            </div>
          </div>
        </CommentableRow>
      </>
    );
  }

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveJsonPath(jsonPath);
    setCommentPanelOpen(true);
  };

  return (
    <div 
      className={`
        ${styles.commentableRow} 
        ${isActive ? styles.active : ''} 
        ${(isTainted || isTargeted) ? styles.tainted : ''}
        ${isStale ? styles.stale : ''}
        ${isRefined ? styles.refined : ''}
        ${count > 0 ? styles.hasComments : ''} 
        ${className}
      `}
    >
      {children}

      {!disabled && (
        <button 
          className={`
            ${styles.commentTrigger} 
            ${(count > 0 || isActive) ? styles.visible : ''}
          `}
          onClick={handleTriggerClick}
          title={!isConfirmed ? "확정된 문서에서만 코멘트 가능" : (count > 0 ? `${count}개의 코멘트` : "코멘트 추가")}
        >
          {count > 0 ? (
            <>
              <MessageSquare size={12} fill="currentColor" />
              <span className={styles.commentCount}>{count}</span>
            </>
          ) : (
            <MessageSquare size={12} />
          )}
        </button>
      )}

      <AnimatePresence>
        {isActive && isCommentPanelOpen && (
          <CommentPopover 
            jsonPath={jsonPath}
            nodeId={nodeId}
            iterationId={activeIteration?.iteration_id || ''}
            onClose={() => {
              setActiveJsonPath(null);
              setCommentPanelOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
