import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Trash2, Pencil, Check, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCommentStore } from '../../store/commentStore';
import { useUIStore } from '../../store/uiStore';
import { useModalStore } from '../../store/modalStore';
import styles from './CommentableRow.module.scss';

interface CommentPopoverProps {
  jsonPath: string;
  nodeId: string;
  iterationId: string;
  onClose: () => void;
}

export const CommentPopover: React.FC<CommentPopoverProps> = ({
  jsonPath,
  nodeId,
  iterationId,
  onClose,
}) => {
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const { showAlert, showError } = useModalStore();
  const allComments = useCommentStore(state => state.comments);
  const comments = useMemo(() => 
    (allComments || []).filter(c => c.json_path === jsonPath),
    [allComments, jsonPath]
  );
  const { 
    addComment, 
    deleteComment, 
    updateComment,
    isLoading 
  } = useCommentStore();
  const projectId = useUIStore.getState().currentProjectId;
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = (element: HTMLTextAreaElement | null) => {
    if (element) {
      element.style.height = '0px'; 
      element.style.height = `${element.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight(textareaRef.current);
  }, [newComment]);

  useEffect(() => {
    if (editingId) {
      adjustHeight(editTextareaRef.current);
    }
  }, [editingId, editingText]);

  useEffect(() => {
    // 새 코멘트 추가 시 하단으로 스크롤
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments.length]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    if (!iterationId) {
      showAlert("이터레이션 정보가 유효하지 않습니다. 페이지를 새로고침하거나 올바른 버전을 선택해 주세요.", "알림");
      return;
    }
    
    
    try {
      if (!projectId) {
        showError("프로젝트 ID가 유효하지 않습니다.", "오류");
        return;
      }
      await addComment({
        projectId,
        nodeId,
        iterationId,
        jsonPath,
        commentText: newComment,
      });
      setNewComment('');
    } catch (err: any) {
      console.error("Failed to add comment:", err);
      const errorMsg = err.toString().includes("Confirmed") 
        ? "코멘트는 확정된(Confirmed) 이터레이션에만 작성할 수 있습니다."
        : "코멘트 작성에 실패했습니다. 시스템 오류가 발생했습니다.";
      showError(errorMsg, "오류 발생");
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

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('ko-KR', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <>
      <div className={styles.popoverOverlay} onClick={onClose} />
      <motion.div 
        className={styles.popover}
        initial={{ scale: 0.9, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 10 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        {comments.length > 0 && (
          <div className={styles.commentList} ref={scrollRef}>
            {comments.map((comment) => (
              <div key={comment.comment_id} className={styles.commentCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.author}>{comment.author || 'Unknown'}</span>
                  <span className={styles.time}>{formatTime(comment.created_at)}</span>
                </div>
                <div className={styles.cardBody}>
                  {editingId === comment.comment_id ? (
                    <div className={styles.editArea}>
                      <textarea 
                        ref={editTextareaRef}
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        autoFocus
                        rows={1}
                      />
                      <div className={styles.editActions}>
                        <button onClick={() => setEditingId(null)} className={styles.cancelEdit}>
                          <RotateCcw size={12} />
                        </button>
                        <button onClick={() => handleUpdate(comment.comment_id)} className={styles.saveEdit}>
                          <Check size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    comment.comment_text
                  )}
                </div>
                <div className={styles.cardActions}>
                  {editingId !== comment.comment_id && (
                    <>
                      <button 
                        onClick={() => {
                          setEditingId(comment.comment_id);
                          setEditingText(comment.comment_text);
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button 
                        className={styles.deleteBtn}
                        onClick={() => deleteComment(comment.comment_id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.commentInputSection}>
          <textarea 
            ref={textareaRef}
            placeholder="Leave a comment"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            autoFocus
            rows={1}
          />
          <div className={styles.inputActions}>
            <button className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button 
              className={styles.submitBtn}
              onClick={handleSubmit} 
              disabled={!newComment.trim() || isLoading}
            >
              {isLoading ? 'Adding...' : 'Add Comment'}
            </button>
          </div>
        </div>
      </motion.div>

    </>
  );
};
