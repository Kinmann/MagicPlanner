import React from 'react';
import './Input.scss';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: string;
  error?: string;
  helperText?: string;
}

const Input: React.FC<InputProps> = ({
  label,
  icon,
  error,
  helperText,
  className = '',
  id,
  type = 'text',
  ...props
}) => {
  const containerClassNames = [
    'input-field',
    error ? 'is-error' : '',
    icon ? 'has-icon' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClassNames}>
      {label && (
        <label className="input-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="input-field__wrapper">
        {icon && (
          <span className="input-field__icon material-symbols-outlined">
            {icon}
          </span>
        )}
        <input 
          className="input-field__control" 
          id={id} 
          type={type}
          {...props} 
        />
        <div className="input-field__outline"></div>
      </div>
      {(error || helperText) && (
        <p className="input-field__helper-text">
          {error || helperText}
        </p>
      )}
    </div>
  );
};

export default Input;
