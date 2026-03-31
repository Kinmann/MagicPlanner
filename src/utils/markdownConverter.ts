import { DocumentNode } from '../types/project';

/**
 * JSON 형식의 기획서 데이터를 예쁜 마크다운 형식으로 변환합니다.
 */
export const convertToMarkdown = (node: DocumentNode, jsonContent: string): string => {
  let data: any;
  try {
    // Markdown 블록 제거 (Gemini가 포함했을 경우)
    const cleanJson = jsonContent.replace(/```json/g, '').replace(/```/g, '').trim();
    data = JSON.parse(cleanJson);
  } catch (e) {
    return `# ${node.target_node_type}\n\n오류: JSON 파싱에 실패했습니다.\n\n${jsonContent}`;
  }

  let markdown = `# ${node.target_node_type}: ${data.title || data.project_name || node.target_node_type}\n\n`;
  markdown += `* **프로젝트 ID:** ${node.project_id}\n`;
  markdown += `* **작성 일시:** ${new Date().toLocaleString()}\n`;
  markdown += `* **품질 점수:** ${node.current_best_score} / 100\n\n---\n\n`;

  // 도메인 타입별 커스텀 렌더링
  switch (node.target_node_type) {
    case 'PRD':
      markdown += renderPRD(data);
      break;
    case 'FSD':
      markdown += renderFSD(data);
      break;
    case 'User Flow':
      markdown += renderUserFlow(data);
      break;
    case 'IA':
      markdown += renderIA(data);
      break;
    case 'ERD':
      markdown += renderERD(data);
      break;
    case 'API_Spec':
      markdown += renderAPI(data);
      break;
    case 'Wireframe':
      markdown += renderWireframe(data);
      break;
    case 'TC':
      markdown += renderTC(data);
      break;
    default:
      markdown += renderGeneric(data);
  }

  return markdown;
};

const renderPRD = (data: any) => {
  let md = `## 1. 개요 (Overview)\n`;
  if (data.overview) {
    md += `- **문제 정의 (Problem):** ${data.overview.problem_statement || ''}\n`;
    md += `- **해결 비전 (Vision):** ${data.overview.solution_vision || ''}\n`;
    md += `- **타겟 사용자 (Audience):** ${data.overview.target_audience || ''}\n\n`;
  } else {
    md += `(개요 정보 없음)\n\n`;
  }
  
  md += `## 2. 목표 (Goals)\n${data.goals?.map((g: any) => `- ${g}`).join('\n') || '(목표 정보 없음)'}\n\n`;
  
  md += `## 3. 핵심 기능 (Core Features)\n${data.core_features?.map((f: any) => `### ${f.feature_name || '기능명 없음'} [${f.priority || '-'}]\n- ${f.description || ''}`).join('\n\n') || '(주요 기능 없음)'}\n\n`;
  
  if (data.user_stories && data.user_stories.length > 0) {
    md += `## 4. 유저 스토리 (User Stories)\n${data.user_stories.map((s: string) => `- ${s}`).join('\n')}\n\n`;
  }
  
  if (data.constraints && data.constraints.length > 0) {
    md += `## 5. 제약 사항 (Constraints)\n${data.constraints.map((c: string) => `- ${c}`).join('\n')}\n\n`;
  }
  
  return md;
};

const renderFSD = (data: any) => {
  let md = `## 1. 기능 요구사항 (Functional Requirements)\n\n`;
  data.features?.forEach((f: any) => {
    md += `### [${f.func_id || 'ID 없음'}] ${f.summary || f.module || '기능명 없음'}\n`;
    md += `- **모듈:** ${f.module || ''}\n`;
    md += `- **설명:** ${f.description || ''}\n`;
    md += `- **사전 조건:** ${f.pre_condition || '없음'}\n`;
    md += `- **사후 조건:** ${f.post_condition || '없음'}\n`;
    
    if (f.flow && f.flow.length > 0) md += `- **기본 흐름(Flow):**\n${f.flow.map((s: string, i: number) => `  ${i+1}. ${s}`).join('\n')}\n`;
    if (f.exception_flow && f.exception_flow.length > 0) md += `- **예외 흐름:**\n${f.exception_flow.map((s: string) => `  - ${s}`).join('\n')}\n`;
    if (f.data_requirements && f.data_requirements.length > 0) md += `- **데이터 요구사항:**\n${f.data_requirements.map((s: string) => `  - ${s}`).join('\n')}\n`;
    md += `\n`;
  });
  return md;
};

