import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  override componentDidCatch(error: Error): void {
    console.error('[ui]', error);
  }
  override render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-md p-8 text-center">
          <h1 className="mb-2 text-xl font-bold">Something broke</h1>
          <p className="mb-4 text-sm opacity-70">{this.state.error.message}</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
