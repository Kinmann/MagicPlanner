import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import { DocumentNode, LocalModule } from '../../types/project';
import PipelineCard from './PipelineCard';
import Spinner from '../common/Spinner';
import './PipelineBoard.scss';

interface PipelineBoardProps {
  nodes: DocumentNode[];
  modules: LocalModule[];
  onRunNode: (nodeId: string) => void;
  onStopNode: (nodeId: string) => void;
  onResumeNode: (nodeId: string) => void;
  onViewNode: (node: DocumentNode) => void;
  onHITLAction: (nodeId: string, action: 'APPROVE' | 'RETRY') => void;
  onRetryLoop?: (nodeId: string, count: number) => void;
  onUpdateMaxIterations: (nodeId: string, maxIterations: number) => void;
  isRefinementMode?: boolean;
}

const PipelineBoard: React.FC<PipelineBoardProps> = ({ 
  nodes, modules, onRunNode, onStopNode, onResumeNode, onViewNode, onHITLAction, onRetryLoop, onUpdateMaxIterations, isRefinementMode = false 
}) => {
  const [nodeDimensions, setNodeDimensions] = useState<Record<string, { width: number, height: number }>>({});
  
  const handleDimensionsChange = useCallback((nodeType: string, dimensions: { width: number, height: number }) => {
    setNodeDimensions(prev => {
      // 오차 범위(1px) 내의 변화는 무시하여 무한 루프 방지
      const prevDim = prev[nodeType];
      if (prevDim && Math.abs(prevDim.width - dimensions.width) < 1 && Math.abs(prevDim.height - dimensions.height) < 1) {
        return prev;
      }
      return { ...prev, [nodeType]: dimensions };
    });
  }, []);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(0.85);

  const viewportRef = useRef<HTMLDivElement>(null);

  // 1. Define Canvas Coordinates for each node type
  // Note: Canvas width should be least 3000px to accommodate 'TC' node at 2080px + card width
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

  // 2. Define Connections (Sources -> Targets)
  const connections = [
    { from: 'PRD', to: 'FSD' },
    { from: 'FSD', to: 'User Flow' },
    { from: 'FSD', to: 'ERD' },
    { from: 'User Flow', to: 'IA' },
    { from: 'IA', to: 'Wireframe' },
    { from: 'User Flow', to: 'Wireframe' },
    { from: 'FSD', to: 'Wireframe' },
    { from: 'ERD', to: 'API_Spec' },
    { from: 'FSD', to: 'API_Spec' },
    { from: 'API_Spec', to: 'TC' },
    { from: 'FSD', to: 'TC' },
    { from: 'PRD', to: 'TC' }
  ];

  // Helper to get node by type
  const getNode = (type: string) => nodes.find(n => n.target_node_type === type);

  // Helper to check if node is locked (Successor started)
  const isNodeLocked = (type: string, currentNode?: DocumentNode) => {
    if (!currentNode) return false;
    const successors = connections.filter(c => c.from === type).map(c => c.to);
    return successors.some(targetType => {
      const targetNode = nodes.find(n => n.target_node_type === targetType && n.module_id === currentNode.module_id);
      return targetNode && targetNode.node_state !== 'READY' && targetNode.node_state !== 'PENDING' && targetNode.node_state !== 'STALE';
    });
  };

  // Helper to draw bezier path
  const renderConnection = (fromType: string, toType: string, index: number) => {
    const fromPos = nodePositions[fromType];
    const toPos = nodePositions[toType];
    const fromNode = getNode(fromType);
    const toNode = getNode(toType);

    if (!fromPos || !toPos) return null;

    // Node width/height offsets (Dynamic or Fallback)
    const fromDim = nodeDimensions[fromType] || { width: 320, height: 222 };
    const toDim = nodeDimensions[toType] || { width: 320, height: 222 };

    const startX = fromPos.x + fromDim.width;
    const startY = fromPos.y + (fromDim.height / 2);
    const endX = toPos.x;
    const endY = toPos.y + (toDim.height / 2);

    const isActive = (fromNode?.node_state === 'COMPLETED' || fromNode?.node_state === 'IN_PROGRESS' || fromNode?.node_state === 'REFINING') && 
                     (toNode?.node_state === 'IN_PROGRESS' || toNode?.node_state === 'REFINING' || toNode?.node_state === 'COMPLETED' || toNode?.node_state === 'READY');
    
    // Smooth bezier curve
    const cp1x = startX + (endX - startX) * 0.5;
    const cp2x = startX + (endX - startX) * 0.5;
    const pathD = `M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}`;

    return (
      <path 
        key={`${fromType}-${toType}-${index}`}
        d={pathD}
        className={`dag-connection ${isActive ? 'active' : ''}`}
      />
    );
  };

  // 3. Zoom Handlers
  const applyZoom = (delta: number, centerX?: number, centerY?: number) => {
    const oldScale = scale.get();
    const newScale = Math.min(Math.max(oldScale + delta, 0.2), 2.0);
    
    if (centerX !== undefined && centerY !== undefined) {
      // Zoom at specific point (e.g. mouse pointer)
      const ratio = newScale / oldScale;
      x.set(centerX - (centerX - x.get()) * ratio);
      y.set(centerY - (centerY - y.get()) * ratio);
    }
    
    scale.set(newScale);
  };

  const handleReset = () => {
    scale.set(0.85);
    x.set(0);
    y.set(0);
  };

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        applyZoom(delta, mouseX, mouseY);
      }
    };

    const viewport = viewportRef.current;
    if (viewport) {
      viewport.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (viewport) viewport.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <div className="pipeline-viewport" ref={viewportRef}>
      <motion.div 
        className="pipeline-canvas"
        drag
        dragMomentum={false}
        style={{ x, y, scale, transformOrigin: '0 0' }}
      >
        {/* SVG Background Layer for Connections */}
        <svg className="connections-layer">
          {connections.map((conn, i) => renderConnection(conn.from, conn.to, i))}
        </svg>

        {/* Nodes Layer */}
        <div className="nodes-layer">
          {Object.entries(nodePositions).map(([type, pos]) => {
            const node = getNode(type);
            if (!node) return null;
            return (
              <div 
                key={node.node_id} 
                className="node-wrapper"
                style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
              >
                <PipelineCard 
                  node={node} 
                  modules={modules}
                  isLocked={isNodeLocked(type, node)}
                  onRun={onRunNode} 
                  onStop={onStopNode}
                  onResume={onResumeNode}
                  onView={onViewNode} 
                  onHITLAction={onHITLAction}
                  onRetryLoop={onRetryLoop}
                  onUpdateMaxIterations={onUpdateMaxIterations}
                  onDimensionsChange={handleDimensionsChange}
                  isRefinementMode={isRefinementMode}
                />
              </div>
            );
          })}
        </div>
        
        {nodes.length === 0 && (
          <div className="empty-loader">
            <Spinner size="lg" variant="primary" />
            <p className="loader-text">Initializing Orchestration Canvas...</p>
          </div>
        )}
      </motion.div>

      {/* Floating Zoom Controls */}
      <div className="zoom-controls">
        <div className="zoom-level">
          {/* We use a sub-component or simple listener to show real-time zoom value because we moved to motion values */}
          <ZoomLevelDisplay scale={scale} />
        </div>
        <div className="control-buttons">
          <button onClick={() => applyZoom(0.1)} title="Zoom In">
            <span className="material-symbols-outlined">add</span>
          </button>
          <button onClick={handleReset} title="Reset View">
            <span className="material-symbols-outlined">center_focus_strong</span>
          </button>
          <button onClick={() => applyZoom(-0.1)} title="Zoom Out">
            <span className="material-symbols-outlined">remove</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Sub-component to display zoom level without re-rendering parent often
const ZoomLevelDisplay: React.FC<{ scale: any }> = ({ scale }) => {
  const [val, setVal] = useState(Math.round(scale.get() * 100));
  useEffect(() => {
    return scale.on('change', (latest: number) => setVal(Math.round(latest * 100)));
  }, [scale]);
  return <>{val}%</>;
};

export default PipelineBoard;
