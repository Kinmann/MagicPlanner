import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import CreateProjectModal from '../components/Project/CreateProjectModal';
import './Dashboard.scss';

interface Project {
  project_id: string;
  project_name: string;
  pipeline_execution_mode: string;
  raw_input_text: string;
  created_at: string;
}

interface DashboardProps {
  onSelectProject: (projectId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onSelectProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProjects = async () => {
    try {
      const list = await invoke<Project[]>('list_projects');
      setProjects(list);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateSuccess = (projectId: string) => {
    fetchProjects();
    onSelectProject(projectId);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-inner">
        <header className="dashboard-header">
          <div>
            <h1>대시보드</h1>
            <p>현재 보관된 모든 기획 프로젝트를 한눈에 관리하세요.</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="create-btn"
          >
            <div className="btn-content">
              <span className="plus">+</span> 새로운 프로젝트 시작
            </div>
          </button>
        </header>

        {isLoading ? (
          <div className="loader-container">
            <div className="spinner" />
          </div>
        ) : projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="empty-state"
          >
            <div className="icon">📂</div>
            <h3>아직 생성된 프로젝트가 없습니다</h3>
            <p>새로운 첫 번째 기획 프로젝트를 만들어보세요!</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="setup-btn"
            >
              새 프로젝트 생성하기
            </button>
          </motion.div>
        ) : (
          <div className="project-grid">
            {projects.map((project, idx) => (
              <motion.div
                key={project.project_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                whileHover={{ y: -5 }}
                onClick={() => onSelectProject(project.project_id)}
                className="project-card"
              >
                <div className="card-header">
                  <div className={`mode-badge ${project.pipeline_execution_mode === 'AUTO' ? 'auto' : 'manual'}`}>
                    {project.pipeline_execution_mode} MODE
                  </div>
                  <span className="date">
                    {new Date(project.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h3>{project.project_name}</h3>
                <p>{project.raw_input_text}</p>
                <div className="card-footer">
                  <div className="dots">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                       <div key={i} className="dot" />
                    ))}
                  </div>
                  <span className="open-link">
                    워크스페이스 열기 →
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <CreateProjectModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleCreateSuccess}
        />
      </div>
    </div>
  );
};

export default Dashboard;
