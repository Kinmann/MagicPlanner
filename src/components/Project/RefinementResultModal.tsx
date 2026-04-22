import React from 'react';
import BaseModal from '../common/BaseModal';
import "./RefinementResultModal.scss";

interface RefinementResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    nodeId: string;
    nodeType: string;
    score: number;
    isPass: boolean;
    errors: any[];
    feedback: any[];
    originalJson: string;
    refinedJson: string;
    patchOps?: string;
    autoRecovered?: boolean;
  } | null;
}

const RefinementResultModal: React.FC<RefinementResultModalProps> = ({ isOpen, onClose, data }) => {
  if (!data) return null;

  // JSON Pointer 헬퍼: 특정 경로의 값을 추출
  const getValueByPath = (obj: any, path: string) => {
    const parts = path.split('/').filter(Boolean);
    let current = obj;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return current;
  };

  const getHunks = () => {
    if (!data.patchOps) return [];
    try {
      const ops = JSON.parse(data.patchOps);
      const original = JSON.parse(data.originalJson);
      if (!Array.isArray(ops)) return [];

      return ops.map((op: any, idx: number) => {
        const oldValue = getValueByPath(original, op.path);
        const pathLabel = op.path.replace(/\//g, ' > ').replace(/^ > /, '') || 'root';
        
        let action: 'ADD' | 'MODIFY' | 'DELETE' = 'MODIFY';
        if (op.op === 'add') action = 'ADD';
        else if (op.op === 'remove') action = 'DELETE';
        else if (op.op === 'replace') action = 'MODIFY';

        return {
          id: idx,
          label: pathLabel,
          action,
          asIs: (action === 'ADD') ? null : oldValue,
          toBe: (action === 'DELETE') ? null : op.value
        };
      });
    } catch (e) {
      console.error("Failed to parse patch for hunks:", e);
      return [];
    }
  };

  const hunks = getHunks();

  const formatValue = (val: any) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${data.nodeType} 정제 결과 비교 (상하 대조)`}
      maxWidth="1000px"
    >
      <div className="refinement-result-modal">
        {/* Score Dashboard */}
        <div className={`result-header ${data.isPass ? 'is-pass' : 'is-fail'}`}>
          <div className="score-badge">
            <span className="score-value">{data.score}</span>
            <span className="score-label">SCORE</span>
          </div>
          <div className="status-info">
            <h3>{data.isPass ? '정제 승인 권장' : '추가 정제 필요'}</h3>
            <p>{data.isPass ? '자동 검증 기준을 통과했습니다.' : '일부 지표에서 개선이 필요합니다.'}</p>
          </div>
        </div>

        {/* Auto-Recovered Message */}
        {data.autoRecovered && (
          <div className="auto-recovered-banner">
            <span className="material-symbols-outlined">info</span>
            <div className="banner-content">
              <h4>연관성 낮음: 기존 설계 유지</h4>
              <p>사용자님의 수정 의도가 이 노드의 설계 내용과 직접적인 연관이 없는 것으로 판단되었습니다. 시스템 무결성을 위해 수정을 생략하고 기존 상태를 유지했습니다.</p>
            </div>
          </div>
        )}

        {/* Changes Section */}
        <div className="changes-section">
          <div className="section-title">
            <span className="material-symbols-outlined">difference</span>
            <h4>수정된 부분 집중 대조 ({(hunks || []).length})</h4>
          </div>

          <div className="hunks-list">
            {hunks.map((hunk) => (
              <div key={hunk.id} className={`hunk-card ${hunk.action.toLowerCase()}`}>
                <div className="hunk-meta">
                  <span className={`action-badge ${hunk.action.toLowerCase()}`}>{hunk.action}</span>
                  <span className="path-label">{hunk.label}</span>
                </div>
                
                <div className="hunk-comparison-vertical">
                  {/* AS-IS Section */}
                  <div className="hunk-side as-is">
                    <div className="side-tag">AS-IS</div>
                    <div className="content-box">
                      {hunk.asIs !== null && hunk.asIs !== undefined ? (
                        <pre><code>{formatValue(hunk.asIs)}</code></pre>
                      ) : (
                        <div className="empty-placeholder">내용 없음</div>
                      )}
                    </div>
                  </div>

                  <div className="hunk-arrow">
                    <span className="material-symbols-outlined">south</span>
                  </div>

                  {/* TO-BE Section */}
                  <div className="hunk-side to-be">
                    <div className="side-tag">TO-BE</div>
                    <div className="content-box">
                      {hunk.toBe !== null && hunk.toBe !== undefined ? (
                        <pre><code>{formatValue(hunk.toBe)}</code></pre>
                      ) : (
                        <div className="empty-placeholder">내용 없음</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {(hunks || []).length === 0 && (
              <div className="no-changes-msg">
                변경 사항이 없거나 분석할 수 없는 형식입니다.
              </div>
            )}
          </div>
        </div>

        {/* Feedback Section */}
        <div className="feedback-section">
          <div className="section-title">
            <span className="material-symbols-outlined">chat_bubble</span>
            <h4>Actionable Feedback</h4>
          </div>
          {(data.feedback || []).length > 0 ? (
            <ul className="feedback-list">
              {(data.feedback || []).map((item, idx) => (
                <li key={idx} className="feedback-item">
                  <span className="badge">{item.code}</span>
                  <span className="content">{item.description}</span>
                  <span className="location">({item.location})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-feedback">모든 지표를 완벽하게 충족했습니다.</p>
          )}
          
          {(data.errors || []).length > 0 && (
            <div className="critical-errors">
              <h4>Critical Errors</h4>
              <ul className="error-list">
                {(data.errors || []).map((err: any, idx: number) => (
                  <li key={idx} className="error-item">
                    <span className="badge danger">{err.code}</span>
                    <span className="content">{err.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>확인</button>
        </div>
      </div>
    </BaseModal>
  );
};

export default RefinementResultModal;
