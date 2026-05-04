import React from 'react';
import { Monitor, Box, Database, CheckCircle2 } from 'lucide-react';
import { CommentableRow } from '../../../ui/CommentableRow';
import styles from '../../GlobalRenderers.module.scss';

interface WireframeRendererProps {
  data: any;
  nodeId?: string;
  currentIteration?: any;
}

const WireframeRenderer: React.FC<WireframeRendererProps> = ({ data, nodeId, currentIteration }) => {
  const screens = data.screens || [];

  return (
    <div className={styles.epicActorContainer}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Monitor className={styles.icon} size={20} />
          UI Wireframe Specification
        </h2>
        
        <div className={styles.epicList}>
          {screens.length === 0 && <div className={styles.emptyState}>No screens defined</div>}
          {screens.map((screen: any, i: number) => (
            <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={`$.screens[${i}]`} currentIteration={currentIteration} blockId={screen.screen_id}>
              <article className={styles.epicItem} style={{ width: '100%' }}>
                {/* Screen Header - GPRD Epic Style */}
                <h3 className={styles.epicHeader}>
                  <span className={styles.epicId}>[{screen.screen_id}]</span>
                  <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>
                    {screen.screen_name}
                  </span>
                </h3>
                
                <div className={styles.epicBody}>
                  {/* Each Region is a Criteria Section */}
                  {(screen.layout_regions || []).map((region: any, j: number) => (
                    <CommentableRow key={j} nodeId={nodeId || ''} jsonPath={`$.screens[${i}].layout_regions[${j}]`} currentIteration={currentIteration}>
                      <div className={styles.criteriaSection}>
                        <h4 className={styles.criteriaTitle}>
                          <Box size={16} className="opacity-50" />
                          {region.region_name}
                        </h4>
                        
                        <ul className={styles.criteriaList}>
                          {(region.components || []).map((comp: any, k: number) => (
                            <CommentableRow key={k} nodeId={nodeId || ''} jsonPath={`$.screens[${i}].layout_regions[${j}].components[${k}]`} currentIteration={currentIteration} blockId={comp.component_id}>
                              <li className={styles.criteriaItem}>
                                <CheckCircle2 size={16} className={styles.checkIcon} />
                                <div className="flex-1">
                                  <div className="flex flex-col gap-1.5 w-full">
                                    {/* Label & Type */}
                                    <div className="flex items-center justify-between">
                                      <span className={`${styles.valueWrapper} font-bold text-foreground/90`}>
                                        {comp.label}
                                        <span className="ml-2 text-[10px] font-mono opacity-40 font-normal">({comp.component_type})</span>
                                      </span>
                                    </div>
                                    
                                    {/* Description with func badge at top */}
                                    <div className={styles.epicDesc} style={{ margin: 0, paddingBottom: 0, fontSize: '13px', lineHeight: '1.6' }}>
                                      {comp.mapped_func_id && (
                                        <div className={`${styles.textSm} ${styles.fontNormal}`} style={{ 
                                          color: 'var(--primary)',
                                          fontFamily: 'monospace',
                                          marginBottom: '4px'
                                        }}>
                                          #{comp.mapped_func_id}
                                        </div>
                                      )}
                                      <span className={styles.valueWrapper}>
                                        {comp.description}
                                        {comp.state_condition && comp.state_condition !== 'Default' && (
                                          <span className="ml-2 text-[11px] italic opacity-40">[{comp.state_condition}]</span>
                                        )}
                                      </span>
                                    </div>
                                    
                                    {/* Data Fields */}
                                    {comp.mapped_data_fields && comp.mapped_data_fields.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mt-0.5 pl-4">
                                        {comp.mapped_data_fields.map((field: string, fIdx: number) => (
                                          <span key={fIdx} className={`${styles.actorChip} ${styles.valueWrapper}`} style={{ 
                                            fontSize: '10px', 
                                            opacity: 0.6,
                                            padding: '1px 6px'
                                          }}>
                                            <Database size={10} style={{ display: 'inline', marginRight: '4px', opacity: 0.5 }} />
                                            {field}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </li>
                            </CommentableRow>
                          ))}
                        </ul>
                      </div>
                    </CommentableRow>
                  ))}
                </div>
              </article>
            </CommentableRow>
          ))}
        </div>
      </section>
    </div>
  );
};

export default WireframeRenderer;
