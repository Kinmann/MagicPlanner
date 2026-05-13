import React from 'react';
import { 
  Diff, 
  MessageSquare, 
  ArrowDown, Sparkles, XCircle
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Alert } from '../ui/Alert';
import { ScrollArea } from '../ui/ScrollArea';

interface RefinementResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    nodeId: string;
    nodeType: string;
    score: number;
    isPass: boolean;
    errors: any[];
    feedback: any[];
    originalJson: string;
    refinedJson: string;
    patchOps?: string;
    autoRecovered?: boolean;
  } | null;
}

const RefinementResultModal: React.FC<RefinementResultModalProps> = ({ isOpen, onClose, data }) => {
  if (!data) return null;

  const getValueByPath = (obj: any, path: string) => {
    const parts = path.split('/').filter(Boolean);
    let current = obj;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return current;
  };

  const getHunks = () => {
    if (!data.patchOps) return [];
    try {
      const ops = JSON.parse(data.patchOps);
      const original = JSON.parse(data.originalJson);
      if (!Array.isArray(ops)) return [];

      return ops.map((op: any, idx: number) => {
        const oldValue = getValueByPath(original, op.path);
        const pathLabel = op.path.replace(/\//g, ' > ').replace(/^ > /, '') || 'root';
        
        let action: 'ADD' | 'MODIFY' | 'DELETE' = 'MODIFY';
        if (op.op === 'add') action = 'ADD';
        else if (op.op === 'remove') action = 'DELETE';
        else if (op.op === 'replace') action = 'MODIFY';

        return {
          id: idx,
          label: pathLabel,
          action,
          asIs: (action === 'ADD') ? null : oldValue,
          toBe: (action === 'DELETE') ? null : op.value
        };
      });
    } catch (e) { return []; }
  };

  const hunks = getHunks();

  const formatValue = (val: any) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
  };

  return (
    <Dialog 
      isOpen={isOpen} 
      onClose={onClose} 
      size="xl"
      headerClass={data.isPass ? "bg-emerald-500/5" : "bg-amber-500/5"}
      customHeader={
        <div className="flex items-center justify-between w-full pr-8">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${data.isPass ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'}`}>
               <Diff size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Refinement Analysis Report</h2>
              <p className="text-xs opacity-50 mt-0.5">{data.nodeType} Evolution Details</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right">
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">Quality Score</div>
                <div className={`text-2xl font-black font-mono ${data.isPass ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {data.score}
                </div>
             </div>
             <Badge variant={data.isPass ? 'success' : 'warning'} className="h-8 px-4 text-xs">
                {data.isPass ? 'THRESHOLD MET' : 'BELOW THRESHOLD'}
             </Badge>
          </div>
        </div>
      }
      footer={
        <Button variant="primary" onClick={onClose} className="w-full">
           Acknowledge and Continue
        </Button>
      }
    >
      <ScrollArea className="max-h-[70vh] pr-4">
        <div className="space-y-8 py-2">
          {/* Summary Alert */}
          <Alert 
            variant={data.isPass ? 'success' : 'warning'}
            title={data.isPass ? "Generation Successful" : "Validation Warnings Found"}
            description={data.isPass 
              ? "The refined architecture meets all validation criteria and is ready for the next pipeline stage."
              : "Some minor architectural inconsistencies were detected during generation. Please review the patches below."
            }
          />

          {/* Evolution Patches */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                <Sparkles size={14} className="text-emerald-500" />
                Targeted Evolution ({hunks.length} changes)
              </h4>
            </div>

            <div className="space-y-4">
              {hunks.map((hunk) => (
                <div key={hunk.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-black/20 border-b border-white/5">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-widest ${
                      hunk.action === 'ADD' ? 'bg-emerald-500/20 text-emerald-500' : 
                      hunk.action === 'DELETE' ? 'bg-rose-500/20 text-rose-500' : 
                      'bg-sky-500/20 text-sky-500'
                    }`}>
                      {hunk.action}
                    </span>
                    <span className="text-xs font-mono text-gray-400">{hunk.label}</span>
                  </div>
                  
                  <div className="grid grid-cols-[1fr,auto,1fr] items-center p-4 gap-4">
                    <div className="space-y-2">
                      <span className="text-[9px] font-black text-gray-600 block">ORIGINAL</span>
                      <div className="p-3 bg-black/20 rounded-lg font-mono text-[11px] text-gray-500 line-clamp-6">
                        {hunk.asIs !== null ? <pre><code>{formatValue(hunk.asIs)}</code></pre> : <span className="italic opacity-30">Null</span>}
                      </div>
                    </div>

                    <div className="text-gray-700"><ArrowDown size={14} /></div>

                    <div className="space-y-2">
                      <span className="text-[9px] font-black text-emerald-900 block">REFINED</span>
                      <div className="p-3 bg-emerald-500/5 rounded-lg font-mono text-[11px] text-emerald-100 border border-emerald-500/10 line-clamp-6">
                        {hunk.toBe !== null ? <pre><code>{formatValue(hunk.toBe)}</code></pre> : <span className="italic text-rose-500 opacity-50">Deleted</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {hunks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 border-2 border-dashed border-white/5 rounded-2xl italic text-sm">
                  No significant structural changes detected.
                </div>
              )}
            </div>
          </section>

          {/* Diagnostics Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                <MessageSquare size={14} className="text-emerald-500" />
                System Feedback & Diagnostics
              </h4>
            </div>

            <div className="space-y-2">
              {(data.feedback || []).length > 0 ? (
                (data.feedback || []).map((item: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/5 text-xs">
                    <Badge variant="outline" className="text-[9px] h-5">{item.code}</Badge>
                    <span className="text-gray-300 leading-relaxed flex-1">{item.description}</span>
                    <span className="text-[10px] text-gray-600 font-mono italic">{item.location}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-emerald-500/60 p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10 italic text-center">
                  Architectural constraints fully satisfied. No feedback generated.
                </p>
              )}
              
              {(data.errors || []).length > 0 && (
                <div className="mt-4 space-y-2">
                  <h5 className="text-[10px] font-black text-rose-500 uppercase tracking-widest px-1">Critical Violations</h5>
                  {data.errors.map((err: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-rose-500/5 rounded-lg border border-rose-500/10 text-xs">
                      <XCircle size={14} className="text-rose-500" />
                      <span className="font-black text-rose-500/50 min-w-[40px]">{err.code}</span>
                      <span className="text-rose-300 flex-1">{err.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
    </Dialog>
  );
};

export default RefinementResultModal;
