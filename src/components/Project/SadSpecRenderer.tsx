import React from 'react';
import { 
  Database, Terminal, Layers, 
  Info, LayoutGrid, Component,
  ChevronRight,
  GitBranch, Eye, 
  RefreshCw, Check,
  Shield, ShieldCheck, Zap, TrendingUp, Briefcase, CheckCircle2,
  Monitor, Server, Globe, Key, User, ListTodo, Code2, Cpu, Users
} from 'lucide-react';
import WireframeRenderer from './Renderer/modules/WireframeRenderer';
import TcRenderer from './Renderer/modules/TcRenderer';
import { CommentableRow } from '../ui/CommentableRow';
import styles from './SadSpecRenderer.module.scss';

interface SadSpecRendererProps {
  type: string;
  data: any;
  baseData?: any;
  isRaw?: boolean;
  nodeId?: string;
  currentIteration?: any;
}

/**
 * 1. ERD Renderer (sad_core_erd)
 */
const ErdRenderer: React.FC<{ data: any, baseData?: any, nodeId?: string, currentIteration?: any }> = ({ data, baseData, nodeId, currentIteration }) => {
  const isModuleErd = !!data.tables;
  const entities = isModuleErd 
    ? (data.tables || []).map((t: any) => ({
        entity_name: t.table_name,
        table_id: t.table_id,
        mapped_func_ids: t.mapped_func_ids || [],
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

  const renderEntity = (ent: any, isStale = false, isRefined = false) => (
    <CommentableRow 
      key={`${ent.entity_name}-${isStale ? 'stale' : 'refined'}`} 
      nodeId={nodeId || ''} 
      jsonPath={getEntityPath(ent.entity_name)} 
      currentIteration={currentIteration} 
      blockId={ent.table_id}
      isStale={isStale}
      isRefined={isRefined}
    >
      <article className={styles.epicItem} style={{ width: '100%' }}>
        <h3 className={styles.epicHeader}>
          {ent.table_id && <span className={styles.idBadge}>{ent.table_id}</span>}
          <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>{ent.entity_name}</span>
          {ent.mapped_epic_ids && ent.mapped_epic_ids.length > 0 && (
            <div className="flex flex-wrap gap-2 ml-auto">
              {ent.mapped_epic_ids.map((eid: string) => (
                <span key={eid} className={styles.mappingBadge}>{eid}</span>
              ))}
            </div>
          )}
        </h3>
        <div className={styles.epicBody}>
          <p className={styles.epicDesc}>{ent.description}</p>
          
          <div className="flex flex-wrap gap-2 mt-1 mb-2">
            {ent.mapped_func_ids && ent.mapped_func_ids.length > 0 && ent.mapped_func_ids.map((fid: string) => (
              <span key={fid} className={styles.mappingBadge}>{fid}</span>
            ))}
          </div>
          
          {ent.attributes && ent.attributes.length > 0 && (
            <div className={styles.criteriaSection}>
              <h4 className={styles.criteriaTitle}>
                <ListTodo size={14} />
                {isModuleErd ? 'Columns' : 'Attributes'}
              </h4>
              <ul className={styles.criteriaList}>
                {ent.attributes.map((attr: any, j: number) => (
                  <CommentableRow 
                    key={j} 
                    nodeId={nodeId || ''} 
                    jsonPath={getAttributePath(ent.entity_name, attr.name)} 
                    currentIteration={currentIteration}
                    isStale={isStale}
                    isRefined={isRefined}
                  >
                    <li className={styles.criteriaItem}>
                      <CheckCircle2 size={16} className={styles.checkIcon} />
                      <div className={styles.valueWrapper}>
                        <span style={{ fontWeight: 700 }}>{attr.name}</span>
                        <span style={{ opacity: 0.9, marginLeft: '8px', fontSize: '11px', fontFamily: 'monospace' }} className="text-primary">{attr.data_type}</span>
                        {attr.description && (
                          <span style={{ opacity: 0.85, marginLeft: '12px', fontSize: '13px' }}>- {attr.description}</span>
                        )}
                      </div>
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

  const baseEntities = baseData ? (isModuleErd 
    ? (baseData.tables || []).map((t: any) => ({
        entity_name: t.table_name,
        table_id: t.table_id,
        mapped_func_ids: t.mapped_func_ids || [],
        description: t.description || '',
        attributes: (t.columns || []).map((c: any) => ({
          name: c.name,
          data_type: c.data_type,
          is_primary_key: c.is_pk,
          is_nullable: c.is_nullable,
          description: c.description
        }))
      }))
    : (baseData.entities || [])) : [];

  const baseRelations = (baseData?.relationships || []).map((rel: any) => ({
    from_entity: rel.from_entity || rel.source_table,
    to_entity: rel.to_entity || rel.target_table,
    relationship_type: rel.relationship_type || rel.rel_type,
    description: rel.description
  }));

  const renderRelation = (rel: any, i: number, isStale = false, isRefined = false) => (
    <CommentableRow key={`${rel.rel_id || i}-${isStale ? 'stale' : 'refined'}`} nodeId={nodeId || ''} jsonPath={`$.relationships[${i}]`} currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
      <div className={styles.minimalRelRow}>
        <div className={styles.relNames}>
          {rel.rel_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{rel.rel_id}</span>}
          <span className={styles.textPrimary}>{rel.from_entity || rel.source_table}</span>
          <ChevronRight size={14} className={styles.opacity40} />
          <span className={styles.textSecondary}>{rel.to_entity || rel.target_table}</span>
        </div>
        <div className={styles.relMeta}>
          <span className={styles.relBadge}>{rel.relationship_type || rel.rel_type}</span>
          {rel.mapped_epic_id && <span className={styles.mappingBadge}>{rel.mapped_epic_id}</span>}
          <span className={styles.relDescription}>{rel.description}</span>
        </div>
      </div>
    </CommentableRow>
  );

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Core Entities / Tables */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Database className={styles.icon} size={20} />
          1. {isModuleErd ? 'Database Tables' : 'Core Entities'}
        </h2>
        <div className={styles.epicList}>
          {entities.map((ent: any) => {
            const baseEnt = baseEntities.find((be: any) => 
              (ent.table_id && be.table_id === ent.table_id) || 
              (ent.entity_name === be.entity_name)
            );
            const hasChanged = baseEnt && JSON.stringify(baseEnt) !== JSON.stringify(ent);
            
            return (
              <React.Fragment key={ent.table_id || ent.entity_name}>
                {hasChanged && renderEntity(baseEnt, true, false)}
                {renderEntity(ent, false, !!baseEnt && hasChanged)}
              </React.Fragment>
            );
          })}
          {/* Orphaned base entities */}
          {baseEntities
            .filter((be: any) => !entities.find((e: any) => 
              (e.table_id && be.table_id === e.table_id) || 
              (e.entity_name === be.entity_name)
            ))
            .map((ent: any) => renderEntity(ent, true, false))
          }
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <GitBranch className={styles.icon} size={20} />
          2. Relationship Architecture
        </h2>
        <div className={styles.epicList} style={{ gap: '2px' }}>
          {relations.map((rel: any, i: number) => {
            const baseRel = baseRelations.find((br: any) => 
              br.from_entity === rel.from_entity && 
              br.to_entity === rel.to_entity && 
              br.relationship_type === rel.relationship_type
            );
            const hasChanged = baseRel && JSON.stringify(baseRel) !== JSON.stringify(rel);

            return (
              <React.Fragment key={i}>
                {hasChanged && renderRelation(baseRel, i, true, false)}
                {renderRelation(rel, i, false, !!baseRel && hasChanged)}
              </React.Fragment>
            );
          })}
          {/* Orphaned base relations */}
          {baseRelations
            .filter((br: any) => !relations.find((r: any) => 
              br.from_entity === r.from_entity && 
              br.to_entity === r.to_entity && 
              br.relationship_type === r.relationship_type
            ))
            .map((rel: any, i: number) => renderRelation(rel, i + relations.length, true, false))
          }
        </div>
      </div>
    </div>
  );
};

/**
 * 2. RBAC Renderer (sad_auth_rbac)
 */
const RbacRenderer: React.FC<{ data: any, baseData?: any, nodeId?: string, currentIteration?: any }> = ({ data, baseData, nodeId, currentIteration }) => {
  const authData = data.authentication_strategy || data;
  const baseAuthData = baseData ? (baseData.authentication_strategy || baseData) : null;
  
  const authMethod = authData.auth_method;
  const tokenStrategy = authData.token_strategy;
  
  const authPath = data.authentication_strategy ? '$.authentication_strategy.auth_method' : '$.auth_method';
  const tokenPath = data.authentication_strategy ? '$.authentication_strategy.token_strategy' : '$.token_strategy';

  const hasAuthChanged = baseAuthData && (
    baseAuthData.auth_method !== authMethod || 
    baseAuthData.token_strategy !== tokenStrategy
  );

  const renderAuthBlock = (label: string, value: string, path: string, icon: React.ReactNode, isStale = false, isRefined = false) => (
    <CommentableRow 
      nodeId={nodeId || ''} 
      jsonPath={path} 
      currentIteration={currentIteration}
      isStale={isStale}
      isRefined={isRefined}
    >
      <article className={styles.epicItem}>
        <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
          {icon}
          <span className={styles.valueWrapper}>{label}</span>
        </h3>
        <div className={styles.epicBody}>
          <p className={styles.epicDesc}>{value}</p>
        </div>
      </article>
    </CommentableRow>
  );

  const renderRole = (r: any, idx: number, isStale = false, isRefined = false) => {
    const isAdmin = r.role_name?.toUpperCase().includes('ADMIN') || r.role_id?.toUpperCase().includes('ADMIN');
    return (
      <CommentableRow 
        key={`${r.role_id || r.role_name}-${isStale ? 'stale' : 'refined'}-${idx}`} 
        nodeId={nodeId || ''} 
        jsonPath={`$.roles[?(@.role_id=='${r.role_id || r.role_name}')]`} 
        currentIteration={currentIteration} 
        blockId={r.role_id}
        isStale={isStale}
        isRefined={isRefined}
      >
        <article className={styles.epicItem} style={{ width: '100%' }}>
          <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
            {r.role_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{r.role_id}</span>}
            <span className={styles.valueWrapper}>{r.role_name}</span>
            {r.mapped_role_id && (
              <span className={styles.mappingBadge} style={{ marginLeft: '8px' }}>{r.mapped_role_id}</span>
            )}
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
                    <CommentableRow 
                      key={j} 
                      nodeId={nodeId || ''} 
                      jsonPath={`$.roles[?(@.role_id=='${r.role_id || r.role_name}')].permissions[${j}]`} 
                      currentIteration={currentIteration}
                      isStale={isStale}
                      isRefined={isRefined}
                    >
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
  };

  const roles = data.roles || [];
  const baseRoles = baseData?.roles || [];

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Authentication Strategy */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Key className={styles.icon} size={20} />
          1. Authentication Strategy
        </h2>
        <div className={styles.epicList}>
          {hasAuthChanged && authMethod && renderAuthBlock('Auth Method', baseAuthData.auth_method, authPath, <Zap size={18} className="text-primary" />, true, false)}
          {authMethod && renderAuthBlock('Auth Method', authMethod, authPath, <Zap size={18} className="text-primary" />, false, hasAuthChanged)}
          
          {hasAuthChanged && tokenStrategy && renderAuthBlock('Token Strategy', baseAuthData.token_strategy, tokenPath, <ShieldCheck size={18} className="text-primary" />, true, false)}
          {tokenStrategy && renderAuthBlock('Token Strategy', tokenStrategy, tokenPath, <ShieldCheck size={18} className="text-primary" />, false, hasAuthChanged)}
        </div>
      </div>

      {/* 2. Role-Based Access Control */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Shield className={styles.icon} size={20} />
          2. Role-Based Access Control
        </h2>
        <div className={styles.epicList}>
          {roles.map((r: any, i: number) => {
            const baseRole = baseRoles.find((br: any) => br.role_id === r.role_id);
            const hasChanged = baseRole && JSON.stringify(baseRole) !== JSON.stringify(r);

            return (
              <React.Fragment key={r.role_id || i}>
                {hasChanged && renderRole(baseRole, i, true, false)}
                {renderRole(r, i, false, !!baseRole && hasChanged)}
              </React.Fragment>
            );
          })}
          {/* Orphaned base roles */}
          {baseRoles
            .filter((br: any) => !roles.find((r: any) => r.role_id === br.role_id))
            .map((r: any, i: number) => renderRole(r, i + roles.length, true, false))
          }
        </div>
      </div>
      {/* 3. Access Policies */}
      {data.access_policies && data.access_policies.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <ShieldCheck className={styles.icon} size={20} />
            3. Global Access Policies
          </h2>
          <div className={styles.epicList}>
            {data.access_policies.map((p: any, i: number) => {
              const baseP = baseData?.access_policies?.find((bp: any) => bp.policy_id === p.policy_id);
              const hasChanged = baseP && JSON.stringify(baseP) !== JSON.stringify(p);
              return (
                <CommentableRow 
                  key={p.policy_id || i} 
                  nodeId={nodeId || ''} 
                  jsonPath={`$.access_policies[?(@.policy_id=='${p.policy_id}')]`} 
                  currentIteration={currentIteration} 
                  blockId={p.policy_id}
                  isRefined={!!baseP && hasChanged}
                >
                  <article className={styles.epicItem}>
                    <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                      <span className={styles.idBadge}>{p.policy_id}</span>
                      <span className={styles.valueWrapper} style={{ marginLeft: '8px' }}>{p.description}</span>
                      {p.mapped_epic_id && (
                        <span className={styles.mappingBadge} style={{ marginLeft: '8px' }}>{p.mapped_epic_id}</span>
                      )}
                    </h3>
                  </article>
                </CommentableRow>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 3. Tech Stack Renderer (sad_tech_stack)
 */
const TechStackRenderer: React.FC<{ data: any, baseData?: any, nodeId?: string, currentIteration?: any }> = ({ data, baseData, nodeId, currentIteration }) => {
  const tech = data.tech_stack || {};
  const baseTech = baseData?.tech_stack || {};

  const techItems = [
    { title: 'Frontend Stack', data: tech.frontend, icon: <Monitor size={18} />, key: 'frontend' },
    { title: 'Backend Stack', data: tech.backend, icon: <Server size={18} />, key: 'backend' },
    { title: 'Data Infrastructure', data: tech.database, icon: <Database size={18} />, key: 'database' },
    { title: 'Cloud & DevOps', data: tech.infrastructure, icon: <Globe size={18} />, key: 'infrastructure' },
    { title: 'AI Model Spec', data: tech.ai_model_spec, icon: <Cpu size={18} />, key: 'ai_model_spec' },
    { title: 'Interface & Auth', data: tech.interface_protocols, icon: <Key size={18} />, key: 'interface_protocols' },
  ];

  const rationale = data.rationale || [];
  const baseRationale = baseData?.rationale || [];

  return (
    <div className={styles.epicActorContainer}>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Code2 size={20} className={styles.icon} />
          Core Technology Architecture
        </h2>
        
        <div className={styles.epicList}>
          <article className={styles.epicItem}>
            <div className={styles.epicBody}>
              <div className={styles.flexColGap6}>
                  {techItems.map((item, idx) => {
                    const itemData = item.data || {};
                    const baseItemData = baseTech[item.key] || {};
                    const hasItemChanged = baseData && JSON.stringify(baseItemData) !== JSON.stringify(itemData);
                    
                    if (Object.keys(itemData).length === 0 && Object.keys(baseItemData).length === 0) return null;

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
                              {itemData.tech_id && <span className={styles.idBadge} style={{ marginLeft: '8px' }}>{itemData.tech_id}</span>}
                              {itemData.mapped_tech_id && (
                                <span className={styles.mappingBadge} style={{ marginLeft: '8px' }}>{itemData.mapped_tech_id}</span>
                              )}
                            </h4>
                            <div className={styles.epicDesc} style={{ 
                              marginTop: '0.4rem', 
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: '8px',
                              paddingLeft: '14px'
                            }}>
                              {Object.entries(itemData).map(([key, val]: [string, any], kIdx) => {
                                if (key === 'tech_id' || key === 'mapped_tech_id') return null;
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
      </div>

      {rationale.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Info className={styles.icon} size={20} />
            Rationale & Design Decisions
          </h2>
          <div className={styles.epicList}>
            {rationale.map((r: any, i: number) => {
              const baseR = baseRationale.find((br: any) => br.rationale_id === r.rationale_id);
              const hasChanged = baseR && JSON.stringify(baseR) !== JSON.stringify(r);
              return (
                <React.Fragment key={r.rationale_id || i}>
                  {hasChanged && (
                    <CommentableRow nodeId={nodeId || ''} jsonPath={`$.rationale[${i}]`} currentIteration={currentIteration} isStale={true}>
                      <li className={styles.criteriaItem}>
                        <CheckCircle2 size={16} className={styles.checkIcon} />
                        <span className={styles.idBadge}>{baseR.rationale_id}</span>
                        <span className={styles.valueWrapper}>{baseR.description}</span>
                      </li>
                    </CommentableRow>
                  )}
                  <CommentableRow nodeId={nodeId || ''} jsonPath={`$.rationale[${i}]`} currentIteration={currentIteration} isRefined={!!baseR && hasChanged}>
                    <li className={styles.criteriaItem}>
                      <CheckCircle2 size={16} className={styles.checkIcon} />
                      <span className={styles.idBadge}>{r.rationale_id}</span>
                      <span className={styles.valueWrapper}>{r.description}</span>
                    </li>
                  </CommentableRow>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 4. Interface & Error Renderer (sad_interface_error)
 */
const InterfaceRenderer: React.FC<{ data: any, baseData?: any, nodeId?: string, currentIteration?: any }> = ({ data, baseData, nodeId, currentIteration }) => {
  const renderStandardBlock = (label: string, value: string, path: string, icon: React.ReactNode, isStale = false, isRefined = false) => (
    <CommentableRow 
      nodeId={nodeId || ''} 
      jsonPath={path} 
      currentIteration={currentIteration}
      isStale={isStale}
      isRefined={isRefined}
    >
      <article className={styles.epicItem}>
        <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
          {icon}
          <span className={styles.valueWrapper}>{label}</span>
        </h3>
        <div className={styles.epicBody}>
          <p className={styles.epicDesc}>{value}</p>
        </div>
      </article>
    </CommentableRow>
  );

  const hasVersioningChanged = baseData && baseData.api_versioning_strategy !== data.api_versioning_strategy;
  const hasFormatChanged = baseData && baseData.response_format !== data.response_format;
  const hasErrorCodesChanged = baseData && JSON.stringify(baseData.error_codes) !== JSON.stringify(data.error_codes);

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Interface Standards */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Globe className={styles.icon} size={20} />
          1. Interface Standards
        </h2>
        <div className={styles.epicList}>
          <div className="flex flex-col gap-6 w-full">
            {hasVersioningChanged && baseData.api_versioning_strategy && renderStandardBlock('API Versioning', baseData.api_versioning_strategy, '$.api_versioning_strategy', <RefreshCw size={18} className="text-primary" />, true, false)}
            {data.api_versioning_strategy && renderStandardBlock('API Versioning', data.api_versioning_strategy, '$.api_versioning_strategy', <RefreshCw size={18} className="text-primary" />, false, hasVersioningChanged)}
            
            {hasFormatChanged && baseData.response_format && renderStandardBlock('Response Format', baseData.response_format, '$.response_format', <Terminal size={18} className="text-primary" />, true, false)}
            {data.response_format && renderStandardBlock('Response Format', data.response_format, '$.response_format', <Terminal size={18} className="text-primary" />, false, hasFormatChanged)}
          </div>
        </div>
      </section>

      {/* 2. Error Definition Map */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Shield className={styles.icon} size={20} />
          2. Error Definition Map
        </h2>
        <div className={styles.epicList}>
          {(data.error_codes || []).map((err: any, i: number) => {
            const baseErr = (baseData?.error_codes || []).find((be: any) => be.code === err.code);
            const hasChanged = baseErr && JSON.stringify(baseErr) !== JSON.stringify(err);

            const renderError = (e: any, isStale = false, isRefined = false) => (
              <CommentableRow nodeId={nodeId || ''} jsonPath={`$.error_codes[?(@.code=="${e.code}")]`} currentIteration={currentIteration} blockId={e.error_id || e.code} isStale={isStale} isRefined={isRefined}>
                <article className={styles.epicItem} style={{ width: '100%' }}>
                  <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                    {e.error_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{e.error_id}</span>}
                    <span className={styles.idBadge}>{e.code}</span>
                    {e.mapped_epic_id && (
                      <span className={styles.mappingBadge} style={{ marginLeft: '8px' }}>{e.mapped_epic_id}</span>
                    )}
                    <span className={`${styles.badge} ${styles['badge--primary']} ml-2`}>
                      {e.http_status}
                    </span>
                    <span className={`${styles.valueWrapper} ml-1`}>{e.message}</span>
                  </h3>
                  <div className={styles.epicBody}>
                    <p className={styles.epicDesc}>{e.description}</p>
                  </div>
                </article>
              </CommentableRow>
            );

            return (
              <React.Fragment key={err.code || i}>
                {hasChanged && renderError(baseErr, true, false)}
                {renderError(err, false, !!baseErr && hasChanged)}
              </React.Fragment>
            );
          })}
          {/* Orphaned base error codes */}
          {(baseData?.error_codes || [])
            .filter((be: any) => !(data.error_codes || []).find((e: any) => e.code === be.code))
            .map((err: any, i: number) => (
              <CommentableRow key={`stale-orphan-${i}`} nodeId={nodeId || ''} jsonPath={`$.error_codes[?(@.code=="${err.code}")]`} currentIteration={currentIteration} blockId={err.code} isStale={true}>
                <article className={styles.epicItem} style={{ width: '100%' }}>
                  <h3 className={styles.criteriaTitle} style={{ fontSize: '15px' }}>
                    <span className={styles.idBadge}>{err.code}</span>
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
            ))
          }
        </div>
      </section>
    </div>
  );
};


/**
 * 5. Module List Renderer (sad_module_list)
 */
const ModuleListRenderer: React.FC<{ data: any, baseData?: any, nodeId?: string, currentIteration?: any }> = ({ data, baseData, nodeId, currentIteration }) => {
  const modules = data.modules || [];
  const baseModules = baseData ? (baseData.modules || []) : [];

  const renderModule = (mod: any, idx: number, isStale = false, isRefined = false) => (
    <CommentableRow 
      key={`${mod.module_id}-${isStale ? 'stale' : 'refined'}-${idx}`} 
      nodeId={nodeId || ''} 
      jsonPath={`$.modules[?(@.module_id=="${mod.module_id}")]`} 
      currentIteration={currentIteration} 
      blockId={mod.module_id}
      isStale={isStale}
      isRefined={isRefined}
    >
      <article className={styles.epicItem} style={{ width: '100%' }}>
        <h3 className={styles.epicHeader}>
          <span className={styles.idBadge}>{mod.module_id}</span>
          <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>
            {mod.module_name}
          </span>
          {mod.mapped_epic_ids && mod.mapped_epic_ids.length > 0 && (
            <div className="flex flex-wrap gap-2 ml-auto">
              {mod.mapped_epic_ids.map((eid: string) => (
                <span key={eid} className={styles.mappingBadge}>{eid}</span>
              ))}
            </div>
          )}
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
  );

  const hasModulesChanged = baseData && JSON.stringify(baseModules) !== JSON.stringify(modules);
  return (
    <div className={styles.epicActorContainer}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Layers className={styles.icon} size={20} />
          1. System Module Architecture
        </h2>
        
        <div className={styles.epicList}>
          {modules.map((mod: any, i: number) => {
            const baseMod = baseModules.find((bm: any) => bm.module_id === mod.module_id);
            const hasChanged = baseMod && JSON.stringify(baseMod) !== JSON.stringify(mod);

            return (
              <React.Fragment key={mod.module_id || i}>
                {hasChanged && renderModule(baseMod, i, true, false)}
                {renderModule(mod, i, false, !!baseMod && hasChanged)}
              </React.Fragment>
            );
          })}
          {/* Orphaned base modules */}
          {baseModules
            .filter((bm: any) => !modules.find((m: any) => m.module_id === bm.module_id))
            .map((mod: any, i: number) => renderModule(mod, i + modules.length, true, false))
          }
        </div>
      </section>
    </div>
  );
};

/**
 * 6. Non-Technical Renderer (sad_non_tech)
 */
const NonTechRenderer: React.FC<{ data: any, baseData?: any, nodeId?: string, currentIteration?: any }> = ({ data, baseData, nodeId, currentIteration }) => {
  const sections = [
    { label: 'Legal Constraints', key: 'legal_constraints', icon: Shield, path: '$.legal_constraints' },
    { label: 'Compliance', key: 'compliance_requirements', icon: ShieldCheck, path: '$.compliance_requirements' },
    { label: 'Performance Targets', key: 'performance_targets', icon: Zap, path: '$.performance_targets' },
    { label: 'Scalability', key: 'scalability_requirements', icon: TrendingUp, path: '$.scalability_requirements' },
    { label: 'Budget', key: 'budget_constraints', icon: Briefcase, path: '$.budget_constraints' },
  ];

  const renderSectionItems = (items: any[], path: string, isStale = false, isRefined = false) => (
    <article className={styles.epicItem}>
      <div className={styles.epicBody}>
        <ul className={styles.criteriaList}>
          {items.map((item: any, j: number) => (
            <CommentableRow 
              key={j} 
              nodeId={nodeId || ''} 
              jsonPath={`${path}[${j}]`} 
              currentIteration={currentIteration}
              isStale={isStale}
              isRefined={isRefined}
            >
              <li className={styles.criteriaItem}>
                <CheckCircle2 size={16} className={styles.checkIcon} />
                {item.constraint_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{item.constraint_id}</span>}
                <span className={styles.valueWrapper}>{typeof item === 'object' ? item.description : item}</span>
                {item.mapped_cons_id && (
                  <span className={styles.mappingBadge} style={{ marginLeft: '8px' }}>{item.mapped_cons_id}</span>
                )}
              </li>
            </CommentableRow>
          ))}
        </ul>
      </div>
    </article>
  );

  return (
    <div className={styles.epicActorContainer}>
      {sections.map((s, i) => {
        const Icon = s.icon;
        const items = data[s.key] || [];
        const baseItems = baseData ? (baseData[s.key] || []) : [];
        if (items.length === 0 && baseItems.length === 0) return null;

        const hasChanged = baseData && JSON.stringify(baseItems) !== JSON.stringify(items);

        return (
          <div key={i} className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <Icon size={20} className={styles.icon} />
              {i + 1}. {s.label}
            </h2>
            <div className={styles.epicList}>
              {hasChanged && renderSectionItems(baseItems, s.path, true, false)}
              {renderSectionItems(items, s.path, false, hasChanged)}
            </div>
          </div>
        );
      })}
    </div>
  );
};


/**
 * 7. Epic Mapping Renderer (sad_epic_mapping)
 */
const EpicMappingRenderer: React.FC<{ data: any, baseData?: any, nodeId?: string, currentIteration?: any }> = ({ data, baseData, nodeId, currentIteration }) => {
  const mappings = data.mappings || [];
  const baseMappings = baseData ? (baseData.mappings || []) : [];

  const renderMapping = (m: any, idx: number, isStale = false, isRefined = false) => (
    <CommentableRow 
      key={`${m.epic_id}-${isStale ? 'stale' : 'refined'}-${idx}`} 
      nodeId={nodeId || ''} 
      jsonPath={`$.mappings[?(@.epic_id=="${m.epic_id}")]`} 
      currentIteration={currentIteration} 
      blockId={m.epic_id}
      isStale={isStale}
      isRefined={isRefined}
    >
      <div className={styles.minimalRelRow}>
        <div className={styles.relNames} style={{ minWidth: '380px' }}>
          <span className={styles.idBadge} style={{ marginRight: '8px' }}>{m.epic_id}</span>
          <span className={styles.textPrimary} style={{ fontWeight: 700 }}>{m.epic_name}</span>
          <ChevronRight size={14} className={styles.opacity40} />
        </div>
        <div className={styles.relMeta}>
          <div className="flex flex-wrap gap-3">
            {m.mapped_modules?.map((mod: string, j: number) => (
              <span key={j} className={styles.mappingBadge}>
                {mod}
              </span>
            ))}
          </div>
        </div>
      </div>
    </CommentableRow>
  );

  const hasMappingsChanged = baseData && JSON.stringify(baseMappings) !== JSON.stringify(mappings);
  return (
    <div className={styles.epicActorContainer}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <GitBranch className={styles.icon} size={20} />
          1. Epic to Module Mapping Architecture
        </h2>
        <div className={styles.epicList} style={{ gap: '2px' }}>
          {mappings.map((m: any, i: number) => {
            const baseMapping = baseMappings.find((bm: any) => bm.epic_id === m.epic_id);
            const hasChanged = baseMapping && JSON.stringify(baseMapping) !== JSON.stringify(m);

            return (
              <React.Fragment key={m.epic_id || i}>
                {hasChanged && renderMapping(baseMapping, i, true, false)}
                {renderMapping(m, i, false, !!baseMapping && hasChanged)}
              </React.Fragment>
            );
          })}
          {/* Orphaned base mappings */}
          {baseMappings
            .filter((bm: any) => !mappings.find((m: any) => m.epic_id === bm.epic_id))
            .map((m: any, i: number) => renderMapping(m, i + mappings.length, true, false))
          }
        </div>
      </section>
    </div>
  );
};

/**
 * 8. Module Dependencies Renderer (sad_module_deps)
 */
const ModuleDepsRenderer: React.FC<{ data: any, baseData?: any, nodeId?: string, currentIteration?: any }> = ({ data, baseData, nodeId, currentIteration }) => {
  const dependencies = data.dependency_graph || data.dependencies || [];
  const baseDependencies = baseData ? (baseData.dependency_graph || baseData.dependencies || []) : [];
  
  const recommendedBuildOrder = data.recommended_build_order || [];
  const baseRecommendedBuildOrder = baseData ? (baseData.recommended_build_order || []) : [];

  const renderDependency = (dep: any, i: number, isStale = false, isRefined = false) => (
    <CommentableRow 
      key={`${dep.from_module}-${dep.to_module}-${isStale ? 'stale' : 'refined'}-${i}`} 
      nodeId={nodeId || ''} 
      jsonPath={`$.dependency_graph[?(@.from_module=="${dep.from_module}" && @.to_module=="${dep.to_module}")]`} 
      currentIteration={currentIteration} 
      blockId={dep.dep_id || dep.id}
      isStale={isStale}
      isRefined={isRefined}
    >
      <article className={styles.epicItem}>
        <h3 className={styles.criteriaTitle} style={{ 
          fontSize: '15px', 
          display: 'flex', 
          flexDirection: 'row', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          width: '100%'
        }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            {dep.dep_id && <span className={styles.idBadge}>{dep.dep_id}</span>}
            <span className={styles.idBadge}>{dep.from_module}</span>
            <ChevronRight size={14} className="opacity-40" style={{ flexShrink: 0 }} />
            <span className={styles.valueWrapper} style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
              {dep.to_module}
            </span>
          </div>
        </h3>
        <div className={styles.epicBody}>
          <p className={styles.epicDesc}>{dep.description}</p>
        </div>
      </article>
    </CommentableRow>
  );

  const hasDepsChanged = baseData && JSON.stringify(baseDependencies) !== JSON.stringify(dependencies);
  const hasBuildOrderChanged = baseData && JSON.stringify(baseRecommendedBuildOrder) !== JSON.stringify(recommendedBuildOrder);

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Dependency Chain */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <GitBranch className={styles.icon} size={20} />
          1. System Dependency Chain
        </h2>
        <div className={styles.epicList}>
          {dependencies.map((dep: any, i: number) => {
            const baseDep = baseDependencies.find((bd: any) => bd.from_module === dep.from_module && bd.to_module === dep.to_module);
            const hasChanged = baseDep && JSON.stringify(baseDep) !== JSON.stringify(dep);

            return (
              <React.Fragment key={i}>
                {hasChanged && renderDependency(baseDep, i, true, false)}
                {renderDependency(dep, i, false, !!baseDep && hasChanged)}
              </React.Fragment>
            );
          })}
          {/* Orphaned base dependencies */}
          {baseDependencies
            .filter((bd: any) => !dependencies.find((d: any) => d.from_module === bd.from_module && d.to_module === bd.to_module))
            .map((dep: any, i: number) => renderDependency(dep, i + dependencies.length, true, false))
          }
        </div>
      </section>

      {/* 2. Build Order */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Layers className={styles.icon} size={20} />
          2. Recommended Build Order
        </h2>
        <div className={styles.epicList}>
          {hasBuildOrderChanged && (
            <CommentableRow nodeId={nodeId || ''} jsonPath="$.recommended_build_order" currentIteration={currentIteration} isStale={true}>
              <article className={styles.epicItem} style={{ opacity: 0.5 }}>
                <div className={styles.epicBody}>
                  <ul className={styles.criteriaList}>
                    {baseRecommendedBuildOrder.map((mod: string, i: number) => (
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
            </CommentableRow>
          )}
          <CommentableRow nodeId={nodeId || ''} jsonPath="$.recommended_build_order" currentIteration={currentIteration} isRefined={hasBuildOrderChanged}>
            <article className={styles.epicItem} style={{ background: hasBuildOrderChanged ? 'rgba(16, 185, 129, 0.05)' : undefined }}>
              <div className={styles.epicBody}>
                <ul className={styles.criteriaList}>
                  {recommendedBuildOrder.map((mod: string, i: number) => (
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
          </CommentableRow>
        </div>
      </section>
    </div>
  );
};

/**
 * 9. API Spec Renderer (API_Spec)
 */
const ApiSpecRenderer: React.FC<{ data: any, baseData?: any, nodeId?: string, currentIteration?: any }> = ({ data, baseData, nodeId, currentIteration }) => {
  const endpoints = data.endpoints || [];
  const baseEndpoints = baseData ? (baseData.endpoints || []) : [];

  const parseSafe = (val: any) => {
    if (typeof val !== 'string') return val;
    try {
      return JSON.parse(val);
    } catch (e) {
      return val;
    }
  };

  const renderEndpoint = (ep: any, i: number, isStale = false, isRefined = false) => {
    const method = (ep.method || 'GET').toLowerCase();
    const reqBody = parseSafe(ep.request_body);
    const hasReqBody = reqBody && (typeof reqBody === 'object' ? Object.keys(reqBody).length > 0 : String(reqBody).length > 0);

    return (
      <CommentableRow 
        key={`${ep.api_id || ep.path}-${isStale ? 'stale' : 'refined'}-${i}`} 
        nodeId={nodeId || ''} 
        jsonPath={`$.endpoints[?(@.path=="${ep.path}" && @.method=="${ep.method}")]`} 
        currentIteration={currentIteration} 
        blockId={ep.api_id}
        isStale={isStale}
        isRefined={isRefined}
      >
        <article className={styles.epicItem} style={{ width: '100%' }}>
          <h3 className={styles.epicHeader}>
            {ep.api_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{ep.api_id}</span>}
            <span className={`${styles.methodBadge} ${styles['methodBadge--' + method]}`}>
              {ep.method || 'GET'}
            </span>
            <span className={styles.path}>{ep.path || '/'}</span>
            {ep.mapped_func_id && (
              <span className={styles.mappingBadge} style={{ marginLeft: 'auto' }}>{ep.mapped_func_id}</span>
            )}
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
                      <CommentableRow 
                        key={j} 
                        nodeId={nodeId || ''} 
                        jsonPath={`$.endpoints[?(@.path=="${ep.path}" && @.method=="${ep.method}")].responses[?(@.status_code=="${res.status_code}")]`} 
                        currentIteration={currentIteration}
                        isStale={isStale}
                        isRefined={isRefined}
                      >
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
  };

  const hasEndpointsChanged = baseData && JSON.stringify(baseEndpoints) !== JSON.stringify(endpoints);

  return (
    <div className={styles.epicActorContainer}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Globe className={styles.icon} size={20} />
          1. API Endpoints Specification
        </h2>
        <div className={styles.epicList}>
          {endpoints.length === 0 && baseEndpoints.length === 0 && <div className={styles.emptyState}>No endpoints defined</div>}
          {endpoints.map((ep: any, i: number) => {
            const baseEp = baseEndpoints.find((be: any) => 
              (ep.api_id && be.api_id === ep.api_id) || 
              (be.path === ep.path && be.method === ep.method)
            );
            const hasChanged = baseEp && JSON.stringify(baseEp) !== JSON.stringify(ep);

            return (
              <React.Fragment key={ep.api_id || `${ep.path}-${ep.method}`}>
                {hasChanged && renderEndpoint(baseEp, i, true, false)}
                {renderEndpoint(ep, i, false, !!baseEp && hasChanged)}
              </React.Fragment>
            );
          })}
          {/* Orphaned base endpoints */}
          {baseEndpoints
            .filter((be: any) => !endpoints.find((ep: any) => 
              (ep.api_id && be.api_id === ep.api_id) || 
              (be.path === ep.path && be.method === ep.method)
            ))
            .map((ep: any, i: number) => renderEndpoint(ep, i + endpoints.length, true, false))
          }
        </div>
      </section>
    </div>
  );
};

/**
 * 10. Information Architecture Renderer (IA)
 */
const IaRenderer: React.FC<{ data: any, baseData?: any, nodeId?: string, currentIteration?: any }> = ({ data, baseData, nodeId, currentIteration }) => {
  const hierarchy = data.hierarchy || [];
  const baseHierarchy = baseData ? (baseData.hierarchy || []) : [];
  
  const screenElements = data.screen_elements || [];
  const baseScreenElements = baseData ? (baseData.screen_elements || []) : [];

  const renderScreenElement = (screen: any, i: number, isStale = false, isRefined = false) => (
    <CommentableRow 
      key={`${screen.screen_id}-${isStale ? 'stale' : 'refined'}-${i}`} 
      nodeId={nodeId || ''} 
      jsonPath={`$.screen_elements[${i}]`} 
      currentIteration={currentIteration} 
      blockId={screen.screen_id}
      isStale={isStale}
      isRefined={isRefined}
    >
      <article className={styles.epicItem} style={{ width: '100%' }}>
        <h3 className={styles.epicHeader}>
          <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>
            {screen.screen_id && <span className={styles.idBadge} style={{ marginRight: '8px' }}>{screen.screen_id}</span>}
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
                    blockId={el.element_id}
                    isStale={isStale}
                    isRefined={isRefined}
                  >
                    <li className={styles.criteriaItem}>
                      <CheckCircle2 size={14} className={styles.checkIcon} />
                      <div className="flex-1">
                        <div className={styles.elementHeader}>
                          {el.element_id && <span className={styles.idBadge}>{el.element_id}</span>}
                          <span className={`${styles.typeBadge} ${styles[elType.toLowerCase()] || ''}`}>
                            {elType}
                          </span>
                          <span className={styles.elementLabel}>{elLabel}</span>
                          {el.mapped_func_id && (
                            <span className={styles.mappingBadge} style={{ marginLeft: 'auto' }}>{el.mapped_func_id}</span>
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
  );

  const renderHierarchyItem = (item: any, i: number, isStale = false, isRefined = false) => {
    const depth = item.depth || 1;
    return (
      <CommentableRow 
        key={`${item.screen_id}-${isStale ? 'stale' : 'refined'}-${i}`} 
        nodeId={nodeId || ''} 
        jsonPath={`$.hierarchy[?(@.screen_id=="${item.screen_id}")]`} 
        currentIteration={currentIteration} 
        blockId={item.screen_id}
        isStale={isStale}
        isRefined={isRefined}
      >
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
            <span className={styles.idBadge} style={{ marginRight: '8px' }}>{item.screen_id}</span>
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
  };

  const hasScreenElementsChanged = baseData && JSON.stringify(baseScreenElements) !== JSON.stringify(screenElements);
  const hasHierarchyChanged = baseData && JSON.stringify(baseHierarchy) !== JSON.stringify(hierarchy);

  return (
    <div className={styles.epicActorContainer}>
      {/* 1. Screen Elements Specification */}
      {(screenElements.length > 0 || baseScreenElements.length > 0) && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Monitor className={styles.icon} size={20} />
            1. Screen Elements Specification
          </div>
          <div className={styles.epicList}>
            {screenElements.map((screen: any, i: number) => {
              const baseScreen = baseScreenElements.find((bs: any) => bs.screen_id === screen.screen_id);
              const hasChanged = baseScreen && JSON.stringify(baseScreen) !== JSON.stringify(screen);

              return (
                <React.Fragment key={screen.screen_id || i}>
                  {hasChanged && renderScreenElement(baseScreen, i, true, false)}
                  {renderScreenElement(screen, i, false, !!baseScreen && hasChanged)}
                </React.Fragment>
              );
            })}
            {/* Orphaned base screens */}
            {baseScreenElements
              .filter((bs: any) => !screenElements.find((s: any) => s.screen_id === bs.screen_id))
              .map((screen: any, i: number) => renderScreenElement(screen, i + screenElements.length, true, false))
            }
          </div>
        </div>
      )}

      {/* 2. Information Architecture Hierarchy */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <LayoutGrid className={styles.icon} size={20} />
          2. Information Architecture Hierarchy
        </div>
        <div className={styles.epicList} style={{ gap: '2px' }}>
          {hierarchy.length === 0 && baseHierarchy.length === 0 && <div className={styles.emptyState}>No hierarchy defined</div>}
          {hierarchy.map((item: any, i: number) => {
            const baseItem = baseHierarchy.find((bi: any) => bi.screen_id === item.screen_id);
            const hasChanged = baseItem && JSON.stringify(baseItem) !== JSON.stringify(item);

            return (
              <React.Fragment key={item.screen_id || i}>
                {hasChanged && renderHierarchyItem(baseItem, i, true, false)}
                {renderHierarchyItem(item, i, false, !!baseItem && hasChanged)}
              </React.Fragment>
            );
          })}
          {/* Orphaned base hierarchy items */}
          {baseHierarchy
            .filter((bi: any) => !hierarchy.find((h: any) => h.screen_id === bi.screen_id))
            .map((item: any, i: number) => renderHierarchyItem(item, i + hierarchy.length, true, false))
          }
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

const RENDERER_MAP: Record<string, React.FC<{ data: any, baseData?: any, nodeId?: string, currentIteration?: any }>> = {
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

const SadSpecRenderer: React.FC<SadSpecRendererProps> = ({ type, data, baseData, isRaw, nodeId, currentIteration }) => {
  if (!data) return <div className="p-8 text-center opacity-40 italic">No data available</div>;

  let parsedData = data;
  if (typeof data === 'string') {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      return <FallbackRenderer data={data} />;
    }
  }

  let parsedBaseData = baseData;
  if (typeof baseData === 'string' && baseData) {
    try {
      parsedBaseData = JSON.parse(baseData);
    } catch (e) {
      // Ignore parse error for baseData
    }
  }

  if (isRaw) return <FallbackRenderer data={parsedData} />;

  const normalizedType = normalizeType(type);
  const Renderer = RENDERER_MAP[normalizedType];

  if (Renderer) {
    return (
      <Renderer 
        data={parsedData} 
        baseData={parsedBaseData} 
        nodeId={nodeId} 
        currentIteration={currentIteration} 
      />
    );
  }

  return <FallbackRenderer data={parsedData} />;
};

export default SadSpecRenderer;
