import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { 
  FileText, Settings, Layout, GitBranch, 
  Database, Grid, Zap, CheckCircle, 
  Play, Square, RotateCcw, Eye, Edit3,
  RefreshCw
} from 'lucide-react';

import { DocumentNode, LocalModule } from '../../types/project';
import { formatNodeTitle } from '../../utils/formatters';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useEngineStore } from '../../store/engineStore';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Progress } from '../ui/Progress';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import styles from './PipelineCard.module.scss';

interface PipelineCardProps {
  node: DocumentNode;
  modules: LocalModule[];
  onDimensionsChange?: (type: string, dims: { width: number, height: number }) => void;
  isLocked?: boolean;
  disabled?: boolean;
}

const PipelineCard: React.FC<PipelineCardProps> = ({ 
  node, 
  modules,
  onDimensionsChange,
  isLocked = false,
  disabled = false
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isEditingMax, setIsEditingMax] = useState(false);
  const [tempMax, setTempMax] = useState(node.max_iterations);

  const { runNode, stopNode, resumeNode, handleHITLAction, updateMaxIterations } = useProjectStore(useShallow(state => ({
    runNode: state.runNode,
    stopNode: state.stopNode,
    resumeNode: state.resumeNode,
    handleHITLAction: state.handleHITLAction,
    updateMaxIterations: state.updateMaxIterations,
    confirmReview: state.confirmReview
  })));

  const setSelectedNode = useUIStore(state => state.setSelectedNode);
  const isEmbedding = useEngineStore(state => state.isEmbedding);
  const isActuallyDisabled = isLocked || disabled || isEmbedding || node.is_active;

  React.useLayoutEffect(() => {
    if (!containerRef.current || !onDimensionsChange) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        onDimensionsChange(node.target_node_type, { width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onDimensionsChange, node.target_node_type]);

  const handleUpdateMax = () => {
    updateMaxIterations(node.node_id, tempMax);
    setIsEditingMax(false);
  };

  const getNodeIcon = (type: string) => {
    const icons: Record<string, any> = {
      'PRD': FileText,
      'FSD': Settings,
      'IA': Layout,
      'User Flow': GitBranch,
      'ERD': Database,
      'Wireframe': Grid,
      'API_Spec': Zap,
      'TC': CheckCircle
    };
    return icons[type] || FileText;
  };

  const statusConfig = (() => {
    if (node.is_active) return { variant: 'primary', label: 'RUNNING', active: true };
    switch (node.node_state) {
      case 'PENDING': return { variant: 'outline', label: 'PENDING', active: false };
      case 'PAUSED_STOPPED': return { variant: 'outline', label: 'Stopped', active: false };
      case 'READY': return { variant: 'outline', label: 'READY', active: false };
      case 'IN_PROGRESS': return { variant: 'primary', label: 'RUNNING', active: true };
      case 'COMPLETED': return { variant: 'success', label: 'COMPLETED', active: false };
      case 'PAUSED_HITL': return { variant: 'secondary', label: 'WAITING', active: false };
      case 'PAUSED_API_ERROR': return { variant: 'danger', label: 'ERROR', active: false };
      case 'STALE': return { variant: 'outline', label: 'STALE', active: false };
      case 'REFINING': return { variant: 'primary', label: 'REFINING', active: true };
      case 'REVIEW_PENDING': return { variant: 'secondary', label: 'REVIEWING', active: false };
      case 'REVIEWED': return { variant: 'success', label: 'REVIEWED', active: false };
      default: return { variant: 'outline', label: 'PENDING', active: false };
    }
  })();

  const IconComp = getNodeIcon(node.target_node_type);

  return (
    <Card 
      className={`${styles.card} ${node.node_state === 'COMPLETED' ? styles.completed : ''}`}
      onClick={() => setSelectedNode(node.node_id)}
      ref={containerRef}
    >
      <div className={styles.ports}>
        <div className={`${styles.port} ${styles.in}`}></div>
        <div className={`${styles.port} ${styles.out}`}></div>
      </div>
      
      <div className={styles.header}>
        <div className={styles.labelGroup}>
          <IconComp size={16} className={styles.icon} />
          <span className={styles.name}>{formatNodeTitle(node, modules)}</span>
        </div>
        <Badge variant={statusConfig.variant as any} className="gap-1.5">
          {statusConfig.active && <span className={styles.pulseDot}></span>}
          {statusConfig.label}
        </Badge>
      </div>

      <div className={styles.body}>
        <div className={styles.infoRow}>
          <div className={styles.iterationBox}>
            <div className="flex justify-between items-center mb-1.5">
              <span className={styles.label}>Progress</span>
              <div className="flex items-center gap-1.5">
                {isEditingMax ? (
                  <Input 
                    type="number" 
                    className="w-16 h-6 py-0 px-1 text-[10px]"
                    value={tempMax} 
                    onChange={(e) => setTempMax(parseInt(e.target.value) || 1)} 
                    onBlur={handleUpdateMax} 
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateMax()} 
                    onClick={(e) => e.stopPropagation()} 
                    autoFocus 
                  />
                ) : (
                  <>
                    <span className="text-[10px] font-mono font-bold opacity-80">{node.current_iteration} / {node.max_iterations}</span>
                    {!isLocked && <Edit3 size={10} className="opacity-40 hover:opacity-100 cursor-pointer" onClick={(e) => { e.stopPropagation(); setIsEditingMax(true); }} />}
                  </>
                )}
              </div>
            </div>
            <Progress value={Math.min(100, (node.current_iteration / node.max_iterations) * 100)} size="sm" />
          </div>
          <div className={styles.scorePanel}>
            <span className={styles.label}>Score</span>
            <span className={styles.value}>{node.current_best_score.toFixed(1)}</span>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        {node.node_state === 'READY' && !node.is_active && (
          <Button variant="primary" size="sm" className="w-full" disabled={isActuallyDisabled} onClick={(e) => { e.stopPropagation(); runNode(node.node_id); }} leftIcon={<Play size={12} />}>
            Execute
          </Button>
        )}
        {node.node_state === 'STALE' && !node.is_active && (
          <Button variant="secondary" size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); runNode(node.node_id); }} leftIcon={<RotateCcw size={12} />}>
            Refine
          </Button>
        )}
        {node.node_state === 'PAUSED_STOPPED' && !node.is_active && (
          <Button variant="primary" size="sm" className="w-full" disabled={isActuallyDisabled} onClick={(e) => { e.stopPropagation(); resumeNode(node.node_id); }} leftIcon={<RefreshCw size={12} />}>
            Resume
          </Button>
        )}
        {(node.node_state === 'PAUSED_HITL' || node.node_state === 'REVIEW_PENDING') && !node.is_active && (
          <div className="flex gap-1 w-full">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 border-secondary/30 text-secondary" 
              disabled={isActuallyDisabled} 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (node.node_state === 'REVIEW_PENDING') {
                  confirmReview(node.node_id);
                } else {
                  handleHITLAction(node.node_id, 'APPROVE'); 
                }
              }} 
              leftIcon={<CheckCircle size={12} />}
            >
              {node.node_state === 'REVIEW_PENDING' ? 'Confirm' : 'Pass'}
            </Button>
            <Button variant="primary" size="sm" className="flex-1" disabled={isActuallyDisabled} onClick={(e) => { e.stopPropagation(); handleHITLAction(node.node_id, 'RETRY'); }} leftIcon={<RotateCcw size={12} />}>
              Retry
            </Button>
          </div>
        )}
        {(node.node_state === 'IN_PROGRESS' || node.is_active) && (
          <div className="flex gap-1 w-full">
            <Button variant="primary" size="sm" className="flex-1 opacity-80 cursor-default pointer-events-none" leftIcon={<RefreshCw size={12} className="animate-spin" />}>
              Running
            </Button>
            <Button variant="ghost" size="sm" className="flex-1 text-danger hover:bg-danger/10" onClick={(e) => { e.stopPropagation(); stopNode(node.node_id); }} leftIcon={<Square size={12} />}>
              Stop
            </Button>
          </div>
        )}
        {node.node_state === 'COMPLETED' && !node.is_active && (
          <Button variant="ghost" size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); setSelectedNode(node.node_id); }} leftIcon={<Eye size={12} />}>
            Inspect
          </Button>
        )}
      </div>
    </Card>
  );
};

export default PipelineCard;
