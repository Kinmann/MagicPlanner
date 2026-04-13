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
  let isPlainString = false;

  if (Array.isArray(feedback)) {
    issues = feedback;
  } else if (typeof feedback === 'string') {
    try {
      const parsed = JSON.parse(feedback);
      if (Array.isArray(parsed)) {
        issues = parsed;
      } else {
        isPlainString = true;
      }
    } catch {
      isPlainString = true;
    }
  }

  if (isPlainString && typeof feedback === 'string') {
    return <p className="feedback-text-plain">{feedback}</p>;
  }

  if (issues.length === 0) return null;

  return (
    <div className={`feedback-issues-list feedback-issues-list--${type}`}>
      {issues.map((issue, idx) => (
        <div key={idx} className="feedback-issue-item">
          <div className="issue-header">
            <span className="issue-code">{issue.code}</span>
            <span className="issue-location">
              <span className="material-symbols-outlined">location_on</span>
              {issue.location}
            </span>
          </div>
          <p className="issue-description">{issue.description}</p>
        </div>
      ))}
    </div>
  );
};

export default FeedbackRenderer;
