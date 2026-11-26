import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Surface runtime errors on screen (instead of a blank blue screen) so we can
// debug crashes that happen in the render loop / async work, which React's
// error boundary alone can't catch.
function showFatalError(message: string) {
  let el = document.getElementById('fatal-error-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatal-error-overlay';
    el.style.cssText =
      'position:fixed;inset:0;z-index:99999;box-sizing:border-box;overflow:auto;' +
      'background:#22173a;color:#ffd9d9;padding:28px;font:14px/1.5 ui-monospace,monospace;' +
      'white-space:pre-wrap;word-break:break-word;';
    document.body.appendChild(el);
  }
  el.textContent = '⚠️ RUNTIME ERROR\n\n' + message;
}

window.addEventListener('error', (e) => {
  const msg = e.error && (e.error.stack || e.error.message) ? e.error.stack || e.error.message : String(e.message);
  showFatalError(String(msg));
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  showFatalError(String((r && (r.stack || r.message)) || r));
});

interface ErrorBoundaryProps {
  children: React.ReactNode;
}
interface ErrorBoundaryState {
  error: Error | null;
}
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    showFatalError((error.stack || error.message) + '\n\n' + (info.componentStack || ''));
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#22173a',
            color: '#ffd9d9',
            padding: 28,
            font: '14px/1.5 monospace',
            whiteSpace: 'pre-wrap',
            overflow: 'auto',
            zIndex: 99999,
          }}
        >
          <strong>⚠️ React render error</strong>
          <pre style={{ marginTop: 12 }}>{this.state.error.stack || this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
