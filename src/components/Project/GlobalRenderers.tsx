import React from 'react';
import { 
  Briefcase, TrendingUp, ShieldCheck, 
  Users, User, Shield, Zap,
  Box, FileCode
} from 'lucide-react';
import SadSpecRenderer from './SadSpecRenderer';
import styles from './GlobalRenderers.module.scss';

export const renderJson = (val: any, indent = 0): React.ReactNode => {
  if (val === null) return <span className={styles.jsonNode}><span className={styles.bool}>null</span></span>;
  if (typeof val === 'boolean') return <span className={styles.jsonNode}><span className={styles.bool}>{String(val)}</span></span>;
  if (typeof val === 'number') return <span className={styles.jsonNode}><span className={styles.num}>{val}</span></span>;
  if (typeof val === 'string') return <span className={styles.jsonNode}><span className={styles.str}>"{val}"</span></span>;
  
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
            <div key={key}>
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

export const PrdBentoRenderer = ({ content, isIntegrated = false, stage }: { content: any, isIntegrated?: boolean, stage?: number }) => {
  const projectName = content.metadata?.project_name || content.project_name || 'Unnamed Project';
  const biz = content.business_context || {};
  const vision = content.product_vision || biz.product_vision || biz.product_goal || biz.vision || 'Goal not defined';
  const targetMarket = content.target_market || biz.target_market || biz.market || 'N/A';
  const successMetrics = content.success_metrics || biz.success_metrics || biz.metrics || [];
  const roles = content.user_roles || content.actors || content.personas || [];
  const epics = content.core_epics || content.functional_epics || content.epics || [];
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
            <p className={styles.projectName}>{projectName}</p>
          </div>
          <div className={styles.infoGroup}>
            <h3>Product Goal</h3>
            <p>{vision}</p>
          </div>
          <div className="mt-6">
            <h3 className="text-[11px] font-bold opacity-40 uppercase mb-2">Success Metrics</h3>
            <ul className={styles.metricsList}>
              {successMetrics.map((m: string, i: number) => (
                <li key={i}><TrendingUp size={14} className="text-secondary" /> {m}</li>
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
                  <span key={i} className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded border border-warning/20 font-bold">{c}</span>
                ))}
              </div>
            </div>
            <div className={styles.infoGroup}>
              <h3>Performance</h3>
              <p className="text-sm">{constraints?.performance?.join(', ') || 'Standard Optimized'}</p>
            </div>
            <div className={styles.infoGroup}>
              <h3>Integrations</h3>
              <p className="text-sm">{constraints?.legacy_integrations?.join(', ') || 'Independent'}</p>
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
                    <h3 className="font-bold text-sm">{epic.title}</h3>
                    <span className="text-[10px] font-mono opacity-40">{epic.epic_id}</span>
                  </div>
                </div>
                <p className="text-xs opacity-60 line-clamp-3 leading-relaxed">{epic.description}</p>
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
