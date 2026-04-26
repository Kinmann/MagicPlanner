import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

interface SystemLogProps {
  logs: string[];
}

export function SystemLog({ logs }: SystemLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="w-80 bg-[#18181b] border-l border-[#27272a] flex flex-col h-full overflow-hidden text-xs font-mono">
      <div className="h-10 px-4 font-semibold text-gray-400 tracking-wider flex items-center gap-2 border-b border-[#27272a] shrink-0">
        <Terminal size={14} className="text-[#10b981]" />
        SYSTEM LOG
      </div>
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#121216]"
      >
        {logs.map((log, i) => {
          const isError = log.includes('[ERROR]');
          const isWarn = log.includes('[WARN]');
          const isInfo = log.includes('[INFO]');
          
          let color = 'text-gray-400';
          if (isError) color = 'text-red-400';
          else if (isWarn) color = 'text-yellow-400';
          else if (isInfo) color = 'text-[#10b981]';
          
          return (
            <div key={i} className={`whitespace-pre-wrap break-words ${color} font-mono tracking-tight`}>
              <span className="opacity-50 text-gray-500 mr-2">
                {new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              {log}
            </div>
          );
        })}
        {logs.length === 0 && (
          <div className="text-gray-600 italic mt-4 text-center">No logs yet...</div>
        )}
      </div>
    </div>
  );
}
