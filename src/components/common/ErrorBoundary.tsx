import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-boundary-fallback" style={{
          padding: '2rem',
          margin: '1rem',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: '12px',
          color: '#ef4444',
          textAlign: 'center'
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '3rem', marginBottom: '1rem' }}>error</span>
          <h3>Component Rendering Failed</h3>
          <p>{this.state.error?.message}</p>
          <button 
            onClick={() => this.setState({ hasError: false })}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Retry Render
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
