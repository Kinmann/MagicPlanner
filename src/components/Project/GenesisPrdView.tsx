import React, { useState, useMemo, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ask } from '@tauri-apps/plugin-dialog';
import { 
  Play, Square, RotateCcw, CheckCircle, History, 
  Sparkles, Layers, Terminal, ChevronRight, 
  Trash2, Undo2, Check, Zap, RefreshCw, AlertCircle
} from 'lucide-react';

import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Alert } from '../ui/Alert';
import { useProjectStore } from '../../store/projectStore';
import { PrdBentoRenderer } from './GlobalRenderers';
import styles from './GenesisPrdView.module.scss';

interface GenesisPrdViewProps {
  isLocked?: boolean;
}

const GenesisPrdView: React.FC<GenesisPrdViewProps> = ({ 
  isLocked = false 
}) => {
  // Store Subscriptions
  const { 
    allNodes, currentProject, 
    runNode, stopNode, resumeNode, 
    approveGenesisNode, approveGenesisPrd, confirmGenesisIteration, unconfirmIteration,
    deleteIteration, updateMaxIterations
  } = useProjectStore(useShallow(state => ({
    allNodes: state.nodes,
    currentProject: state.currentProject,
    runNode: state.runNode,
    stopNode: state.stopNode,
    resumeNode: state.resumeNode,
    approveGenesisNode: state.approveGenesisNode,
    approveGenesisPrd: state.approveGenesisPrd,
    confirmGenesisIteration: state.confirmGenesisIteration,
    unconfirmIteration: state.unconfirmIteration,
    deleteIteration: state.deleteIteration,
    updateMaxIterations: state.updateMaxIterations
  })));

  const nodes = useMemo(() => 
    allNodes.filter(n => n.target_node_type.startsWith('GPRD_')),
    [allNodes]
  );

  const [activeStage, setActiveStage] = useState<'GPRD_Context_Goal' | 'GPRD_Capability_Actor' | 'GPRD_Architecture_Schema'>('GPRD_Context_Goal');
  const [viewMode, setViewMode] = useState<'STEP' | 'INTEGRATED' | 'RAW'>('STEP');
  
  const node = useMemo(() => nodes.find(n => n.target_node_type === activeStage) || null, [nodes, activeStage]);

  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<any>(null);
  const [iterations, setIterations] = useState<any[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [tempMax, setTempMax] = useState(node?.max_iterations || 10);
  const [isAiGuidanceOpen, setIsAiGuidanceOpen] = useState(false);

  const allCompleted = nodes.length > 0 && nodes.every(n => n.node_state === 'COMPLETED');

  // Event Listeners
  useEffect(() => {
    const unlisten = listen<any>('pipeline-status', (event) => {
      const msg = event.payload;
      if (typeof msg === 'string') {
        if (msg.includes('임베딩 중')) setStatusMsg(msg);
        else if (msg.includes('임베딩 완료') || msg.includes('임베딩 실패')) setStatusMsg(null);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Auto-switch stage
  useEffect(() => {
    if (nodes.length > 0) {
      const current = nodes.find(n => ['READY', 'IN_PROGRESS', 'PAUSED_HITL', 'PAUSED_API_ERROR'].includes(n.node_state));
      if (current) setActiveStage(current.target_node_type as any);
      else if (allCompleted && viewMode === 'STEP') setViewMode('INTEGRATED');
    }
  }, [nodes, allCompleted]);

  useEffect(() => {
    if (node) setTempMax(node.max_iterations);
  }, [node?.node_id, node?.max_iterations]);

  // Content Loader
  const loadContent = async (force = false) => {
    if (!node) return;
    try {
      const iters = await invoke<any[]>('get_node_iterations', { projectId: currentProject?.project_id, nodeId: node.node_id });
      if (iters && iters.length > 0) {
        const sorted = [...iters].sort((a, b) => a.iteration_number - b.iteration_number);
        setIterations(sorted);
        let targetIdx = selectedIdx;
        if (force || selectedIdx < 0 || selectedIdx >= sorted.length) {
          const passIdx = sorted.findIndex((it: any) => it.is_pass);
          targetIdx = passIdx >= 0 ? passIdx : sorted.length - 1;
        }
        setSelectedIdx(targetIdx);
        const raw = sorted[targetIdx].content_json || sorted[targetIdx].generated_draft_json;
        setContent(normalizeKeys(typeof raw === 'string' ? JSON.parse(raw) : raw));
      } else {
        setIterations([]);
        setSelectedIdx(-1);
        setContent(null);
      }
    } catch (e) { console.error(e); }
  };

  const [integratedData, setIntegratedData] = useState<any[]>([]);

  const fetchBestIterationContent = async (nodeType: string) => {
    const targetNode = nodes.find(n => n.target_node_type === nodeType);
    if (!targetNode) return null;
    try {
      const it = await invoke<any | null>('get_latest_iteration', { nodeId: targetNode.node_id });
      if (it) {
        const raw = it.content_json || it.generated_draft_json;
        if (raw) return normalizeKeys(typeof raw === 'string' ? JSON.parse(raw) : raw);
      }
    } catch (e) { console.error(e); }
    return null;
  };

  useEffect(() => {
    if (viewMode === 'INTEGRATED') {
       const fetchAllStages = async () => {
         try {
           const [s1, s2, s3] = await Promise.all([
             fetchBestIterationContent('GPRD_Context_Goal'),
             fetchBestIterationContent('GPRD_Capability_Actor'),
             fetchBestIterationContent('GPRD_Architecture_Schema')
           ]);
           const data = [
             { stage: 1, content: s1 },
             { stage: 2, content: s2 },
             { stage: 3, content: s3 }
           ].filter(item => item.content !== null && Object.keys(item.content).length > 0);
           setIntegratedData(data);
         } catch(e) { console.error(e); }
       };
       fetchAllStages();
    } else {
      loadContent();
    }
  }, [viewMode, activeStage, nodes, node?.node_id]);

  // Handlers
  const handleRun = async () => {
    setLoading(true);
    if (node && tempMax !== node.max_iterations) {
      await updateMaxIterations(node.node_id, tempMax);
    }
    await runNode(activeStage);
    setLoading(false);
  };

  const handleApproveStage = async () => {
    if (!node) return;
    setLoading(true);
    await approveGenesisNode(node.node_id);
    setLoading(false);
  };

  const handleProceedToSad = async () => {
    setLoading(true);
    await approveGenesisPrd();
    setLoading(false);
  };

  const handleConfirmIteration = async (idx: number) => {
    const it = iterations[idx];
    if (!it) return;
    setLoading(true);
    if (it.is_pass) await unconfirmIteration(it.iteration_id);
    else await confirmGenesisIteration(it.iteration_id);
    await loadContent(true);
    setLoading(false);
  };

  const handleDeleteIteration = async (idx: number) => {
    const it = iterations[idx];
    if (!it) return;
    const confirmed = await ask('이 이터레이션을 삭제하시겠습니까?', { title: 'Delete Draft', kind: 'warning' });
    if (!confirmed) return;
    setLoading(true);
    await deleteIteration(it.iteration_id);
    await loadContent(true);
    setLoading(false);
  };

  const normalizeKeys = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(normalizeKeys);
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj).reduce((acc: any, key) => {
        const snakeKey = key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`).replace(/^_/, '');
        acc[snakeKey] = normalizeKeys(obj[key]);
        return acc;
      }, {});
    }
    return obj;
  };

  const isCurrentStageLocked = isLocked || (
    activeStage === 'GPRD_Context_Goal' ? (nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor')?.node_state !== 'READY' && nodes.find(n => n.target_node_type === 'GPRD_Capability_Actor')?.node_state !== 'PENDING') :
    activeStage === 'GPRD_Capability_Actor' ? (nodes.find(n => n.target_node_type === 'GPRD_Architecture_Schema')?.node_state !== 'READY' && nodes.find(n => n.target_node_type === 'GPRD_Architecture_Schema')?.node_state !== 'PENDING') :
    false
  );

  return (
    <div className={styles.container}>
      {/* 1. Header & Stepper */}
      <div className={styles.headerRow}>
        <div className={styles.headerInfo}>
          <h1>Genesis PRD</h1>
          <p className={styles.description}>Define the business goals and architectural foundation of your project.</p>
          
          <div className={styles.controls}>
            <div className={styles.iterationBox}>
              <span className={styles.label}>Iteration Budget</span>
              <div className={styles.controlGroup}>
                <span className={styles.current}>{node?.current_iteration || 0}</span>
                <span className={styles.sep}>/</span>
                <input 
                  type="number" 
                  value={tempMax} 
                  onChange={(e) => setTempMax(parseInt(e.target.value) || 1)} 
                  onBlur={() => node && !isCurrentStageLocked && updateMaxIterations(node.node_id, tempMax)}
                  disabled={loading || isCurrentStageLocked || node?.node_state === 'COMPLETED'}
                />
              </div>
            </div>

            <div className={styles.buttonGroup}>
              {node?.node_state === 'IN_PROGRESS' ? (
                <Button onClick={() => stopNode(node.node_id)} variant="danger" leftIcon={<Square size={14} />}>Stop</Button>
              ) : (
                <Button 
                  onClick={handleRun} 
                  disabled={loading || isCurrentStageLocked} 
                  variant={node?.node_state === 'COMPLETED' ? "secondary" : "primary"} 
                  isLoading={loading} 
                  leftIcon={node?.node_state === 'COMPLETED' ? <RotateCcw size={14} /> : <Zap size={14} />}
                >
                  {node?.node_state === 'COMPLETED' ? 'Regenerate' : 'Generate'}
                </Button>
              )}
              
              {node?.node_state === 'PAUSED_STOPPED' && (
                <Button onClick={() => resumeNode(node.node_id)} variant="primary" leftIcon={<Play size={14} />}>Resume</Button>
              )}

              {iterations.some(it => it.is_pass) && node?.node_state !== 'COMPLETED' && !isCurrentStageLocked && (
                <Button onClick={handleApproveStage} variant="primary" leftIcon={<CheckCircle size={14} />}>Approve & Next</Button>
              )}

              {activeStage === 'GPRD_Architecture_Schema' && node?.node_state === 'COMPLETED' && (
                <Button onClick={handleProceedToSad} variant="primary" rightIcon={<ChevronRight size={14} />}>Proceed to SAD</Button>
              )}
            </div>
          </div>
        </div>

        <div className={styles.stepper}>
          {['GPRD_Context_Goal', 'GPRD_Capability_Actor', 'GPRD_Architecture_Schema'].map((type, i) => {
            const sNode = nodes.find(n => n.target_node_type === type);
            return (
              <button 
                key={type} 
                className={`${styles.step} ${activeStage === type ? styles.active : ''} ${sNode?.node_state === 'COMPLETED' ? styles.completed : ''}`} 
                onClick={() => setActiveStage(type as any)}
              >
                <div className={styles.stepNum}>{sNode?.node_state === 'COMPLETED' ? <Check size={10} /> : i + 1}</div>
                <div className={styles.stepLabel}>Stage {i+1}</div>
              </button>
            );
          })}
        </div>
      </div>

      {statusMsg && (
        <div className={styles.statusBanner}>
          <RefreshCw className="spin" size={14} />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* 2. Revision Timeline */}
      {iterations.length > 0 && (
        <div className={styles.timeline}>
          <div className={styles.timelineHeader}>
            <h3><History size={14} /> Revision History</h3>
            <div className={styles.viewActions}>
              <button className="btn btn--secondary btn--sm" onClick={() => setIsAiGuidanceOpen(true)}><Sparkles size={14} /> AI Insight</button>
              <div className="btn-group ml-4">
                <button className={`btn btn--secondary btn--sm ${viewMode === 'STEP' ? 'active' : ''}`} onClick={() => setViewMode('STEP')}><Layers size={14} /></button>
                <button className={`btn btn--secondary btn--sm ${viewMode === 'RAW' ? 'active' : ''}`} onClick={() => setViewMode('RAW')}><Terminal size={14} /></button>
                <button className={`btn btn--secondary btn--sm ${viewMode === 'INTEGRATED' ? 'active' : ''}`} onClick={() => setViewMode('INTEGRATED')}><Zap size={14} /></button>
              </div>
            </div>
          </div>
          
          <div className={styles.revisionList}>
            {iterations.map((it, idx) => (
              <div 
                key={it.iteration_id} 
                className={`${styles.revisionCard} ${selectedIdx === idx ? styles.active : ''} ${it.is_pass ? styles.confirmed : ''}`} 
                onClick={() => viewMode === 'STEP' && setSelectedIdx(idx)}
              >
                <span className={styles.iterNum}>Draft #{it.iteration_number}</span>
                <span className={styles.score}>{it.calculated_score} <small>pts</small></span>
                {it.is_pass && <CheckCircle size={12} className="text-secondary" />}
              </div>
            ))}
          </div>

          {viewMode === 'STEP' && iterations[selectedIdx] && !isCurrentStageLocked && (
            <div className="flex gap-2 mt-2">
              <Button 
                onClick={() => handleConfirmIteration(selectedIdx)} 
                variant={iterations[selectedIdx].is_pass ? "ghost" : "secondary"} 
                size="sm"
                leftIcon={iterations[selectedIdx].is_pass ? <Undo2 size={14} /> : <Check size={14} />}
              >
                {iterations[selectedIdx].is_pass ? 'Unconfirm' : 'Confirm Selection'}
              </Button>
              <Button 
                onClick={() => handleDeleteIteration(selectedIdx)} 
                variant="ghost" 
                size="sm"
                className="text-error"
                leftIcon={<Trash2 size={14} />}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 3. Main Viewport */}
      <div className={styles.viewport}>
        <div className={styles.scrollArea}>
          {viewMode === 'RAW' ? (
            <pre className={styles.rawView}>{JSON.stringify(content, null, 2)}</pre>
          ) : viewMode === 'INTEGRATED' ? (
            <div className={styles.integratedStack}>
               {integratedData.map((item, idx) => (
                 <PrdBentoRenderer key={idx} content={item.content} isIntegrated={true} stage={item.stage} />
               ))}
            </div>
          ) : (
            <PrdBentoRenderer content={content} isIntegrated={false} />
          )}
        </div>
      </div>

      {/* AI Guidance Modal */}
      <Dialog 
        isOpen={isAiGuidanceOpen} 
        onClose={() => setIsAiGuidanceOpen(false)} 
        title="AI Intelligence Feedback"
        size="md"
      >
        <div className="p-4 flex flex-col gap-4">
          {iterations[selectedIdx]?.critical_errors_array && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-2 text-rose-500 font-bold mb-2 text-xs uppercase tracking-widest">
                <AlertCircle size={14} /> Critical Issues Found
              </h4>
              {(Array.isArray(iterations[selectedIdx].critical_errors_array) 
                ? iterations[selectedIdx].critical_errors_array 
                : [iterations[selectedIdx].critical_errors_array]
              ).map((err: any, i: number) => (
                <Alert 
                  key={i}
                  variant="error"
                  title={err.code || "Violation"}
                  description={err.description || String(err)}
                />
              ))}
            </div>
          )}
          {iterations[selectedIdx]?.actionable_feedback_text && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-2 text-emerald-500 font-bold mb-2 text-xs uppercase tracking-widest">
                <Sparkles size={14} /> Optimization Guidance
              </h4>
              <Alert 
                variant="info"
                description={iterations[selectedIdx].actionable_feedback_text}
              />
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
};

export default GenesisPrdView;
