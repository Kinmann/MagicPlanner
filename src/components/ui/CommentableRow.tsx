import React from 'react';
import { MessageSquare } from 'lucide-react';
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
  blockId?: string; // 추가: 아티팩트 ID (하이라이트용)
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  currentIteration?: any;
}

export const CommentableRow: React.FC<CommentableRowProps> = ({
  jsonPath,
  nodeId,
  blockId,
  children,
  className = '',
  disabled = false,
  currentIteration: propIteration,
}) => {
  const count = useCommentStore(state => 
    state.comments.filter(c => c.json_path === jsonPath).length
  );
  const { setActiveJsonPath, setCommentPanelOpen, isCommentPanelOpen, activeJsonPath } = useCommentStore();
  const selectedIterationId = useUIStore(state => state.selectedIterationId);
  const node = useProjectStore(state => state.nodes.find(n => n.node_id === nodeId));
  
  // Refinement 시뮬레이션 결과 가져오기
  const taintCascadeResult = useRefinementStore(state => state.taintCascadeResult);
  
  // 현재 블록이 오염(Tainted) 되었는지 확인 (경로 기반 정밀 매칭 및 ID 매칭 지원)
  const isTainted = (() => {
    if (!taintCascadeResult) return false;
    
    return taintCascadeResult.impacts.some(impact => {
      if (impact.node_id !== nodeId) return false;
      
      // 1. 구체적 경로(JSON Path) 매칭 (최고 우선순위)
      if (impact.block_paths && impact.block_paths.includes(jsonPath)) {
        return true;
      }

      // 2. 아티팩트 ID 매칭 (Fallback)
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
  
  // 전달받은 이터레이션이 있으면 사용하고, 없으면 노드에서 찾음 (노드에 이터레이션이 없을 확률이 높으므로 전달받는 것이 SSOT)
  const activeIteration = propIteration || node?.iterations?.find(it => 
    selectedIterationId ? it.iteration_id === selectedIterationId : it.is_pass
  );
  
  const isConfirmed = activeIteration && Number(activeIteration.is_pass) === 1;
  const isActive = activeJsonPath === jsonPath;

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
        ${isTainted ? styles.tainted : ''}
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
