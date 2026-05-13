import React from 'react';
import styles from './DataDisplay.module.scss';

// Table Components
export const Table: React.FC<React.HTMLAttributes<HTMLTableElement>> = ({ children, className = '', ...props }) => (
  <div className={styles.tableWrapper}>
    <table className={`${styles.table} ${className}`} {...props}>{children}</table>
  </div>
);

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ children, className = '', ...props }) => (
  <thead className={`${styles.tableHeader} ${className}`} {...props}>{children}</thead>
);

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ children, className = '', ...props }) => (
  <tbody className={`${styles.tableBody} ${className}`} {...props}>{children}</tbody>
);

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ children, className = '', ...props }) => (
  <tr className={`${styles.tableRow} ${className}`} {...props}>{children}</tr>
);

export const TableHead: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ children, className = '', ...props }) => (
  <th className={`${styles.tableHead} ${className}`} {...props}>{children}</th>
);

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ children, className = '', ...props }) => (
  <td className={`${styles.tableCell} ${className}`} {...props}>{children}</td>
);

// Skeleton Component
export const Skeleton: React.FC<{ width?: string | number, height?: string | number, circle?: boolean, className?: string }> = ({ 
  width, height, circle, className = '' 
}) => {
  return (
    <div 
      className={`${styles.skeleton} ${circle ? styles.circle : ''} ${className}`}
      style={{ width, height }}
    />
  );
};
