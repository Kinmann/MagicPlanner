import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import './CreateProjectModal.scss';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (projectId: string) => void;
}

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [concept, setConcept] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (concept.length < 50) {
       setError('기획 컨셉은 최소 50자 이상 입력해야 합니다.');
       return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const projectId = await invoke<string>('create_project', {
        name,
        mode,
        inputText: concept,
      });
      onSuccess(projectId);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-overlay">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="backdrop"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="modal-content"
          >
            <div className="modal-header">
              <h2>🚀 새로운 기획 시작하기</h2>
              <p>당신의 아이디어를 구체적인 기획서로 변환합니다.</p>
            </div>

            <form onSubmit={handleSubmit} className="project-form">
              <div className="form-group">
                <label>프로젝트 이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: AI 일정 관리 앱"
                  required
                />
              </div>

              <div className="form-group">
                <label>파이프라인 실행 모드</label>
                <div className="mode-selector">
                  {(['AUTO', 'MANUAL'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`mode-btn ${mode === m ? 'active' : ''}`}
                    >
                      {m === 'AUTO' ? '자동 (Best-of-N 최적화)' : '수동 (단계별 확인)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>초기 기획 컨셉 (최소 50자)</label>
                <textarea
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="앱의 핵심 기능, 타겟 고객, 해결하고자 하는 문제 등을 상세히 적어주세요."
                  required
                />
                <div className="counter-box">
                  <span className={`counter ${concept.length < 50 ? 'warning' : 'success'}`}>
                    {concept.length} / 50자 이상
                  </span>
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="error-message"
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem', borderRadius: '0.5rem', color: '#f87171', fontSize: '0.875rem' }}
                  >
                     {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="form-actions">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-cancel"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-submit"
                >
                  {isLoading ? '프로젝트 생성 중...' : '기획 파이프라인 가동'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CreateProjectModal;
