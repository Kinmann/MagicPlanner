import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, Pencil, Check, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCommentStore } from '../../store/commentStore';
import { useUIStore } from '../../store/uiStore';
import { useModalStore } from '../../store/modalStore';
import styles from './CommentableRow.module.scss';

interface ReviewPopoverProps {
  nodeId: string;
  iterationId: string;
  onClose: () => void;
}

export const ReviewPopover: React.FC<ReviewPopoverProps> = ({
  nodeId,
  iterationId,
  onClose,
}) => {
  const [newComment, setNewComment] = useState('');
  const [isListExpanded, setIsListExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const { showError } = useModalStore();
  const allComments = useCommentStore(state => state.comments);
  const { addComment, deleteComment, updateComment, isLoading } = useCommentStore();
  const projectId = useUIStore.getState().currentProjectId;

  const handleSubmit = async () => {
    if (!newComment.trim() || !iterationId || !projectId) return;
    
    try {
      await addComment({
        projectId,
        nodeId,
        iterationId,
        jsonPath: '$', // Root level review
        commentText: newComment,
      });
      setNewComment('');
    } catch (err: any) {
      showError("리뷰 작성에 실패했습니다.", "오류");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  };

  const handleUpdate = async (commentId: string) => {
    if (!editingText.trim()) return;
    try {
      await updateComment(commentId, editingText, false);
      setEditingId(null);
      setEditingText('');
    } catch (err) {
      showError("코멘트 수정에 실패했습니다.", "오류");
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(commentId);
    } catch (err) {
      showError("코멘트 삭제에 실패했습니다.", "오류");
    }
  };

  return (
    <>
      <div className={styles.popoverOverlay} onClick={onClose} />
      <motion.div 
        className={`${styles.popover} ${styles.reviewPopover}`}
        initial={{ opacity: 0, y: -10, x: 20 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, y: -10, x: 20 }}
        style={{ 
          position: 'absolute', 
          top: '72px', 
          right: '0', 
          width: '480px',
          left: 'auto',
          transform: 'none'
        }}
      >
        <div className={styles.reviewContent}>
          <h4 className={styles.reviewHeader}>Submit comment</h4>
          
          <div className={styles.reviewInputRow}>
            <textarea 
              placeholder="Add a message, ↵ to submit"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button 
              className={styles.reviewSubmitBtn}
              onClick={handleSubmit}
              disabled={!newComment.trim() || isLoading}
            >
              Submit
            </button>
          </div>

          <div className={styles.reviewCommentsSection}>
            <button 
              className={styles.expandToggle}
              onClick={() => setIsListExpanded(!isListExpanded)}
            >
              {isListExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>Review {allComments.length} comment{allComments.length !== 1 ? 's' : ''}</span>
            </button>

            <AnimatePresence>
              {isListExpanded && (
                <motion.div 
                  className={styles.reviewList}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  {allComments.length === 0 ? (
                    <div className={styles.emptyList}>No comments yet.</div>
                  ) : (
                    allComments.map((comment) => (
                      <div key={comment.comment_id} className={styles.reviewItem}>
                        <div className={styles.itemContext}>"{comment.json_path}"</div>
                        <div className={styles.itemBody}>
                          {editingId === comment.comment_id ? (
                            <div className={styles.reviewEditArea}>
                              <textarea 
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                autoFocus
                              />
                              <div className={styles.reviewEditActions}>
                                <button onClick={() => setEditingId(null)}><RotateCcw size={12} /></button>
                                <button onClick={() => handleUpdate(comment.comment_id)} className={styles.saveEdit}><Check size={12} /></button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={styles.itemText}>{comment.comment_text}</div>
                              <div className={styles.reviewItemActions}>
                                <button onClick={() => {
                                  setEditingId(comment.comment_id);
                                  setEditingText(comment.comment_text);
                                }}>
                                  <Pencil size={12} />
                                </button>
                                <button onClick={() => handleDelete(comment.comment_id)} className={styles.deleteBtn}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </>
  );
};
