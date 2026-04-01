import React from 'react';
import './Spinner.scss';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'secondary' | 'error' | 'white';
  className?: string;
}

const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  variant = 'primary',
  className = ''
}) => {
  const classNames = [
    'spinner',
    `spinner--${size}`,
    `spinner--${variant}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classNames}>
      <span className="material-symbols-outlined animate-spin">
        progress_activity
      </span>
    </div>
  );
};

export default Spinner;
