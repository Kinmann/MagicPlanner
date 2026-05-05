import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useCommentStore } from '../../../store/commentStore';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { PrdBentoRenderer, renderJson, ModuleFsdRenderer, ModuleErdRenderer, ModuleUserFlowRenderer } from '../GlobalRenderers';
import SadSpecRenderer from '../SadSpecRenderer';
import { Sparkles, RefreshCw, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from './NodeRenderer.module.scss';
import { DocumentNode } from '../../../types/project';

const normalizeKeys = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(normalizeKeys);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc: any, key) => {
      const snakeKey = key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`).replace(/^_/, '');
      acc[snakeKey] = normalizeKeys(obj[key]);
      return acc;
    }, {});
  }
  return obj;
};

const MagicEmptyState = ({ title, description, showGuide = false }: { title: string, description: string, showGuide?: boolean }) => (
  <div className={styles.magicEmptyState}>
    <div className={styles.centerContent}>
      <div className={styles.logoArea}>
        <div className={styles.iconBox}>
          <Sparkles size={24} />
        </div>
      </div>
      
      <h2>{title}</h2>
      <p className={styles.description}>{description}</p>

      {showGuide && (
        <div className={styles.guideList}>
          <div className={styles.guideItem}>왼쪽 사이드바에서 노드를 선택하세요.</div>
          <div className={styles.guideItem}>상단 [Start] 버튼으로 설계를 시작하세요.</div>
          <div className={styles.guideItem}>생성된 내용을 검토하고 확정하세요.</div>
        </div>
      )}

      <div className={styles.footerHint}>
        <span>Architecture Command Center</span>
        <span>•</span>
        <span>v0.1.0</span>
      </div>
    </div>
  </div>
);

const EmptyFolderView = ({ folderId }: { folderId: string }) => {
  const isGprd = folderId === 'phase-gprd';
  return (
    <MagicEmptyState 
      title="Architecture Blueprint Ready"
      description={isGprd 
        ? 'Genesis PRD 단계의 노드들을 실행하여 완료(Completed) 상태로 만들어 주세요. 마법 같은 설계도가 이곳에 나타납니다.' 
        : '이 섹션의 노드들이 생성되면 통합된 명세서를 여기서 확인할 수 있습니다.'}
      showGuide={true}
    />
  );
};

// Integrated View for Folders
const FolderIntegratedView = ({ folderId, nodes }: { folderId: string, nodes: DocumentNode[] }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        let targetTypes: string[] = [];
        if (folderId === 'phase-gprd') {
          targetTypes = ['GPRD_Context_Goal', 'GPRD_Capability_Actor', 'GPRD_Architecture_Schema'];
        } else if (folderId === 'group-sad-global') {
          targetTypes = ['SAD_Non_Tech', 'SAD_Tech_Stack', 'SAD_Core_ERD', 'SAD_Auth_RBAC', 'SAD_Interface_Error'];
        } else if (folderId === 'group-sad-split') {
          targetTypes = ['SAD_Module_List', 'SAD_Epic_Mapping', 'SAD_Module_Deps'];
        } else if (folderId === 'phase-sad') {
          targetTypes = [
            'SAD_Non_Tech', 'SAD_Tech_Stack', 'SAD_Core_ERD', 'SAD_Auth_RBAC', 'SAD_Interface_Error', 
            'SAD_Module_List', 'SAD_Epic_Mapping', 'SAD_Module_Deps'
          ];
        }

        const results = await Promise.all(targetTypes.map(async (type, idx) => {
          const node = nodes.find(n => n.target_node_type === type);
          if (!node || node.node_state !== 'COMPLETED') return null; // Filter for completed nodes
          
          try {
            const it = await invoke<any | null>('get_latest_iteration', { nodeId: node.node_id });
            if (it) {
              const raw = it.content_json || it.generated_draft_json;
              if (raw) return { type, content: normalizeKeys(typeof raw === 'string' ? JSON.parse(raw) : raw), stage: idx + 1 };
            }
          } catch(e) {}
          return null;
        }));
        
        setData(results.filter(r => r !== null));
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [folderId, nodes]);

  if (loading) return <div className="p-8 text-center opacity-50"><RefreshCw className="animate-spin inline mr-2"/>Loading integrated view...</div>;

  if (data.length === 0) {
    return <EmptyFolderView folderId={folderId} />;
  }

  return (
    <div className={styles.integratedView}>
      {data.map((item, i) => {
        const isPrd = item.type.startsWith('GPRD_');
        const isSad = item.type.startsWith('sad_');

        return (
          <div key={i} className={styles.integratedSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionBadge}>PART {i + 1}</div>
              <h3 className={styles.sectionTitle}>{item.type.replace('GPRD_', '').replace('sad_', '').replace(/_/g, ' ')}</h3>
            </div>
            <div className={styles.sectionContent}>
              {isPrd && <PrdBentoRenderer content={item.content} isIntegrated={true} stage={item.stage} />}
              {isSad && (
                <div className="bg-surface-container-low p-6 rounded-xl border border-border">
                  <SadSpecRenderer type={item.type} data={item.content} isRaw={false} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const NodeRenderer: React.FC = () => {
  const { nodes } = useProjectStore(useShallow(state => ({
    nodes: state.nodes
  })));

  const { selectedNodeId, selectedIterationId, isRawMode, currentProjectId } = useUIStore(useShallow(state => ({
    selectedNodeId: state.selectedNodeId,
    selectedIterationId: state.selectedIterationId,
    isRawMode: state.isRawMode,
    currentProjectId: state.currentProjectId
  })));

  const [content, setContent] = useState<any>(null);
  const [baseContent, setBaseContent] = useState<any>(null);
  const [currentIteration, setCurrentIteration] = useState<any>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [copied, setCopied] = useState(false);
  const fetchComments = useCommentStore(state => state.fetchComments);

  // Fetch comments when node changes
  useEffect(() => {
    if (selectedNodeId && !selectedNodeId.startsWith('phase-') && !selectedNodeId.startsWith('group-') && !selectedNodeId.startsWith('stage-') && !selectedNodeId.startsWith('module-')) {
      fetchComments(selectedNodeId);
    }
  }, [selectedNodeId, fetchComments]);


  // Content Loader
  useEffect(() => {
    const loadContent = async () => {
      if (selectedNodeId?.startsWith('mock-')) {
        const type = selectedNodeId.replace('mock-', '');
        const globalTypes = [
          'sad_non_tech', 'sad_tech_stack', 'sad_core_erd', 'sad_auth_rbac', 'sad_interface_error',
          'sad_module_list', 'sad_epic_mapping', 'sad_module_deps'
        ];
        
        if (globalTypes.includes(type)) {
          setLoadingContent(true);
          try {
            const contexts = await invoke<any[]>('get_global_contexts', { projectId: currentProjectId });
            const match = contexts.find(c => c.context_type === type);
            if (match) {
              const parsed = typeof match.context_data_json === 'string' 
                ? JSON.parse(match.context_data_json) 
                : match.context_data_json;
              setContent(normalizeKeys(parsed));
              setLoadingContent(false);
              return;
            }
          } catch (e) {
            console.error("Error loading global context:", e);
          }
          setLoadingContent(false);
          setContent(null);
          return;
        }
      }

      if (!selectedIterationId) {
        setContent(null);
        return;
      }
      setLoadingContent(true);
      try {
        const it = await invoke<any>('get_iteration_by_id', { iterationId: selectedIterationId });
        if (it) {
          setCurrentIteration(it);
          const raw = it.content_json || it.generated_draft_json;
          if (raw) {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            setContent(normalizeKeys(parsed));
          } else {
            setContent(null);
          }
        }
      } catch (e) {
        console.error("Error loading iteration content:", e);
        setContent(null);
        setCurrentIteration(null);
      } finally {
        setLoadingContent(false);
      }
    };
    
    // Only load if it's not a folder
    if (selectedNodeId && !selectedNodeId.startsWith('phase-') && !selectedNodeId.startsWith('group-') && !selectedNodeId.startsWith('stage-') && !selectedNodeId.startsWith('module-')) {
      loadContent();

      // Load base content for comparison if needed
      // baseContent는 현재 content(새 draft)와 비교할 이전 pass iter
      // 단, selectedIter가 이미 pass iter이면 diff 대상이 없으므로 baseContent를 로드하지 않음
      const node = nodes.find(n => n.node_id === selectedNodeId);
      const isPostPatchState = node && (
        node.node_state === 'STALE' ||
        node.node_state === 'REFINING' ||
        node.node_state === 'PAUSED_HITL'
      );

      if (isPostPatchState && selectedIterationId) {
        // 현재 선택된 iter가 pass가 아닐 때만 baseContent를 로드 (pass이면 diff 필요 없음)
        invoke<any | null>('get_iteration_by_id', { iterationId: selectedIterationId })
          .then(selectedIter => {
            if (selectedIter?.is_pass) {
              // 선택된 것이 이미 pass iter → diff 불필요
              setBaseContent(null);
              return;
            }
            // 선택된 iter가 draft(is_pass=0)이면 이전 pass를 baseContent로 로드
            return invoke<any | null>('get_latest_pass_iteration', { nodeId: selectedNodeId })
              .then(it => {
                if (it && it.iteration_id !== selectedIterationId) {
                  const raw = it.content_json || it.generated_draft_json;
                  if (raw) {
                    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    setBaseContent(normalizeKeys(parsed));
                  } else {
                    setBaseContent(null);
                  }
                } else {
                  setBaseContent(null);
                }
              });
          })
          .catch(err => {
            console.error("Error loading base iteration:", err);
            setBaseContent(null);
          });
      } else {
        setBaseContent(null);
      }
    }
  }, [selectedIterationId, selectedNodeId, nodes]);

  if (!selectedNodeId) {
    return (
      <MagicEmptyState 
        title="Magic Planner Ready"
        description="탐색기에서 노드를 선택하여 아키텍처 설계를 시작하세요. 마법 같은 설계가 시작됩니다."
        showGuide={false}
      />
    );
  }

  const isFolder = selectedNodeId.startsWith('phase-') || selectedNodeId.startsWith('group-') || selectedNodeId.startsWith('stage-') || selectedNodeId.startsWith('module-');
  
  if (isFolder) {
    return (
      <div className={styles.container}>
        <FolderIntegratedView folderId={selectedNodeId} nodes={nodes} />
      </div>
    );
  }

  let node = nodes.find(n => n.node_id === selectedNodeId);
  const isMock = !node && selectedNodeId.startsWith('mock-');
  const mockType = isMock ? selectedNodeId.replace('mock-', '') : null;

  if (isMock && mockType) {
    node = {
      node_id: selectedNodeId,
      target_node_type: mockType,
      node_state: 'PENDING',
      current_iteration: 0,
      max_iterations: 10,
    } as any;
  }

  if (!node) return <div className={styles.container}>Node not found</div>;


  // Raw Mode View (JSON)
  if (isRawMode) {
    const jsonString = content ? JSON.stringify(content, null, 2) : '';

    const handleCopy = () => {
      navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={styles.rawMode}
      >
        <div className={styles.premiumHeader}>
          <div className={styles.headerTitleArea}>
            <div className={styles.badge}>RAW SPEC</div>
            <h2>{node.target_node_type}</h2>
          </div>
          <button 
            className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
            onClick={handleCopy}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
          </button>
        </div>
        <div className={styles.codeBlockWrapper}>
          <div className={styles.codeBlock}>
            {content ? (
              renderJson(content)
            ) : (
              <MagicEmptyState 
                title="Specification Pending"
                description="Raw JSON 데이터를 불러올 수 없습니다. 파이프라인을 실행하여 데이터를 생성하세요."
              />
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  const isPrd = node.target_node_type.includes('PRD') || node.target_node_type.startsWith('GPRD_');
  const isSad = node.target_node_type.includes('SAD') || node.target_node_type.startsWith('sad_');
  const isFsd = node.target_node_type === 'FSD' || node.target_node_type.toLowerCase() === 'fsd';
  const isErd = node.target_node_type === 'ERD';
  const isUserFlow = node.target_node_type.toLowerCase().replace(/_/g, ' ') === 'user flow';
  const isApiSpec = node.target_node_type === 'API_Spec';
  const isIa = node.target_node_type === 'IA';
  const isWireframe = node.target_node_type.toLowerCase().includes('wireframe');
  const isTc = node.target_node_type.toLowerCase().includes('tc');

  // Determine stage for PRD
  let prdStage = 1;
  if (node.target_node_type === 'GPRD_Capability_Actor') prdStage = 2;
  if (node.target_node_type === 'GPRD_Architecture_Schema') prdStage = 3;
  if (node.target_node_type === 'PRD') prdStage = 4;

  return (
    <div className={styles.container}>

      {isMock && (
        <div className={styles.mockBanner}>
          <span>NOTICE: 이 노드는 아직 생성되지 않았습니다. 데이터를 생성하려면 파이프라인을 실행하세요.</span>
        </div>
      )}

      {loadingContent ? (
        <div className="p-12 flex justify-center opacity-50"><RefreshCw className="animate-spin" /></div>
      ) : content ? (
        <>
          {isPrd && (
            <PrdBentoRenderer 
              content={content} 
              baseContent={baseContent}
              isIntegrated={false} 
              stage={prdStage} 
              nodeId={selectedNodeId} 
              currentIteration={currentIteration} 
            />
          )}
          {isFsd && (
            <ModuleFsdRenderer 
              content={content} 
              baseContent={baseContent}
              nodeId={selectedNodeId} 
              currentIteration={currentIteration} 
            />
          )}
          {isErd && (
            <div className="bg-surface-container border border-border rounded-xl p-6">
              <ModuleErdRenderer 
                content={content} 
                baseContent={baseContent}
                nodeId={selectedNodeId} 
                currentIteration={currentIteration} 
              />
            </div>
          )}
          {isUserFlow && (
            <ModuleUserFlowRenderer 
              content={content} 
              baseContent={baseContent}
              nodeId={selectedNodeId} 
              currentIteration={currentIteration} 
            />
          )}
          {(isSad || isApiSpec || isIa || isWireframe || isTc) && (
            <div className="bg-surface-container border border-border rounded-xl p-6">
              <SadSpecRenderer 
                type={node.target_node_type} 
                data={content} 
                baseData={baseContent}
                isRaw={false} 
                nodeId={selectedNodeId} 
                currentIteration={currentIteration}
              />
            </div>
          )}
          {!isPrd && !isSad && !isFsd && !isErd && !isUserFlow && !isApiSpec && !isIa && !isWireframe && !isTc && (
            <div className={styles.fallback}>
              <h1>{node.target_node_type}</h1>
              <p>This node type is currently being migrated to the new structured document view.</p>
              <pre className="text-xs p-4 bg-black/20 rounded mt-4 overflow-auto max-h-[300px]">{JSON.stringify(content, null, 2)}</pre>
            </div>
          )}
        </>
      ) : (
        <MagicEmptyState 
          title="Specification Pending"
          description="이 노드에 대한 산출물 데이터가 아직 생성되지 않았거나 로딩 중입니다."
          showGuide={node?.node_state === 'READY'}
        />
      )}
    </div>
  );
};
