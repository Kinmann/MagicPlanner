import React from 'react';
import { 
  Database, Terminal, Layers, 
  Layout, Info, 
  ChevronRight, Box,
  GitBranch, Eye, 
  RefreshCw, Check,
  Shield, ShieldCheck, Zap, TrendingUp, Briefcase, CheckCircle2,
  Monitor, Server, Globe, Cpu, Key, User, ListTodo,
  Package, Code2, FolderOpen
} from 'lucide-react';
import styles from './SadSpecRenderer.module.scss';

interface SadSpecRendererProps {
  type: string;
  data: any;
  isRaw?: boolean;
}

/**
 * 1. ERD Renderer (sad_core_erd)
 */
const ErdRenderer: React.FC<{ data: any }> = ({ data }) => {
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

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Core Entities / Tables */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Database className={styles.icon} size={20} />
          1. {isModuleErd ? 'Database Tables' : 'Core Entities'}
        </h2>
        <div className={styles.epicList}>
          {entities.map((ent: any, i: number) => (
            <article key={i} className={styles.epicItem}>
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
                        <div key={j} className={styles.attribute}>
                          <span className={styles.name}>{attr.name}</span>
                          <span className={styles.type}>({attr.data_type})</span>
                          {attr.is_primary_key && <span className={styles.badge}>PK</span>}
                          {!attr.is_primary_key && attr.is_nullable && <span className={`${styles.opacity40} ${styles.textXs}`}>NULL</span>}
                          {!attr.is_primary_key && !attr.is_nullable && <span className={`${styles.opacity40} ${styles.textXs}`}>NOT NULL</span>}
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

/**
 * 2. RBAC Renderer (sad_auth_rbac)
 */
const RbacRenderer: React.FC<{ data: any }> = ({ data }) => {
  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Authentication Strategy */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Key className={styles.icon} size={20} />
          1. Authentication Strategy
        </h2>
        <div className={styles.epicList}>
          <article className={styles.epicItem}>
            <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
              <Zap size={18} className="text-primary" />
              <span className={styles.valueWrapper}>Auth Method</span>
            </h3>
            <div className={styles.epicBody}>
              <p className={styles.epicDesc}>{data.auth_method}</p>
            </div>
          </article>
          <article className={styles.epicItem}>
            <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
              <ShieldCheck size={18} className="text-primary" />
              <span className={styles.valueWrapper}>Token Strategy</span>
            </h3>
            <div className={styles.epicBody}>
              <p className={styles.epicDesc}>{data.token_strategy}</p>
            </div>
          </article>
        </div>
      </section>

      {/* 2. Role-Based Access Control */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Shield className={styles.icon} size={20} />
          2. Role-Based Access Control
        </h2>
        <div className={styles.epicList}>
          {(data.roles || []).map((r: any, i: number) => {
            const isAdmin = r.role_name?.toUpperCase().includes('ADMIN') || r.role_id?.toUpperCase().includes('ADMIN');
            return (
              <article key={i} className={styles.epicItem}>
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
                          <li key={j} className={styles.criteriaItem}>
                            <CheckCircle2 size={14} className={styles.checkIcon} />
                            <span className={styles.valueWrapper}>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};

/**
 * 3. Tech Stack Renderer (sad_tech_stack)
 */
const TechStackRenderer: React.FC<{ data: any }> = ({ data }) => {
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
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Layers className={styles.icon} size={20} />
          Core Technology Stack
        </h2>
        <div className={styles.epicList}>
          <article className={styles.epicItem}>
            <div className={styles.epicBody}>
              <div className="flex flex-col gap-6">
                {techItems.map((item, idx) => {
                  const val = data[item.id];
                  if (!val) return null;

                  return (
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
                              {val}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* 2. Rationale */}
      {data.rationale && data.rationale.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Info className={styles.icon} size={20} />
            Rationale & Design Decisions
          </h2>
          <div className={styles.epicList}>
             <article className={styles.epicItem}>
               <div className={styles.epicBody}>
                 <ul className={styles.criteriaList}>
                   {data.rationale.map((r: string, i: number) => (
                     <li key={i} className={styles.criteriaItem}>
                       <CheckCircle2 size={16} className={styles.checkIcon} />
                       <span className={styles.valueWrapper}>{r}</span>
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

/**
 * 4. Interface & Error Renderer (sad_interface_error)
 */
const InterfaceRenderer: React.FC<{ data: any }> = ({ data }) => {
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
                <article className={styles.epicItem}>
                  <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                    <RefreshCw size={18} className="text-primary" />
                    <span className={styles.valueWrapper}>API Versioning</span>
                  </h3>
                  <div className={styles.epicBody}>
                    <p className={styles.epicDesc}>{data.api_versioning_strategy}</p>
                  </div>
                </article>
                <article className={styles.epicItem}>
                  <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                    <Terminal size={18} className="text-primary" />
                    <span className={styles.valueWrapper}>Response Format</span>
                  </h3>
                  <div className={styles.epicBody}>
                    <p className={styles.epicDesc}>{data.response_format}</p>
                  </div>
                </article>
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
            <article key={i} className={styles.epicItem}>
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
          ))}
        </div>
      </section>
    </div>
  );
};

/**
 * 5. Module List Renderer (sad_module_list)
 */
const ModuleListRenderer: React.FC<{ data: any }> = ({ data }) => {
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
            <article key={i} className={styles.epicItem}>
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
          ))}
        </div>
      </section>
    </div>
  );
};

/**
 * 6. Non-Technical Renderer (sad_non_tech)
 */
const NonTechRenderer: React.FC<{ data: any }> = ({ data }) => {
  const sections = [
    { label: 'Legal Constraints', items: data.legal_constraints, icon: Shield },
    { label: 'Compliance', items: data.compliance_requirements, icon: ShieldCheck },
    { label: 'Performance Targets', items: data.performance_targets, icon: Zap },
    { label: 'Scalability', items: data.scalability_requirements, icon: TrendingUp },
    { label: 'Budget', items: data.budget_constraints, icon: Briefcase },
  ].filter(s => s.items && s.items.length > 0);

  return (
    <div className={styles.epicActorContainer}>
      {sections.map((s, i) => {
        const Icon = s.icon;
        return (
          <section key={i} className={styles.section}>
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
          </section>
        );
      })}
    </div>
  );
};

/**
 * 7. Epic Mapping Renderer (sad_epic_mapping)
 */
const EpicMappingRenderer: React.FC<{ data: any }> = ({ data }) => {
  return (
    <div className={styles.epicActorContainer}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <GitBranch className={styles.icon} size={20} />
          1. Epic to Module Mapping Architecture
        </h2>
        <div className={styles.epicList} style={{ gap: '2px' }}>
          {(data.mappings || []).map((m: any, i: number) => (
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
          ))}
        </div>
      </section>
    </div>
  );
};

/**
 * 8. Module Dependencies Renderer (sad_module_deps)
 */
const ModuleDepsRenderer: React.FC<{ data: any }> = ({ data }) => {
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
 * 9. Fallback Renderer (JSON)
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

const SadSpecRenderer: React.FC<SadSpecRendererProps> = ({ type, data, isRaw }) => {
  if (!data) return <div className="p-8 text-center opacity-40 italic">No data available</div>;

  let workingData = data;
  if (typeof data === 'string') {
    try {
      workingData = JSON.parse(data);
    } catch (e) {
      return <FallbackRenderer data={data} />;
    }
  }

  if (isRaw) return <FallbackRenderer data={workingData} />;

  switch (type) {
    case 'sad_core_erd':
    case 'SAD_Core_ERD':
    case 'ERD':
      return <ErdRenderer data={workingData} />;
    case 'sad_auth_rbac':
    case 'SAD_Auth_RBAC':
      return <RbacRenderer data={workingData} />;
    case 'sad_tech_stack':
    case 'SAD_Tech_Stack':
      return <TechStackRenderer data={workingData} />;
    case 'sad_interface_error':
    case 'SAD_Interface_Error':
      return <InterfaceRenderer data={workingData} />;
    case 'sad_non_tech':
    case 'SAD_Non_Tech':
      return <NonTechRenderer data={workingData} />;
    case 'sad_module_list':
    case 'SAD_Module_List':
      return <ModuleListRenderer data={workingData} />;
    case 'sad_epic_mapping':
    case 'SAD_Epic_Mapping':
      return <EpicMappingRenderer data={workingData} />;
    case 'sad_module_deps':
    case 'SAD_Module_Deps':
      return <ModuleDepsRenderer data={workingData} />;
    case 'PRD':
      // PRD Renderer logic truncated for brevity but follow the same style pattern
      return <FallbackRenderer data={workingData} />;
    case 'API_Spec':
      return <FallbackRenderer data={workingData} />;
    default:
      return <FallbackRenderer data={workingData} />;
  }
};

export default SadSpecRenderer;
