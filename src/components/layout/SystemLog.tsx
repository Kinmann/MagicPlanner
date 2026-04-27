import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Terminal, Trash2, MousePointer2, Copy, Search } from 'lucide-react';
import { useLogStore } from '../../store/logStore';
import styles from './SystemLog.module.scss';

export const SystemLog: React.FC = () => {
  const { logs, clearLogs } = useLogStore();
  const logEndRef = useRef<HTMLDivElement>(null);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState(true);

  // 자동 스크롤 로직
  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      return filterLevel === 'ALL' || log.level === filterLevel;
    });
  }, [logs, filterLevel]);


  const copyToClipboard = () => {
    const text = filteredLogs.map(l => `[${l.time}] [${l.level}] ${l.projectName ? `[${l.projectName}]` : ''} ${l.nodeType ? `[${l.nodeType}]` : ''} ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  return (
    <div className={styles.systemLog}>
      <div className={styles.header}>
        <div className={styles.leftSection}>
          <div className={styles.title}>
            <Terminal size={14} />
            <span>Output</span>
          </div>
          
          <div className={styles.filters}>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Level:</span>
              {['ALL', 'INFO', 'SUCCESS', 'WARN', 'ERROR'].map(level => (
                <button
                  key={level}
                  className={`${styles.filterBtn} ${filterLevel === level ? styles.active : ''}`}
                  onClick={() => setFilterLevel(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button 
            className={`${styles.actionBtn} ${autoScroll ? styles.active : ''}`} 
            onClick={() => setAutoScroll(!autoScroll)}
            title="Auto-scroll"
          >
            <MousePointer2 size={14} />
          </button>
          <button className={styles.actionBtn} onClick={copyToClipboard} title="Copy all logs">
            <Copy size={14} />
          </button>
          <button className={styles.actionBtn} onClick={clearLogs} title="Clear logs">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className={styles.logContainer}>
        {filteredLogs.map((log, index) => {
          const showDateSeparator = index === 0 || log.date !== filteredLogs[index - 1].date;
          
          return (
            <React.Fragment key={log.id}>
              {showDateSeparator && (
                <div className={styles.dateSeparator}>
                  {log.date}
                </div>
              )}
              <div className={styles.logLine}>
                <span className={styles.time}>{log.time}</span>
                <div className={styles.badges}>
                  <span className={`${styles.badge} ${styles.levelBadge} ${styles[log.level.toLowerCase()]}`}>
                    {log.level}
                  </span>
                  {log.projectName && (
                    <span className={`${styles.badge} ${styles.projectName}`}>
                      {log.projectName}
                    </span>
                  )}
                  {log.nodeType && (
                    <span className={`${styles.badge} ${styles.nodeType}`}>
                      {log.nodeType}
                    </span>
                  )}
                </div>
                <span className={styles.message}>{log.message}</span>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};
