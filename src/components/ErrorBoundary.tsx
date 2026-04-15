import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  /** True for transient DOM reconciliation errors we can silently recover from. */
  transient: boolean;
}

/**
 * Matches the class of errors that happen when React's reconciler and some
 * other DOM-mutating system (Framer Motion exit animations, react-helmet-async,
 * browser auto-translate) race over the same node. These are transient: the
 * next render cycle succeeds because the offending node has already been
 * detached by whichever system won the race. We recover silently instead of
 * blowing up the whole app with the "Something went wrong" screen.
 */
function isTransientDomError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('removechild') ||
    m.includes('insertbefore') ||
    m.includes('the node to be removed') ||
    m.includes('the node before which the new node is to be inserted') ||
    m.includes("reading 'removechild'") ||
    m.includes("reading 'insertbefore'") ||
    m.includes("reading 'nextsibling'")
  );
}

export class ErrorBoundary extends Component<Props, State> {
  private transientRecoveryTimer: number | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '', transient: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, message, transient: isTransientDomError(message) };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    if (this.state.transient) {
      // Don't surface the error UI — log and reset on the next tick so React
      // finishes the crashed commit before we re-render.
      console.warn('[ErrorBoundary] transient DOM error recovered', error);
      this.transientRecoveryTimer = window.setTimeout(() => {
        this.setState({ hasError: false, message: '', transient: false });
      }, 50);
      return;
    }
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentWillUnmount() {
    if (this.transientRecoveryTimer != null) {
      window.clearTimeout(this.transientRecoveryTimer);
      this.transientRecoveryTimer = null;
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '', transient: false });
    window.location.href = '/';
  };

  goTo = (path: string) => {
    // Reset state before navigating so the user doesn't stay stuck in the boundary.
    this.setState({ hasError: false, message: '', transient: false });
    window.location.href = path;
  };

  render() {
    // Transient errors: render children normally on the recovery tick — the
    // crashed commit has been replaced by whichever DOM mutator won.
    if (this.state.hasError && !this.state.transient) {
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
