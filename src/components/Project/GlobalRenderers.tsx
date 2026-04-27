import React from 'react';
import { 
  Briefcase, TrendingUp, ShieldCheck, 
  Users, User, Shield, Zap,
  Box, FileCode, ListTodo, CheckCircle2, Layers,
  Server, Database, Cpu, Globe, Monitor, Code2, Key
} from 'lucide-react';
import SadSpecRenderer from './SadSpecRenderer';
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

export const PrdBentoRenderer = ({ content, isIntegrated = false, stage }: { content: any, isIntegrated?: boolean, stage?: number }) => {
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

export const SadGlobalRenderer = ({ content }: { content: any }) => {
  const contexts = Array.isArray(content) ? content : (content.contexts || []);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {contexts.map((ctx: any, idx: number) => (
        <div key={idx} className={`${styles.card} ${styles.col12} p-0 overflow-visible`}>
          <div className="flex items-center justify-between px-6 py-3 border-bottom border-border bg-surface-container-high rounded-t-xl">
             <div className="flex items-center gap-2">
               <Box size={14} className="text-primary" />
               <span className="text-[11px] font-bold tracking-widest opacity-60 uppercase">{ctx.context_type?.replace('sad_', '')} Specification</span>
             </div>
             <span className="text-[10px] font-mono opacity-30">{ctx.context_type?.toUpperCase()}.JSON</span>
          </div>
          <div className="p-6 max-h-[500px] overflow-auto custom-scrollbar">
            <SadSpecRenderer
              type={ctx.context_type}
              data={ctx.context_data_json}
              isRaw={false}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
