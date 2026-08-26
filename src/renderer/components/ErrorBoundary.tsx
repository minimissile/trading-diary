import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer]', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="renderer-fatal">
          <h1>界面加载失败</h1>
          <p>{this.state.error.message}</p>
          <pre>{this.state.error.stack}</pre>
        </main>
      );
    }

    return this.props.children;
  }
}
