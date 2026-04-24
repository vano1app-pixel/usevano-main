import { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';

// Mirrors ErrorBoundary.tsx's transient list. These are DOM reconciliation
// races that surface on fast route changes (framer-motion reaching into a
// fiber React already unmounted). We silently recover on the next tick so
// the user never sees a fallback flash between pages.
function isTransientDomError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('removechild') ||
    m.includes('insertbefore') ||
    m.includes('the node to be removed') ||
    m.includes('the node before which the new node is to be inserted') ||
    m.includes("reading 'removechild'") ||
    m.includes("reading 'insertbefore'") ||
    m.includes("reading 'nextsibling'") ||
    m.includes("reading 'add'") ||
    m.includes("reading 'remove'") ||
    m.includes("reading 'parentnode'") ||
    m.includes("reading 'contains'")
  );
}

interface Props {
  children: ReactNode;
  /** Changes when the route changes — used to auto-reset on navigation. */
  routeKey?: string;
}

interface State {
  hasError: boolean;
  message: string;
  transient: boolean;
}

/**
 * Page-scoped error boundary. Lives inside Routes so a crash on one page
 * doesn't nuke the navbar + bottom nav the way the top-level ErrorBoundary
 * would. Compact fallback leaves the app chrome intact; auto-resets when
 * the user navigates to a different route.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  private recoveryTimer: number | null = null;

  state: State = { hasError: false, message: '', transient: false };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, message, transient: isTransientDomError(message) };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    if (this.state.transient) {
      this.recoveryTimer = window.setTimeout(() => {
        this.setState({ hasError: false, message: '', transient: false });
      }, 50);
      return;
    }
    console.error('[RouteErrorBoundary]', error, info.componentStack);
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
      tags: { source: 'RouteErrorBoundary' },
    });
  }

  componentDidUpdate(prev: Props) {
    if (prev.routeKey !== this.props.routeKey && this.state.hasError && !this.state.transient) {
      this.setState({ hasError: false, message: '', transient: false });
    }
  }

  componentWillUnmount() {
    if (this.recoveryTimer != null) {
      window.clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: '', transient: false });
  };

  render() {
    if (this.state.hasError && !this.state.transient) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-2xl font-bold text-foreground">Something went wrong on this page</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {this.state.message || 'Try again, or use the nav to go somewhere else.'}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
