import React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Button } from './Button';
import styles from './Navigation.module.scss';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({ 
  currentPage, 
  totalPages, 
  onPageChange,
  className = ''
}) => {
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 || 
      i === totalPages || 
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      pages.push(i);
    } else if (i === currentPage - 2 || i === currentPage + 2) {
      pages.push('...');
    }
  }

  const uniquePages = Array.from(new Set(pages));

  return (
    <nav className={`${styles.pagination} ${className}`} role="navigation" aria-label="pagination">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        leftIcon={<ChevronLeft size={16} />}
      >
        Previous
      </Button>

      <div className={styles.pageList}>
        {uniquePages.map((page, index) => (
          page === '...' ? (
            <div key={`dots-${index}`} className={styles.dots}>
              <MoreHorizontal size={14} />
            </div>
          ) : (
            <Button
              key={page}
              variant={currentPage === page ? 'primary' : 'ghost'}
              size="sm"
              className={styles.pageBtn}
              onClick={() => onPageChange(page as number)}
            >
              {page}
            </Button>
          )
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        rightIcon={<ChevronRight size={16} />}
      >
        Next
      </Button>
    </nav>
  );
};
