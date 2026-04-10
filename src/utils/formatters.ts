import { DocumentNode, LocalModule } from '../types/project';

/**
 * 노드 타이틀을 일관된 형식으로 포맷팅합니다.
 * 1. 노드명에서 [] 삭제
 * 2. 모듈 내 문서는 모듈 이름을 앞에 표시 (ex. [MOD-IAM] PRD)
 */
export const formatNodeTitle = (node: DocumentNode, modules: LocalModule[]) => {
  if (node.module_id) {
    const mod = modules.find(m => m.module_id === node.module_id);
    if (mod) {
      return `[${mod.module_name}] ${node.target_node_type}`;
    }
  }
  return node.target_node_type;
};
