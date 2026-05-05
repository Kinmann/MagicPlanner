import React from 'react';
import { ListTodo, CheckCircle2, ShieldCheck, Activity, Terminal } from 'lucide-react';
import { CommentableRow } from '../../../ui/CommentableRow';
import styles from '../../GlobalRenderers.module.scss';

interface TcRendererProps {
  data: any;
  baseData?: any;
  nodeId?: string;
  currentIteration?: any;
}

const TcRenderer: React.FC<TcRendererProps> = ({ data, baseData, nodeId, currentIteration }) => {
  const testCases = data.test_cases || [];
  const baseTestCases = baseData?.test_cases || [];

  const renderTestCase = (tc: any, i: number, isStale = false, isRefined = false) => {
    const isNegative = tc.tc_type?.toLowerCase().includes('negative');
    
    return (
      <CommentableRow key={`${tc.tc_id}-${isStale ? 'stale' : 'refined'}`} nodeId={nodeId || ''} jsonPath={`$.test_cases[?(@.tc_id=='${tc.tc_id}')]`} currentIteration={currentIteration} blockId={tc.tc_id} isStale={isStale} isRefined={isRefined}>
        <article className={styles.epicItem} style={{ width: '100%' }}>
          {/* Test Case Header - GPRD Epic Style */}
          <h3 className={styles.epicHeader}>
            <span className={styles.epicId}>[{tc.tc_id}]</span>
            <span className={`${styles.epicTitle} ${styles.valueWrapper}`}>
              {tc.title}
            </span>
            <span className={`${styles.badge} ${isNegative ? styles['badge--secondary'] : styles['badge--primary']} ml-auto text-[10px] font-bold`}>
              {tc.tc_type}
            </span>
          </h3>
          
          <div className={styles.epicBody}>
            {/* Meta Tags: REQ & FUNC */}
            <div className={styles.epicTags}>
              {tc.mapped_req_id && (
                <span className={styles.epicTag}>
                  #{tc.mapped_req_id}
                </span>
              )}
              {tc.mapped_func_id && (
                <span className={styles.epicTag}>
                  #{tc.mapped_func_id}
                </span>
              )}
            </div>

            {/* Pre-conditions */}
            {tc.pre_conditions && tc.pre_conditions.length > 0 && (
              <div className={styles.criteriaSection}>
                <h4 className={styles.criteriaTitle}>
                  <ShieldCheck size={16} className="opacity-50" />
                  Pre-conditions
                </h4>
                <ul className={styles.criteriaList}>
                  {tc.pre_conditions.map((cond: string, j: number) => (
                    <CommentableRow key={j} nodeId={nodeId || ''} jsonPath={`$.test_cases[?(@.tc_id=='${tc.tc_id}')].pre_conditions[${j}]`} currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
                      <li className={styles.criteriaItem}>
                        <CheckCircle2 size={16} className={styles.checkIcon} />
                        <span className={styles.valueWrapper}>{cond}</span>
                      </li>
                    </CommentableRow>
                  ))}
                </ul>
              </div>
            )}

            {/* Test Steps */}
            {tc.test_steps && tc.test_steps.length > 0 && (
              <div className={styles.criteriaSection}>
                <h4 className={styles.criteriaTitle}>
                  <Activity size={16} className="opacity-50" />
                  Test Execution Steps
                </h4>
                <ul className={styles.criteriaList}>
                  {tc.test_steps.map((step: string, j: number) => (
                    <CommentableRow key={j} nodeId={nodeId || ''} jsonPath={`$.test_cases[?(@.tc_id=='${tc.tc_id}')].test_steps[${j}]`} currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
                      <li className={styles.criteriaItem}>
                        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold border border-primary/20 flex-shrink-0 mt-0.5">
                          {j + 1}
                        </div>
                        <span className={styles.valueWrapper}>{step}</span>
                      </li>
                    </CommentableRow>
                  ))}
                </ul>
              </div>
            )}

            {/* Expected Result */}
            <CommentableRow nodeId={nodeId || ''} jsonPath={`$.test_cases[?(@.tc_id=='${tc.tc_id}')].expected_result`} currentIteration={currentIteration} isStale={isStale} isRefined={isRefined}>
              <div className={styles.criteriaSection}>
                <h4 className={styles.criteriaTitle}>
                  <Terminal size={16} className="opacity-50" />
                  Expected Result
                </h4>
                <div className={styles.epicDesc} style={{ margin: 0, paddingBottom: 0 }}>
                  <span className={`${styles.valueWrapper} font-bold text-primary`}>
                    {tc.expected_result}
                  </span>
                </div>
              </div>
            </CommentableRow>
          </div>
        </article>
      </CommentableRow>
    );
  };

  const hasTestCasesChanged = baseData && JSON.stringify(baseTestCases) !== JSON.stringify(testCases);

  return (
    <div className={styles.epicActorContainer}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <ListTodo className={styles.icon} size={20} />
          Test Case Specification
        </h2>
        
        <div className={styles.epicList}>
          {testCases.length === 0 && baseTestCases.length === 0 && <div className={styles.emptyState}>No test cases defined</div>}
          {testCases.map((tc: any, i: number) => {
            const baseTc = baseTestCases.find((btc: any) => btc.tc_id === tc.tc_id);
            const hasChanged = baseTc && JSON.stringify(baseTc) !== JSON.stringify(tc);

            return (
              <React.Fragment key={tc.tc_id || i}>
                {hasChanged && renderTestCase(baseTc, i, true, false)}
                {renderTestCase(tc, i, false, !!baseTc && hasChanged)}
              </React.Fragment>
            );
          })}
          {/* Orphaned base test cases */}
          {baseTestCases
            .filter((btc: any) => !testCases.find((tc: any) => tc.tc_id === btc.tc_id))
            .map((tc: any, i: number) => renderTestCase(tc, i + testCases.length, true, false))
          }
        </div>
      </section>
    </div>
  );
};

export default TcRenderer;
