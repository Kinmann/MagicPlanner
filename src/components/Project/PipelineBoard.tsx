import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { DocumentNode, LocalModule } from '../../types/project';
import PipelineCard from './PipelineCard';
import { useUIStore } from '../../store/uiStore';
import Spinner from '../common/Spinner';
import './PipelineBoard.scss';

interface PipelineBoardProps {
  nodes: DocumentNode[];
  modules: LocalModule[];
  disabled?: boolean;
}

const PipelineBoard: React.FC<PipelineBoardProps> = ({ 
  nodes, modules, disabled = false
}) => {
  const [nodeDimensions, setNodeDimensions] = useState<Record<string, { width: number, height: number }>>({});
  
  const handleDimensionsChange = useCallback((nodeType: string, dimensions: { width: number, height: number }) => {
    setNodeDimensions(prev => {
      const prevDim = prev[nodeType];
      if (prevDim && Math.abs(prevDim.width - dimensions.width) < 1 && Math.abs(prevDim.height - dimensions.height) < 1) {
        return prev;
      }
      return { ...prev, [nodeType]: dimensions };
    });
  }, []);

  const { boardViewState, setBoardViewState } = useUIStore(useShallow(state => ({
    boardViewState: state.boardViewState,
    setBoardViewState: state.setBoardViewState
  })));

  const x = useMotionValue(boardViewState.panX);
  const y = useMotionValue(boardViewState.panY);
  const scale = useMotionValue(boardViewState.zoom);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubX = x.on('change', (latest) => setBoardViewState({ panX: latest }));
    const unsubY = y.on('change', (latest) => setBoardViewState({ panY: latest }));
    const unsubScale = scale.on('change', (latest) => setBoardViewState({ zoom: latest }));
    return () => { unsubX(); unsubY(); unsubScale(); };
  }, [x, y, scale, setBoardViewState]);

  const nodePositions: Record<string, { x: number, y: number }> = {
    'PRD': { x: 80, y: 400 },
    'FSD': { x: 480, y: 400 },
    'User Flow': { x: 880, y: 200 },
    'ERD': { x: 880, y: 600 },
    'IA': { x: 1280, y: 200 },
    'Wireframe': { x: 1680, y: 200 },
    'API_Spec': { x: 1680, y: 600 },
    'TC': { x: 2080, y: 400 }
  };

  const connections = [
    { from: 'PRD', to: 'FSD' }, { from: 'FSD', to: 'User Flow' }, { from: 'FSD', to: 'ERD' },
    { from: 'User Flow', to: 'IA' }, { from: 'IA', to: 'Wireframe' }, { from: 'User Flow', to: 'Wireframe' },
    { from: 'FSD', to: 'Wireframe' }, { from: 'ERD', to: 'API_Spec' }, { from: 'FSD', to: 'API_Spec' },
    { from: 'API_Spec', to: 'TC' }, { from: 'FSD', to: 'TC' }, { from: 'PRD', to: 'TC' }
  ];

  const isNodeLocked = (type: string, currentNode?: DocumentNode) => {
    if (!currentNode) return false;
    const successors = connections.filter(c => c.from === type).map(c => c.to);
    return successors.some(targetType => {
      const targetNode = nodes.find(n => n.target_node_type === targetType && n.module_id === currentNode.module_id);
      return targetNode && !['READY', 'PENDING', 'STALE'].includes(targetNode.node_state);
    });
  };

  const renderConnection = (fromType: string, toType: string, index: number) => {
    const fromPos = nodePositions[fromType];
    const toPos = nodePositions[toType];
    if (!fromPos || !toPos) return null;

    const fromDim = nodeDimensions[fromType] || { width: 320, height: 222 };
    const toDim = nodeDimensions[toType] || { width: 320, height: 222 };
    const startX = fromPos.x + fromDim.width;
    const startY = fromPos.y + (fromDim.height / 2);
    const endX = toPos.x;
    const endY = toPos.y + (toDim.height / 2);

    const fromNode = nodes.find(n => n.target_node_type === fromType);
    const toNode = nodes.find(n => n.target_node_type === toType);
    const isActive = (fromNode?.node_state === 'COMPLETED' || fromNode?.node_state === 'IN_PROGRESS') && 
                     (toNode?.node_state === 'IN_PROGRESS' || toNode?.node_state === 'COMPLETED' || toNode?.node_state === 'READY');
    
    const cp1x = startX + (endX - startX) * 0.5;
    const cp2x = startX + (endX - startX) * 0.5;
    const pathD = `M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}`;

    return <path key={`${fromType}-${toType}-${index}`} d={pathD} className={`dag-connection ${isActive ? 'active' : ''}`} />;
  };

  const applyZoom = (delta: number, centerX?: number, centerY?: number) => {
    const oldScale = scale.get();
    const newScale = Math.min(Math.max(oldScale + delta, 0.2), 2.0);
    if (centerX !== undefined && centerY !== undefined) {
      const ratio = newScale / oldScale;
      x.set(centerX - (centerX - x.get()) * ratio);
      y.set(centerY - (centerY - y.get()) * ratio);
    }
    scale.set(newScale);
  };

  const handleReset = () => { scale.set(0.85); x.set(0); y.set(0); };

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;
        applyZoom(e.deltaY > 0 ? -0.1 : 0.1, e.clientX - rect.left, e.clientY - rect.top);
      }
    };
    viewportRef.current?.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewportRef.current?.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div className="pipeline-viewport" ref={viewportRef}>
      <motion.div className="pipeline-canvas" drag dragMomentum={false} style={{ x, y, scale, transformOrigin: '0 0' }}>
        <svg className="connections-layer">{connections.map((conn, i) => renderConnection(conn.from, conn.to, i))}</svg>
        <div className="nodes-layer">
          {Object.entries(nodePositions).map(([type, pos]) => {
            const node = nodes.find(n => n.target_node_type === type);
            if (!node) return null;
            return (
              <div key={node.node_id} className="node-wrapper" style={{ left: `${pos.x}px`, top: `${pos.y}px` }}>
                <PipelineCard 
                  node={node} 
                  modules={modules}
                  isLocked={isNodeLocked(type, node)}
                  onDimensionsChange={handleDimensionsChange}
                  disabled={disabled}
                />
              </div>
            );
          })}
        </div>
        {nodes.length === 0 && <div className="empty-loader"><Spinner size="lg" /><p>Initializing Orchestration Canvas...</p></div>}
      </motion.div>
      <div className="zoom-controls">
        <div className="zoom-level"><ZoomLevelDisplay scale={scale} /></div>
        <div className="control-buttons">
          <button onClick={() => applyZoom(0.1)}><span className="material-symbols-outlined">add</span></button>
          <button onClick={handleReset}><span className="material-symbols-outlined">center_focus_strong</span></button>
          <button onClick={() => applyZoom(-0.1)}><span className="material-symbols-outlined">remove</span></button>
        </div>
      </div>
    </div>
  );
};

const ZoomLevelDisplay: React.FC<{ scale: any }> = ({ scale }) => {
  const [val, setVal] = useState(Math.round(scale.get() * 100));
  useEffect(() => scale.on('change', (latest: number) => setVal(Math.round(latest * 100))), [scale]);
  return <>{val}%</>;
};

export default PipelineBoard;
