export interface NodeComment {
  comment_id: string;
  project_id: string;
  node_id: string;
  iteration_id: string;
  json_path: string;
  comment_text: string;
  author: string;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCommentParams {
  projectId: string;
  nodeId: string;
  iterationId: string;
  jsonPath: string;
  commentText: string;
}
