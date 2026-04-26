import React, { useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { 
  Terminal, Database, ShieldCheck, 
  Layers, Box, GitBranch, Map, History,
  Square, RotateCcw, Check,
  Rocket, Sparkles, FileText,
  Zap, Trash2, Undo2
} from 'lucide-react';

import { GenerationIteration, GlobalContext, CONTEXT_TYPE_LABELS } from '../../types/project';
import { Button } from '../ui/Button';
import SadSpecRenderer from './SadSpecRenderer';
import { useProjectStore } from '../../store/projectStore';
import styles from './SadOverview.module.scss';

const CONTEXT_ICONS: Record<string, any> = {
  sad_non_tech: FileText,
  sad_tech_stack: Terminal,
  sad_core_erd: Database,
  sad_auth_rbac: ShieldCheck,
  sad_interface_error: Zap,
  sad_module_list: Box,
  sad_epic_mapping: Map,
  sad_module_deps: GitBranch,
};

interface SadOverviewProps {
  isLocked?: boolean;
}

const SadOverview: React.FC<SadOverviewProps> = ({ isLocked = false }) => {
  const { 
    currentProject, nodes, 
    runSadPipeline, stopNode,
    approveSadNode, confirmSadIteration, unconfirmIteration,
    deleteIteration, updateMaxIterations, createLocalModules
  } = useProjectStore(useShallow(state => ({
    currentProject: state.currentProject,
    nodes: state.nodes,
    runSadPipeline: state.runSadPipeline,
    stopNode: state.stopNode,
    approveSadNode: state.approveSadNode,
    confirmSadIteration: state.confirmSadIteration,
    unconfirmIteration: state.unconfirmIteration,
    deleteIteration: state.deleteIteration,
    updateMaxIterations: state.updateMaxIterations,
    createLocalModules: state.createLocalModules
  })));

  const globalNode = useMemo(() => nodes.find(n => n.target_node_type === 'SAD_Global') || null, [nodes]);
  const moduleNode = useMemo(() => nodes.find(n => n.target_node_type === 'SAD_Module') || null, [nodes]);

  const [activeStage, setActiveStage] = useState<'GLOBAL' | 'MODULE'>('GLOBAL');
  const [contexts, setContexts] = useState<GlobalContext[]>([]);
  const [globalIters, setGlobalIters] = useState<GenerationIteration[]>([]);
  const [moduleIters, setModuleIters] = useState<GenerationIteration[]>([]);
  const [selectedGlobalIterId, setSelectedGlobalIterId] = useState<string | null>(null);
  const [selectedModuleIterId, setSelectedModuleIterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tempMax, setTempMax] = useState(10);
  const [viewMode, setViewMode] = useState<'STEP' | 'INTEGRATED' | 'RAW'>('STEP');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const currentNode = activeStage === 'GLOBAL' ? globalNode : moduleNode;
  const currentIters = activeStage === 'GLOBAL' ? globalIters : moduleIters;
  const currentSelectedIterId = activeStage === 'GLOBAL' ? selectedGlobalIterId : selectedModuleIterId;

  const currentIterIdx = useMemo(() => {
    return currentIters.findIndex(it => it.iteration_id === currentSelectedIterId);
  }, [currentIters, currentSelectedIterId]);

  const filteredContexts = useMemo(() => {
    return contexts.filter(c => c.iteration_id === currentSelectedIterId);
  }, [contexts, currentSelectedIterId]);

  const derivedContexts = useMemo(() => {
    if (filteredContexts.length > 0) return filteredContexts;
    const currentDraft = currentIters[currentIterIdx]?.generated_draft_json;
    if (!currentDraft) return [];
    try {
      const json = typeof currentDraft === 'string' ? JSON.parse(currentDraft) : currentDraft;
      const dataObj = json.contexts || json;
      return Object.entries(dataObj)
        .filter(([type]) => CONTEXT_TYPE_LABELS[type] || type.startsWith('sad_'))
        .map(([type, data]) => ({
          context_id: `derived-${type}`,
          project_id: currentProject?.project_id || '',
          iteration_id: currentSelectedIterId || '',
          context_type: type,
          context_data_json: typeof data === 'string' ? data : JSON.stringify(data),
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })) as GlobalContext[];
    } catch (e) { return []; }
  }, [filteredContexts, currentIters, currentIterIdx, currentProject, currentSelectedIterId]);

  useEffect(() => {
    const currentTypes = derivedContexts.map(c => c.context_type);
    if (derivedContexts.length > 0 && (!activeCategory || !currentTypes.includes(activeCategory))) {
      setActiveCategory(derivedContexts[0].context_type);
    }
  }, [derivedContexts, activeCategory]);

  const syncData = async (force = false) => {
    if (!currentProject) return;
    try {
      const ctxs = await invoke<GlobalContext[]>('get_global_contexts', { projectId: currentProject.project_id });
      setContexts(ctxs);
      if (globalNode) {
        const giters = await invoke<GenerationIteration[]>('get_node_iterations', { nodeId: globalNode.node_id });
        const sortedG = [...giters].sort((a, b) => a.iteration_number - b.iteration_number);
        setGlobalIters(sortedG);
        if (sortedG.length > 0 && (!selectedGlobalIterId || force)) {
          const passIt = sortedG.find(it => it.is_pass);
          setSelectedGlobalIterId((passIt || sortedG[sortedG.length - 1]).iteration_id);
        }
      }
      if (moduleNode) {
        const miters = await invoke<GenerationIteration[]>('get_node_iterations', { nodeId: moduleNode.node_id });
        const sortedM = [...miters].sort((a, b) => a.iteration_number - b.iteration_number);
        setModuleIters(sortedM);
        if (sortedM.length > 0 && (!selectedModuleIterId || force)) {
          const passIt = sortedM.find(it => it.is_pass);
          setSelectedModuleIterId((passIt || sortedM[sortedM.length - 1]).iteration_id);
        }
      }
    } catch(e) { console.error(e); }
  };

  useEffect(() => { syncData(); }, [nodes, activeStage]);

  useEffect(() => {
    if (currentNode) setTempMax(currentNode.max_iterations);
  }, [currentNode?.node_id, currentNode?.max_iterations]);

  const handleRun = async () => {
    const targetCount = 8;
    setLoading(true);
    if (currentNode && tempMax !== currentNode.max_iterations) {
      await updateMaxIterations(currentNode.node_id, tempMax);
    }
    await runSadPipeline(activeStage, targetCount);
    setLoading(false);
  };

  const handleApproveStage = async () => {
    if (!currentNode) return;
    setLoading(true);
    await approveSadNode(currentNode.node_id);
    if (activeStage === 'GLOBAL') setActiveStage('MODULE');
    setLoading(false);
  };

  const handleConfirmIteration = async (iterId: string) => {
    const it = currentIters.find(i => i.iteration_id === iterId);
    if (!it) return;
    setLoading(true);
    if (it.is_pass) await unconfirmIteration(it.iteration_id);
    else await confirmSadIteration(it.iteration_id);
    await syncData(true);
    setLoading(false);
  };

  const handleDeleteIteration = async (iterId: string) => {
    const confirmed = await ask('이 이터레이션을 삭제하시겠습니까?', { title: 'Delete Draft', kind: 'warning' });
    if (!confirmed) return;
    setLoading(true);
    await deleteIteration(iterId);
    await syncData(true);
    setLoading(false);
  };

  const handleFinalize = async () => {
    setLoading(true);
    const moduleListCtx = contexts.find(c => c.context_type === 'sad_module_list' && c.iteration_id);
    if (moduleListCtx) {
      const parsed = JSON.parse(moduleListCtx.context_data_json);
      const modulesData = (parsed.modules || []).map((m: any, idx: number) => ({
        name: m.module_name,
        description: m.description,
        responsibility: m.core_responsibility,
        priority_order: m.priority_order ?? idx,
      }));
      await createLocalModules(JSON.stringify(modulesData));
    }
    setLoading(false);
  };

  const isStage1Locked = isLocked || Boolean(moduleNode && moduleNode.node_state !== 'READY' && moduleNode.node_state !== 'PENDING');
  const isCurrentLocked = activeStage === 'GLOBAL' ? isStage1Locked : isLocked;

  return (
    <div className={styles.container}>
      {/* 1. Architecture Header */}
      <div className={styles.headerRow}>
        <div className={styles.headerInfo}>
          <h1>Software Architecture Design</h1>
          <p className={styles.description}>
            {activeStage === 'GLOBAL' 
              ? 'Design global contexts including Tech Stack, Auth & RBAC, and Database Schemas.' 
              : 'Define functional module partitioning and core responsibilities for each component.'}
          </p>
          <div className={styles.controls}>
            <div className={styles.iterationBox}>
              <span className={styles.label}>Iteration Budget</span>
              <div className={styles.controlGroup}>
                <span className={styles.current}>{currentNode?.current_iteration || 0}</span>
                <span className={styles.sep}>/</span>
                <input 
                  type="number" 
                  value={tempMax} 
                  onChange={(e) => setTempMax(parseInt(e.target.value) || 1)} 
                  onBlur={() => currentNode && !isCurrentLocked && updateMaxIterations(currentNode.node_id, tempMax)}
                  disabled={loading || isCurrentLocked || currentNode?.node_state === 'COMPLETED'}
                />
              </div>
            </div>

            <div className={styles.buttonGroup}>
              {currentNode?.node_state === 'IN_PROGRESS' ? (
                <Button onClick={() => stopNode(currentNode.node_id)} variant="danger" leftIcon={<Square size={14} />}>Stop</Button>
              ) : (
                <Button 
                  onClick={handleRun} 
                  disabled={loading || isCurrentLocked} 
                  variant={currentNode?.node_state === 'COMPLETED' ? "secondary" : "primary"} 
                  isLoading={loading} 
                  leftIcon={currentNode?.node_state === 'COMPLETED' ? <RotateCcw size={14} /> : <Zap size={14} />}
                >
                  {currentNode?.node_state === 'COMPLETED' ? 'Regenerate' : 'Generate'}
                </Button>
              )}
              {currentIters.some(it => it.is_pass) && currentNode?.node_state !== 'COMPLETED' && !isCurrentLocked && (
                <Button onClick={handleApproveStage} variant="primary" leftIcon={<Check size={14} />}>Approve & Next</Button>
              )}
              {activeStage === 'MODULE' && (moduleNode?.node_state === 'COMPLETED') && !isCurrentLocked && (
                <Button onClick={handleFinalize} variant="primary" leftIcon={<Rocket size={14} />}>Finalize Design</Button>
              )}
            </div>
          </div>
        </div>

        <div className={styles.stepper}>
          {[
            { id: 'GLOBAL', label: 'Stage 1: Global', node: globalNode },
            { id: 'MODULE', label: 'Stage 2: Module', node: moduleNode }
          ].map((s, i) => (
            <button 
              key={s.id} 
              className={`${styles.step} ${activeStage === s.id ? styles.active : ''} ${s.node?.node_state === 'COMPLETED' ? styles.completed : ''}`} 
              onClick={() => (s.id === 'GLOBAL' || globalNode?.node_state === 'COMPLETED') && setActiveStage(s.id as any)}
            >
              <div className={styles.stepNum}>{s.node?.node_state === 'COMPLETED' ? <Check size={10} /> : i + 1}</div>
              <div className={styles.stepLabel}>{s.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Revision History */}
      {currentIters.length > 0 && (
        <div className={styles.timeline}>
          <div className={styles.timelineHeader}>
            <h3><History size={14} /> Revision Timeline</h3>
            <div className="flex gap-2">
               <div className="btn-group">
                 <button className={`btn btn--secondary btn--sm ${viewMode === 'STEP' ? 'active' : ''}`} onClick={() => setViewMode('STEP')}><Layers size={14} /></button>
                 <button className={`btn btn--secondary btn--sm ${viewMode === 'INTEGRATED' ? 'active' : ''}`} onClick={() => setViewMode('INTEGRATED')}><Sparkles size={14} /></button>
                 <button className={`btn btn--secondary btn--sm ${viewMode === 'RAW' ? 'active' : ''}`} onClick={() => setViewMode('RAW')}><Terminal size={14} /></button>
               </div>
            </div>
          </div>
          <div className={styles.revisionList}>
            {currentIters.map((it) => (
              <div 
                key={it.iteration_id} 
                className={`${styles.revisionCard} ${currentSelectedIterId === it.iteration_id ? styles.active : ''} ${it.is_pass ? styles.confirmed : ''}`} 
                onClick={() => (activeStage === 'GLOBAL' ? setSelectedGlobalIterId(it.iteration_id) : setSelectedModuleIterId(it.iteration_id))}
              >
                <span className={styles.iterNum}>Draft #{it.iteration_number}</span>
                <span className={styles.score}>{it.calculated_score} <small>pts</small></span>
              </div>
            ))}
          </div>
          {currentIters[currentIterIdx] && !isCurrentLocked && (
            <div className="flex gap-2 mt-2">
              <Button 
                onClick={() => currentSelectedIterId && handleConfirmIteration(currentSelectedIterId)} 
                variant={currentIters[currentIterIdx].is_pass ? "ghost" : "secondary"} 
                size="sm"
                leftIcon={currentIters[currentIterIdx].is_pass ? <Undo2 size={14} /> : <Check size={14} />}
              >
                {currentIters[currentIterIdx].is_pass ? 'Unconfirm' : 'Confirm Selection'}
              </Button>
              <Button 
                onClick={() => currentSelectedIterId && handleDeleteIteration(currentSelectedIterId)} 
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

      {/* 3. Main Specification View */}
      <div className={styles.mainLayout}>
        {viewMode === 'STEP' && (
          <aside className={styles.categorySidebar}>
            {derivedContexts.map(ctx => {
              const IconComp = CONTEXT_ICONS[ctx.context_type] || FileText;
              return (
                <button 
                  key={ctx.context_id} 
                  className={`${styles.categoryBtn} ${activeCategory === ctx.context_type ? styles.active : ''}`}
                  onClick={() => setActiveCategory(ctx.context_type)}
                >
                  <IconComp className={styles.icon} size={14} />
                  <span className={styles.name}>{CONTEXT_TYPE_LABELS[ctx.context_type] || ctx.context_type}</span>
                </button>
              );
            })}
          </aside>
        )}

        <main className={styles.contentArea}>
          {viewMode === 'RAW' ? (
            <pre className={styles.rawView}>
              {currentIters[currentIterIdx]?.generated_draft_json ? JSON.stringify(JSON.parse(currentIters[currentIterIdx].generated_draft_json), null, 2) : 'No data'}
            </pre>
          ) : viewMode === 'INTEGRATED' ? (
            <div className={styles.integratedGrid}>
              {derivedContexts.map(ctx => (
                <div key={ctx.context_id} className={styles.contextCard}>
                  <div className={styles.cardTop}><span>Architecture</span><span>{ctx.context_type}</span></div>
                  <div className={styles.cardInner}>
                    <h4>{CONTEXT_TYPE_LABELS[ctx.context_type]}</h4>
                    <SadSpecRenderer type={ctx.context_type} data={ctx.context_data_json} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <header className={styles.specHeader}>
                <h2>{CONTEXT_TYPE_LABELS[activeCategory || ''] || activeCategory} Specification</h2>
              </header>
              <div className={styles.specBody}>
                {activeCategory && (
                  <SadSpecRenderer 
                    type={activeCategory} 
                    data={derivedContexts.find(c => c.context_type === activeCategory)?.context_data_json} 
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default SadOverview;
