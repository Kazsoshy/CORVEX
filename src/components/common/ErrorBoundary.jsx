import React from 'react';
import { FailureContext } from '../../context/FailureContext';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (this.context && this.context.logFailure) {
      this.context.logFailure({
        module: window.location.pathname,
        status: 'Failed',
        type: 'React Component Crash',
        service: 'Frontend Rendering',
        cause: error.message,
        logs: error.stack,
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', background: '#fef2f2', border: '1px solid #f87171', borderRadius: '8px', margin: '20px' }}>
          <h2 style={{ color: '#b91c1c', marginTop: 0 }}>Module Failed to Load</h2>
          <p style={{ color: '#991b1b', marginBottom: '16px' }}>The frontend application encountered an unexpected error while rendering this module.</p>
          <pre style={{ background: '#7f1d1d', color: '#fca5a5', padding: '12px', borderRadius: '4px', overflowX: 'auto', fontSize: '0.85rem' }}>
            {this.state.error && this.state.error.toString()}
          </pre>
          <button 
            type="button" 
            className="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{ marginTop: '16px' }}
          >
            Reload Module
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Since ErrorBoundary needs to use Context, we can hook it up this way:
ErrorBoundary.contextType = FailureContext;
