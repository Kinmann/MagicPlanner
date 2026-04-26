import React from 'react';
import { 
  Server, 
  ShieldCheck, 
  Database,
  Layout,
  Terminal,
  Cloud,
  Network,
  Cpu,
  User,
  Fingerprint
} from 'lucide-react';

const data = {
  "tech_stack": {
    "ai_model_spec": {
      "model_family": "Gemini",
      "temperature": 0.7,
      "version": "2.5-flash"
    },
    "backend": {
      "framework": "Next.js",
      "language_version": "JavaScript/TypeScript",
      "runtime": "Node.js"
    },
    "database": {
      "caching": "Redis",
      "primary": "Supabase PostgreSQL",
      "vector_db": "Supabase PGVector"
    },
    "frontend": {
      "framework": "React",
      "state_management": "React Context API",
      "ui_library": "SCSS"
    },
    "infrastructure": {
      "ci_cd_tool": "GitHub Actions",
      "containerization": "Serverless Runtime",
      "platform": "Netlify"
    },
    "interface_protocols": {
      "api_type": "RESTful API",
      "auth_protocol": "JWT"
    }
  },
  "user_roles": [
    {
      "permissions_level": "USER",
      "role_id": "ROLE-USER",
      "role_name": "일반 사용자"
    },
    {
      "permissions_level": "ADMIN",
      "role_id": "ROLE-ADMIN",
      "role_name": "시스템 관리자"
    }
  ]
};

export function ArchitectureSchemaDetail({ isRawMode }: { isRawMode?: boolean }) {
  const techStackEntries = [
    { key: 'frontend', title: 'Frontend', icon: Layout, data: data.tech_stack.frontend },
    { key: 'backend', title: 'Backend', icon: Terminal, data: data.tech_stack.backend },
    { key: 'database', title: 'Database', icon: Database, data: data.tech_stack.database },
    { key: 'infrastructure', title: 'Infrastructure', icon: Cloud, data: data.tech_stack.infrastructure },
    { key: 'interface_protocols', title: 'Interface & Protocols', icon: Network, data: data.tech_stack.interface_protocols },
    { key: 'ai_model_spec', title: 'AI Model Spec', icon: Cpu, data: data.tech_stack.ai_model_spec },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8 animate-in fade-in duration-300 mt-2 text-gray-300 font-sans w-full max-w-[900px]">
      {isRawMode ? (
        <div className="bg-[#121216] border border-[#27272a] rounded p-6 overflow-auto max-h-[600px]">
          <pre className="text-sm font-mono text-[#10b981]/80">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Tech Stack */}
          <section className="space-y-6">
            <h2 className="text-xl font-bold text-gray-100 border-b border-[#27272a] pb-2 flex items-center gap-2">
              <Server size={20} className="text-[#10b981]" />
              1. Tech Stack
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-2">
              {techStackEntries.map((section, idx) => {
                const Icon = section.icon;
                return (
                  <article key={idx} className="bg-[#18181b] border border-[#27272a] rounded-lg p-5 hover:border-[#3f3f46] transition-colors">
                    <h3 className="text-base font-semibold text-gray-200 flex items-center gap-2 mb-4">
                      <Icon size={18} className="text-[#10b981]/80" />
                      {section.title}
                    </h3>
                    <ul className="space-y-2.5">
                      {Object.entries(section.data).map(([k, v], i) => (
                        <li key={i} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 text-sm">
                          <span className="text-gray-500 font-mono text-xs w-36 shrink-0">{k}</span>
                          <span className="text-gray-300 font-medium">{String(v)}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </section>

          {/* User Roles */}
          <section className="space-y-6">
            <h2 className="text-xl font-bold text-gray-100 border-b border-[#27272a] pb-2 flex items-center gap-2">
              <ShieldCheck size={20} className="text-[#10b981]" />
              2. User Roles
            </h2>
            
            <div className="space-y-4 pl-2">
              {data.user_roles.map((role, idx) => (
                <article key={idx} className="bg-[#18181b] border border-[#27272a] rounded-lg p-5 flex flex-col md:flex-row md:items-center gap-4 hover:border-[#3f3f46] transition-colors">
                  <div className="flex items-center gap-3 md:w-1/3">
                    <div className="p-2 bg-[#27272a] rounded-md text-[#10b981]">
                      <User size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-200">{role.role_name}</h3>
                      <span className="text-xs font-mono text-gray-500">{role.role_id}</span>
                    </div>
                  </div>
                  
                  <div className="h-px w-full md:w-px md:h-10 bg-[#27272a]"></div>
                  
                  <div className="flex items-center gap-3 text-sm">
                    <Fingerprint size={16} className="text-gray-500" />
                    <span className="text-gray-400">Permissions Level:</span>
                    <span className="px-2.5 py-0.5 rounded bg-[#10b981]/10 text-[#10b981] font-bold border border-[#10b981]/20">
                      {role.permissions_level}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
