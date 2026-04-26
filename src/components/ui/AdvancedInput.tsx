import React from 'react';
import styles from './Form.module.scss';

// RadioGroup Component
export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

export interface RadioGroupProps {
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({ 
  options, 
  value, 
  onChange, 
  label, 
  className = '' 
}) => {
  return (
    <div className={`${styles.selectWrapper} ${className}`}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.radioGroup}>
        {options.map(opt => (
          <div 
            key={opt.value} 
            className={`${styles.radioItem} ${value === opt.value ? styles.active : ''}`}
            onClick={() => onChange(opt.value)}
          >
            <div className={styles.radioCircle}>
              <div className={styles.radioInner} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{opt.label}</span>
              {opt.description && <span className="text-xs opacity-50">{opt.description}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Slider Component
export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  className = ''
}) => {
  return (
    <div className={`${styles.sliderWrapper} ${className}`}>
      {label && (
        <div className="flex justify-between items-center mb-2">
          <span className={styles.label}>{label}</span>
          <span className="text-xs font-mono font-bold text-primary">{value}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.slider}
      />
    </div>
  );
};
