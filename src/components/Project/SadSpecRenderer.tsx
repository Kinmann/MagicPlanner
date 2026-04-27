import React from 'react';
import { 
  Database, Terminal, Layers, 
  Layout, Info, 
  ChevronRight, Box,
  GitBranch, Eye, 
  RefreshCw, Check
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
    <div className={styles.container}>
      <div className={styles.tableContainer}>
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
                <td><strong className={styles.textPrimary}>{ent.entity_name}</strong></td>
                <td className={`${styles.opacity80} ${styles.textSm}`}>{ent.description}</td>
                <td>
                  <div className={`${styles.attributeList} ${styles.valueWrapper}`}>
                    {ent.attributes?.map((attr: any, j: number) => (
                      <div key={j} className={styles.attribute}>
                        <span className={styles.name}>{attr.name}</span>
                        <span className={styles.type}>({attr.data_type})</span>
                        {attr.is_primary_key && <span className={styles.badge}>PK</span>}
                        <span className={`${styles.opacity40} ${styles.textXs}`}>{attr.is_nullable ? 'NULL' : 'NOT NULL'}</span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {relations.length > 0 && (
        <div className="mt-8">
          <div className={styles.sectionHeader}>
            <GitBranch className={styles.icon} size={14} />
            <h3>Relationships Map</h3>
          </div>
          <div className={styles.relationshipList}>
            {relations.map((rel: any, i: number) => (
              <div key={i} className={styles.relCard}>
                <div className={styles.relInfo}>
                  <span className={styles.textPrimary}>{rel.from_entity}</span>
                  <ChevronRight size={12} className={styles.opacity40} />
                  <span className={styles.textSecondary}>{rel.to_entity}</span>
                </div>
                <div className={`${styles.flex} ${styles.gap2} ${styles.mt2} ${styles.itemsCenter}`}>
                  <span className={styles.relType}>{rel.relationship_type}</span>
                  <span className={styles.desc}>{rel.description}</span>
                </div>
              </div>
            ))}
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
    <div className={styles.container}>
      <div className={styles.techGrid}>
        <div className={styles.techCard}>
          <div className={styles.category}>Auth Method</div>
          <div className={`${styles.name} ${styles.valueWrapper}`}>{data.auth_method}</div>
        </div>
        <div className={styles.techCard}>
          <div className={styles.category}>Token Strategy</div>
          <div className={`${styles.name} ${styles.valueWrapper}`}>{data.token_strategy}</div>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '150px' }}>Role</th>
              <th>Description</th>
              <th>Permissions</th>
            </tr>
          </thead>
          <tbody>
            {(data.roles || []).map((r: any, i: number) => (
              <tr key={i}>
                <td><span className={`${styles.badge} ${styles['badge--secondary']}`}>{r.role_name}</span></td>
                <td className={`${styles.textSm} ${styles.opacity80}`}>{r.description}</td>
                <td>
                  <div className={`${styles.flex} ${styles.flexWrap} ${styles.gap1}`}>
                    {r.permissions?.map((p: string, j: number) => (
                      <span key={j} className={`${styles.textXs} ${styles.bgSurfaceContainerHigh} ${styles.px2} ${styles.py0_5} ${styles.rounded} ${styles.border} ${styles.borderBorder}`}>{p}</span>
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
 * 3. Tech Stack Renderer (sad_tech_stack)
 */
const TechStackRenderer: React.FC<{ data: any }> = ({ data }) => {
  const categories = [
    { label: 'Frontend', id: 'frontend', icon: Layout },
    { label: 'Backend', id: 'backend', icon: Terminal },
    { label: 'Database', id: 'database', icon: Database },
    { label: 'Infrastructure', id: 'infrastructure', icon: Layers },
    { label: 'CI/CD', id: 'ci_cd', icon: RefreshCw },
    { label: 'Monitoring', id: 'monitoring', icon: Eye },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.techGrid}>
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <div key={cat.id} className={styles.techCard}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className="text-primary" />
                <span className={styles.category}>{cat.label}</span>
              </div>
              <div className={`${styles.name} ${styles.valueWrapper}`}>{data[cat.id] || 'N/A'}</div>
            </div>
          );
        })}
      </div>
      {data.rationale && data.rationale.length > 0 && (
        <div className="mt-8">
          <div className={styles.sectionHeader}>
            <Info className={styles.icon} size={14} />
            <h3>Rationale</h3>
          </div>
          <div className={`${styles.bgSurfaceContainerHigh} ${styles.p4} ${styles.roundedLg} ${styles.border} ${styles.borderBorder}`}>
            <ul className={`${styles.flex} ${styles.flexCol} ${styles.gap2}`}>
              {data.rationale.map((r: string, i: number) => (
                <li key={i} className={`${styles.textSm} ${styles.flex} ${styles.gap2}`}><Check size={12} className={`${styles.textSecondary} ${styles.mt1}`} /> {r}</li>
              ))}
            </ul>
          </div>
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
    <div className={styles.container}>
      <div className={styles.techGrid}>
        <div className={styles.techCard}>
          <div className={styles.category}>API Versioning</div>
          <div className={`${styles.name} ${styles.valueWrapper}`}>{data.api_versioning_strategy}</div>
        </div>
        <div className={styles.techCard}>
          <div className={styles.category}>Response Format</div>
          <div className={`${styles.name} ${styles.valueWrapper}`}>{data.response_format}</div>
        </div>
      </div>

      <div className={styles.tableContainer}>
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
                <td><code className={`${styles.textPrimary} ${styles.fontBold}`}>{err.code}</code></td>
                <td><span className={styles.badge}>{err.http_status}</span></td>
                <td className={styles.fontBold}>{err.message}</td>
                <td className={`${styles.textSm} ${styles.opacity60}`}>{err.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * 5. Module List Renderer (sad_module_list)
 */
const ModuleListRenderer: React.FC<{ data: any }> = ({ data }) => {
  const modules = data.modules || [];
  return (
    <div className={styles.container}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((mod: any, i: number) => (
          <div key={i} className={styles.techCard}>
            <div className={`${styles.flex} ${styles.justifyBetween} ${styles.itemsStart} ${styles.mb2}`}>
              <div className={`${styles.flex} ${styles.itemsCenter} ${styles.gap2}`}>
                <Box size={16} className={styles.textPrimary} />
                <span className={`${styles.fontBold} ${styles.textLg}`}>{mod.module_name}</span>
              </div>
              <span className={`${styles.badge} ${styles['badge--secondary']}`}>#{mod.priority_order}</span>
            </div>
            <p className={`${styles.textSm} ${styles.opacity80} ${styles.leadingRelaxed}`}>{mod.core_responsibility}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 6. Non-Technical Renderer (sad_non_tech)
 */
const NonTechRenderer: React.FC<{ data: any }> = ({ data }) => {
  const sections = [
    { label: 'Legal Constraints', items: data.legal_constraints },
    { label: 'Compliance', items: data.compliance_requirements },
    { label: 'Performance Targets', items: data.performance_targets },
    { label: 'Scalability', items: data.scalability_requirements },
    { label: 'Budget', items: data.budget_constraints },
  ];
  return (
    <div className={styles.container}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map((s, i) => (
          <div key={i} className={styles.techCard}>
            <div className={styles.category}>{s.label}</div>
            <ul className="mt-2 space-y-2">
              {s.items?.map((item: string, j: number) => (
                <li key={j} className="text-sm opacity-80 flex gap-2">
                  <span className="text-primary">•</span> {item}
                </li>
              ))}
            </ul>
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
  return (
    <div className={styles.container}>
      <div className={styles.tableContainer}>
        <table>
          <thead>
            <tr>
              <th>Epic</th>
              <th>Mapped Modules</th>
            </tr>
          </thead>
          <tbody>
            {(data.mappings || []).map((m: any, i: number) => (
              <tr key={i}>
                <td><strong className={styles.textPrimary}>{m.epic_name}</strong> <span className="opacity-40 text-xs">({m.epic_id})</span></td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {m.mapped_modules?.map((mod: string, j: number) => (
                      <span key={j} className={`${styles.badge} ${styles['badge--secondary']}`}>{mod}</span>
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
 * 8. Module Dependencies Renderer (sad_module_deps)
 */
const ModuleDepsRenderer: React.FC<{ data: any }> = ({ data }) => {
  return (
    <div className={styles.container}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className={styles.sectionHeader}>
            <GitBranch className={styles.icon} size={14} />
            <h3>Dependency Chain</h3>
          </div>
          <div className="space-y-4">
            {(data.dependencies || []).map((dep: any, i: number) => (
              <div key={i} className={styles.relCard}>
                <div className={styles.relInfo}>
                  <span className={styles.textPrimary}>{dep.from_module}</span>
                  <ChevronRight size={12} className={styles.opacity40} />
                  <span className={styles.textSecondary}>{dep.to_module}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className={styles.relType}>{dep.dependency_type}</span>
                  <span className="text-sm opacity-60 italic">{dep.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className={styles.sectionHeader}>
            <Layers className={styles.icon} size={14} />
            <h3>Build Order</h3>
          </div>
          <div className="bg-surface-container-high rounded-xl border border-border p-4">
            <div className="space-y-3">
              {(data.recommended_build_order || []).map((mod: string, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">{i + 1}</div>
                  <span className="text-sm font-medium">{mod}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
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
