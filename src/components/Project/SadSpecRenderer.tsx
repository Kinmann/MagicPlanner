import React from 'react';
import { 
  Database, Terminal, Layers, 
  Info, LayoutGrid, Component,
  ChevronRight,
  GitBranch, Eye, 
  RefreshCw, Check,
  Shield, ShieldCheck, Zap, TrendingUp, Briefcase, CheckCircle2,
  Monitor, Server, Globe, Key, User, ListTodo
} from 'lucide-react';
import WireframeRenderer from './Renderer/modules/WireframeRenderer';
import TcRenderer from './Renderer/modules/TcRenderer';
import { CommentableRow } from '../ui/CommentableRow';
import styles from './SadSpecRenderer.module.scss';

interface SadSpecRendererProps {
  type: string;
  data: any;
  isRaw?: boolean;
  nodeId?: string;
  currentIteration?: any;
}

/**
 * 1. ERD Renderer (sad_core_erd)
 */
const ErdRenderer: React.FC<{ data: any, nodeId?: string, currentIteration?: any }> = ({ data, nodeId, currentIteration }) => {
  const isModuleErd = !!data.tables;
  const entities = isModuleErd 
    ? (data.tables || []).map((t: any) => ({
        entity_name: t.table_name,
        description: t.description || '',
        attributes: (t.columns || []).map((c: any) => ({
          name: c.name,
          data_type: c.data_type,
          is_primary_key: c.is_pk,
          is_nullable: c.is_nullable,
          description: c.description
        }))
      }))
    : (data.entities || []);

  const relations = (data.relationships || []).map((rel: any) => ({
    from_entity: rel.from_entity || rel.source_table,
    to_entity: rel.to_entity || rel.target_table,
    relationship_type: rel.relationship_type || rel.rel_type,
    description: rel.description
  }));

  // JSONPath helper for ERD
  const getEntityPath = (name: string) => {
    return isModuleErd 
      ? `$.tables[?(@.table_name=='${name}')]`
      : `$.entities[?(@.entity_name=='${name}')]`;
  };

  const getAttributePath = (entityName: string, attrName: string) => {
    return isModuleErd
      ? `$.tables[?(@.table_name=='${entityName}')].columns[?(@.name=='${attrName}')]`
      : `$.entities[?(@.entity_name=='${entityName}')].attributes[?(@.name=='${attrName}')]`;
  };

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Core Entities / Tables */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Database className={styles.icon} size={20} />
          1. {isModuleErd ? 'Database Tables' : 'Core Entities'}
        </h2>
        <div className={styles.epicList}>
          {entities.map((ent: any, i: number) => (
            <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={getEntityPath(ent.entity_name)} currentIteration={currentIteration}>
              <article className={styles.epicItem} style={{ width: '100%' }}>
                <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                  <Layers size={18} className="text-primary opacity-50" />
                  <span className={styles.valueWrapper}>{ent.entity_name}</span>
                </h3>
                <div className={styles.epicBody}>
                  <p className={styles.epicDesc}>{ent.description}</p>
                  
                  {ent.attributes && ent.attributes.length > 0 && (
                    <div className={styles.criteriaSection}>
                      <h4 className={styles.criteriaTitle}>
                        <ListTodo size={14} />
                        {isModuleErd ? 'Columns' : 'Attributes'}
                      </h4>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {ent.attributes.map((attr: any, j: number) => (
                          <CommentableRow key={j} nodeId={nodeId || ''} jsonPath={getAttributePath(ent.entity_name, attr.name)} currentIteration={currentIteration}>
                            <div className={styles.attribute}>
                              <span className={styles.name}>{attr.name}</span>
                              <span className={styles.type}>({attr.data_type})</span>
                              {attr.is_primary_key && <span className={styles.badge}>PK</span>}
                              {!attr.is_primary_key && attr.is_nullable && <span className={`${styles.opacity40} ${styles.textXs}`}>NULL</span>}
                              {!attr.is_primary_key && !attr.is_nullable && <span className={`${styles.opacity40} ${styles.textXs}`}>NOT NULL</span>}
                            </div>
                          </CommentableRow>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            </CommentableRow>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <GitBranch className={styles.icon} size={20} />
          2. Relationship Architecture
        </h2>
        <div className={styles.epicList} style={{ gap: '2px' }}>
          {relations.map((rel: any, i: number) => (
            <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={`$.relationships[${i}]`} currentIteration={currentIteration}>
              <div className={styles.minimalRelRow}>
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
            </CommentableRow>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * 2. RBAC Renderer (sad_auth_rbac)
 */
const RbacRenderer: React.FC<{ data: any, nodeId?: string, currentIteration?: any }> = ({ data, nodeId, currentIteration }) => {
  const authData = data.authentication_strategy || data;
  const authMethod = authData.auth_method;
  const tokenStrategy = authData.token_strategy;
  const authPath = data.authentication_strategy ? '$.authentication_strategy.auth_method' : '$.auth_method';
  const tokenPath = data.authentication_strategy ? '$.authentication_strategy.token_strategy' : '$.token_strategy';

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Authentication Strategy */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Key className={styles.icon} size={20} />
          1. Authentication Strategy
        </h2>
        <div className={styles.epicList}>
          {authMethod && (
            <CommentableRow nodeId={nodeId || ''} jsonPath={authPath} currentIteration={currentIteration}>
              <article className={styles.epicItem}>
                <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                  <Zap size={18} className="text-primary" />
                  <span className={styles.valueWrapper}>Auth Method</span>
                </h3>
                <div className={styles.epicBody}>
                  <p className={styles.epicDesc}>{authMethod}</p>
                </div>
              </article>
            </CommentableRow>
          )}
          {tokenStrategy && (
            <CommentableRow nodeId={nodeId || ''} jsonPath={tokenPath} currentIteration={currentIteration}>
              <article className={styles.epicItem}>
                <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                  <ShieldCheck size={18} className="text-primary" />
                  <span className={styles.valueWrapper}>Token Strategy</span>
                </h3>
                <div className={styles.epicBody}>
                  <p className={styles.epicDesc}>{tokenStrategy}</p>
                </div>
              </article>
            </CommentableRow>
          )}
        </div>
      </div>

      {/* 2. Role-Based Access Control */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Shield className={styles.icon} size={20} />
          2. Role-Based Access Control
        </h2>
        <div className={styles.epicList}>
          {(data.roles || []).map((r: any, i: number) => {
            const isAdmin = r.role_name?.toUpperCase().includes('ADMIN') || r.role_id?.toUpperCase().includes('ADMIN');
            return (
              <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={`$.roles[?(@.role_id=='${r.role_id || r.role_name}')]`} currentIteration={currentIteration}>
                <article className={styles.epicItem} style={{ width: '100%' }}>
                  <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                    {isAdmin ? <ShieldCheck size={18} className="text-primary" /> : <User size={18} className="opacity-40" />}
                    <span className={styles.valueWrapper}>{r.role_name}</span>
                  </h3>
                  <div className={styles.epicBody}>
                    <p className={styles.epicDesc}>{r.description}</p>
                    
                    {r.permissions && r.permissions.length > 0 && (
                      <div className={styles.criteriaSection}>
                        <h4 className={styles.criteriaTitle}>
                          <ListTodo size={14} />
                          Permissions
                        </h4>
                        <ul className={styles.criteriaList}>
                          {r.permissions.map((p: string, j: number) => (
                            <CommentableRow key={j} nodeId={nodeId || ''} jsonPath={`$.roles[?(@.role_id=='${r.role_id || r.role_name}')].permissions[${j}]`} currentIteration={currentIteration}>
                              <li className={styles.criteriaItem}>
                                <CheckCircle2 size={14} className={styles.checkIcon} />
                                <span className={styles.valueWrapper}>{p}</span>
                              </li>
                            </CommentableRow>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </article>
              </CommentableRow>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * 3. Tech Stack Renderer (sad_tech_stack)
 */
const TechStackRenderer: React.FC<{ data: any, nodeId?: string, currentIteration?: any }> = ({ data, nodeId, currentIteration }) => {
  const techItems = [
    { title: 'Frontend Stack', id: 'frontend', icon: <Monitor size={18} /> },
    { title: 'Backend Stack', id: 'backend', icon: <Server size={18} /> },
    { title: 'Data Infrastructure', id: 'database', icon: <Database size={18} /> },
    { title: 'Cloud & DevOps', id: 'infrastructure', icon: <Globe size={18} /> },
    { title: 'CI/CD Pipeline', id: 'ci_cd', icon: <RefreshCw size={18} /> },
    { title: 'Monitoring & Logs', id: 'monitoring', icon: <Eye size={18} /> },
  ];

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Tech Items */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Layers className={styles.icon} size={20} />
          Core Technology Stack
        </h2>
        <div className={styles.epicList}>
          <article className={styles.epicItem} style={{ width: '100%' }}>
            <div className={styles.epicBody}>
              <div className="flex flex-col gap-6">
                {techItems.map((item, idx) => {
                  const val = data[item.id];
                  if (!val) return null;

                  return (
                    <CommentableRow key={idx} nodeId={nodeId || ''} jsonPath={`$.${item.id}`} currentIteration={currentIteration}>
                      <div style={{ width: '100%' }}>
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
                          {typeof val === 'object' ? (
                            Object.entries(val).map(([k, v]: [string, any], kIdx) => (
                              <div key={kIdx} className={styles.kvRow}>
                                <Zap size={12} style={{ opacity: 0.3, flexShrink: 0, marginTop: '2px' }} />
                                <span style={{ fontSize: '13px', opacity: 0.8, minWidth: '160px' }}>
                                  {k.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}:
                                </span>
                                <span className={`${styles.valueWrapper} text-primary`} style={{ fontSize: '13px', fontWeight: '700' }}>
                                  {String(v)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className={styles.kvRow}>
                              <Zap size={12} style={{ opacity: 0.3, flexShrink: 0, marginTop: '2px' }} />
                              <span className={`${styles.valueWrapper} text-primary`} style={{ fontSize: '14px', fontWeight: '700' }}>
                                {String(val)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CommentableRow>
                  );
                })}
              </div>
            </div>
          </article>
        </div>
      </div>

      {/* 2. Rationale */}
      {data.rationale && data.rationale.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Info className={styles.icon} size={20} />
            Rationale & Design Decisions
          </h2>
          <div className={styles.epicList}>
             <article className={styles.epicItem}>
               <div className={styles.epicBody}>
                 <ul className={styles.criteriaList}>
                   {data.rationale.map((r: string, i: number) => (
                     <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={`$.rationale[${i}]`} currentIteration={currentIteration}>
                       <li className={styles.criteriaItem}>
                         <CheckCircle2 size={16} className={styles.checkIcon} />
                         <span className={styles.valueWrapper}>{r}</span>
                       </li>
                     </CommentableRow>
                   ))}
                 </ul>
               </div>
             </article>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 4. Interface & Error Renderer (sad_interface_error)
 */
const InterfaceRenderer: React.FC<{ data: any, nodeId?: string, currentIteration?: any }> = ({ data, nodeId, currentIteration }) => {
  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Interface Standards */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Globe className={styles.icon} size={20} />
          1. Interface Standards
        </h2>
        <div className={styles.epicList}>
          <article className={styles.epicItem}>
            <div className={styles.epicBody}>
              <div className="flex flex-col gap-6">
                <CommentableRow nodeId={nodeId || ''} jsonPath="$.api_versioning_strategy" currentIteration={currentIteration}>
                  <article className={styles.epicItem}>
                    <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                      <RefreshCw size={18} className="text-primary" />
                      <span className={styles.valueWrapper}>API Versioning</span>
                    </h3>
                    <div className={styles.epicBody}>
                      <p className={styles.epicDesc}>{data.api_versioning_strategy}</p>
                    </div>
                  </article>
                </CommentableRow>
                <CommentableRow nodeId={nodeId || ''} jsonPath="$.response_format" currentIteration={currentIteration}>
                  <article className={styles.epicItem}>
                    <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                      <Terminal size={18} className="text-primary" />
                      <span className={styles.valueWrapper}>Response Format</span>
                    </h3>
                    <div className={styles.epicBody}>
                      <p className={styles.epicDesc}>{data.response_format}</p>
                    </div>
                  </article>
                </CommentableRow>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* 2. Error Definition Map */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Shield className={styles.icon} size={20} />
          2. Error Definition Map
        </h2>
        <div className={styles.epicList}>
          {(data.error_codes || []).map((err: any, i: number) => (
            <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={`$.error_codes[?(@.code=="${err.code}")]`} currentIteration={currentIteration}>
              <article className={styles.epicItem} style={{ width: '100%' }}>
                <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                  <code className="text-primary opacity-70 font-mono text-[11px] bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">{err.code}</code>
                  <span className={`${styles.badge} ${styles['badge--primary']} ml-2`}>
                    {err.http_status}
                  </span>
                  <span className={`${styles.valueWrapper} ml-1`}>{err.message}</span>
                </h3>
                <div className={styles.epicBody}>
                  <p className={styles.epicDesc}>{err.description}</p>
                </div>
              </article>
            </CommentableRow>
          ))}
        </div>
      </section>
    </div>
  );
};

/**
 * 5. Module List Renderer (sad_module_list)
 */
const ModuleListRenderer: React.FC<{ data: any, nodeId?: string, currentIteration?: any }> = ({ data, nodeId, currentIteration }) => {
  const modules = data.modules || [];
  return (
    <div className={styles.epicActorContainer}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Layers className={styles.icon} size={20} />
          1. System Module Architecture
        </h2>
        
        <div className={styles.epicList}>
          {modules.map((mod: any, i: number) => (
            <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={`$.modules[?(@.module_id=="${mod.module_id}")]`} currentIteration={currentIteration}>
              <article className={styles.epicItem} style={{ width: '100%' }}>
              <h3 className={styles.epicHeader}>
                <span className={styles.epicId}>[{mod.module_id}]</span>
                <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>
                  {mod.module_name}
                </span>
              </h3>
              
              <div className={styles.epicBody}>
                <p className={`${styles.epicDesc} ${styles.valueWrapper}`}>
                  {mod.core_responsibility}
                </p>
                
                {mod.technologies && mod.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {mod.technologies.map((tech: string, j: number) => (
                      <span key={j} className={`${styles.badge} ${styles['badge--primary']} text-[10px]`}>
                        {tech}
                      </span>
                    ))}
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

/**
 * 6. Non-Technical Renderer (sad_non_tech)
 */
const NonTechRenderer: React.FC<{ data: any, nodeId?: string, currentIteration?: any }> = ({ data, nodeId, currentIteration }) => {
  const sections = [
    { label: 'Legal Constraints', items: data.legal_constraints, icon: Shield, path: '$.legal_constraints' },
    { label: 'Compliance', items: data.compliance_requirements, icon: ShieldCheck, path: '$.compliance_requirements' },
    { label: 'Performance Targets', items: data.performance_targets, icon: Zap, path: '$.performance_targets' },
    { label: 'Scalability', items: data.scalability_requirements, icon: TrendingUp, path: '$.scalability_requirements' },
    { label: 'Budget', items: data.budget_constraints, icon: Briefcase, path: '$.budget_constraints' },
  ].filter(s => s.items && s.items.length > 0);

  return (
    <div className={styles.epicActorContainer}>
      {sections.map((s, i) => {
        const Icon = s.icon;
        return (
          <div key={i} className={styles.section}>
            <CommentableRow nodeId={nodeId || ''} jsonPath={s.path} currentIteration={currentIteration}>
              <h2 className={styles.sectionTitle}>
              <Icon size={20} className={styles.icon} />
              {i + 1}. {s.label}
            </h2>
            <div className={styles.epicList}>
               <article className={styles.epicItem}>
                 <div className={styles.epicBody}>
                   <ul className={styles.criteriaList}>
                     {s.items.map((item: string, j: number) => (
                       <li key={j} className={styles.criteriaItem}>
                         <CheckCircle2 size={16} className={styles.checkIcon} />
                         <span className={styles.valueWrapper}>{item}</span>
                       </li>
                     ))}
                   </ul>
                 </div>
               </article>
            </div>
            </CommentableRow>
          </div>
        );
      })}
    </div>
  );
};

/**
 * 7. Epic Mapping Renderer (sad_epic_mapping)
 */
const EpicMappingRenderer: React.FC<{ data: any, nodeId?: string, currentIteration?: any }> = ({ data, nodeId, currentIteration }) => {
  return (
    <div className={styles.epicActorContainer}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <GitBranch className={styles.icon} size={20} />
          1. Epic to Module Mapping Architecture
        </h2>
        <div className={styles.epicList} style={{ gap: '2px' }}>
          {(data.mappings || []).map((m: any, i: number) => (
            <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={`$.mappings[?(@.epic_id=="${m.epic_id}")]`} currentIteration={currentIteration}>
            <div key={i} className={styles.minimalRelRow}>
              <div className={styles.relNames} style={{ minWidth: '380px' }}>
                <span className={styles.epicId}>[{m.epic_id}]</span>
                <span className={styles.textPrimary} style={{ fontWeight: 700 }}>{m.epic_name}</span>
                <ChevronRight size={14} className={styles.opacity40} />
              </div>
              <div className={styles.relMeta}>
                <div className="flex flex-wrap gap-3">
                  {m.mapped_modules?.map((mod: string, j: number) => (
                    <span key={j} style={{ 
                      fontSize: '13px',
                      color: 'var(--primary)',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      opacity: 0.8
                    }}>
                      {mod}
                      {j < m.mapped_modules.length - 1 && <span style={{ marginLeft: '4px', opacity: 0.3 }}>,</span>}
                    </span>
                  ))}
                </div>
              </div>
              </div>
            </CommentableRow>
          ))}
        </div>
      </section>
    </div>
  );
};

/**
 * 8. Module Dependencies Renderer (sad_module_deps)
 */
const ModuleDepsRenderer: React.FC<{ data: any, nodeId?: string, currentIteration?: any }> = ({ data, nodeId, currentIteration }) => {
  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Dependency Chain */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <GitBranch className={styles.icon} size={20} />
          1. System Dependency Chain
        </h2>
        <div className={styles.epicList}>
          {(data.dependencies || []).map((dep: any, i: number) => (
            <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={`$.dependencies[?(@.from_module=="${dep.from_module}" && @.to_module=="${dep.to_module}")]`} currentIteration={currentIteration}>
            <article key={i} className={styles.epicItem}>
              <h3 className={styles.criteriaTitle} style={{ 
                fontSize: '15px', 
                display: 'flex', 
                flexDirection: 'row', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                width: '100%'
              }}>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px' }}>
                  <code className="text-primary opacity-70 font-mono text-[11px] bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20" style={{ whiteSpace: 'nowrap' }}>
                    {dep.from_module}
                  </code>
                  <ChevronRight size={14} className="opacity-40" style={{ flexShrink: 0 }} />
                  <span className={styles.valueWrapper} style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {dep.to_module}
                  </span>
                </div>
                <span className={`${styles.badge} ${styles['badge--primary']}`} style={{ flexShrink: 0, marginLeft: '12px' }}>
                  {dep.dependency_type}
                </span>
              </h3>
              <div className={styles.epicBody}>
                <p className={styles.epicDesc}>{dep.description}</p>
              </div>
            </article>
            </CommentableRow>
          ))}
        </div>
      </section>

      {/* 2. Build Order */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Layers className={styles.icon} size={20} />
          2. Recommended Build Order
        </h2>
        <div className={styles.epicList}>
          <article className={styles.epicItem}>
            <div className={styles.epicBody}>
              <ul className={styles.criteriaList}>
                {(data.recommended_build_order || []).map((mod: string, i: number) => (
                  <li key={i} className={styles.criteriaItem}>
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold border border-primary/20 mr-1 flex-shrink-0">
                      {i + 1}
                    </div>
                    <span className={styles.valueWrapper} style={{ fontWeight: 600 }}>{mod}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
};

/**
 * 9. API Spec Renderer (API_Spec)
 */
const ApiSpecRenderer: React.FC<{ data: any, nodeId?: string, currentIteration?: any }> = ({ data, nodeId, currentIteration }) => {
  const endpoints = data.endpoints || [];

  const parseSafe = (val: any) => {
    if (typeof val !== 'string') return val;
    try {
      return JSON.parse(val);
    } catch (e) {
      return val;
    }
  };

  return (
    <div className={styles.epicActorContainer}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Globe className={styles.icon} size={20} />
          1. API Endpoints Specification
        </h2>
        <div className={styles.epicList}>
          {endpoints.length === 0 && <div className={styles.emptyState}>No endpoints defined</div>}
          {endpoints.map((ep: any, i: number) => {
            const method = (ep.method || 'GET').toLowerCase();
            const reqBody = parseSafe(ep.request_body);
            const hasReqBody = reqBody && (typeof reqBody === 'object' ? Object.keys(reqBody).length > 0 : String(reqBody).length > 0);

            return (
              <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={`$.endpoints[?(@.path=="${ep.path}" && @.method=="${ep.method}")]`} currentIteration={currentIteration}>
                <article className={styles.epicItem} style={{ width: '100%' }}>
                <h3 className={styles.epicHeader}>
                  <span className={`${styles.methodBadge} ${styles['methodBadge--' + method]}`}>
                    {ep.method || 'GET'}
                  </span>
                  <span className={styles.path}>{ep.path || '/'}</span>
                </h3>
                <div className={styles.epicBody}>
                  {(ep.summary || ep.description) && (
                    <p className={styles.epicDesc}>
                      {ep.summary && <strong className="block mb-1 text-primary/80">{ep.summary}</strong>}
                      {ep.description}
                    </p>
                  )}
                  
                  {hasReqBody && (
                    <div className={styles.criteriaSection}>
                      <h4 className={styles.criteriaTitle}>
                        <Terminal size={14} /> Request Body
                      </h4>
                      <div className={styles.codeBlock}>
                        <pre>{typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody, null, 2)}</pre>
                      </div>
                    </div>
                  )}

                  {ep.responses && ep.responses.length > 0 && (
                    <div className={styles.criteriaSection}>
                      <h4 className={styles.criteriaTitle}>
                        <RefreshCw size={14} /> Responses
                      </h4>
                      <div className="flex flex-col gap-3">
                        {ep.responses.map((res: any, j: number) => {
                          const status = parseInt(res.status_code || '200');
                          const isSuccess = status >= 200 && status < 300;
                          const isError = status >= 400;
                          const statusClass = isSuccess ? 'success' : isError ? 'error' : 'info';
                          const resSchema = parseSafe(res.schema);
                          const hasResSchema = resSchema && (typeof resSchema === 'object' ? Object.keys(resSchema).length > 0 : String(resSchema).length > 0);

                          return (
                            <CommentableRow key={j} nodeId={nodeId || ''} jsonPath={`$.endpoints[?(@.path=="${ep.path}" && @.method=="${ep.method}")].responses[?(@.status_code=="${res.status_code}")]`} currentIteration={currentIteration}>
                              <div className={styles.responseRow} style={{ width: '100%' }}>
                                <div className="flex items-center gap-3">
                                  <span className={`${styles.statusBadge} ${styles['statusBadge--' + statusClass]}`}>
                                    {res.status_code}
                                  </span>
                                  <span className="text-xs font-semibold opacity-80">{res.description}</span>
                                </div>
                                {hasResSchema && (
                                  <div className={styles.codeBlock} style={{ marginTop: '8px' }}>
                                    <pre>{typeof resSchema === 'string' ? resSchema : JSON.stringify(resSchema, null, 2)}</pre>
                                  </div>
                                )}
                              </div>
                            </CommentableRow>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                </article>
              </CommentableRow>
            );
          })}
        </div>
      </section>
    </div>
  );
};

/**
 * 10. Information Architecture Renderer (IA)
 */
const IaRenderer: React.FC<{ data: any, nodeId?: string, currentIteration?: any }> = ({ data, nodeId, currentIteration }) => {
  const hierarchy = data.hierarchy || [];
  const screenElements = data.screen_elements || [];

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Screen Elements Specification (FSD Style Reference) */}
      {screenElements.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Monitor className={styles.icon} size={20} />
            1. Screen Elements Specification
          </div>
          <div className={styles.epicList}>
            {screenElements.map((screen: any, i: number) => (
              <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={`$.screen_elements[${i}]`} currentIteration={currentIteration}>
                <article className={styles.epicItem} style={{ width: '100%' }}>
                  <h3 className={styles.epicHeader}>
                    <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>
                      <span className={styles.textPrimary} style={{ marginRight: '8px' }}>{screen.screen_id}</span>
                      {screen.screen_name && screen.screen_name !== 'Screen details' ? screen.screen_name : ''}
                    </span>
                  </h3>
                  
                  <div className={styles.epicBody}>
                    {(screen.description || screen.desc) && (
                      <p className={`${styles.epicDesc} ${styles.valueWrapper}`}>
                        {screen.description || screen.desc}
                      </p>
                    )}

                    <div className={styles.criteriaSection}>
                      <div className={styles.criteriaTitle}>
                        <Component size={14} className={styles.icon} />
                        UI Components & Elements
                      </div>
                      <ul className={styles.criteriaList}>
                        {screen.elements?.map((el: any, j: number) => {
                          const elType = el.type || el.element_type || el.component_type || 'Element';
                          const elLabel = el.label || el.name || el.element_label || 'Unnamed Element';
                          return (
                            <CommentableRow 
                              key={j} 
                              nodeId={nodeId || ''} 
                              jsonPath={`$.screen_elements[${i}].elements[${j}]`}
                              currentIteration={currentIteration}
                            >
                              <li className={styles.criteriaItem}>
                                <CheckCircle2 size={14} className={styles.checkIcon} />
                                <div className="flex-1">
                                  <div className={styles.elementHeader}>
                                    {el.element_id && <span className={styles.reqBadge}>{el.element_id}</span>}
                                    <span className={`${styles.typeBadge} ${styles[elType.toLowerCase()] || ''}`}>
                                      {elType}
                                    </span>
                                    <span className={styles.elementLabel}>{elLabel}</span>
                                    {el.mapped_func_id && (
                                      <code className="opacity-40 text-[10px] font-mono bg-white/5 px-1 rounded ml-auto">#{el.mapped_func_id}</code>
                                    )}
                                  </div>
                                  {(el.description || el.desc) && (
                                    <p className={styles.elementDesc}>{el.description || el.desc}</p>
                                  )}
                                </div>
                              </li>
                            </CommentableRow>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </article>
              </CommentableRow>
            ))}
          </div>
        </div>
      )}

      {/* 2. Information Architecture Hierarchy (Epic Mapping Style Reference) */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <LayoutGrid className={styles.icon} size={20} />
          2. Information Architecture Hierarchy
        </div>
        <div className={styles.epicList} style={{ gap: '2px' }}>
          {hierarchy.length === 0 && <div className={styles.emptyState}>No hierarchy defined</div>}
          {hierarchy.map((item: any, i: number) => {
            const depth = item.depth || 1;
            return (
                <CommentableRow key={i} nodeId={nodeId || ''} jsonPath={`$.hierarchy[?(@.screen_id=="${item.screen_id}")]`} currentIteration={currentIteration}>
                <div 
                  className={styles.minimalRelRow}
                  style={{ 
                    marginLeft: `${(depth - 1) * 32}px`,
                    borderLeft: depth > 1 ? '1px solid rgba(16, 185, 129, 0.15)' : 'none',
                    paddingLeft: depth > 1 ? '16px' : '8px',
                    width: '100%'
                  }}
                >
                <div className={styles.relNames} style={{ minWidth: '380px' }}>
                  <span className={styles.epicId}>{item.screen_id}</span>
                  <span className={styles.textPrimary} style={{ fontWeight: 700 }}>{item.title}</span>
                  <ChevronRight size={14} className={styles.opacity40} />
                </div>
                <div className={styles.relMeta}>
                  <div className="flex items-center gap-4">
                    {item.actor && (
                      <span className={styles.badge} style={{ fontSize: '11px', fontWeight: 600 }}>
                        {item.actor}
                      </span>
                    )}
                    {item.path && (
                      <span style={{ 
                        fontSize: '13px', 
                        fontFamily: 'monospace', 
                        color: 'var(--primary)', 
                        opacity: 0.6,
                        fontWeight: 500
                      }}>
                        {item.path}
                      </span>
                    )}
                  </div>
                </div>
                </div>
                </CommentableRow>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * 11. Fallback Renderer (JSON)
 */

const FallbackRenderer: React.FC<{ data: any }> = ({ data }) => {
  return (
    <div className="bg-black p-4 rounded-lg border border-border">
      <pre className="text-[12px] text-primary opacity-80 overflow-auto max-h-[400px] custom-scrollbar">
        {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

const normalizeType = (type: string): string => {
  return type
    .toLowerCase()
    .trim()
    .replace(/^sad_/, '')
    .replace(/^modules\./, '')
    .replace(/[ &._]+/g, '_')
    .replace(/_+$/, '');
};

const RENDERER_MAP: Record<string, React.FC<{ data: any, nodeId?: string, currentIteration?: any }>> = {
  'core_erd': ErdRenderer,
  'erd': ErdRenderer,
  'auth_rbac': RbacRenderer,
  'tech_stack': TechStackRenderer,
  'interface_error': InterfaceRenderer,
  'non_tech': NonTechRenderer,
  'module_list': ModuleListRenderer,
  'epic_mapping': EpicMappingRenderer,
  'module_deps': ModuleDepsRenderer,
  'api_spec': ApiSpecRenderer,
  'ia': IaRenderer,
  'wireframe': WireframeRenderer,
  'tc': TcRenderer,
};

const SadSpecRenderer: React.FC<SadSpecRendererProps> = ({ type, data, isRaw, nodeId, currentIteration }) => {
  if (!data) return <div className="p-8 text-center opacity-40 italic">No data available</div>;

  let parsedData = data;
  if (typeof data === 'string') {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      return <FallbackRenderer data={data} />;
    }
  }

  if (isRaw) return <FallbackRenderer data={parsedData} />;

  const normalizedType = normalizeType(type);
  const Renderer = RENDERER_MAP[normalizedType];

  if (Renderer) {
    return <Renderer data={parsedData} nodeId={nodeId} currentIteration={currentIteration} />;
  }

  return <FallbackRenderer data={parsedData} />;
};

export default SadSpecRenderer;
