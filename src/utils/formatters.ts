import { DocumentNode, LocalModule, CONTEXT_TYPE_LABELS } from '../types/project';

/**
 * 노드 타이틀을 일관된 형식으로 포맷팅합니다.
 * 1. 노드명에서 [] 삭제
 * 2. 모듈 내 문서는 모듈 이름을 앞에 표시 (ex. [MOD-IAM] PRD)
 * 3. SAD 하위 노드들은 한글 매핑 적용
 */
export const formatNodeTitle = (node: DocumentNode, modules: LocalModule[]) => {
  let title = node.target_node_type;

  // SAD 하위 타입 한글화
  const lowerType = node.target_node_type.toLowerCase();
  if (CONTEXT_TYPE_LABELS[lowerType]) {
    title = CONTEXT_TYPE_LABELS[lowerType];
  } else if (lowerType.includes('api_spec')) {
    title = 'API 명세서';
  } else if (lowerType.includes('spec')) {
    title = '모듈 스펙';
  } else if (lowerType.includes('data')) {
    title = '데이터 모델';
  }

  if (node.module_id) {
    const mod = modules.find(m => m.module_id === node.module_id);
    if (mod) {
      return `[${mod.module_name}] ${title}`;
    }
  }
  
  return title;
};
