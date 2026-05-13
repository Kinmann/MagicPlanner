import React from 'react';
import { 
  Briefcase, TrendingUp, ShieldCheck, 
  Users, User, Shield, Zap,
  Box, FileCode, ListTodo, CheckCircle2, Layers,
  Server, Database, Cpu, Globe, Monitor, Code2, Key,
  Activity, ArrowRight, AlertCircle,
  ChevronRight, GitBranch, Terminal
} from 'lucide-react';
import SadSpecRenderer from './SadSpecRenderer';
import { CommentableRow } from '../ui/CommentableRow';
import styles from './GlobalRenderers.module.scss';

export const renderJson = (val: any, indent = 0): React.ReactNode => {
  if (val === null) return <span className={styles.jsonNode}><span className={styles.valueWrapper}><span className={styles.bool}>null</span></span></span>;
  if (typeof val === 'boolean') return <span className={styles.jsonNode}><span className={styles.valueWrapper}><span className={styles.bool}>{String(val)}</span></span></span>;
  if (typeof val === 'number') return <span className={styles.jsonNode}><span className={styles.valueWrapper}><span className={styles.num}>{val}</span></span></span>;
  if (typeof val === 'string') return <span className={styles.jsonNode}><span className={styles.valueWrapper}><span className={styles.str}>"{val}"</span></span></span>;
  
  if (Array.isArray(val)) {
    if (val.length === 0) return <span className={styles.bracket}>[]</span>;
    return (
      <div className={styles.jsonNode}>
        <span className={styles.bracket}>[</span>
        <div className={styles.indent}>
          {val.map((item, i) => (
            <div key={i}>
              {renderJson(item, indent + 1)}
              {i < val.length - 1 && ","}
            </div>
          ))}
        </div>
        <span className={styles.bracket}>]</span>
      </div>
    );
  }
  
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    if (keys.length === 0) return <span className={styles.bracket}>{"{}"}</span>;
    return (
      <div className={styles.jsonNode}>
        <span className={styles.bracket}>{"{"}</span>
        <div className={styles.indent}>
          {keys.map((key, i) => (
            <div key={key} className={styles.kvRow}>
              <span className={styles.prop}>"{key}"</span>: {renderJson(val[key], indent + 1)}
              {i < keys.length - 1 && ","}
            </div>
          ))}
        </div>
        <span className={styles.bracket}>{"}"}</span>
      </div>
    );
  }
  return String(val);
};

