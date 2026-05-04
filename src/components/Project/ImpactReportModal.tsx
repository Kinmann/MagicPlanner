import React from 'react';
import { 
  AlertTriangle, 
  Layers, 
  Check, 
  ChevronRight,
  Info,
  Box
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ScrollArea } from '../ui/ScrollArea';
import { useProjectStore } from '../../store/projectStore';
import { TaintCascadeSchema } from '../../store/refinementStore';

interface ImpactReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: TaintCascadeSchema | null;
  onConfirm: () => void;
  isLoading?: boolean;
}

export const ImpactReportModal: React.FC<ImpactReportModalProps> = ({ 
  isOpen, 
  onClose, 
  data, 
  onConfirm,
  isLoading = false
}) => {
  const { nodes } = useProjectStore();

  if (!data) return null;

  return (
    <Dialog 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Impact Radius Report (Dry-Run)"
      size="lg"
    >
      <div className="space-y-6 pt-2">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-4">
          <div className="p-2 bg-amber-500/20 rounded-lg text-amber-500">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-200">Cascade Impact Detected</h4>
            <p className="text-xs text-amber-500/70 mt-1 leading-relaxed">
              Applying the proposed changes will trigger a chain reaction across your architecture. 
              Review the impacted blocks below before proceeding.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Directly Stale</div>
            <div className="text-2xl font-black text-rose-500">{data.stale_count} <span className="text-xs opacity-50 font-normal">Artifacts</span></div>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Related Impact</div>
            <div className="text-2xl font-black text-amber-500">{data.impact_count} <span className="text-xs opacity-50 font-normal">Blocks</span></div>
          </div>
        </div>

        <div className="space-y-3">
          <h5 className="text-[11px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2 px-1">
            <Layers size={14} className="text-sky-500" />
            Impacted Document Hierarchy
          </h5>
          
          <ScrollArea className="max-h-[40vh] border border-white/5 rounded-xl bg-black/20">
            <div className="divide-y divide-white/5">
              {data.impacts.map((impact, idx) => {
                const node = nodes.find(n => n.node_id === impact.node_id);
                return (
                  <div key={idx} className="p-4 hover:bg-white/5 transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Box size={14} className="text-gray-400" />
                        <span className="text-sm font-bold">{node?.target_node_type || impact.node_type}</span>
                        <Badge variant={node?.node_state === 'COMPLETED' ? 'warning' : 'outline'} className="text-[9px] h-5">
                          {node?.node_state === 'COMPLETED' ? 'WILL BE STALE' : 'PARTIAL IMPACT'}
                        </Badge>
                      </div>
                      <span className="text-[10px] font-mono text-gray-600">{impact.node_id}</span>
                    </div>

                    <div className="space-y-1 ml-5 mt-2">
                      {impact.block_ids.map((bid, bidx) => (
                        <div key={bidx} className="flex flex-col gap-1 p-2 bg-white/5 rounded border border-white/5">
                          <div className="flex items-center gap-2">
                            <ChevronRight size={10} className="text-amber-500" />
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Target ID:</span>
                            <code className="text-[11px] text-amber-200/70 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">
                              {bid}
                            </code>
                          </div>
                          <div className="flex items-center gap-2 pl-4">
                            <span className="text-[9px] text-gray-600 uppercase font-bold">Address:</span>
                            <span className="text-[11px] text-sky-400/60 font-mono italic">
                              {impact.block_paths[bidx] || "(Node Level Target)"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-2 ml-5 flex items-center gap-2 text-[10px] text-gray-500 italic">
                      <Info size={10} />
                      {impact.reason}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Re-evaluate Changes
          </Button>
          <Button 
            variant="primary" 
            onClick={onConfirm} 
            className="flex-1" 
            isLoading={isLoading}
            leftIcon={<Check size={16} />}
          >
            Apply & Broadcast Impact
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
