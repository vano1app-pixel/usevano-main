import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

// Recoverable DOM-race errors (browser extensions, AnimatePresence races).
// applyDomSafeguards() in main.tsx catches these at the source, but we
// belt-and-suspenders here: if one still slips through, auto-retry once
// rather than crashing the user onto the fallback screen.
function isRecoverableDomError(message: string): boolean {
  return (
    /removeChild/i.test(message) ||
    /insertBefore/i.test(message) ||
    /The node to be removed is not a child of this node/i.test(message)
  );
}

export class ErrorBoundary extends Component<Props, State> {
  private autoRetried = false;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ErrorBoundary]', error, info.componentStack);

    // Transient DOM race — reset state once to re-render. If it happens
    // again on the retry, the fallback UI will show.
    if (!this.autoRetried && isRecoverableDomError(message)) {
      this.autoRetried = true;
      // Defer to the next microtask so the bad DOM state has a chance to settle.
      queueMicrotask(() => {
        this.setState({ hasError: false, message: '' });
      });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
    window.location.href = '/';
  };

  goTo = (path: string) => {
    // Reset state before navigating so the user doesn't stay stuck in the boundary.
    this.setState({ hasError: false, message: '' });
    window.location.href = path;
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center">
          <p className="text-4xl font-bold text-foreground">Something went wrong</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {this.state.message || 'An unexpected error occurred. Refresh the page or go back home.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to home
          </button>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-muted-foreground">or</span>
            <button
              type="button"
              onClick={() => this.goTo('/students')}
              className="rounded-lg px-3 py-1.5 font-medium text-primary hover:bg-primary/5"
            >
              Browse freelancers
            </button>
            <span className="text-muted-foreground/50">·</span>
            <button
              type="button"
              onClick={() => this.goTo('/hire')}
              className="rounded-lg px-3 py-1.5 font-medium text-primary hover:bg-primary/5"
            >
              Hire someone
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
