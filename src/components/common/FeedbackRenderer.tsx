import React from 'react';
import { EvaluationIssue } from '../../types/project';
import './FeedbackRenderer.scss';

interface FeedbackRendererProps {
  feedback: string | EvaluationIssue[] | null | undefined;
  type?: 'error' | 'info' | 'success';
}

const FeedbackRenderer: React.FC<FeedbackRendererProps> = ({ feedback, type = 'info' }) => {
  if (!feedback) return null;

  let issues: EvaluationIssue[] = [];
  let plainText: string | null = null;

  // 1. 이미 배열인 경우 처리
  if (Array.isArray(feedback)) {
    issues = feedback as any[];
  } 
  // 2. 문자열인 경우 처리
  else if (typeof feedback === 'string') {
    const trimmed = feedback.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          issues = parsed;
        } else if (typeof parsed === 'object' && parsed !== null) {
          // 단일 객체인 경우 배열로 감싸줌
          issues = [parsed as any];
        } else {
          plainText = feedback;
        }
      } catch {
        plainText = feedback;
      }
    } else {
      plainText = feedback;
    }
  } 
  // 3. 단일 객체인 경우 처리
  else if (typeof feedback === 'object' && feedback !== null) {
    issues = [feedback as any];
  }

  // 4. 평문 텍스트 렌더링
  if (plainText) {
    return <p className="feedback-text-plain">{plainText}</p>;
  }

  // 5. 이슈 목록 렌더링 (방어적 접근)
  if (issues.length === 0) return null;

  return (
    <div className={`feedback-issues-list feedback-issues-list--${type}`}>
      {issues.map((issue, idx) => {
        // 혹시나 각 필드가 객체일 경우를 대비해 문자열로 안전하게 변환
        const safeCode = typeof issue.code === 'object' ? JSON.stringify(issue.code) : String(issue.code || '');
        const safeLocation = typeof issue.location === 'object' ? JSON.stringify(issue.location) : String(issue.location || '');
        const safeDescription = typeof issue.description === 'object' ? JSON.stringify(issue.description) : String(issue.description || '');

        // 데이터가 유효하지 않은 경우 (모든 필드가 비어있음) 건너뜀
        if (!safeCode && !safeLocation && !safeDescription) return null;

        return (
          <div key={idx} className="feedback-issue-item">
            <div className="issue-header">
              <span className="issue-code">{safeCode}</span>
              {safeLocation && (
                <span className="issue-location">
                  <span className="material-symbols-outlined">location_on</span>
                  {safeLocation}
                </span>
              )}
            </div>
            {safeDescription && <p className="issue-description">{safeDescription}</p>}
          </div>
        );
      })}
    </div>
  );
};

export default FeedbackRenderer;
