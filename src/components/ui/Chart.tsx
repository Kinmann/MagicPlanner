import React from 'react';
import styles from './Chart.module.scss';

export interface ChartDataPoint {
  x: number | string;
  y: number;
}

export interface LineChartProps {
  data: ChartDataPoint[];
  height?: number;
  width?: string | number;
  color?: string;
  showPoints?: boolean;
}

export const LineChart: React.FC<LineChartProps> = ({ 
  data, 
  height = 100, 
  width = '100%',
  color = '#10b981',
  showPoints = true
}) => {
  if (!data || data.length === 0) return <div className={styles.empty}>No data available</div>;

  const minVal = 0; // Fixed min for score usually
  const maxVal = Math.max(...data.map(d => d.y), 100);
  const range = maxVal - minVal;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((d.y - minVal) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className={styles.chartWrapper} style={{ height, width }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.svg}>
        {/* Grid Lines (Simple) */}
        <line x1="0" y1="25" x2="100" y2="25" className={styles.gridLine} />
        <line x1="0" y1="50" x2="100" y2="50" className={styles.gridLine} />
        <line x1="0" y1="75" x2="100" y2="75" className={styles.gridLine} />

        {/* The Line */}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          points={points}
          vectorEffect="non-scaling-stroke"
          className={styles.line}
        />

        {/* Gradient Fill */}
        <path
          d={`M ${points} V 100 H 0 Z`}
          className={styles.fill}
          style={{ fill: `url(#gradient-${color.replace('#','')})` }}
        />

        <defs>
          <linearGradient id={`gradient-${color.replace('#','')}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {showPoints && (
        <div className={styles.pointsOverlay}>
          {data.map((d, i) => (
            <div 
              key={i} 
              className={styles.point} 
              style={{ 
                left: `${(i / (data.length - 1)) * 100}%`,
                bottom: `${((d.y - minVal) / range) * 100}%`,
                backgroundColor: color
              }}
              title={`Score: ${d.y.toFixed(1)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
