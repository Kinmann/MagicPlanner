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
  const entities = data.entities || [];
  const relations = data.relationships || [];

  return (
    <div className="sad-spec-renderer">
      <div className="spec-table-container">
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Description</th>
              <th>Attributes</th>
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
 * 9. Fallback Renderer (JSON)
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
    default:
      return <FallbackRenderer data={workingData} />;
  }
};

export default SadSpecRenderer;
