import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import BaseModal from '../common/BaseModal';
import Button from '../common/Button';
import './IncrementUpdateModal.scss';

interface IncrementUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess?: () => void;
}

type UpdateStep = 'INPUT' | 'ANALYZING' | 'CONFIRMATION' | 'VALIDATING' | 'VALIDATION_RESULT' | 'CASCADING' | 'SUCCESS';

interface ValidationResult {
  decision: 'PASS' | 'FAIL' | 'REFACTORING';
  rationale: string;
  violations: string[];
}

const IncrementUpdateModal: React.FC<IncrementUpdateModalProps> = (props) => {
  const { isOpen, onClose, projectId, onSuccess } = props;
  const [step, setStep] = useState<UpdateStep>('INPUT');
  const [requestText, setRequestText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetNodes, setTargetNodes] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState<string>('');
  const [intent, setIntent] = useState<any>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  useEffect(() => {
    const loadApiKey = async () => {
      const store = await Store.load('settings.json');
      const apiKeyValue = await store.get<{ value: string }>('gemini_api_key');
      if (apiKeyValue?.value) setApiKey(apiKeyValue.value);
    };
    loadApiKey();
  }, []);

  const handleStartAnalysis = async () => {
    if (!requestText.trim()) {
      setError('수정 요청 내용을 입력해 주세요.');
      return;
    }
    if (!apiKey) {
      setError('Gemini API Key가 설정되지 않았습니다. 설정에서 등록해 주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStep('ANALYZING');

    try {
      // 1. Intent Parsing
      const parsedIntent = await invoke<any>('parse_intent', { 
        apiKey,
        rawInput: requestText 
      });
      setIntent(parsedIntent);

      // 2. Architecture Routing
      const routing = await invoke<any>('route_architecture_target', {
        apiKey,
        projectId,
        intent: parsedIntent
      });

      setTargetNodes(routing.target_nodes);
      setStep('CONFIRMATION');
    } catch (err: any) {
      setError(err.toString());
      setStep('INPUT');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmRouting = async () => {
    setIsLoading(true);
    setError(null);
    setStep('VALIDATING');
    try {
      // 3. Global Validation
      const result = await invoke<ValidationResult>('validate_intent_globally', {
        apiKey,
        projectId,
        intent,
        targets: targetNodes
      });
      setValidationResult(result);
      setStep('VALIDATION_RESULT');
    } catch (err: any) {
      setError(err.toString());
      setStep('CONFIRMATION');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveValidation = async () => {
    setIsLoading(true);
    setError(null);
    setStep('CASCADING');
    try {
      // 4. Taint Cascade
      await invoke('apply_taint_cascade', {
        projectId,
        intent,
        targets: targetNodes
      });
      setStep('SUCCESS');
      setError(null);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.toString());
      setStep('VALIDATION_RESULT');
    } finally {
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    switch (step) {
      case 'INPUT':
        return (
          <div className="update-input-view">
            <p className="description">
              시스템에 추가하거나 수정하고 싶은 기능을 자연어로 입력하세요.<br/>
              AI가 아키텍처를 분석하여 변경이 필요한 부분을 자동으로 식별합니다.
            </p>
            <div className="input-container">
              <textarea
                placeholder="예: 결제 시스템에 Apple Pay 지원 기능을 추가하고, 기존 신용카드 결제 로직을 통합해줘."
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                className="custom-scrollbar"
                autoFocus
              />
              <div className="prompt-tips">
                <span className="material-symbols-outlined">lightbulb</span>
                <span>Tip: 기능의 목적과 대상 모듈을 구체적으로 언급할수록 정확도가 높아집니다.</span>
              </div>
            </div>
          </div>
        );
      case 'ANALYZING':
        return (
          <div className="update-analyzing-view">
            <div className="ai-loader">
              <div className="pulse-ring"></div>
              <span className="material-symbols-outlined ai-icon">auto_awesome</span>
            </div>
            <h3>Analyzing Architecture...</h3>
            <p>요청하신 내용을 바탕으로 시스템 영향도를 분석하고 있습니다.</p>
            <div className="progress-steps">
               <div className="step active">의도 추출 중...</div>
               <div className="step">아키텍처 영향도 평가 중...</div>
            </div>
          </div>
        );
      case 'CONFIRMATION':
        return (
          <div className="update-confirmation-view">
             <h3>Architecture Mapping Results</h3>
             <p>분석 결과, 다음 노드들이 수정 대상으로 지목되었습니다. 계속하시겠습니까?</p>
             <div className="target-node-list custom-scrollbar">
                {targetNodes.map((node, idx) => (
                   <div key={idx} className="target-node-item">
                     <span className="material-symbols-outlined">account_tree</span>
                     <span className="node-id">{node}</span>
                   </div>
                ))}
             </div>
             <p className="warning-text">승인 시 대상을 기준으로 글로벌 제약 적합성 검증 단계로 진입합니다.</p>
          </div>
        );
      case 'VALIDATING':
        return (
          <div className="update-analyzing-view">
            <div className="ai-loader">
              <div className="pulse-ring"></div>
              <span className="material-symbols-outlined ai-icon">fact_check</span>
            </div>
            <h3>Validating Constraints...</h3>
            <p>요청된 변경 사항이 시스템의 글로벌 제약(보안, 기술 스택 등)을 준수하는지 검증하고 있습니다.</p>
          </div>
        );
      case 'VALIDATION_RESULT':
        return (
          <div className="update-validation-result-view">
            <div className={`decision-badge ${validationResult?.decision.toLowerCase()}`}>
               <span className="material-symbols-outlined">
                 {validationResult?.decision === 'PASS' ? 'check_circle' : 
                  validationResult?.decision === 'FAIL' ? 'cancel' : 'warning'}
               </span>
               <span className="decision-text">{validationResult?.decision}</span>
            </div>
            <h3>Global Validation Analysis</h3>
            <div className="rationale-box custom-scrollbar">
               <p>{validationResult?.rationale}</p>
            </div>
            {validationResult?.violations && validationResult.violations.length > 0 && (
              <div className="violations-container">
                <h4>Detected Issues:</h4>
                <ul className="violations-list custom-scrollbar">
                  {validationResult.violations.map((v, i) => <li key={i}>{v}</li>)}
                </ul>
              </div>
            )}
            <p className="final-prompt">본 검증 결과를 확인하셨습니까? 승인 시 오염 전파 및 수정이 시작됩니다.</p>
          </div>
        );
      case 'CASCADING':
        return (
          <div className="update-analyzing-view">
            <div className="ai-loader">
              <div className="pulse-ring"></div>
              <span className="material-symbols-outlined ai-icon">rebase_edit</span>
            </div>
            <h3>Cascading Changes...</h3>
            <p>수정 대상 노드와 연관된 하위 의존성 노드들에 대해 'STALE' 마킹을 진행하고 있습니다.</p>
          </div>
        );
      case 'SUCCESS':
        return (
          <div className="update-success-view">
            <div className="success-icon">
              <span className="material-symbols-outlined">task_alt</span>
            </div>
            <h3>Routing Confirmed!</h3>
            <p>아키텍처 수정 파이프라인이 성공적으로 트리거되었습니다.</p>
            <Button variant="primary" onClick={onClose}>확인</Button>
          </div>
        );
    }
  };

  const footer = step === 'INPUT' ? (
    <>
      <Button variant="ghost" onClick={onClose}>취소</Button>
      <Button variant="primary" onClick={handleStartAnalysis} isLoading={isLoading}>분석 시작</Button>
    </>
  ) : step === 'CONFIRMATION' ? (
    <>
      <Button variant="ghost" onClick={() => setStep('INPUT')}>재설정</Button>
      <Button variant="primary" onClick={handleConfirmRouting} isLoading={isLoading}>확인 및 검증</Button>
    </>
  ) : step === 'VALIDATION_RESULT' ? (
    <>
      <Button variant="ghost" onClick={() => setStep('INPUT')}>처음으로</Button>
      <Button 
        variant="primary" 
        onClick={handleApproveValidation} 
        isLoading={isLoading}
        disabled={validationResult?.decision === 'FAIL'}
      >
        최종 승인 및 진행
      </Button>
    </>
  ) : null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Increment Update"
      subtitle="Refine & Modify Project"
      footer={footer}
      size={(step === 'CONFIRMATION' || step === 'VALIDATION_RESULT') ? 'md' : 'sm'}
      className="increment-update-modal"
    >
      {renderContent()}
      {error && <div className="error-message">{error}</div>}
    </BaseModal>
  );
};

export default IncrementUpdateModal;
