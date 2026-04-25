import React from 'react';
import SadSpecRenderer from './SadSpecRenderer';

export const renderJson = (val: any, indent = 0): React.ReactNode => {
  if (val === null) return <span className="token-boolean">null</span>;
  if (typeof val === 'boolean') return <span className="token-boolean">{String(val)}</span>;
  if (typeof val === 'number') return <span className="token-number">{val}</span>;
  if (typeof val === 'string') return <span className="token-string">"{val}"</span>;
  
  if (Array.isArray(val)) {
    if (val.length === 0) return <span className="token-bracket">[]</span>;
    return (
      <div className="json-array">
        <span className="token-bracket">[</span>
        <div className="json-items">
          {val.map((item, i) => (
            <div key={i} className="json-item">
              <span className="indent" style={{ marginLeft: `${(indent + 1) * 2}ch` }}></span>
              {renderJson(item, indent + 1)}
              {i < val.length - 1 && ","}
            </div>
          ))}
        </div>
        <div style={{ marginLeft: `${indent * 2}ch` }}>
          <span className="token-bracket">]</span>
        </div>
      </div>
    );
  }
  
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    if (keys.length === 0) return <span className="token-bracket">{"{}"}</span>;
    return (
      <div className="json-object">
        <span className="token-bracket">{"{"}</span>
        <div className="json-items">
          {keys.map((key, i) => (
            <div key={key} className="json-item">
              <span className="indent" style={{ marginLeft: `${(indent + 1) * 2}ch` }}></span>
              <span className="token-property">"{key}"</span>: {renderJson(val[key], indent + 1)}
              {i < keys.length - 1 && ","}
            </div>
          ))}
        </div>
        <div style={{ marginLeft: `${indent * 2}ch` }}>
          <span className="token-bracket">{"}"}</span>
        </div>
      </div>
    );
  }
  return String(val);
};

