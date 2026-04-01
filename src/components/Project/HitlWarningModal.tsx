import React from 'react';
import BaseModal from '../common/BaseModal';
import Button from '../common/Button';
import Badge from '../common/Badge';

interface HitlWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
  onApprove: () => void;
  nodeType: string;
  currentScore: number;
}

const HitlWarningModal: React.FC<HitlWarningModalProps> = ({
  isOpen,
  onClose,
  onRetry,
  onApprove,
  nodeType,
  currentScore
}) => {
  const footer = (
    <>
      <Button variant="ghost" onClick={onClose}>
        Dismiss
      </Button>
      <Button variant="danger" onClick={onRetry} leftIcon={<span className="material-symbols-outlined">refresh</span>}>
        Retry Pipeline
      </Button>
      <Button variant="primary" onClick={onApprove} leftIcon={<span className="material-symbols-outlined">verified</span>}>
        Force Approve
      </Button>
    </>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Quality Threshold Alert"
      subtitle="Human-in-the-Loop Intervention"
      footer={footer}
      size="md"
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
          <span className="material-symbols-outlined text-orange-500 text-4xl">warning</span>
          <div>
            <h4 className="text-orange-500 font-bold mb-1">Low Confidence Score</h4>
            <p className="text-on-surface-variant text-sm">
              The generated <Badge size="xs" variant="tertiary">{nodeType}</Badge> draft achieved a score of <strong>{currentScore}%</strong>, which is below the target threshold.
            </p>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/10">
          <h5 className="label-uppercase text-xs text-on-surface-variant mb-3">Recommended Action</h5>
          <p className="text-on-surface text-sm leading-relaxed">
            We recommend retrying the generation with adjusted prompts or approving it manually if the content meets your specific requirements.
          </p>
        </div>
      </div>
    </BaseModal>
  );
};

export default HitlWarningModal;
