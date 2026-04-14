import React from 'react';
import { EvaluationIssue } from '../../types/project';
import './FeedbackRenderer.scss';

interface FeedbackRendererProps {
  feedback: string | EvaluationIssue[] | null | undefined;
  type?: 'error' | 'info' | 'success';
}

const FeedbackRenderer: React.FC<FeedbackRendererProps> = ({ feedback, type = 'info' }) => {
  if (!feedback) return null;

  // 재귀적 JSON 파싱 함수 (이중 직렬화 대응)
  const parseRecursively = (data: any): any => {
    if (typeof data !== 'string') return data;
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === 'string') {
        const trimmed = parsed.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          return parseRecursively(parsed);
        }
      }
      return parsed;
    } catch {
      return data;
    }
  };

  const parsedData = parseRecursively(feedback);
  let issues: EvaluationIssue[] = [];
  let isPlainString = false;

  if (Array.isArray(parsedData)) {
    // EvaluationIssue 구조를 가진 객체들만 필터링 (최소한 description은 있어야 함)
    issues = parsedData.filter(item => 
      item && typeof item === 'object' && (item.description || item.code)
    );
    if (issues.length === 0 && parsedData.length > 0) {
      // 배열이지만 이슈 구조가 아닌 경우 문자열 리스트로 간주하여 변환 시도
      isPlainString = true;
    }
  } else if (typeof parsedData === 'string') {
    isPlainString = true;
  }

  if (isPlainString) {
    const textContent = typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData, null, 2);
    return (
      <div className={`feedback-text-wrapper feedback-text-wrapper--${type}`}>
        <p className="feedback-text-plain">{textContent}</p>
      </div>
    );
  }

  if (issues.length === 0) return null;

  return (
    <div className={`feedback-issues-list feedback-issues-list--${type}`}>
      {issues.map((issue, idx) => (
        <div key={idx} className="feedback-issue-item">
          <div className="issue-header">
            {issue.code && <span className="issue-code">{issue.code}</span>}
            {issue.location && (
              <span className="issue-location">
                <span className="material-symbols-outlined">location_on</span>
                {issue.location}
              </span>
            )}
          </div>
          <p className="issue-description">
            {issue.description || '상세 설명 없음'}
          </p>
        </div>
      ))}
    </div>
  );
};

export default FeedbackRenderer;