export const PrdBentoRenderer = ({ content, isIntegrated = false, stage }: { content: any, isIntegrated?: boolean, stage?: number }) => {
  // GPRD 서브 노드와 통합 PRD 간의 키 매핑 호환성 처리
  const projectName = content.metadata?.project_name || content.project_name || 'Unnamed Project';
  
  // Stage 1 데이터 추출 (최상위 또는 business_context 내부)
  const biz = content.business_context || {};
  const vision = content.product_vision || biz.product_vision || biz.product_goal || biz.vision || 'Goal not defined';
  const targetMarket = content.target_market || biz.target_market || biz.market || 'N/A';
  const successMetrics = content.success_metrics || biz.success_metrics || biz.metrics || [];
  
  // Stage 2 데이터 추출
  const roles = content.user_roles || content.actors || content.personas || [];
  const epics = content.core_epics || content.functional_epics || content.epics || [];
  
  // Stage 3 데이터 추출
  const tech = content.tech_stack || content.architecture?.tech_stack || null;
  const constraints = content.global_constraints || content.constraints || null;

  return (
    <div className="visual-view">
      <div className="genesis-prd-view__bento-grid">
        {(vision !== 'Goal not defined' || targetMarket !== 'N/A' || successMetrics.length > 0) && (
          <div className="bento-card bento-card--overview intent-strip-primary">
            {isIntegrated && <div className="stage-badge-small">STAGE {stage || 1}: STRATEGY</div>}
            <div className="card-header">
              <h2 className="card-title">
                <span className="material-symbols-outlined icon">business_center</span>
                Business Strategy
              </h2>
            </div>
            <div className="card-body">
              <div className="overview-content">
                <div className="main-info">
                  <div className="info-group project-name-group">
                    <h3>Project Name</h3>
                    <p className="project-name-value">{projectName}</p>
                  </div>
                  <div className="info-group">
                    <h3>Product Goal</h3>
                    <p>{vision}</p>
                  </div>
                  <div className="info-group">
                    <h3>Target Market</h3>
                    <p>{targetMarket}</p>
                  </div>
                </div>
                <div className="metrics-box">
                  <h3>Success Metrics</h3>
                  <ul className="metrics-list">
                    {successMetrics.map((m: string, i: number) => (
                      <li key={i}>
                        <span className="material-symbols-outlined">analytics</span>
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {constraints && (constraints.compliance?.length > 0 || constraints.performance?.length > 0 || constraints.legacy_integrations?.length > 0) && (
          <div className="bento-card bento-card--constraints intent-strip-success">
            {isIntegrated && <div className="stage-badge-small">STAGE {stage || 1}: CONSTRAINTS</div>}
            <div className="card-header">
              <h2 className="card-title">
                <span className="material-symbols-outlined icon">verified_user</span>
                Constraints
              </h2>
            </div>
            <div className="constraints-content">
              <div className="constraint-group">
                <h3>Compliance</h3>
                <div className="tag-cloud">
                  {constraints?.compliance?.map((c: string, i: number) => (
                    <span key={i} className="tag">{c}</span>
                  ))}
                </div>
              </div>
              <div className="constraint-group">
                <h3>Performance</h3>
                <p>{constraints?.performance?.join(', ') || 'Standard'}</p>
              </div>
              <div className="constraint-group">
                <h3>Integration</h3>
                <p>{constraints?.legacy_integrations?.join(', ') || 'Standalone'}</p>
              </div>
            </div>
          </div>
        )}

        {roles.length > 0 && !(isIntegrated && stage === 2) && (
          <div className="bento-card bento-card--personas">
            {isIntegrated && <div className="stage-badge-small">STAGE {stage || 2}: {stage === 3 ? 'SYSTEM ROLES' : 'ACTORS'}</div>}
            <h2 className="card-title">System Persona Mapping</h2>
            <div className="personas-grid">
              {roles.map((role: any, i: number) => (
                <div key={i} className="persona-chip">
                  <div className="persona-header">
                    <span className="material-symbols-outlined icon">
                      {role.permissions_level === 'ADMIN' ? 'admin_panel_settings' : 
                       role.permissions_level === 'MANAGER' ? 'hub' : 'person'}
                    </span>
                    <div className="persona-info">
                      <span className="name">{role.role_name}</span>
                      <span className="role-id">{role.role_id || role.id || 'N/A'}</span>
                    </div>
                  </div>
                  <span className="badge">{role.permissions_level || 'USER'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {epics.length > 0 && (
          <div className="epics-section col-span-12">
            {isIntegrated && <div className="stage-badge-small">STAGE {stage || 2}: CAPABILITIES</div>}
            <div className="section-header">
              <h2>Functional Epics</h2>
            </div>
            <div className="epics-grid">
              {epics.map((epic: any, i: number) => (
                <div key={i} className="epic-card">
                  <div className="epic-card-top">
                    <div className="epic-info">
                      <div className="epic-icon">
                        <span className="material-symbols-outlined">
                          {epic.epic_id?.includes('SEC') ? 'security' : 
                           epic.epic_id?.includes('PROJ') ? 'task' : 'description'}
                        </span>
                      </div>
                      <div className="epic-text">
                        <h3>{epic.title}</h3>
                        <div className="epic-meta">
                          <span className="epic-id">{epic.epic_id}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="epic-desc">
                    {epic.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tech && (
          <div className="bento-card bento-card--tech intent-strip-primary">
            {isIntegrated && <div className="stage-badge-small">STAGE {stage || 3}: ARCHITECTURE</div>}
            <h2 className="card-title">Core Technology Stack</h2>
            <div className="tech-grid">
              {tech.ai_model_spec && tech.ai_model_spec.model_family !== 'Not Applicable' && (
                <div className="tech-category">
                  <div className="category-header">
                    <span className="material-symbols-outlined">psychology</span>
                    <span className="name">AI & Models</span>
                  </div>
                  <div className="category-body">
                    <div className="category-main">
                      <span className="label">Model</span>
                      <span className="value">{tech.ai_model_spec.model_family}</span>
                    </div>
                    <div className="category-subs">
                      <div className="sub-item">
                        <span className="label">Version</span>
                        <span className="value">{tech.ai_model_spec.version}</span>
                      </div>
                      <div className="sub-item">
                        <span className="label">Temp</span>
                        <span className="value">{tech.ai_model_spec.temperature}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {tech.frontend && (
                <div className="tech-category">
                  <div className="category-header">
                    <span className="material-symbols-outlined">splitscreen</span>
                    <span className="name">Frontend</span>
                  </div>
                  <div className="category-body">
                    <div className="category-main">
                      <span className="label">Framework</span>
                      <span className="value">{tech.frontend.framework || 'N/A'}</span>
                    </div>
                    <div className="category-subs">
                      <div className="sub-item">
                        <span className="label">UI Library</span>
                        <span className="value">{tech.frontend.ui_library || 'N/A'}</span>
                      </div>
                      <div className="sub-item">
                        <span className="label">State</span>
                        <span className="value">{tech.frontend.state_management || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {tech.backend && (
                <div className="tech-category">
                  <div className="category-header">
                    <span className="material-symbols-outlined">dns</span>
                    <span className="name">Backend</span>
                  </div>
                  <div className="category-body">
                    <div className="category-main">
                      <span className="label">Framework</span>
                      <span className="value">{tech.backend.framework || 'N/A'}</span>
                    </div>
                    <div className="category-subs">
                      <div className="sub-item">
                        <span className="label">Language</span>
                        <span className="value">{tech.backend.language_version || tech.backend.language || 'N/A'}</span>
                      </div>
                      <div className="sub-item">
                        <span className="label">Runtime</span>
                        <span className="value">{tech.backend.runtime || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {tech.database && (
                <div className="tech-category">
                  <div className="category-header">
                    <span className="material-symbols-outlined">database</span>
                    <span className="name">Database & Cache</span>
                  </div>
                  <div className="category-body">
                    <div className="category-main">
                      <span className="label">Primary DB</span>
                      <span className="value">{tech.database.primary || 'N/A'}</span>
                    </div>
                    <div className="category-subs">
                      <div className="sub-item">
                        <span className="label">Caching</span>
                        <span className="value">{tech.database.caching || 'N/A'}</span>
                      </div>
                      {tech.database.vector_db && tech.database.vector_db !== 'Not Applicable' && (
                        <div className="sub-item">
                          <span className="label">Vector DB</span>
                          <span className="value">{tech.database.vector_db}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {tech.interface_protocols && (
                <div className="tech-category">
                  <div className="category-header">
                    <span className="material-symbols-outlined">sync_alt</span>
                    <span className="name">Protocols</span>
                  </div>
                  <div className="category-body">
                    <div className="category-main">
                      <span className="label">API Type</span>
                      <span className="value">{tech.interface_protocols.api_type || 'N/A'}</span>
                    </div>
                    <div className="category-subs">
                      <div className="sub-item">
                        <span className="label">Auth</span>
                        <span className="value">{tech.interface_protocols.auth_protocol || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {tech.infrastructure && (
                <div className="tech-category">
                  <div className="category-header">
                    <span className="material-symbols-outlined">cloud_done</span>
                    <span className="name">Infrastructure</span>
                  </div>
                  <div className="category-body">
                    <div className="category-main">
                      <span className="label">Platform</span>
                      <span className="value">{tech.infrastructure.platform || 'N/A'}</span>
                    </div>
                    <div className="category-subs">
                      <div className="sub-item">
                        <span className="label">Container</span>
                        <span className="value">{tech.infrastructure.containerization || 'N/A'}</span>
                      </div>
                      <div className="sub-item">
                        <span className="label">CI/CD</span>
                        <span className="value">{tech.infrastructure.ci_cd_tool || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const SadGlobalRenderer = ({ content }: { content: any }) => {
  const contexts = Array.isArray(content) ? content : (content.contexts || []);
  
  return (
    <div className="visual-view">
      <div className="sad-overview-grid">
        {contexts.map((ctx: any, idx: number) => (
          <div key={idx} className="context-card">
            <div className="spec-card-top">
              <span className="group-label">Architecture Definition</span>
              <span className="file-name">{ctx.context_type?.toUpperCase()}.JSON</span>
            </div>
            <div className="spec-card-inner">
              <div className="card-header">
                <div className="title-group">
                  <span className="material-symbols-outlined icon">
                    {ctx.context_type === 'erd' ? 'database' :
                     ctx.context_type === 'api' ? 'api' : 'architecture'}
                  </span>
                  <span className="name">{ctx.context_type?.toUpperCase()} Specification</span>
                </div>
              </div>
              <div className="card-content-wrapper custom-scrollbar">
                <SadSpecRenderer
                  type={ctx.context_type}
                  data={ctx.context_data_json}
                  isRaw={false}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