const renderERD = (data: any) => {
  let md = `## 1. 데이터베이스 스키마 (Tables)\n\n`;
  data.tables?.forEach((t: any) => {
    md += `### Table: ${t.table_name || t.name}\n`;
    md += `| 필드명 | 타입 | PK | FK | 참조 테이블 | NNN(Not Null) | UQ(Unique) | 설명 |\n`;
    md += `| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
    t.columns?.forEach((c: any) => {
      md += `| ${c.name || ''} | ${c.type || ''} | ${c.is_pk ? 'O' : ''} | ${c.is_fk ? 'O' : ''} | ${c.ref_table || ''} | ${c.is_nullable === false ? 'O' : ''} | ${c.is_unique ? 'O' : ''} | ${c.description || ''} |\n`;
    });
    md += `\n`;
  });
  if (data.relationships && data.relationships.length > 0) {
    md += `## 2. 관계성 (Relationships)\n`;
    data.relationships.forEach((r: any) => {
      md += `- **${r.source_table} <-> ${r.target_table}** [${r.type}]: ${r.description || ''}\n`;
    });
    md += `\n`;
  }
  return md;
};

const renderTC = (data: any) => {
  let md = `## 1. 테스트 케이스 (Test Cases)\n\n`;
  data.test_cases?.forEach((tc: any) => {
    md += `### [${tc.tc_id || tc.mapped_func_id || '-'}] ${tc.title || '테스트'}\n`;
    md += `- **유형:** ${tc.tc_type || 'Positive'}\n`;
    md += `- **관련 기능 ID:** ${tc.mapped_func_id || '없음'}\n`;
    if (tc.pre_conditions && tc.pre_conditions.length > 0) {
      md += `- **사전 조건:** ${tc.pre_conditions.join(', ')}\n`;
    }
    if (tc.test_steps && tc.test_steps.length > 0) {
      md += `- **테스트 절차:**\n${tc.test_steps.map((s: string, i: number) => `  ${i+1}. ${s}`).join('\n')}\n`;
    }
    md += `- **기대 결과:** ${tc.expected_result || ''}\n\n`;
  });
  return md;
};

const renderAPI = (data: any) => {
  let md = `## 1. API 명세서 (API Specification)\n\n`;
  data.endpoints?.forEach((ep: any) => {
    md += `### [${ep.method || 'GET'}] ${ep.path || '/'}\n`;
    md += `- **요약:** ${ep.summary || ''}\n`;
    md += `- **설명:** ${ep.description || ''}\n`;
    
    // Request Body
    if (ep.request_body && Object.keys(ep.request_body).length > 0) {
      md += `- **Request Body:** \n\`\`\`json\n${JSON.stringify(ep.request_body, null, 2)}\n\`\`\`\n`;
    } else {
      md += `- **Request Body:** 없음\n`;
    }
    
    // Responses
    if (ep.responses && ep.responses.length > 0) {
      md += `- **Responses:**\n`;
      ep.responses.forEach((res: any) => {
        md += `  - **[${res.status_code || 200}]** ${res.description || ''}\n`;
        if (res.schema && Object.keys(res.schema).length > 0) {
          md += `    \`\`\`json\n${JSON.stringify(res.schema, null, 2).split('\n').map(l => '    ' + l).join('\n')}\n    \`\`\`\n`;
        }
      });
    }
    md += `\n`;
  });
  return md;
};

const renderUserFlow = (data: any) => {
  let md = `## 1. 노드 (Nodes)\n\n`;
  data.nodes?.forEach((f: any) => {
    md += `### [${f.id}] ${f.label || f.step || ''} (${f.type || 'Action'})\n`;
    md += `- **주체(Actor):** ${f.actor || 'User'}\n`;
    if (f.system_response) md += `- **시스템 응답:** ${f.system_response}\n`;
    if (f.mapped_func_ids && f.mapped_func_ids.length > 0) md += `- **관련 기능:** ${f.mapped_func_ids.join(', ')}\n`;
    md += `\n`;
  });
  
  if (data.edges && data.edges.length > 0) {
    md += `## 2. 시퀀스 흐름 (Edges)\n\n`;
    data.edges.forEach((e: any) => {
      md += `- **${e.from_id}** ➔ **${e.to_id}** (조건: ${e.condition || '기본 흐름'})\n`;
    });
    md += `\n`;
  }
  return md;
};

const renderIA = (data: any) => {
  let md = `## 1. 정보 구조 계층도 (Hierarchy)\n\n`;
  
  // Depth를 기반으로 트리 형태로 출력
  const sortedHierarchy = [...(data.hierarchy || [])].sort((a: any, b: any) => (a.depth || 0) - (b.depth || 0));
  sortedHierarchy.forEach((item: any) => {
    let indent = '  '.repeat(item.depth ? item.depth - 1 : 0);
    md += `${indent}- **[${item.screen_id || ''}] ${item.title || ''}** (Actor: ${item.actor || 'All'}, Path: ${item.path || ''})\n`;
  });
  md += `\n`;

  if (data.screen_elements && data.screen_elements.length > 0) {
    md += `## 2. 화면별 요소 명세서 (Screen Elements)\n\n`;
    data.screen_elements.forEach((screen: any) => {
      md += `### Screen ID: ${screen.screen_id}\n`;
      screen.elements?.forEach((el: any) => {
        md += `- [${el.type || '요소'}] **${el.label || ''}** (매핑 기능: ${el.mapped_func_id || '없음'})\n`;
      });
      md += `\n`;
    });
  }
  return md;
};

const renderWireframe = (data: any) => {
  let md = `## 1. 화면 설계 매핑 (Screens)\n\n`;
  data.screens?.forEach((s: any) => {
    md += `### [${s.screen_id || '-'}] ${s.screen_name || '화면'}\n\n`;
    s.layout_regions?.forEach((region: any) => {
      md += `#### 영역: ${region.region_name || '레이아웃'}\n`;
      region.components?.forEach((c: any) => {
        md += `- [${c.type || 'UI'}] **${c.label || ''}** (${c.description || ''})\n`;
        if (c.state_condition) md += `  - 노출 조건: ${c.state_condition}\n`;
        if (c.mapped_func_id) md += `  - 매핑 기능: ${c.mapped_func_id}\n`;
      });
      md += `\n`;
    });
  });
  return md;
};

const renderGeneric = (data: any) => {
  return `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
};
