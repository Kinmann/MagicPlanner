
import { invoke } from '@tauri-apps/api/tauri';

async function checkArchived() {
  try {
    const projects = await invoke('list_projects');
    console.log("Projects:", projects);
    if (projects.length > 0) {
      const nodes = await invoke('get_project_nodes', { projectId: projects[0].project_id });
      for (const node of nodes) {
        const archived = await invoke('get_archived_iterations', { nodeId: node.node_id });
        if (archived.length > 0) {
          console.log(`Node ${node.node_id} (${node.target_node_type}) has ${archived.length} archived iterations.`);
        }
        
        const active = await invoke('get_node_iterations', { nodeId: node.node_id });
        console.log(`Node ${node.node_id} (${node.target_node_type}) has ${active.length} active iterations.`);
      }
    }
  } catch (e) {
    console.error(e);
  }
}

checkArchived();
