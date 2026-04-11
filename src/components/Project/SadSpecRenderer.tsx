import React from 'react';
import './SadSpecRenderer.scss';

interface SadSpecRendererProps {
  type: string;
  data: any;
  isRaw?: boolean;
}

/**
 * 1. ERD Renderer (sad_core_erd)
 */
const ErdRenderer: React.FC<{ data: any }> = ({ data }) => {
  // Handle both SadCoreErdSchema (entities) and ErdSchema (tables)
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
    <div className="sad-spec-renderer">
      <div className="spec-table-container">
        <table>
          <thead>
            <tr>
              <th>{isModuleErd ? 'Table' : 'Entity'}</th>
              <th>Description</th>
              <th>{isModuleErd ? 'Columns' : 'Attributes'}</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((ent: any, i: number) => (
              <tr key={i}>
                <td><b>{ent.entity_name}</b></td>
                <td>{ent.description}</td>
                <td>
                  <ul className="spec-list">
                    {ent.attributes?.map((attr: any, j: number) => (
                      <li key={j}>
                        <div className="bullet" />
                        <div className="text">
                          <b>{attr.name}</b> ({attr.data_type}) {attr.is_primary_key ? '<PK>' : ''} {attr.is_nullable ? '?' : '*'}
                          <div style={{ fontSize: '0.65rem', opacity: 0.6 }}>{attr.description}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {relations.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h4 style={{ fontSize: '0.7rem', color: 'var(--primary)', marginBottom: '0.75rem', fontWeight: 900, textTransform: 'uppercase' }}>Relationships Map</h4>
          <div className="spec-table-container">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Type</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {relations.map((rel: any, i: number) => (
                  <tr key={i}>
                    <td><b>{rel.from_entity}</b></td>
                    <td><b>{rel.to_entity}</b></td>
                    <td><span className="badge badge--primary">{rel.relationship_type}</span></td>
                    <td>{rel.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 2. RBAC Renderer (sad_auth_rbac)
 */
const RbacRenderer: React.FC<{ data: any }> = ({ data }) => {
  return (
    <div className="sad-spec-renderer">
      <div className="tech-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: '1.5rem' }}>
        <div className="tech-category">
          <div className="category-header">
            <span className="material-symbols-outlined">api</span>
            <span className="name">Auth Method</span>
          </div>
          <div className="category-body">
            <span className="value">{data.auth_method}</span>
          </div>
        </div>
        <div className="tech-category">
          <div className="category-header">
            <span className="material-symbols-outlined">security</span>
            <span className="name">Token Strategy</span>
          </div>
          <div className="category-body">
            <span className="value">{data.token_strategy}</span>
          </div>
        </div>
      </div>

      <div className="spec-table-container">
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Description</th>
              <th>Permissions</th>
            </tr>
          </thead>
          <tbody>
            {(data.roles || []).map((r: any, i: number) => (
              <tr key={i}>
                <td style={{ width: '150px' }}>
                  <div className="badge badge--primary">{r.role_name}</div>
                </td>
                <td><small>{r.description}</small></td>
                <td>
                  <ul className="spec-list">
                    {r.permissions?.map((p: string, j: number) => (
                      <li key={j}><div className="bullet" /><div className="text">{p}</div></li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * 3. Tech Stack Renderer (sad_tech_stack)
 */
const TechStackRenderer: React.FC<{ data: any }> = ({ data }) => {
  const categories = [
    { label: 'Frontend', id: 'frontend', icon: 'splitscreen' },
    { label: 'Backend', id: 'backend', icon: 'dns' },
    { label: 'Database', id: 'database', icon: 'database' },
    { label: 'Infrastructure', id: 'infrastructure', icon: 'cloud_circle' },
    { label: 'CI/CD', id: 'ci_cd', icon: 'cyclone' },
    { label: 'Monitoring', id: 'monitoring', icon: 'query_stats' },
  ];

  return (
    <div className="sad-spec-renderer">
      <div className="tech-grid">
        {categories.map((cat) => (
          <div key={cat.id} className="tech-category">
            <div className="category-header">
              <span className="material-symbols-outlined">{cat.icon}</span>
              <span className="name">{cat.label}</span>
            </div>
            <div className="category-body">
              <div className="category-main">
                <span className="value">{data[cat.id] || 'N/A'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {data.rationale && data.rationale.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h4 style={{ fontSize: '0.7rem', color: 'var(--primary)', marginBottom: '0.75rem', fontWeight: 900, textTransform: 'uppercase' }}>Rationale</h4>
          <ul className="spec-list">
            {data.rationale.map((r: string, i: number) => (
              <li key={i}><div className="bullet" /><div className="text">{r}</div></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * 4. Interface & Error Renderer (sad_interface_error)
 */
const InterfaceRenderer: React.FC<{ data: any }> = ({ data }) => {
  return (
    <div className="sad-spec-renderer">
      <div className="tech-grid" style={{ gridTemplateColumns: '1fr', marginBottom: '1.5rem' }}>
        <div className="tech-category">
          <div className="category-header"><span className="name">API Versioning</span></div>
          <div className="category-body"><span className="value" style={{ fontSize: '0.75rem' }}>{data.api_versioning_strategy}</span></div>
        </div>
        <div className="tech-category">
          <div className="category-header"><span className="name">Response Format</span></div>
          <div className="category-body"><span className="value" style={{ fontSize: '0.75rem' }}>{data.response_format}</span></div>
        </div>
        <div className="tech-category">
          <div className="category-header"><span className="name">Pagination</span></div>
          <div className="category-body"><span className="value" style={{ fontSize: '0.75rem' }}>{data.pagination_strategy}</span></div>
        </div>
      </div>

      <div className="spec-table-container">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Status</th>
              <th>Message</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {(data.error_codes || []).map((err: any, i: number) => (
              <tr key={i}>
                <td><code style={{ color: 'var(--primary)' }}>{err.code}</code></td>
                <td><span className="badge">{err.http_status}</span></td>
                <td><b>{err.message}</b></td>
                <td><small style={{ opacity: 0.7 }}>{err.description}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * 5. Non-Tech Renderer (sad_non_tech)
 */
const NonTechRenderer: React.FC<{ data: any }> = ({ data }) => {
  const sections = [
    { label: 'Legal Constraints', key: 'legal_constraints' },
    { label: 'Compliance', key: 'compliance_requirements' },
    { label: 'Performance Targets', key: 'performance_targets' },
    { label: 'Scalability', key: 'scalability_requirements' },
    { label: 'Budget', key: 'budget_constraints' },
  ];

  return (
    <div className="sad-spec-renderer">
      <div className="tech-grid">
        {sections.map(s => (
          <div key={s.key} className="tech-category">
            <div className="category-header"><span className="name">{s.label}</span></div>
            <div className="category-body">
              <ul className="spec-list">
                {(data[s.key] || []).map((item: string, idx: number) => (
                  <li key={idx}><div className="bullet" /><div className="text" style={{ fontSize: '0.7rem' }}>{item}</div></li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 6. Module List Renderer (sad_module_list)
 */
const ModuleListRenderer: React.FC<{ data: any }> = ({ data }) => {
  const modules = data.modules || [];
  return (
    <div className="sad-spec-renderer">
      <div className="chips-grid">
        {modules.map((mod: any, i: number) => (
          <div key={i} className="v-chip">
            <div className="icon"><span className="material-symbols-outlined">inventory_2</span></div>
            <div className="chip-info">
              <span className="name">{mod.module_name}</span>
              <span className="sub">Order: {mod.priority_order}</span>
              <small style={{ fontSize: '0.6rem', opacity: 0.6, marginTop: '0.25rem' }}>{mod.core_responsibility}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 7. Epic Mapping Renderer (sad_epic_mapping)
 */
const EpicMappingRenderer: React.FC<{ data: any }> = ({ data }) => {
  const mappings = data.mappings || [];
  return (
    <div className="sad-spec-renderer">
      {mappings.map((m: any, i: number) => (
        <div key={i} className="epic-map-card">
          <div className="epic-header">
            <span className="epic-id">{m.epic_id}</span>
            <span className="epic-title">{m.epic_name}</span>
          </div>
          <div className="module-tags">
            {m.mapped_modules?.map((modId: string, j: number) => (
              <span key={j} className="mod-tag">{modId}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * 8. Module Dependency Renderer (sad_module_deps)
 */
const ModuleDepsRenderer: React.FC<{ data: any }> = ({ data }) => {
  const dependencies = data.dependencies || [];
  return (
    <div className="sad-spec-renderer">
      <div className="spec-table-container">
        <table>
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Type</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {dependencies.map((d: any, i: number) => (
              <tr key={i}>
                <td><b>{d.from_module}</b></td>
                <td><b>{d.to_module}</b></td>
                <td><span className="badge badge--primary">{d.dependency_type}</span></td>
                <td><small style={{ opacity: 0.7 }}>{d.description}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.recommended_build_order && (
        <div style={{ marginTop: '1.5rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
          <h4 style={{ fontSize: '0.7rem', color: 'var(--primary)', marginBottom: '0.75rem', fontWeight: 900, textTransform: 'uppercase' }}>Recommended Build Order</h4>
          <div className="module-tags">
            {data.recommended_build_order.map((mod: string, i: number) => (
              <React.Fragment key={i}>
                <span className="mod-tag" style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}>{mod}</span>
                {i < data.recommended_build_order.length - 1 && <span className="material-symbols-outlined" style={{ fontSize: '1rem', opacity: 0.3 }}>arrow_forward</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 9. Module PRD Renderer (PRD)
 */
const PrdRenderer: React.FC<{ data: any }> = ({ data }) => {
  return (
    <div className="sad-spec-renderer">
      <div className="tech-grid" style={{ gridTemplateColumns: '1fr', marginBottom: '1.5rem' }}>
        <div className="tech-category">
          <div className="category-header"><span className="name">Vision & Overview</span></div>
          <div className="category-body">
            <div className="category-main">
               <span className="label">Problem</span>
               <span className="value" style={{ fontSize: '0.85rem' }}>{data.overview?.problem_statement}</span>
            </div>
            <div className="category-main" style={{ marginTop: '0.5rem' }}>
               <span className="label">Vision</span>
               <span className="value" style={{ fontSize: '0.85rem' }}>{data.overview?.solution_vision}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="spec-table-container">
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Description</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {(data.core_features || []).map((f: any, i: number) => (
              <tr key={i}>
                <td><b>{f.feature_name}</b></td>
                 <td className="feature-desc">{f.description}</td>
                <td><span className={`badge ${f.priority === 'P0' ? 'badge--primary' : 'badge--warning'}`}>{f.priority}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

       <div className="tech-grid" style={{ marginTop: '1.5rem', gridTemplateColumns: '1fr' }}>
        <div className="tech-category">
          <div className="category-header"><span className="name">User Stories</span></div>
          <div className="category-body">
            <ul className="spec-list">
              {(data.user_stories || []).map((s: string, i: number) => (
                <li key={i}><div className="bullet" /><div className="text">{s}</div></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="tech-category">
          <div className="category-header"><span className="name">Constraints</span></div>
          <div className="category-body">
             <ul className="spec-list">
              {(data.constraints || []).map((c: string, i: number) => (
                <li key={i}><div className="bullet" /><div className="text">{c}</div></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 10. FSD Renderer (FSD)
 */
const FsdRenderer: React.FC<{ data: any }> = ({ data }) => {
  const features = data.features || [];
  return (
    <div className="sad-spec-renderer">
      {features.map((f: any, i: number) => (
        <div key={i} className="epic-map-card" style={{ marginBottom: '1.5rem' }}>
          <div className="epic-header">
            <span className="epic-id">{f.func_id}</span>
            <span className="epic-title">{f.summary}</span>
            <span className="badge badge--primary" style={{ marginLeft: 'auto' }}>{f.module}</span>
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '1rem', padding: '0 0.5rem' }}>
            {f.description}
          </div>
          <div className="tech-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
             <div className="tech-category" style={{ padding: '0.75rem' }}>
                <div className="category-header"><span className="name" style={{ fontSize: '0.6rem' }}>Pre-Condition</span></div>
                <div className="category-body"><span className="value" style={{ fontSize: '0.7rem' }}>{f.pre_condition}</span></div>
             </div>
             <div className="tech-category" style={{ padding: '0.75rem' }}>
                <div className="category-header"><span className="name" style={{ fontSize: '0.6rem' }}>Post-Condition</span></div>
                <div className="category-body"><span className="value" style={{ fontSize: '0.7rem' }}>{f.post_condition}</span></div>
             </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <h4 style={{ fontSize: '0.65rem', color: 'var(--primary)', marginBottom: '0.5rem', fontWeight: 900, textTransform: 'uppercase' }}>Main Flow</h4>
              <ul className="spec-list">
                {f.flow?.map((s: string, j: number) => (
                  <li key={j}><div className="bullet" /><div className="text">{s}</div></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 style={{ fontSize: '0.65rem', color: 'var(--error)', marginBottom: '0.5rem', fontWeight: 900, textTransform: 'uppercase' }}>Exceptions</h4>
              <ul className="spec-list">
                {f.exception_flow?.map((s: string, j: number) => (
                  <li key={j} style={{ borderBottomColor: 'rgba(255,0,0,0.05)' }}><div className="bullet" style={{ background: 'var(--error)' }} /><div className="text">{s}</div></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * 11. User Flow Renderer (User Flow)
 */
const UserFlowRenderer: React.FC<{ data: any }> = ({ data }) => {
  return (
    <div className="sad-spec-renderer">
      <div className="spec-table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Label</th>
              <th>Actor</th>
              <th>Action / Flow</th>
              <th>System Response</th>
            </tr>
          </thead>
          <tbody>
            {(data.nodes || []).map((n: any, i: number) => (
              <tr key={i}>
                <td><code style={{ fontSize: '0.7rem' }}>{n.id}</code></td>
                <td><b>{n.label}</b></td>
                <td><span className="badge">{n.actor}</span></td>
                <td><small>{n.step}</small></td>
                <td><small style={{ color: 'var(--primary)', fontWeight: 600 }}>{n.system_response}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.edges?.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h4 style={{ fontSize: '0.7rem', color: 'var(--primary)', marginBottom: '0.75rem', fontWeight: 900, textTransform: 'uppercase' }}>Flow Connections</h4>
          <div className="spec-table-container">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Condition / trigger</th>
                </tr>
              </thead>
              <tbody>
                {data.edges.map((e: any, i: number) => (
                  <tr key={i}>
                    <td><b>{e.from_id}</b></td>
                    <td><b>{e.to_id}</b></td>
                    <td><small>{e.condition}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 12. IA Renderer (IA)
 */
const IaRenderer: React.FC<{ data: any }> = ({ data }) => {
  const elementsMap = (data.screen_elements || []).reduce((acc: any, wrap: any) => {
    acc[wrap.screen_id] = wrap.elements;
    return acc;
  }, {});

  return (
    <div className="sad-spec-renderer">
      <div className="spec-table-container">
        <table>
          <thead>
            <tr>
              <th>Screen ID</th>
              <th>Title</th>
              <th>Path</th>
              <th>Elements</th>
            </tr>
          </thead>
          <tbody>
            {(data.hierarchy || []).map((h: any, i: number) => (
              <tr key={i}>
                <td style={{ paddingLeft: `${h.depth * 1}rem` }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                     {h.depth > 0 && <span className="material-symbols-outlined" style={{ fontSize: '1rem', opacity: 0.3 }}>subdirectory_arrow_right</span>}
                     <code style={{ fontSize: '0.7rem' }}>{h.screen_id}</code>
                   </div>
                </td>
                <td><b>{h.title}</b></td>
                <td><code style={{ fontSize: '0.7rem', opacity: 0.6 }}>{h.path}</code></td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {elementsMap[h.screen_id]?.map((el: any, j: number) => (
                      <span key={j} className="badge" title={el.mapped_func_id}>{el.label}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * 13. Wireframe Renderer (Wireframe)
 */
const WireframeRenderer: React.FC<{ data: any }> = ({ data }) => {
  return (
    <div className="sad-spec-renderer" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem', width: '100%', alignItems: 'start' }}>
      {(data.screens || []).map((s: any, i: number) => (
        <div key={i} className="epic-map-card">
          <div className="epic-header" style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="epic-id">{s.screen_id}</span>
            <span className="epic-title">{s.screen_name}</span>
          </div>
          <div className="tech-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', padding: '1rem' }}>
            {s.layout_regions?.map((reg: any, j: number) => (
              <div key={j} className="tech-category" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)' }}>
                <div className="category-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="name">{reg.region_name}</span>
                </div>
                <div className="category-body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {(reg.components || []).map((c: any, k: number) => (
                      <div key={k} style={{ padding: '0.5rem', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)' }}>{c.component_type}</span>
                          <span className="badge" style={{ fontSize: '0.6rem' }}>{c.mapped_func_id}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>{c.label}</div>
                        {c.state_condition && (
                          <div style={{ fontSize: '0.65rem', opacity: 0.6, fontStyle: 'italic', marginBottom: '0.25rem' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '0.8rem', verticalAlign: 'middle', marginRight: '0.2rem' }}>info</span>
                            {c.state_condition}
                          </div>
                        )}
                        <div style={{ fontSize: '0.7rem', opacity: 0.8, lineHeight: 1.4 }}>{c.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * 14. API Spec Renderer (API_Spec)
 */
const ApiSpecRenderer: React.FC<{ data: any }> = ({ data }) => {
  const endpoints = data.endpoints || [];
  return (
    <div className="sad-spec-renderer">
      {endpoints.map((ep: any, i: number) => (
        <div key={i} className="epic-map-card" style={{ padding: '0' }}>
          <div className="epic-header" style={{ padding: '1rem', marginBottom: 0 }}>
            <span className={`badge ${['POST', 'PUT', 'PATCH'].includes(ep.method) ? 'badge--primary' : 'badge--success'}`} style={{ padding: '0.2rem 0.6rem', fontSize: '0.7rem' }}>{ep.method}</span>
            <code style={{ fontSize: '0.85rem', color: 'white', fontWeight: 700 }}>{ep.path}</code>
          </div>
          <div style={{ padding: '0 1rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
             <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{ep.summary}</div>
             <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{ep.description}</div>
          </div>
          <div className="tech-grid" style={{ gridTemplateColumns: '1fr 1fr', padding: '1rem', gap: '1rem' }}>
             <div className="tech-category" style={{ padding: '0.75rem' }}>
                <div className="category-header"><span className="name" style={{ fontSize: '0.75rem' }}>Request Body</span></div>
                <div className="category-body">
                  <pre style={{ fontSize: '0.8rem', margin: 0, opacity: 0.7 }}>{JSON.stringify(ep.request_body, null, 2)}</pre>
                </div>
             </div>
             <div className="tech-category" style={{ padding: '0.75rem' }}>
                <div className="category-header"><span className="name" style={{ fontSize: '0.75rem' }}>Responses</span></div>
                <div className="category-body">
                  <pre style={{ fontSize: '0.8rem', margin: 0, opacity: 0.7 }}>{JSON.stringify(ep.responses, null, 2)}</pre>
                </div>
             </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * 15. TC Renderer (TC)
 */
const TcRenderer: React.FC<{ data: any }> = ({ data }) => {
  return (
    <div className="sad-spec-renderer">
      <div className="spec-table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Test Case Title</th>
              <th>Steps / Expected</th>
            </tr>
          </thead>
          <tbody>
            {(data.test_cases || []).map((tc: any, i: number) => (
              <tr key={i}>
                <td><code style={{ fontSize: '0.7rem' }}>{tc.tc_id}</code></td>
                <td><span className="badge">{tc.tc_type}</span></td>
                <td>
                  <div style={{ fontWeight: 700 }}>{tc.title}</div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.5 }}>REQ: {tc.mapped_req_id}</div>
                </td>
                <td>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div>
                        <b style={{ fontSize: '0.6rem', color: 'var(--primary)' }}>STEPS:</b>
                        <ul className="spec-list" style={{ marginTop: '0.25rem' }}>
                          {tc.test_steps?.map((s: string, j: number) => (
                            <li key={j} style={{ padding: '0.15rem 0' }}><div className="bullet" /><div className="text" style={{ fontSize: '0.7rem' }}>{s}</div></li>
                          ))}
                        </ul>
                      </div>
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                        <b style={{ fontSize: '0.6rem', color: 'var(--status-completed)' }}>EXPECTED:</b>
                        <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '0.25rem' }}>{tc.expected_result}</div>
                      </div>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * 16. Fallback Renderer (JSON)
 */
const FallbackRenderer: React.FC<{ data: any }> = ({ data }) => {
  return (
    <pre className="card-content" style={{ fontSize: '0.7rem', color: 'var(--primary)', opacity: 0.7 }}>
      {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
    </pre>
  );
};

const SadSpecRenderer: React.FC<SadSpecRendererProps> = ({ type, data, isRaw }) => {
  if (!data) return <div className="sad-spec-empty">No data available</div>;

  let workingData = data;
  if (typeof data === 'string') {
    try {
      workingData = JSON.parse(data);
    } catch (e) {
      return <FallbackRenderer data={data} />;
    }
  }

  if (isRaw) {
    return <FallbackRenderer data={workingData} />;
  }

  // Type normalization
  switch (type) {
    // SAD Global types
    case 'sad_core_erd':
      return <ErdRenderer data={workingData} />;
    case 'sad_auth_rbac':
      return <RbacRenderer data={workingData} />;
    case 'sad_tech_stack':
      return <TechStackRenderer data={workingData} />;
    case 'sad_interface_error':
      return <InterfaceRenderer data={workingData} />;
    case 'sad_non_tech':
      return <NonTechRenderer data={workingData} />;
    case 'sad_module_list':
      return <ModuleListRenderer data={workingData} />;
    case 'sad_epic_mapping':
      return <EpicMappingRenderer data={workingData} />;
    case 'sad_module_deps':
      return <ModuleDepsRenderer data={workingData} />;
    
    // Module pipeline types
    case 'PRD':
      return <PrdRenderer data={workingData} />;
    case 'FSD':
      return <FsdRenderer data={workingData} />;
    case 'User Flow':
      return <UserFlowRenderer data={workingData} />;
    case 'IA':
      return <IaRenderer data={workingData} />;
    case 'ERD':
      return <ErdRenderer data={workingData} />;
    case 'Wireframe':
      return <WireframeRenderer data={workingData} />;
    case 'API_Spec':
      return <ApiSpecRenderer data={workingData} />;
    case 'TC':
      return <TcRenderer data={workingData} />;

    default:
      return <FallbackRenderer data={workingData} />;
  }
};

export default SadSpecRenderer;