export const BusinessStrategyRenderer = ({ content, baseContent, nodeId, currentIteration }: { content: any, baseContent?: any, nodeId?: string, currentIteration?: any }) => {
  const projectName = content.metadata?.project_name || content.project_name || 'Unnamed Project';
  const biz = content.business_context || {};
  const vision = content.product_vision || biz.product_vision || biz.product_goal || biz.vision || 'Goal not defined';
  const targetMarket = content.target_market || biz.target_market || biz.market || 'N/A';
  
  const rawMetrics = content.success_metrics || biz.success_metrics || biz.metrics || [];
  const successMetrics = Array.isArray(rawMetrics) ? rawMetrics : [String(rawMetrics)];
  
  const constraints = content.global_constraints || content.constraints || null;

  // Base Data
  const baseBiz = baseContent?.business_context || {};
  const baseVision = baseContent?.product_vision || baseBiz.product_vision || baseBiz.product_goal || baseBiz.vision;
  const baseTargetMarket = baseContent?.target_market || baseBiz.target_market || baseBiz.market;
  const baseRawMetrics = baseContent?.success_metrics || baseBiz.success_metrics || baseBiz.metrics || [];
  const baseSuccessMetrics = Array.isArray(baseRawMetrics) ? baseRawMetrics : (baseRawMetrics ? [String(baseRawMetrics)] : []);
  const baseConstraints = baseContent?.global_constraints || baseContent?.constraints || null;

  const renderVision = (v: string, isStale = false, isRefined = false) => (
    <CommentableRow nodeId={nodeId || ''} jsonPath="$.business_context.product_vision" currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
      <div>
        <h4 className={styles.criteriaTitle}>
          <TrendingUp size={14} className={styles.opacity50} /> Product Vision
        </h4>
        <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>
          {v}
        </p>
      </div>
    </CommentableRow>
  );

  const renderTargetMarket = (m: string, isStale = false, isRefined = false) => (
    <CommentableRow nodeId={nodeId || ''} jsonPath="$.business_context.target_market" currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
      <div>
        <h4 className={styles.criteriaTitle}>
          <Users size={14} className={styles.opacity50} /> Target Market
        </h4>
        <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>
          {m}
        </p>
      </div>
    </CommentableRow>
  );

  const hasVisionChanged = baseVision && baseVision !== vision;
  const hasMarketChanged = baseTargetMarket && baseTargetMarket !== targetMarket;
  const hasMetricsChanged = baseContent && JSON.stringify(baseSuccessMetrics) !== JSON.stringify(successMetrics);
  const hasConstraintsChanged = baseContent && JSON.stringify(baseConstraints) !== JSON.stringify(constraints);

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Business Strategy */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Briefcase size={20} className={styles.icon} />
          1. Business Strategy
        </h2>
        
        <div className={styles.epicList}>
          <article className={styles.epicItem}>
            <h3 className={styles.epicHeader}>
              <span className={`${styles.epicTitle} ${styles.valueWrapper}`} style={{ color: 'var(--primary)', fontSize: '1.25rem' }}>{projectName}</span>
            </h3>
            
            <div className={styles.epicBody}>
              <div className={styles.flexColGap6}>
                {hasVisionChanged && renderVision(baseVision, true, false)}
                {renderVision(vision, false, hasVisionChanged)}
                
                {targetMarket !== 'N/A' && (
                  <>
                    {hasMarketChanged && renderTargetMarket(baseTargetMarket, true, false)}
                    {renderTargetMarket(targetMarket, false, hasMarketChanged)}
                  </>
                )}
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* 2. Success Metrics */}
      {(successMetrics.length > 0 || baseSuccessMetrics.length > 0) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <CheckCircle2 size={20} className={styles.icon} />
            2. Success Metrics
          </h2>
          
          <div className={styles.epicList}>
            <article className={styles.epicItem}>
              <div className={styles.epicBody}>
                <ul className={styles.criteriaList}>
                  {hasMetricsChanged && baseSuccessMetrics.map((metric: any, idx: number) => (
                    <CommentableRow key={`stale-${idx}`} nodeId={nodeId || ''} jsonPath={`$.success_metrics[${idx}]`} currentIteration={currentIteration} isStale={true}>
                      <li className={styles.criteriaItem}>
                        <CheckCircle2 size={16} className={styles.checkIcon} />
                        <span className={styles.valueWrapper}>
                          {metric.metric_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{metric.metric_id}</span>}
                          {typeof metric === 'object' ? metric.description : metric}
                        </span>
                      </li>
                    </CommentableRow>
                  ))}
                  {successMetrics.map((metric: any, idx: number) => (
                    <CommentableRow key={`refined-${idx}`} nodeId={nodeId || ''} jsonPath={`$.success_metrics[${idx}]`} currentIteration={currentIteration} isRefined={hasMetricsChanged}>
                      <li className={styles.criteriaItem}>
                        <CheckCircle2 size={16} className={styles.checkIcon} />
                        <span className={styles.valueWrapper}>
                          {metric.metric_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{metric.metric_id}</span>}
                          {typeof metric === 'object' ? metric.description : metric}
                        </span>
                      </li>
                    </CommentableRow>
                  ))}
                </ul>
              </div>
            </article>
          </div>
        </section>
      )}

      {/* 3. Constraints & Compliance */}
      {(constraints || baseConstraints) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <ShieldCheck size={20} className={styles.icon} />
            3. Constraints & Compliance
          </h2>
          
          <div className={styles.epicList}>
            {hasConstraintsChanged && baseConstraints && (
              <article className={styles.epicItem}>
                <div className={styles.epicBody}>
                  <div className={styles.constraintsGrid}>
                    <CommentableRow nodeId={nodeId || ''} jsonPath="$.constraints" currentIteration={currentIteration} isStale={true}>
                      <div className="opacity-60">
                        <p className="text-xs uppercase font-bold mb-2">Previous Constraints</p>
                        {baseConstraints.compliance?.map((c: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-sm"><Shield size={12}/> {c}</div>
                        ))}
                        {baseConstraints.performance?.map((p: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-sm"><Zap size={12}/> {p}</div>
                        ))}
                      </div>
                    </CommentableRow>
                  </div>
                </div>
              </article>
            )}

            <article className={styles.epicItem}>
              <div className={styles.epicBody}>
                <div className={styles.constraintsGrid}>
                  {(constraints?.compliance && constraints.compliance.length > 0) && (
                    <div>
                      <h4 className={styles.criteriaTitle} style={{ marginBottom: '1rem' }}>
                        <Shield size={16} /> Compliance Standards
                      </h4>
                      <ul className={styles.criteriaList}>
                        {constraints.compliance.map((c: any, i: number) => (
                          <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={`$.constraints.compliance[${i}]`} currentIteration={currentIteration} isRefined={hasConstraintsChanged}>
                            <li className={styles.criteriaItem}>
                              <ShieldCheck size={14} className={styles.checkIcon} />
                              <span className={styles.valueWrapper}>
                                {c.constraint_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{c.constraint_id}</span>}
                                {typeof c === 'object' ? c.description : c}
                              </span>
                            </li>
                          </CommentableRow>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {(constraints?.performance || constraints?.legacy_integrations) && (
                    <div>
                      <h4 className={styles.criteriaTitle} style={{ marginBottom: '1rem' }}>
                        <Zap size={16} /> System Constraints
                      </h4>
                      <ul className={styles.criteriaList}>
                        {constraints.performance?.map((p: any, i: number) => (
                          <CommentableRow key={`p-${i}`} nodeId={nodeId || ''} jsonPath={`$.constraints.performance[${i}]`} currentIteration={currentIteration} isRefined={hasConstraintsChanged}>
                            <li className={styles.criteriaItem}>
                              <CheckCircle2 size={14} className={styles.checkIcon} />
                              <span className={styles.valueWrapper}>
                                {p.constraint_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{p.constraint_id}</span>}
                                <strong>Performance:</strong> {typeof p === 'object' ? p.description : p}
                              </span>
                            </li>
                          </CommentableRow>
                        ))}
                        {constraints.legacy_integrations?.map((l: any, i: number) => (
                          <CommentableRow key={`l-${i}`} nodeId={nodeId || ''} jsonPath={`$.constraints.legacy_integrations[${i}]`} currentIteration={currentIteration} isRefined={hasConstraintsChanged}>
                            <li className={styles.criteriaItem}>
                              <Box size={14} className="text-secondary opacity-60" />
                              <span className={styles.valueWrapper}>
                                {l.constraint_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{l.constraint_id}</span>}
                                <strong>Legacy:</strong> {typeof l === 'object' ? l.description : l}
                              </span>
                            </li>
                          </CommentableRow>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </article>
          </div>
        </section>
      )}
    </div>
  );
};

export const EpicActorRenderer = ({ content, baseContent, nodeId, currentIteration }: { content: any, baseContent?: any, nodeId?: string, currentIteration?: any }) => {
  const rawRoles = content.user_roles || content.actors || content.personas || [];
  const roles = Array.isArray(rawRoles) ? rawRoles : [];

  const rawEpics = content.core_epics || content.functional_epics || content.epics || [];
  const epics = Array.isArray(rawEpics) ? rawEpics : [];

  const baseRawRoles = baseContent?.user_roles || baseContent?.actors || baseContent?.personas || [];
  const baseRoles = Array.isArray(baseRawRoles) ? baseRawRoles : [];

  const baseRawEpics = baseContent?.core_epics || baseContent?.functional_epics || baseContent?.epics || [];
  const baseEpics = Array.isArray(baseRawEpics) ? baseRawEpics : [];

  const hasRolesChanged = baseContent && JSON.stringify(baseRoles) !== JSON.stringify(roles);
  const hasEpicsChanged = baseContent && JSON.stringify(baseEpics) !== JSON.stringify(epics);

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. System Actors */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Users size={20} className={styles.icon} />
          1. System Actors
        </h2>
        <ul className={styles.actorList}>
          {hasRolesChanged && baseRoles.map((role: any, idx: number) => (
            <CommentableRow key={`stale-role-${idx}`} nodeId={nodeId || ''} jsonPath={`$.user_roles[${idx}]`} currentIteration={currentIteration} blockId={role.role_id} isStale={true}>
              <li className={styles.actorItem}>
                <span className={`${styles.actorName} ${styles.valueWrapper}`}>
                  <User size={16} className={styles.icon} />
                  {role.role_name}
                  {role.role_id}
                </span>
                <span className={`${styles.actorDesc} ${styles.valueWrapper}`}>{role.description}</span>
              </li>
            </CommentableRow>
          ))}
          {roles.map((role: any, idx: number) => (
            <CommentableRow key={`refined-role-${idx}`} nodeId={nodeId || ''} jsonPath={`$.user_roles[${idx}]`} currentIteration={currentIteration} blockId={role.role_id} isRefined={hasRolesChanged}>
              <li className={styles.actorItem}>
                <span className={`${styles.actorName} ${styles.valueWrapper}`}>
                  <User size={16} className={styles.icon} />
                  {role.role_name}
                  {role.role_id}
                </span>
                <span className={`${styles.actorDesc} ${styles.valueWrapper}`}>{role.description}</span>
              </li>
            </CommentableRow>
          ))}
        </ul>
      </section>

      {/* 2. Core Epics */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Layers size={20} className={styles.icon} />
          2. Core Epics
        </h2>
        
        <div className={styles.epicList}>
          {hasEpicsChanged && baseEpics.map((epic: any, idx: number) => (
            <CommentableRow key={`stale-epic-${idx}`} nodeId={nodeId || ''} jsonPath={`$.core_epics[?(@.epic_id=='${epic.epic_id}')]`} currentIteration={currentIteration} blockId={epic.epic_id} isStale={true}>
              <article className={styles.epicItem}>
                <h3 className={styles.epicHeader}>
                  <span className={styles.idBadge}>{epic.epic_id}</span>
                  <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>{epic.title}</span>
                </h3>
                <div className={styles.epicBody}>
                  <p className={`${styles.epicDesc} ${styles.valueWrapper}`}>{epic.description}</p>
                </div>
              </article>
            </CommentableRow>
          ))}
          {epics.map((epic: any, idx: number) => (
            <CommentableRow key={`refined-epic-${idx}`} nodeId={nodeId || ''} jsonPath={`$.core_epics[?(@.epic_id=='${epic.epic_id}')]`} currentIteration={currentIteration} blockId={epic.epic_id} isRefined={hasEpicsChanged}>
              <article className={styles.epicItem}>
                <h3 className={styles.epicHeader}>
                  <span className={styles.idBadge}>{epic.epic_id}</span>
                  <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>{epic.title}</span>
                </h3>
                
                <div className={styles.epicBody}>
                  <p className={`${styles.epicDesc} ${styles.valueWrapper}`}>
                    {epic.description}
                  </p>
                  
                  {epic.required_actors && epic.required_actors.length > 0 && (
                    <div className={styles.epicActors}>
                      <Users size={14} className={styles.icon} />
                      <span className={styles.label}>Actors:</span>
                      <div className={styles.actorChips}>
                        {epic.required_actors.map((actor: string, aIdx: number) => (
                          <span key={aIdx} className={`${styles.actorChip} ${styles.valueWrapper}`}>{actor}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {epic.acceptance_criteria && epic.acceptance_criteria.length > 0 && (
                    <div className={styles.criteriaSection}>
                      <h4 className={styles.criteriaTitle}>
                        <ListTodo size={16} />
                        Acceptance Criteria:
                      </h4>
                      <ul className={styles.criteriaList}>
                        {epic.acceptance_criteria.map((criteria: string, cIdx: number) => (
                          <CommentableRow key={cIdx} nodeId={nodeId || ''} jsonPath={`$.core_epics[?(@.epic_id=='${epic.epic_id}')].acceptance_criteria[${cIdx}]`} currentIteration={currentIteration}>
                            <li className={styles.criteriaItem}>
                              <CheckCircle2 size={16} className={styles.checkIcon} />
                              <span className={styles.valueWrapper}>{criteria}</span>
                            </li>
                          </CommentableRow>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </article>
            </CommentableRow>
          ))}
        </div>
      </section>
    </div>
  );
};

export const ArchitectureSchemaRenderer = ({ content, baseContent, nodeId, currentIteration }: { content: any, baseContent?: any, nodeId?: string, currentIteration?: any }) => {
  const roles = Array.isArray(content.user_roles) ? content.user_roles : [];
  const tech = content.tech_stack || {};

  const baseRoles = Array.isArray(baseContent?.user_roles) ? baseContent.user_roles : [];
  const baseTech = baseContent?.tech_stack || {};

  const hasRolesChanged = baseContent && JSON.stringify(baseRoles) !== JSON.stringify(roles);
  const hasTechChanged = baseContent && JSON.stringify(baseTech) !== JSON.stringify(tech);

  const techItems = [
    { title: 'Frontend Stack', data: tech.frontend, icon: <Monitor size={18} />, key: 'frontend' },
    { title: 'Backend Stack', data: tech.backend, icon: <Server size={18} />, key: 'backend' },
    { title: 'Data Infrastructure', data: tech.database, icon: <Database size={18} />, key: 'database' },
    { title: 'Cloud & DevOps', data: tech.infrastructure, icon: <Globe size={18} />, key: 'infrastructure' },
    { title: 'AI Model Spec', data: tech.ai_model_spec, icon: <Cpu size={18} />, key: 'ai_model_spec' },
    { title: 'Interface & Auth', data: tech.interface_protocols, icon: <Key size={18} />, key: 'interface_protocols' },
  ];

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. User Roles & Permissions */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Users size={20} className={styles.icon} />
          1. User Roles & Permissions
        </h2>
        <div className={styles.epicList}>
          <article className={styles.epicItem}>
            <div className={styles.epicBody}>
              <div className={styles.flexColGap6}>
                  {hasRolesChanged && baseRoles.map((role: any, idx: number) => (
                    <CommentableRow key={`stale-role-${idx}`} nodeId={nodeId || ''} jsonPath={`$.user_roles[${idx}]`} currentIteration={currentIteration} blockId={role.role_id} isStale={true}>
                      <div style={{ marginBottom: '1.5rem' }}>
                        <h4 className={styles.criteriaTitle}>
                          {role.permissions_level === 'ADMIN' ? <ShieldCheck size={14} className={styles.opacity50} /> : <User size={14} className={styles.opacity50} />}
                          <span className={styles.valueWrapper}>{role.role_name}</span> 
                          <span className={styles.idBadge} style={{ marginLeft: '8px' }}>{role.role_id}</span>
                        </h4>
                        <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.4rem' }}>
                          Permission Level: <span className="text-primary font-bold">{role.permissions_level}</span>
                        </p>
                      </div>
                    </CommentableRow>
                  ))}
                  {roles.map((role: any, idx: number) => (
                    <CommentableRow key={`refined-role-${idx}`} nodeId={nodeId || ''} jsonPath={`$.user_roles[${idx}]`} currentIteration={currentIteration} blockId={role.role_id} isRefined={hasRolesChanged}>
                      <div style={{ marginBottom: '1.5rem' }}>
                        <h4 className={styles.criteriaTitle}>
                          {role.permissions_level === 'ADMIN' ? <ShieldCheck size={14} className={styles.opacity50} /> : <User size={14} className={styles.opacity50} />}
                          <span className={styles.valueWrapper}>{role.role_name}</span> 
                          <span className={styles.idBadge} style={{ marginLeft: '8px' }}>{role.role_id}</span>
                        </h4>
                        <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.4rem' }}>
                          Permission Level: <span className="text-primary font-bold">{role.permissions_level}</span>
                        </p>
                      </div>
                    </CommentableRow>
                  ))}
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* 2. Technical Stack */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Code2 size={20} className={styles.icon} />
          2. Technical Stack Architecture
        </h2>
        
        <div className={styles.epicList}>
          <article className={styles.epicItem}>
            <div className={styles.epicBody}>
              <div className={styles.flexColGap6}>
                  {techItems.map((item, idx) => {
                    const baseItemData = baseTech[item.key] || {};
                    const hasItemChanged = baseContent && JSON.stringify(baseItemData) !== JSON.stringify(item.data);
                    
                    return (
                      <React.Fragment key={idx}>
                        {hasItemChanged && (
                          <CommentableRow nodeId={nodeId || ''} jsonPath={`$.tech_stack.${item.key}`} currentIteration={currentIteration} blockId={item.key} isStale={true}>
                            <div style={{ marginBottom: '1.5rem', opacity: 0.6 }}>
                              <h4 className={styles.criteriaTitle}>
                                <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                                {item.title} (Previous)
                              </h4>
                              <div className={styles.epicDesc} style={{ marginTop: '0.4rem', paddingLeft: '14px' }}>
                                {Object.entries(baseItemData).map(([key, val]: [string, any], kIdx) => (
                                  <div key={kIdx} className={styles.kvRow}>
                                    <span style={{ fontSize: '12px', opacity: 0.7 }}>{key}: {String(val)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </CommentableRow>
                        )}
                        <CommentableRow nodeId={nodeId || ''} jsonPath={`$.tech_stack.${item.key}`} currentIteration={currentIteration} blockId={item.key} isRefined={hasItemChanged}>
                          <div style={{ marginBottom: '1.5rem' }}>
                            <h4 className={styles.criteriaTitle}>
                              <span style={{ opacity: 0.5, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                              {item.title}
                            </h4>
                            <div className={styles.epicDesc} style={{ 
                              marginTop: '0.4rem', 
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: '8px',
                              paddingLeft: '14px'
                            }}>
                              {Object.entries(item.data || {}).map(([key, val]: [string, any], kIdx) => {
                                if (key === 'mapped_tech_id') return null;
                                return (
                                  <CommentableRow key={kIdx} nodeId={nodeId || ''} jsonPath={`$.tech_stack.${item.key}.${key}`} currentIteration={currentIteration} blockId={key}>
                                    <div className={styles.kvRow}>
                                      <Zap size={12} style={{ opacity: 0.3, flexShrink: 0, marginTop: '2px' }} />
                                      <span style={{ fontSize: '13px', opacity: 0.8, minWidth: '160px' }}>
                                        {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}:
                                      </span>
                                      <span className={`${styles.valueWrapper} text-primary`} style={{ fontSize: '13px', fontWeight: '700' }}>
                                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                      </span>
                                    </div>
                                  </CommentableRow>
                                );
                              })}
                            </div>
                          </div>
                        </CommentableRow>
                      </React.Fragment>
                    );
                  })}
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
};

export const ModulePrdRenderer = ({ content, baseContent, nodeId, currentIteration }: { content: any, baseContent?: any, nodeId?: string, currentIteration?: any }) => {
  const overview = content.overview || {};
  const goals = content.goals || [];
  const features = content.core_features || [];
  const userStories = content.user_stories || [];
  const constraints = content.constraints || [];

  const baseOverview = baseContent?.overview || {};
  const baseGoals = baseContent?.goals || [];
  const baseFeatures = baseContent?.core_features || [];
  const baseUserStories = baseContent?.user_stories || [];
  const baseConstraints = baseContent?.constraints || [];

  const hasOverviewChanged = baseContent && JSON.stringify(baseOverview) !== JSON.stringify(overview);
  const hasGoalsChanged = baseContent && JSON.stringify(baseGoals) !== JSON.stringify(goals);
  const hasFeaturesChanged = baseContent && JSON.stringify(baseFeatures) !== JSON.stringify(features);
  const hasStoriesChanged = baseContent && JSON.stringify(baseUserStories) !== JSON.stringify(userStories);
  const hasConstraintsChanged = baseContent && JSON.stringify(baseConstraints) !== JSON.stringify(constraints);

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Project Overview */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Briefcase size={20} className={styles.icon} />
          1. Project Overview
        </h2>
        <div className={styles.epicList}>
           <article className={styles.epicItem}>
             <h3 className={styles.epicHeader}>
               <span className={`${styles.epicTitle} ${styles.valueWrapper}`} style={{ color: 'var(--primary)', fontSize: '1.25rem' }}>{content.project_name}</span>
             </h3>
             <div className={styles.epicBody}>
               <div className={styles.flexColGap6}>
                  {overview.solution_vision && (
                    <>
                      {hasOverviewChanged && baseOverview.solution_vision && baseOverview.solution_vision !== overview.solution_vision && (
                        <CommentableRow nodeId={nodeId || ''} jsonPath="$.overview.solution_vision" currentIteration={currentIteration} isStale={true}>
                          <div className="opacity-60">
                            <h4 className={styles.criteriaTitle}><Zap size={14} className={styles.opacity50} /> Solution Vision (Prev)</h4>
                            <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>{baseOverview.solution_vision}</p>
                          </div>
                        </CommentableRow>
                      )}
                      <CommentableRow nodeId={nodeId || ''} jsonPath="$.overview.solution_vision" currentIteration={currentIteration} isRefined={hasOverviewChanged && baseOverview.solution_vision !== overview.solution_vision}>
                        <div>
                          <h4 className={styles.criteriaTitle}><Zap size={14} className={styles.opacity50} /> Solution Vision</h4>
                          <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>{overview.solution_vision}</p>
                        </div>
                      </CommentableRow>
                    </>
                  )}
                  {overview.target_audience && (
                    <>
                      {hasOverviewChanged && baseOverview.target_audience && baseOverview.target_audience !== overview.target_audience && (
                        <CommentableRow nodeId={nodeId || ''} jsonPath="$.overview.target_audience" currentIteration={currentIteration} isStale={true}>
                          <div className="opacity-60">
                            <h4 className={styles.criteriaTitle}><Users size={14} className={styles.opacity50} /> Target Audience (Prev)</h4>
                            <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>{baseOverview.target_audience}</p>
                          </div>
                        </CommentableRow>
                      )}
                      <CommentableRow nodeId={nodeId || ''} jsonPath="$.overview.target_audience" currentIteration={currentIteration} isRefined={hasOverviewChanged && baseOverview.target_audience !== overview.target_audience}>
                        <div>
                          <h4 className={styles.criteriaTitle}><Users size={14} className={styles.opacity50} /> Target Audience</h4>
                          <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>{overview.target_audience}</p>
                        </div>
                      </CommentableRow>
                    </>
                  )}
                  {overview.problem_statement && (
                    <>
                      {hasOverviewChanged && baseOverview.problem_statement && baseOverview.problem_statement !== overview.problem_statement && (
                        <CommentableRow nodeId={nodeId || ''} jsonPath="$.overview.problem_statement" currentIteration={currentIteration} isStale={true}>
                          <div className="opacity-60">
                            <h4 className={styles.criteriaTitle}><ListTodo size={14} className={styles.opacity50} /> Problem Statement (Prev)</h4>
                            <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>{baseOverview.problem_statement}</p>
                          </div>
                        </CommentableRow>
                      )}
                      <CommentableRow nodeId={nodeId || ''} jsonPath="$.overview.problem_statement" currentIteration={currentIteration} isRefined={hasOverviewChanged && baseOverview.problem_statement !== overview.problem_statement}>
                        <div>
                          <h4 className={styles.criteriaTitle}><ListTodo size={14} className={styles.opacity50} /> Problem Statement</h4>
                          <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>{overview.problem_statement}</p>
                        </div>
                      </CommentableRow>
                    </>
                  )}
               </div>
             </div>
           </article>
        </div>
      </section>

      {/* 2. Product Goals */}
      {(goals.length > 0 || baseGoals.length > 0) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <TrendingUp size={20} className={styles.icon} />
            2. Product Goals
          </h2>
          <div className={styles.epicList}>
            <article className={styles.epicItem}>
              <div className={styles.epicBody}>
                <ul className={styles.criteriaList}>
                  {hasGoalsChanged && baseGoals.map((goal: string, idx: number) => (
                    <CommentableRow key={`stale-goal-${idx}`} nodeId={nodeId || ''} jsonPath={`$.goals[${idx}]`} currentIteration={currentIteration} isStale={true}>
                      <li className={styles.criteriaItem}>
                        <CheckCircle2 size={16} className={styles.checkIcon} />
                        <span className={styles.valueWrapper}>{goal}</span>
                      </li>
                    </CommentableRow>
                  ))}
                  {goals.map((goal: string, idx: number) => (
                    <CommentableRow key={`refined-goal-${idx}`} nodeId={nodeId || ''} jsonPath={`$.goals[${idx}]`} currentIteration={currentIteration} isRefined={hasGoalsChanged}>
                      <li className={styles.criteriaItem}>
                        <CheckCircle2 size={16} className={styles.checkIcon} />
                        <span className={styles.valueWrapper}>{goal}</span>
                      </li>
                    </CommentableRow>
                  ))}
                </ul>
              </div>
            </article>
          </div>
        </section>
      )}

      {/* 3. Core Features */}
      {(features.length > 0 || baseFeatures.length > 0) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Zap size={20} className={styles.icon} />
            3. Core Features
          </h2>
          <div className={styles.epicList}>
            {hasFeaturesChanged && baseFeatures.map((feature: any, idx: number) => (
              <CommentableRow key={`stale-feature-${idx}`} nodeId={nodeId || ''} jsonPath={`$.core_features[?(@.feature_name=='${feature.feature_name}')]`} currentIteration={currentIteration} blockId={feature.req_id} isStale={true}>
                <article className={styles.epicItem}>
                  <h3 className={styles.epicHeader}>
                    <div className="flex items-center gap-2">
                      <span className={styles.idBadge}>{feature.req_id}</span>
                    </div>
                    <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>{feature.feature_name}</span>
                  </h3>
                  <div className={styles.epicBody}>
                    <p className={`${styles.epicDesc} ${styles.valueWrapper}`}>{feature.description}</p>
                  </div>
                </article>
              </CommentableRow>
            ))}
            {features.map((feature: any, idx: number) => (
              <CommentableRow key={`refined-feature-${idx}`} nodeId={nodeId || ''} jsonPath={`$.core_features[?(@.feature_name=='${feature.feature_name}')]`} currentIteration={currentIteration} blockId={feature.req_id} isRefined={hasFeaturesChanged}>
                <article className={styles.epicItem}>
                  <h3 className={styles.epicHeader}>
                    <div className="flex items-center gap-2">
                      <span className={styles.idBadge}>{feature.req_id}</span>
                      {feature.mapped_epic_id && (
                        <span className={styles.mappingBadge}>{feature.mapped_epic_id}</span>
                      )}
                    </div>
                    <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>{feature.feature_name}</span>
                    <span className={styles.priorityBadge}>{feature.priority}</span>
                  </h3>
                  <div className={styles.epicBody}>
                    <p className={`${styles.epicDesc} ${styles.valueWrapper}`}>{feature.description}</p>
                  </div>
                </article>
              </CommentableRow>
            ))}
          </div>
        </section>
      )}

      {/* 4. User Stories */}
      {(userStories.length > 0 || baseUserStories.length > 0) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Users size={20} className={styles.icon} />
            4. User Stories
          </h2>
          <div className={styles.epicList}>
             <article className={styles.epicItem}>
               <div className={styles.epicBody}>
                 <ul className={styles.criteriaList}>
                   {hasStoriesChanged && baseUserStories.map((story: string, idx: number) => (
                     <CommentableRow key={`stale-story-${idx}`} nodeId={nodeId || ''} jsonPath={`$.user_stories[${idx}]`} currentIteration={currentIteration} isStale={true}>
                       <li className={styles.criteriaItem}>
                         <User size={16} className={styles.opacity50} />
                         <span className={styles.valueWrapper}>{story}</span>
                       </li>
                     </CommentableRow>
                   ))}
                   {userStories.map((story: string, idx: number) => (
                     <CommentableRow key={`refined-story-${idx}`} nodeId={nodeId || ''} jsonPath={`$.user_stories[${idx}]`} currentIteration={currentIteration} isRefined={hasStoriesChanged}>
                       <li className={styles.criteriaItem}>
                         <User size={16} className={styles.opacity50} />
                         <span className={styles.valueWrapper}>{story}</span>
                       </li>
                     </CommentableRow>
                   ))}
                 </ul>
               </div>
             </article>
          </div>
        </section>
      )}

      {/* 5. Global Constraints */}
      {(constraints.length > 0 || baseConstraints.length > 0) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <ShieldCheck size={20} className={styles.icon} />
            5. Global Constraints
          </h2>
          <div className={styles.epicList}>
             <article className={styles.epicItem}>
               <div className={styles.epicBody}>
                 <ul className={styles.criteriaList}>
                   {hasConstraintsChanged && baseConstraints.map((c: string, idx: number) => (
                     <CommentableRow key={`stale-constraint-${idx}`} nodeId={nodeId || ''} jsonPath={`$.constraints[${idx}]`} currentIteration={currentIteration} isStale={true}>
                       <li className={styles.criteriaItem}>
                         <Shield size={16} className={styles.opacity50} />
                         <span className={styles.valueWrapper}>{c}</span>
                       </li>
                     </CommentableRow>
                   ))}
                   {constraints.map((c: string, idx: number) => (
                     <CommentableRow key={`refined-constraint-${idx}`} nodeId={nodeId || ''} jsonPath={`$.constraints[${idx}]`} currentIteration={currentIteration} isRefined={hasConstraintsChanged}>
                       <li className={styles.criteriaItem}>
                         <Shield size={16} className={styles.opacity50} />
                         <span className={styles.valueWrapper}>{c}</span>
                       </li>
                     </CommentableRow>
                   ))}
                 </ul>
               </div>
             </article>
          </div>
        </section>
      )}
    </div>
  );
};

export const ModuleFsdRenderer = ({ content, baseContent, nodeId, currentIteration }: { content: any, baseContent?: any, nodeId?: string, currentIteration?: any }) => {
  const features = content.features || [];
  const baseFeatures = baseContent?.features || [];

  const hasFeaturesChanged = baseContent && JSON.stringify(baseFeatures) !== JSON.stringify(features);

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Functional Specifications */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Layers size={20} className={styles.icon} />
          1. Functional Specifications
        </h2>
        
        <div className={styles.epicList}>
          {hasFeaturesChanged && baseFeatures.map((feature: any, idx: number) => (
            <CommentableRow key={`stale-${idx}`} nodeId={nodeId || ''} jsonPath={`$.features[?(@.func_id=='${feature.func_id}')]`} currentIteration={currentIteration} blockId={feature.func_id} isStale={true}>
              <article className={styles.epicItem} style={{ width: '100%' }}>
                <h3 className={styles.epicHeader}>
                  <span className={styles.idBadge}>{feature.func_id}</span>
                  <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>
                    {feature.summary || feature.feature_name} (Previous)
                  </span>
                </h3>
                <div className={styles.epicBody}>
                  <p className={styles.epicDesc}>{feature.description}</p>
                </div>
              </article>
            </CommentableRow>
          ))}
          {features.map((feature: any, idx: number) => (
            <CommentableRow key={`refined-${idx}`} nodeId={nodeId || ''} jsonPath={`$.features[?(@.func_id=='${feature.func_id}')]`} currentIteration={currentIteration} blockId={feature.func_id} isRefined={hasFeaturesChanged}>
              <article className={styles.epicItem} style={{ width: '100%' }}>
                <h3 className={styles.epicHeader}>
                  <span className={styles.idBadge}>{feature.func_id}</span>
                  <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>
                    {feature.summary || feature.feature_name}
                  </span>
                </h3>
                
                <div className={styles.epicBody}>
                  <p className={`${styles.epicDesc} ${styles.valueWrapper}`}>
                    {feature.mapped_req_id && (
                      <span className={styles.mappingBadge} style={{ marginRight: '8px' }}>
                        {feature.mapped_req_id}
                      </span>
                    )}
                    {feature.description}
                  </p>

                  {/* 1. Conditions */}
                  {(feature.pre_condition || feature.post_condition) && (
                    <div className={styles.criteriaSection}>
                      <h4 className={styles.criteriaTitle}>
                        <ShieldCheck size={16} />
                        Pre & Post Conditions:
                      </h4>
                      <ul className={styles.criteriaList}>
                        {feature.pre_condition && (
                          <CommentableRow nodeId={nodeId || ''} jsonPath={`$.features[?(@.func_id=='${feature.func_id}')].pre_condition`} currentIteration={currentIteration}>
                            <li className={styles.criteriaItem}>
                              <ArrowRight size={16} className={styles.checkIcon} />
                              <span className={styles.valueWrapper}><strong>Pre-condition:</strong> {feature.pre_condition}</span>
                            </li>
                          </CommentableRow>
                        )}
                        {feature.post_condition && (
                          <CommentableRow nodeId={nodeId || ''} jsonPath={`$.features[?(@.func_id=='${feature.func_id}')].post_condition`} currentIteration={currentIteration}>
                            <li className={styles.criteriaItem}>
                              <CheckCircle2 size={16} className={styles.checkIcon} />
                              <span className={styles.valueWrapper}><strong>Post-condition:</strong> {feature.post_condition}</span>
                            </li>
                          </CommentableRow>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* 2. Main Flow */}
                  {feature.flow && feature.flow.length > 0 && (
                    <div className={styles.criteriaSection}>
                      <h4 className={styles.criteriaTitle}>
                        <Activity size={16} />
                        Main Functional Flow:
                      </h4>
                      <ul className={styles.criteriaList}>
                        {feature.flow.map((step: string, sIdx: number) => (
                          <CommentableRow key={sIdx} nodeId={nodeId || ''} jsonPath={`$.features[?(@.func_id=='${feature.func_id}')].flow[${sIdx}]`} currentIteration={currentIteration}>
                            <li className={styles.criteriaItem}>
                              <div className={styles.stepBadge}>
                                {sIdx + 1}
                              </div>
                              <span className={styles.valueWrapper}>{step}</span>
                            </li>
                          </CommentableRow>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 3. Exception Flow */}
                  {feature.exception_flow && feature.exception_flow.length > 0 && (
                    <div className={styles.criteriaSection}>
                      <h4 className={styles.criteriaTitle}>
                        <AlertCircle size={16} />
                        Exception & Error Flows:
                      </h4>
                      <ul className={styles.criteriaList}>
                        {feature.exception_flow.map((step: string, eIdx: number) => (
                          <CommentableRow key={eIdx} nodeId={nodeId || ''} jsonPath={`$.features[?(@.func_id=='${feature.func_id}')].exception_flow[${eIdx}]`} currentIteration={currentIteration}>
                            <li className={styles.criteriaItem}>
                              <AlertCircle size={16} className={styles.opacity50} style={{ color: 'var(--warning)' }} />
                              <span className={styles.valueWrapper}>{step}</span>
                            </li>
                          </CommentableRow>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 4. Data Requirements */}
                  {feature.data_requirements && feature.data_requirements.length > 0 && (
                    <div className={styles.criteriaSection}>
                      <h4 className={styles.criteriaTitle}>
                        <Database size={16} />
                        Data Requirements:
                      </h4>
                      <ul className={styles.criteriaList}>
                        {feature.data_requirements.map((req: string, rIdx: number) => (
                          <CommentableRow key={rIdx} nodeId={nodeId || ''} jsonPath={`$.features[?(@.func_id=='${feature.func_id}')].data_requirements[${rIdx}]`} currentIteration={currentIteration}>
                            <li className={styles.criteriaItem}>
                              <Database size={16} className={styles.checkIcon} style={{ opacity: 0.5 }} />
                              <span className={styles.valueWrapper}>{req}</span>
                            </li>
                          </CommentableRow>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </article>
            </CommentableRow>
          ))}
        </div>
      </section>
    </div>
  );
};

export const PrdBentoRenderer = ({ content, baseContent, isIntegrated = false, stage, nodeId, currentIteration }: { content: any, baseContent?: any, isIntegrated?: boolean, stage?: number, nodeId?: string, currentIteration?: any }) => {
  if (!content) return <div className={styles.emptyState}>No content available</div>;

  // Use specialized renderer for Stage 1 (Business Strategy)
  if (stage === 1 || (!stage && content.business_context && !content.core_epics)) {
    return <BusinessStrategyRenderer content={content} baseContent={baseContent} nodeId={nodeId} currentIteration={currentIteration} />;
  }

  // Use specialized renderer for Stage 2 (Epics & Actors)
  if (stage === 2 || (!stage && content.core_epics && content.user_roles)) {
    return <EpicActorRenderer content={content} baseContent={baseContent} nodeId={nodeId} currentIteration={currentIteration} />;
  }

  // Use specialized renderer for Stage 3 (Architecture Schema)
  if (stage === 3 || (!stage && content.tech_stack && content.user_roles && !content.core_epics)) {
    return <ArchitectureSchemaRenderer content={content} baseContent={baseContent} nodeId={nodeId} currentIteration={currentIteration} />;
  }

  // Use specialized renderer for Module PRD (Stage 4 or legacy PrdSchema detection)
  if (stage === 4 || (!stage && content.overview && content.core_features)) {
    return <ModulePrdRenderer content={content} baseContent={baseContent} nodeId={nodeId} currentIteration={currentIteration} />;
  }

  const projectName = content.metadata?.project_name || content.project_name || 'Unnamed Project';
  const biz = content.business_context || {};
  const vision = content.product_vision || biz.product_vision || biz.product_goal || biz.vision || 'Goal not defined';
  const targetMarket = content.target_market || biz.target_market || biz.market || 'N/A';
  
  const rawMetrics = content.success_metrics || biz.success_metrics || biz.metrics || [];
  const successMetrics = Array.isArray(rawMetrics) ? rawMetrics : [String(rawMetrics)];
  
  const rawRoles = content.user_roles || content.actors || content.personas || [];
  const roles = Array.isArray(rawRoles) ? rawRoles : [];

  const rawEpics = content.core_epics || content.functional_epics || content.epics || [];
  const epics = Array.isArray(rawEpics) ? rawEpics : [];

  const constraints = content.global_constraints || content.constraints || null;

  return (
    <div className={styles.bentoGrid}>
      {/* 1. Business Strategy */}
      {(vision !== 'Goal not defined' || targetMarket !== 'N/A' || successMetrics.length > 0) && (
        <div className={`${styles.card} ${styles.col6}`}>
          <div className={`${styles.intentStrip} ${styles.primary}`} />
          {isIntegrated && <div className={styles.stageBadge}>STAGE {stage || 1}: STRATEGY</div>}
          <div className={styles.cardHeader}>
            <h2><Briefcase size={18} className={styles.icon} /> Business Strategy</h2>
          </div>
          <div className={styles.infoGroup}>
            <h3>Project Name</h3>
            <p className={`${styles.projectName} ${styles.valueWrapper}`}>{projectName}</p>
          </div>
          <div className={styles.infoGroup}>
            <h3>Product Goal</h3>
            <p className={styles.valueWrapper}>{vision}</p>
          </div>
          <div className="mt-6">
            <h3 className="text-[11px] font-bold opacity-40 uppercase mb-2">Success Metrics</h3>
            <ul className={styles.metricsList}>
              {successMetrics.map((m: string, i: number) => (
                <li key={i}><TrendingUp size={14} className="text-secondary" /> <span className={styles.valueWrapper}>{m}</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 2. Constraints */}
      {constraints && (
        <div className={`${styles.card} ${styles.col6}`}>
          <div className={`${styles.intentStrip} ${styles.warning}`} />
          {isIntegrated && <div className={styles.stageBadge}>STAGE {stage || 1}: CONSTRAINTS</div>}
          <div className={styles.cardHeader}>
            <h2><ShieldCheck size={18} className={styles.icon} /> Compliance & Constraints</h2>
          </div>
          <div className="flex flex-col gap-4">
            <div className={styles.infoGroup}>
              <h3>Compliance</h3>
              <div className={styles.flexWrapGap1} style={{ marginTop: '4px' }}>
                {constraints?.compliance?.map((c: string, i: number) => (
                  <span key={i} className={styles.warningBadge}>{c}</span>
                ))}
              </div>
            </div>
            <div className={styles.infoGroup}>
              <h3>Performance</h3>
              <p className={`text-sm ${styles.valueWrapper}`}>{constraints?.performance?.join(', ') || 'Standard Optimized'}</p>
            </div>
            <div className={styles.infoGroup}>
              <h3>Integrations</h3>
              <p className={`text-sm ${styles.valueWrapper}`}>{constraints?.legacy_integrations?.join(', ') || 'Independent'}</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Personas */}
      {roles.length > 0 && (
        <div className={`${styles.card} ${styles.col12}`}>
          <div className={styles.cardHeader}>
            <h2><Users size={18} className={styles.icon} /> System Persona Mapping</h2>
          </div>
          <div className={styles.personaGrid}>
            {roles.map((role: any, i: number) => (
              <div key={i} className={styles.personaChip}>
                <div className={styles.personaHeader}>
                  {role.permissions_level === 'ADMIN' ? <Shield size={16} className="text-primary" /> : <User size={16} className={styles.opacity50} />}
                  <div className="flex flex-col">
                    <span className={styles.name}>{role.role_name}</span>
                    <span className={styles.roleId}>{role.role_id || 'N/A'}</span>
                  </div>
                </div>
                <span className="text-[9px] font-bold bg-surface-container-low px-2 py-0.5 rounded w-fit">{role.permissions_level || 'USER'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Epics (Capabilities) */}
      {epics.length > 0 && (
        <div className={`${styles.card} ${styles.col12}`}>
          <div className={styles.cardHeader}>
            <h2><Zap size={18} className={styles.icon} /> Functional Capabilities</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {epics.map((epic: any, i: number) => (
              <div key={i} className="bg-surface-container-high p-4 rounded-xl border border-border group hover:border-primary transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-all">
                    <FileCode size={16} />
                  </div>
                  <div>
                    <h3 className={`font-bold text-sm ${styles.valueWrapper}`}>{epic.title}</h3>
                    <span className={styles.idBadge}>{epic.epic_id}</span>
                  </div>
                </div>
                <p className={`text-xs opacity-60 line-clamp-3 leading-relaxed ${styles.valueWrapper}`}>{epic.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const ModuleUserFlowRenderer = ({ content, baseContent, nodeId, currentIteration }: { content: any, baseContent?: any, nodeId?: string, currentIteration?: any }) => {
  if (!content) return null;
  const nodes = content.nodes || [];
  const edges = content.edges || [];
  const baseNodes = baseContent?.nodes || [];
  const baseEdges = baseContent?.edges || [];
  
  const hasChanged = baseContent && (
    JSON.stringify(baseNodes) !== JSON.stringify(nodes) ||
    JSON.stringify(baseEdges) !== JSON.stringify(edges)
  );

  const renderFlowNode = (node: any, i: number, isStale = false, isRefined = false) => (
    <CommentableRow key={`${node.id}-${isStale ? 'stale' : 'refined'}`} nodeId={nodeId || ''} jsonPath={`$.nodes[?(@.id=='${node.id}')]`} currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
      <article className={styles.epicItem}>
         <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
           <span className={styles.idBadge} style={{ marginRight: '8px' }}>{node.id}</span>
            <span className={styles.valueWrapper}>{node.label}</span>
           <span className={`${styles.badge} ${styles['badge--primary']} ml-2`}>
             {node.node_type}
           </span>
         </h3>
         <div className={styles.epicBody}>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <CommentableRow nodeId={nodeId || ''} jsonPath={`$.nodes[?(@.id=='${node.id}')].step`} currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
                  <div>
                    <h4 className={styles.criteriaTitle}>
                      <ArrowRight size={14} className="opacity-50" /> 
                      Action/Trigger
                    </h4>
                    <p className={styles.epicDesc} style={{ marginTop: '0.5rem' }}>{node.step}</p>
                  </div>
                </CommentableRow>
              </div>
              {node.system_response && (
                <div>
                  <CommentableRow nodeId={nodeId || ''} jsonPath={`$.nodes[?(@.id=='${node.id}')].system_response`} currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
                    <div>
                      <h4 className={styles.criteriaTitle}>
                        <Terminal size={14} className="opacity-50" /> 
                        System Response
                      </h4>
                      <p className={styles.epicDesc} style={{ marginTop: '0.5rem', borderColor: 'var(--accent)' }}>{node.system_response}</p>
                    </div>
                  </CommentableRow>
                </div>
              )}
           </div>
           
            {node.mapped_func_ids && node.mapped_func_ids.length > 0 && (
              <div className="mt-2">
                <CommentableRow nodeId={nodeId || ''} jsonPath={`$.nodes[?(@.id=='${node.id}')].mapped_func_ids`} currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
                  <div>
                    <h4 className={styles.criteriaTitle}>
                      <Code2 size={14} className="opacity-50" /> 
                      Functional Dependencies
                    </h4>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {node.mapped_func_ids.map((func: string, j: number) => (
                        <span key={j} className={styles.mappingBadge}>
                          {func}
                        </span>
                      ))}
                    </div>
                  </div>
                </CommentableRow>
              </div>
            )}
         </div>
      </article>
    </CommentableRow>
  );

  const renderFlowArch = (nodesToRender: any, edgesToRender: any, isStale = false, isRefined = false) => (
    <>
      {nodesToRender.map((node: any, i: number) => {
        const outboundEdges = edgesToRender.filter((e: any) => e.from_id === node.id);
        return (
          <CommentableRow key={`${node.id}-arch-${isStale ? 'stale' : 'refined'}`} nodeId={nodeId || ''} jsonPath={`$.nodes[?(@.id=='${node.id}')]`} currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
            <div className={styles.minimalRelRow}>
              <div className={styles.relNames} style={{ minWidth: '380px' }}>
                <span className={styles.idBadge} style={{ marginRight: '8px' }}>{node.id}</span>
                <div className="flex flex-col">
                  <span className={styles.textPrimary} style={{ fontWeight: 700 }}>{node.label}</span>
                  <span style={{ fontSize: '10px', opacity: 0.5 }}>{node.actor} • {node.node_type}</span>
                </div>
                <ChevronRight size={14} className={styles.opacity40} />
              </div>
              <div className={styles.relMeta}>
                {outboundEdges.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {outboundEdges.map((edge: any, j: number) => {
                      const targetNode = nodesToRender.find((n: any) => n.id === edge.to_id);
                      return (
                        <CommentableRow key={edge.edge_id || j} nodeId={nodeId || ''} jsonPath={`$.edges[?(@.from_id=='${node.id}' && @.to_id=='${edge.to_id}')]`} currentIteration={currentIteration} blockId={edge.edge_id} isStale={isStale} isRefined={isRefined}>
                          <div className="flex items-center gap-1">
                            {edge.edge_id && <span className={styles.idBadge} style={{ fontSize: '9px', padding: '1px 3px' }}>{edge.edge_id}</span>}
                            {edge.condition && (
                              <span style={{ 
                                fontSize: '10px', 
                                background: 'rgba(255,255,255,0.05)',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                opacity: 0.6
                              }}>{edge.condition}</span>
                            )}
                            <span style={{ 
                              fontSize: '13px',
                              color: 'var(--primary)',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              opacity: 0.8
                            }}>
                              {targetNode ? targetNode.label : edge.to_id}
                              {j < outboundEdges.length - 1 && <span style={{ marginLeft: '4px', opacity: 0.3 }}>,</span>}
                            </span>
                          </div>
                        </CommentableRow>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-[11px] opacity-30 italic">End of Flow</span>
                )}
              </div>
            </div>
          </CommentableRow>
        );
      })}
    </>
  );

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Step Details */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Activity size={20} className={styles.icon} />
          1. Sequence & Logic Details
        </h2>
        <div className={styles.epicList}>
          {nodes.map((node: any, i: number) => {
            const baseNode = baseNodes.find((bn: any) => bn.id === node.id);
            const isRefined = baseNode && JSON.stringify(baseNode) !== JSON.stringify(node);
            return (
              <React.Fragment key={node.id}>
                {isRefined && renderFlowNode(baseNode, i, true, false)}
                {renderFlowNode(node, i, false, isRefined)}
              </React.Fragment>
            );
          })}
          {baseNodes.filter((bn: any) => !nodes.some((n: any) => n.id === bn.id)).map((bn: any, i: number) => (
            renderFlowNode(bn, i, true, false)
          ))}
        </div>
      </section>

      {/* 2. User Flow Architecture */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <GitBranch className={styles.icon} size={20} />
          2. User Flow Mapping Architecture
        </h2>
        <div className={styles.epicList} style={{ gap: '2px' }}>
          {nodes.map((node: any, i: number) => {
            const baseNode = baseNodes.find((bn: any) => bn.id === node.id);
            // Check if node or its outbound edges changed
            const outboundEdges = edges.filter((e: any) => e.from_id === node.id);
            const baseOutboundEdges = baseEdges.filter((e: any) => e.from_id === node.id);
            const isRefined = baseNode && (
              JSON.stringify(baseNode) !== JSON.stringify(node) ||
              JSON.stringify(baseOutboundEdges) !== JSON.stringify(outboundEdges)
            );
            
            return (
              <React.Fragment key={`${node.id}-arch`}>
                {isRefined && renderFlowArch([baseNode], baseOutboundEdges, true, false)}
                {renderFlowArch([node], outboundEdges, false, isRefined)}
              </React.Fragment>
            );
          })}
          {baseNodes.filter((bn: any) => !nodes.some((n: any) => n.id === bn.id)).map((bn: any, i: number) => {
            const baseOutboundEdges = baseEdges.filter((e: any) => e.from_id === bn.id);
            return renderFlowArch([bn], baseOutboundEdges, true, false);
          })}
        </div>
      </section>
    </div>
  );
};

export const ModuleErdRenderer = ({ content, baseContent, nodeId, currentIteration }: { content: any, baseContent?: any, nodeId?: string, currentIteration?: any }) => {
  if (!content) return null;
  
  const parseErd = (c: any) => {
    const entities = (c.tables || []).map((t: any) => ({
      entity_name: t.table_name || t.name,
      table_id: t.table_id,
      mapped_func_ids: t.mapped_func_ids || [],
      description: t.description || '',
      attributes: (t.columns || []).map((col: any) => ({
        name: col.name,
        data_type: col.data_type,
        is_primary_key: col.is_pk || col.is_primary_key,
        is_nullable: col.is_nullable,
        description: col.description
      }))
    }));

    const relations = (c.relationships || []).map((rel: any) => ({
      rel_id: rel.rel_id,
      from_entity: rel.from_entity || rel.source_table,
      to_entity: rel.to_entity || rel.target_table,
      relationship_type: rel.relationship_type || rel.rel_type,
      description: rel.description
    }));

    return { entities, relations };
  };

  const { entities, relations } = parseErd(content);
  const baseErd = baseContent ? parseErd(baseContent) : null;
  
  const hasEntitiesChanged = baseErd && JSON.stringify(baseErd.entities) !== JSON.stringify(entities);
  const hasRelationsChanged = baseErd && JSON.stringify(baseErd.relations) !== JSON.stringify(relations);

  const renderErdEntity = (ent: any, i: number, isStale = false, isRefined = false) => (
    <CommentableRow key={`${ent.entity_name}-${isStale ? 'stale' : 'refined'}`} nodeId={nodeId || ''} jsonPath={`$.tables[?(@.table_name=='${ent.entity_name}')]`} currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
      <article className={styles.epicItem}>
        <h3 className={styles.erdEntityTitle}>
          <Layers size={22} className="text-primary opacity-50" />
          {ent.table_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{ent.table_id}</span>}
          <span className={styles.valueWrapper}>{ent.entity_name}</span>
        </h3>
        <div className={styles.erdEntityBody}>
          {ent.description && (
            <CommentableRow nodeId={nodeId || ''} jsonPath={`$.tables[?(@.table_name=='${ent.entity_name}')].description`} currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
              <p className={styles.epicDesc}>{ent.description}</p>
            </CommentableRow>
          )}
          
          {ent.mapped_func_ids && ent.mapped_func_ids.length > 0 && (
            <div className={styles.epicTags} style={{ marginTop: '8px', paddingLeft: '28px' }}>
              {ent.mapped_func_ids.map((fid: string) => (
                <span key={fid} className={styles.mappingBadge}>{fid}</span>
              ))}
            </div>
          )}
          
          {ent.attributes && ent.attributes.length > 0 && (
            <div className={styles.criteriaSection}>
              <h4 className={styles.criteriaTitle} style={{ marginTop: '8px' }}>
                <ListTodo size={14} />
                Attributes
              </h4>
              <div className="flex flex-col gap-1 mt-2">
                {ent.attributes.map((attr: any, j: number) => (
                  <CommentableRow key={j} nodeId={nodeId || ''} jsonPath={`$.tables[?(@.table_name=='${ent.entity_name}')].columns[?(@.name=='${attr.name}')]`} currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
                    <div className={styles.attributeLine}>
                      <div className={styles.attribute}>
                        <span className={styles.name}>{attr.name}</span>
                        <span className={styles.type}>({attr.data_type})</span>
                        {attr.is_primary_key && <span className={styles.badge}>PK</span>}
                        {!attr.is_primary_key && attr.is_nullable && <span className={`${styles.opacity40} ${styles.textXs}`}>NULL</span>}
                        {!attr.is_primary_key && !attr.is_nullable && <span className={`${styles.opacity40} ${styles.textXs}`}>NOT NULL</span>}
                      </div>
                      {attr.description && (
                        <span className={styles.desc}>- {attr.description}</span>
                      )}
                    </div>
                  </CommentableRow>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    </CommentableRow>
  );

  const renderErdRelation = (rel: any, i: number, isStale = false, isRefined = false) => (
    <CommentableRow key={`${rel.rel_id || i}-${isStale ? 'stale' : 'refined'}`} nodeId={nodeId || ''} jsonPath={`$.relationships[${i}]`} currentIteration={currentIteration} blockId={rel.rel_id} isStale={isStale} isRefined={isRefined}>
      <div className={styles.minimalRelRow}>
        <div className={styles.relNames}>
          {rel.rel_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{rel.rel_id}</span>}
          <span className={styles.textPrimary}>{rel.from_entity}</span>
          <ChevronRight size={14} className={styles.opacity40} />
          <span className={styles.textSecondary}>{rel.to_entity}</span>
        </div>
        <div className={styles.relMeta}>
          <span className={styles.relBadge}>{rel.relationship_type}</span>
          <span className={styles.relDescription}>{rel.description}</span>
        </div>
      </div>
    </CommentableRow>
  );

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Core Entities / Tables */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Database className={styles.icon} size={20} />
          1. Core Entities
        </h2>
        <div className={styles.epicList}>
          {entities.map((ent: any, i: number) => {
            const baseEnt = baseErd?.entities.find((be: any) => be.entity_name === ent.entity_name);
            const isRefined = baseEnt && JSON.stringify(baseEnt) !== JSON.stringify(ent);
            return (
              <React.Fragment key={ent.entity_name}>
                {isRefined && renderErdEntity(baseEnt, i, true, false)}
                {renderErdEntity(ent, i, false, isRefined)}
              </React.Fragment>
            );
          })}
          {baseErd?.entities.filter((be: any) => !entities.some((e: any) => e.entity_name === be.entity_name)).map((be: any, i: number) => (
            renderErdEntity(be, i, true, false)
          ))}
        </div>
      </section>

      {/* 2. Relationships Map */}
      {relations.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <GitBranch className={styles.icon} size={20} />
            2. Relationship Architecture
          </h2>
          <div className={styles.epicList} style={{ gap: '2px' }}>
            {relations.map((rel: any, i: number) => {
              const baseRel = baseErd?.relations.find((br: any) => br.from_entity === rel.from_entity && br.to_entity === rel.to_entity);
              const isRefined = baseRel && JSON.stringify(baseRel) !== JSON.stringify(rel);
              return (
                <React.Fragment key={`${rel.from_entity}-${rel.to_entity}`}>
                  {isRefined && renderErdRelation(baseRel, i, true, false)}
                  {renderErdRelation(rel, i, false, isRefined)}
                </React.Fragment>
              );
            })}
            {baseErd?.relations.filter((br: any) => !relations.some((r: any) => r.from_entity === br.from_entity && r.to_entity === br.to_entity)).map((br: any, i: number) => (
              renderErdRelation(br, i, true, false)
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export const SadGlobalRenderer = ({ content, baseContent, nodeId, currentIteration }: { content: any, baseContent?: any, nodeId?: string, currentIteration?: any }) => {
  const contexts = Array.isArray(content) ? content : (content.contexts || []);
  const baseContexts = baseContent ? (Array.isArray(baseContent) ? baseContent : (baseContent.contexts || [])) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {contexts.map((ctx: any, idx: number) => (
        <div key={idx} className={`${styles.card} ${styles.col12} p-0 overflow-visible`}>
          <div className="p-6 max-h-[500px] overflow-auto custom-scrollbar">
            <SadSpecRenderer
              type={ctx.context_type}
              data={ctx.context_data_json}
              baseData={baseContexts.find((bc: any) => bc.context_type === ctx.context_type)?.context_data_json}
              isRaw={false}
              nodeId={nodeId}
              currentIteration={currentIteration}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
