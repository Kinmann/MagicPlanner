import React from 'react';
import { 
  Briefcase, TrendingUp, ShieldCheck, 
  Users, User, Shield, Zap,
  Box, FileCode, ListTodo, CheckCircle2, Layers,
  Server, Database, Cpu, Globe, Monitor, Code2, Key,
  Activity, ArrowRight, AlertCircle, FileText,
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
        <div className="ml-4">
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
        <div className="ml-4">
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

export const BusinessStrategyRenderer = ({ content }: { content: any }) => {
  const projectName = content.metadata?.project_name || content.project_name || 'Unnamed Project';
  const biz = content.business_context || {};
  const vision = content.product_vision || biz.product_vision || biz.product_goal || biz.vision || 'Goal not defined';
  const targetMarket = content.target_market || biz.target_market || biz.market || 'N/A';
  
  const rawMetrics = content.success_metrics || biz.success_metrics || biz.metrics || [];
  const successMetrics = Array.isArray(rawMetrics) ? rawMetrics : [String(rawMetrics)];
  
  const constraints = content.global_constraints || content.constraints || null;

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
              <div className="flex flex-col gap-6">
                <div>
                  <h4 className={styles.criteriaTitle}>
                    <TrendingUp size={14} className="opacity-50" /> Product Vision
                  </h4>
                  <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>
                    {vision}
                  </p>
                </div>
                
                {targetMarket !== 'N/A' && (
                  <div>
                    <h4 className={styles.criteriaTitle}>
                      <Users size={14} className="opacity-50" /> Target Market
                    </h4>
                    <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>
                      {targetMarket}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* 2. Success Metrics */}
      {successMetrics.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <CheckCircle2 size={20} className={styles.icon} />
            2. Success Metrics
          </h2>
          
          <div className={styles.epicList}>
            <article className={styles.epicItem}>
              <div className={styles.epicBody}>
                <ul className={styles.criteriaList}>
                  {successMetrics.map((metric: string, idx: number) => (
                    <li key={idx} className={styles.criteriaItem}>
                      <CheckCircle2 size={16} className={styles.checkIcon} />
                      <span className={styles.valueWrapper}>{metric}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </div>
        </section>
      )}

      {/* 3. Constraints & Compliance */}
      {constraints && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <ShieldCheck size={20} className={styles.icon} />
            3. Constraints & Compliance
          </h2>
          
          <div className={styles.epicList}>
            <article className={styles.epicItem}>
              <div className={styles.epicBody}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {(constraints.compliance && constraints.compliance.length > 0) && (
                    <div>
                      <h4 className={styles.criteriaTitle} style={{ marginBottom: '1rem' }}>
                        <Shield size={16} /> Compliance Standards
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {constraints.compliance.map((c: string, i: number) => (
                          <span key={i} className={`${styles.actorChip} ${styles.valueWrapper}`}>{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {(constraints.performance || constraints.legacy_integrations) && (
                    <div>
                      <h4 className={styles.criteriaTitle} style={{ marginBottom: '1rem' }}>
                        <Zap size={16} /> System Constraints
                      </h4>
                      <ul className={styles.criteriaList}>
                        {constraints.performance?.map((p: string, i: number) => (
                          <li key={i} className={styles.criteriaItem}>
                            <CheckCircle2 size={14} className={styles.checkIcon} />
                            <span className={styles.valueWrapper}><strong>Performance:</strong> {p}</span>
                          </li>
                        ))}
                        {constraints.legacy_integrations?.map((l: string, i: number) => (
                          <li key={i} className={styles.criteriaItem}>
                            <Box size={14} className="text-secondary opacity-60" />
                            <span className={styles.valueWrapper}><strong>Legacy:</strong> {l}</span>
                          </li>
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

export const EpicActorRenderer = ({ content }: { content: any }) => {
  const rawRoles = content.user_roles || content.actors || content.personas || [];
  const roles = Array.isArray(rawRoles) ? rawRoles : [];

  const rawEpics = content.core_epics || content.functional_epics || content.epics || [];
  const epics = Array.isArray(rawEpics) ? rawEpics : [];

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. System Actors */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Users size={20} className={styles.icon} />
          1. System Actors
        </h2>
        <ul className={styles.actorList}>
          {roles.map((role: any, idx: number) => (
            <li key={idx} className={styles.actorItem}>
              <span className={`${styles.actorName} ${styles.valueWrapper}`}>
                <User size={16} className={styles.icon} />
                {role.role_name}
              </span>
              <span className={`${styles.actorDesc} ${styles.valueWrapper}`}>{role.description}</span>
            </li>
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
          {epics.map((epic: any, idx: number) => (
            <article key={idx} className={styles.epicItem}>
              <h3 className={styles.epicHeader}>
                <span className={styles.epicId}>[{epic.epic_id}]</span>
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
                        <li key={cIdx} className={styles.criteriaItem}>
                          <CheckCircle2 size={16} className={styles.checkIcon} />
                          <span className={styles.valueWrapper}>{criteria}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export const ArchitectureSchemaRenderer = ({ content }: { content: any }) => {
  const roles = Array.isArray(content.user_roles) ? content.user_roles : [];
  const tech = content.tech_stack || {};

  const techItems = [
    { title: 'Frontend Stack', data: tech.frontend, icon: <Monitor size={18} /> },
    { title: 'Backend Stack', data: tech.backend, icon: <Server size={18} /> },
    { title: 'Data Infrastructure', data: tech.database, icon: <Database size={18} /> },
    { title: 'Cloud & DevOps', data: tech.infrastructure, icon: <Globe size={18} /> },
    { title: 'AI Model Spec', data: tech.ai_model_spec, icon: <Cpu size={18} /> },
    { title: 'Interface & Auth', data: tech.interface_protocols, icon: <Key size={18} /> },
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
              <div className="flex flex-col gap-6">
                {roles.map((role: any, idx: number) => (
                  <div key={idx}>
                    <h4 className={styles.criteriaTitle}>
                      {role.permissions_level === 'ADMIN' ? <ShieldCheck size={14} className="opacity-50" /> : <User size={14} className="opacity-50" />}
                      <span className={styles.valueWrapper}>{role.role_name}</span> <span style={{ opacity: 0.3, fontSize: '10px', marginLeft: '4px' }}>[{role.role_id}]</span>
                    </h4>
                    <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.4rem' }}>
                      Permission Level: <span className="text-primary font-bold">{role.permissions_level}</span>
                    </p>
                  </div>
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
              <div className="flex flex-col gap-6">
                {techItems.map((item, idx) => (
                  <div key={idx}>
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
                      {Object.entries(item.data || {}).map(([key, val]: [string, any], kIdx) => (
                        <div key={kIdx} className={styles.kvRow}>
                          <Zap size={12} style={{ opacity: 0.3, flexShrink: 0, marginTop: '2px' }} />
                          <span style={{ fontSize: '13px', opacity: 0.8, minWidth: '160px' }}>
                            {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}:
                          </span>
                          <span className={`${styles.valueWrapper} text-primary`} style={{ fontSize: '13px', fontWeight: '700' }}>
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
};

export const ModulePrdRenderer = ({ content }: { content: any }) => {
  const overview = content.overview || {};
  const goals = content.goals || [];
  const features = content.core_features || [];
  const userStories = content.user_stories || [];
  const constraints = content.constraints || [];

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
               <div className="flex flex-col gap-6">
                 {overview.solution_vision && (
                   <div>
                     <h4 className={styles.criteriaTitle}><Zap size={14} className="opacity-50" /> Solution Vision</h4>
                     <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>{overview.solution_vision}</p>
                   </div>
                 )}
                 {overview.target_audience && (
                   <div>
                     <h4 className={styles.criteriaTitle}><Users size={14} className="opacity-50" /> Target Audience</h4>
                     <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>{overview.target_audience}</p>
                   </div>
                 )}
                 {overview.problem_statement && (
                   <div>
                     <h4 className={styles.criteriaTitle}><ListTodo size={14} className="opacity-50" /> Problem Statement</h4>
                     <p className={`${styles.epicDesc} ${styles.valueWrapper}`} style={{ marginTop: '0.5rem' }}>{overview.problem_statement}</p>
                   </div>
                 )}
               </div>
             </div>
           </article>
        </div>
      </section>

      {/* 2. Product Goals */}
      {goals.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <TrendingUp size={20} className={styles.icon} />
            2. Product Goals
          </h2>
          <div className={styles.epicList}>
            <article className={styles.epicItem}>
              <div className={styles.epicBody}>
                <ul className={styles.criteriaList}>
                  {goals.map((goal: string, idx: number) => (
                    <li key={idx} className={styles.criteriaItem}>
                      <CheckCircle2 size={16} className={styles.checkIcon} />
                      <span className={styles.valueWrapper}>{goal}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </div>
        </section>
      )}

      {/* 3. Core Features */}
      {features.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Zap size={20} className={styles.icon} />
            3. Core Features
          </h2>
          <div className={styles.epicList}>
            {features.map((feature: any, idx: number) => (
              <article key={idx} className={styles.epicItem}>
                <h3 className={styles.epicHeader}>
                  <span className={styles.epicId}>{feature.mapped_epic_id || `F-${idx+1}`} / {feature.req_id || 'REQ'}</span>
                  <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>{feature.feature_name}</span>
                  <span className="ml-auto text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">{feature.priority}</span>
                </h3>
                <div className={styles.epicBody}>
                  <p className={`${styles.epicDesc} ${styles.valueWrapper}`}>{feature.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 4. User Stories */}
      {userStories.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Users size={20} className={styles.icon} />
            4. User Stories
          </h2>
          <div className={styles.epicList}>
             <article className={styles.epicItem}>
               <div className={styles.epicBody}>
                 <ul className={styles.criteriaList}>
                   {userStories.map((story: string, idx: number) => (
                     <li key={idx} className={styles.criteriaItem}>
                       <User size={16} className="opacity-40" />
                       <span className={styles.valueWrapper}>{story}</span>
                     </li>
                   ))}
                 </ul>
               </div>
             </article>
          </div>
        </section>
      )}

      {/* 5. Global Constraints */}
      {constraints.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <ShieldCheck size={20} className={styles.icon} />
            5. Global Constraints
          </h2>
          <div className={styles.epicList}>
             <article className={styles.epicItem}>
               <div className={styles.epicBody}>
                 <ul className={styles.criteriaList}>
                   {constraints.map((c: string, idx: number) => (
                     <li key={idx} className={styles.criteriaItem}>
                       <Shield size={16} className="opacity-40" />
                       <span className={styles.valueWrapper}>{c}</span>
                     </li>
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

export const ModuleFsdRenderer = ({ content, nodeId, currentIteration }: { content: any, nodeId?: string, currentIteration?: any }) => {
  const features = content.features || [];

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Functional Specifications */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Layers size={20} className={styles.icon} />
          1. Functional Specifications
        </h2>
        
        <div className={styles.epicList}>
          {features.map((feature: any, idx: number) => (
            <CommentableRow key={idx} nodeId={nodeId || ''} jsonPath={`$.features[?(@.func_id=='${feature.func_id}')]`} currentIteration={currentIteration}>
              <article className={styles.epicItem} style={{ width: '100%' }}>
                <h3 className={styles.epicHeader}>
                  <span className={styles.epicId}>[{feature.func_id || `F-${idx+1}`}]</span>
                  <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>
                    {feature.summary || feature.feature_name}
                  </span>
                </h3>
                
                <div className={styles.epicBody}>
                  <p className={`${styles.epicDesc} ${styles.valueWrapper}`}>
                    {feature.mapped_req_id && (
                      <span className={styles.reqBadge}>
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
                          <li className={styles.criteriaItem}>
                            <ArrowRight size={16} className={styles.checkIcon} />
                            <span className={styles.valueWrapper}><strong>Pre-condition:</strong> {feature.pre_condition}</span>
                          </li>
                        )}
                        {feature.post_condition && (
                          <li className={styles.criteriaItem}>
                            <CheckCircle2 size={16} className={styles.checkIcon} />
                            <span className={styles.valueWrapper}><strong>Post-condition:</strong> {feature.post_condition}</span>
                          </li>
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
                          <li key={sIdx} className={styles.criteriaItem}>
                            <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold border border-primary/20 mr-1 flex-shrink-0">
                              {sIdx + 1}
                            </div>
                            <span className={styles.valueWrapper}>{step}</span>
                          </li>
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
                          <li key={eIdx} className={styles.criteriaItem}>
                            <AlertCircle size={16} className="text-warning opacity-50" />
                            <span className={styles.valueWrapper}>{step}</span>
                          </li>
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
                          <li key={rIdx} className={styles.criteriaItem}>
                            <Database size={16} className={styles.checkIcon} style={{ opacity: 0.5 }} />
                            <span className={styles.valueWrapper}>{req}</span>
                          </li>
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

export const PrdBentoRenderer = ({ content, isIntegrated = false, stage, nodeId, currentIteration }: { content: any, isIntegrated?: boolean, stage?: number, nodeId?: string, currentIteration?: any }) => {
  if (!content) return <div className={styles.emptyState}>No content available</div>;

  // Use specialized renderer for Stage 1 (Business Strategy)
  if (stage === 1 || (!stage && content.business_context && !content.core_epics)) {
    return <BusinessStrategyRenderer content={content} />;
  }

  // Use specialized renderer for Stage 2 (Epics & Actors)
  if (stage === 2 || (!stage && content.core_epics && content.user_roles)) {
    return <EpicActorRenderer content={content} />;
  }

  // Use specialized renderer for Stage 3 (Architecture Schema)
  if (stage === 3 || (!stage && content.tech_stack && content.user_roles && !content.core_epics)) {
    return <ArchitectureSchemaRenderer content={content} />;
  }

  // Use specialized renderer for Module PRD (Stage 4 or legacy PrdSchema detection)
  if (stage === 4 || (!stage && content.overview && content.core_features)) {
    return <ModulePrdRenderer content={content} />;
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
              <div className="flex flex-wrap gap-1 mt-1">
                {constraints?.compliance?.map((c: string, i: number) => (
                  <span key={i} className={`text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded border border-warning/20 font-bold ${styles.valueWrapper}`}>{c}</span>
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
                  {role.permissions_level === 'ADMIN' ? <Shield size={16} className="text-primary" /> : <User size={16} className="opacity-40" />}
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
                    <span className="text-[10px] font-mono opacity-40">{epic.epic_id}</span>
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

export const ModuleUserFlowRenderer = ({ content, nodeId, currentIteration }: { content: any, nodeId?: string, currentIteration?: any }) => {
  if (!content) return null;
  const nodes = content.nodes || [];
  const edges = content.edges || [];

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Step Details */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Activity size={20} className={styles.icon} />
          1. Sequence & Logic Details
        </h2>
        <div className={styles.epicList}>
          {nodes.map((node: any, i: number) => (
            <article key={i} className={styles.epicItem}>
               <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                 <span className={styles.epicId}>[{node.id}]</span>
                 <span className={styles.valueWrapper}>{node.label}</span>
                 <span className={`${styles.badge} ${styles['badge--primary']} ml-2`}>
                   {node.node_type}
                 </span>
               </h3>
               <div className={styles.epicBody}>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h4 className={styles.criteriaTitle}>
                        <ArrowRight size={14} className="opacity-50" /> 
                        Action/Trigger
                      </h4>
                      <p className={styles.epicDesc} style={{ marginTop: '0.5rem' }}>{node.step}</p>
                    </div>
                    {node.system_response && (
                      <div>
                        <h4 className={styles.criteriaTitle}>
                          <Terminal size={14} className="opacity-50" /> 
                          System Response
                        </h4>
                        <p className={styles.epicDesc} style={{ marginTop: '0.5rem', borderColor: 'var(--accent)' }}>{node.system_response}</p>
                      </div>
                    )}
                 </div>
                 
                 {node.mapped_func_ids && node.mapped_func_ids.length > 0 && (
                   <div className="mt-2">
                     <h4 className={styles.criteriaTitle}>
                       <Code2 size={14} className="opacity-50" /> 
                       Functional Dependencies
                     </h4>
                     <div className="flex flex-wrap gap-2 mt-2">
                       {node.mapped_func_ids.map((func: string, j: number) => (
                         <span key={j} className={`${styles.badge} ${styles['badge--primary']} text-[10px]`}>
                           {func}
                         </span>
                       ))}
                     </div>
                   </div>
                 )}
               </div>
            </article>
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
            const outboundEdges = edges.filter((e: any) => e.from_id === node.id);
            return (
              <div key={i} className={styles.minimalRelRow}>
                <div className={styles.relNames} style={{ minWidth: '380px' }}>
                  <span className={styles.epicId}>[{node.id}]</span>
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
                        const targetNode = nodes.find((n: any) => n.id === edge.to_id);
                        return (
                          <div key={j} className="flex items-center gap-1">
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
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-[11px] opacity-30 italic">End of Flow</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export const ModuleErdRenderer = ({ content, nodeId, currentIteration }: { content: any, nodeId?: string, currentIteration?: any }) => {
  if (!content) return null;
  
  // Normalize tables and columns
  const entities = (content.tables || []).map((t: any) => ({
    entity_name: t.table_name || t.name,
    description: t.description || '',
    attributes: (t.columns || []).map((c: any) => ({
      name: c.name,
      data_type: c.data_type,
      is_primary_key: c.is_pk || c.is_primary_key,
      is_nullable: c.is_nullable,
      description: c.description
    }))
  }));

  const relations = (content.relationships || []).map((rel: any) => ({
    from_entity: rel.from_entity || rel.source_table,
    to_entity: rel.to_entity || rel.target_table,
    relationship_type: rel.relationship_type || rel.rel_type,
    description: rel.description
  }));

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Core Entities / Tables */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Database className={styles.icon} size={20} />
          1. Core Entities
        </h2>
        <div className={styles.epicList}>
          {entities.map((ent: any, i: number) => (
            <article key={i} className={styles.epicItem}>
              <h3 className={styles.erdEntityTitle}>
                <Layers size={22} className="text-primary opacity-50" />
                <span className={styles.valueWrapper}>{ent.entity_name}</span>
              </h3>
              <div className={styles.erdEntityBody}>
                {ent.description && <p className={styles.epicDesc}>{ent.description}</p>}
                
                {ent.attributes && ent.attributes.length > 0 && (
                  <div className={styles.criteriaSection}>
                    <h4 className={styles.criteriaTitle} style={{ marginTop: '8px' }}>
                      <ListTodo size={14} />
                      Attributes
                    </h4>
                    <div className="flex flex-col gap-1 mt-2">
                      {ent.attributes.map((attr: any, j: number) => (
                        <div key={j} className={styles.attributeLine}>
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
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </article>
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
            {relations.map((rel: any, i: number) => (
              <div key={i} className={styles.minimalRelRow}>
                <div className={styles.relNames}>
                  <span className={styles.textPrimary}>{rel.from_entity}</span>
                  <ChevronRight size={14} className={styles.opacity40} />
                  <span className={styles.textSecondary}>{rel.to_entity}</span>
                </div>
                <div className={styles.relMeta}>
                  <span className={styles.relBadge}>{rel.relationship_type}</span>
                  <span className={styles.relDescription}>{rel.description}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export const SadGlobalRenderer = ({ content, nodeId, currentIteration }: { content: any, nodeId?: string, currentIteration?: any }) => {
  const contexts = Array.isArray(content) ? content : (content.contexts || []);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {contexts.map((ctx: any, idx: number) => (
        <div key={idx} className={`${styles.card} ${styles.col12} p-0 overflow-visible`}>
          <div className="p-6 max-h-[500px] overflow-auto custom-scrollbar">
            <SadSpecRenderer
              type={ctx.context_type}
              data={ctx.context_data_json}
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
