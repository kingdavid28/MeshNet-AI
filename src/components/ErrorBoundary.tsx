import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0B1D3A',
          color: '#E8EEF7',
          padding: '20px',
          textAlign: 'center'
        }}>
          <h1 style={{ color: '#F97316', marginBottom: '20px' }}>Something went wrong</h1>
          <p style={{ color: '#7B9CC4', marginBottom: '20px' }}>
            The app encountered an error and couldn't start properly.
          </p>
          {this.state.error && (
            <details style={{ 
              background: '#0F172A', 
              padding: '15px', 
              borderRadius: '8px',
              textAlign: 'left',
              maxWidth: '500px',
              fontSize: '12px',
              color: '#94A3B8'
            }}>
              <summary style={{ cursor: 'pointer', color: '#E8EEF7', marginBottom: '10px' }}>
                Error details
              </summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '12px 24px',
              background: '#F97316',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
