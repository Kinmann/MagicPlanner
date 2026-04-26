import React from 'react';
import { Info, Calendar, Hash, Tag, Activity, DollarSign, Clock, Zap } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { Accordion } from '../ui/Card'; // Accordion was exported from Card.tsx
import { LineChart } from '../ui/Chart';
import { Badge } from '../ui/Badge';
import styles from './RightPanel.module.scss';

export const RightPanel: React.FC = () => {
  const { selectedNodeId } = useUIStore();
  const { nodes } = useProjectStore();

  const selectedNode = nodes.find(n => n.node_id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div className={styles.rightPanel}>
        <div className={styles.emptyState}>
          <Info size={24} />
          <p>Select a node to view properties</p>
        </div>
      </div>
    );
  }

  // Mock Score History (In real app, fetch from history table)
  const mockHistory = [
    { x: 1, y: 45 },
    { x: 2, y: 52 },
    { x: 3, y: 48 },
    { x: 4, y: 65 },
    { x: 5, y: 72 },
    { x: 6, y: selectedNode.current_best_score || 0 }
  ];

  return (
    <div className={styles.rightPanel}>
      <div className={styles.header}>
        <Tag size={16} />
        <span>Properties</span>
      </div>

      <div className={styles.content}>
        <Accordion title="General Info" defaultOpen>
          <PropertyItem icon={<Hash size={14}/>} label="Node ID" value={selectedNode.node_id} />
          <PropertyItem 
            icon={<Activity size={14}/>} 
            label="Status" 
            value={
              <Badge variant={selectedNode.node_state === 'COMPLETED' ? 'success' : 'primary'}>
                {selectedNode.node_state}
              </Badge>
            } 
          />
          <PropertyItem icon={<Calendar size={14}/>} label="Created" value={new Date(selectedNode.created_at).toLocaleDateString()} />
        </Accordion>

        <Accordion title="Performance & Scoring" defaultOpen>
          <div className={styles.scoreSection}>
            <div className={styles.scoreHeader}>
              <span className={styles.scoreLabel}>Best Score</span>
              <span className={styles.scoreValue}>{selectedNode.current_best_score.toFixed(1)}</span>
            </div>
            <div className={styles.chartArea}>
              <LineChart data={mockHistory} height={80} />
            </div>
          </div>
          <PropertyItem icon={<Zap size={14}/>} label="Iterations" value={`${selectedNode.current_iteration} / ${selectedNode.max_iterations}`} />
        </Accordion>

        <Accordion title="Resources & Cost">
          <PropertyItem icon={<Clock size={14}/>} label="Time Elapsed" value="2m 45s" />
          <PropertyItem icon={<DollarSign size={14}/>} label="Estimated Cost" value={`$${(selectedNode.current_iteration * 0.02).toFixed(3)}`} />
          <PropertyItem icon={<Tag size={14}/>} label="Tokens Used" value="~12,450" />
        </Accordion>
      </div>
    </div>
  );
};

const PropertyItem = ({ icon, label, value }: any) => (
  <div className={styles.propertyItem}>
    <div className={styles.propLabel}>
      {icon}
      <span>{label}</span>
    </div>
    <div className={styles.propValue}>{value}</div>
  </div>
);
