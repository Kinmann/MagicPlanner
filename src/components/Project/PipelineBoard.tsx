import React from 'react';
import { DocumentNode } from '../../types/project';
import PipelineCard from './PipelineCard';
import './PipelineBoard.scss';

interface PipelineBoardProps {
  nodes: DocumentNode[];
  onRunNode: (nodeType: string) => void;
  onViewNode: (node: DocumentNode) => void;
  onHITLAction: (nodeId: string, action: 'APPROVE' | 'RETRY') => void;
}

const PipelineBoard: React.FC<PipelineBoardProps> = ({ nodes, onRunNode, onViewNode, onHITLAction }) => {
  // FSD에 정의된 8개 노드 순서대로 정렬
  const nodeOrder = ['PRD', 'FSD', 'User Flow', 'IA', 'ERD', 'Wireframe', 'API_Spec', 'TC'];

  const sortedNodes = nodeOrder.map(type => 
    nodes.find(n => n.target_node_type === type)
  ).filter(Boolean) as DocumentNode[];

  return (
    <div className="pipeline-grid">
      {sortedNodes.map((node) => (
        <PipelineCard 
          key={node.node_id} 
          node={node} 
          onRun={onRunNode} 
          onView={onViewNode} 
          onHITLAction={onHITLAction}
        />
      ))}
      
      {/* 노드가 아직 로드되지 않았을 때의 빈 상태 처리 */}
      {nodes.length === 0 && (
        <div className="empty-loader">
          <div className="loader-ring">
            <div className="inner" />
          </div>
          <p>프로젝트 데이터를 불러오고 있습니다...</p>
        </div>
      )}
    </div>
  );
};

export default PipelineBoard;
