import { Component, type ReactNode } from 'react';
import { captureException } from '@/lib/observability';
import { isChunkLoadError } from '@/lib/lazyWithRetry';

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
  /** True when the error came from a stale lazy chunk after a deploy. */
  staleChunk: boolean;
}

/**
 * Page-scoped error boundary. Lives inside Routes so a crash on one page
 * doesn't nuke the navbar + bottom nav the way the top-level ErrorBoundary
 * would. Compact fallback leaves the app chrome intact; auto-resets when
 * the user navigates to a different route.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  private recoveryTimer: number | null = null;

  state: State = { hasError: false, message: '', transient: false, staleChunk: false };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return {
      hasError: true,
      message,
      transient: isTransientDomError(message),
      // Stale chunk errors should generally be recovered by lazyWithRetry,
      // but keep a separate signal so the fallback can offer a tailored
      // "new version" message instead of the generic crash card.
      staleChunk: isChunkLoadError(error),
    };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    if (this.state.transient) {
      this.recoveryTimer = window.setTimeout(() => {
        this.setState({ hasError: false, message: '', transient: false, staleChunk: false });
      }, 50);
      return;
    }
    console.error('[RouteErrorBoundary]', error, info.componentStack);
    captureException(error, {
      extra: { componentStack: info.componentStack },
      tags: { source: 'RouteErrorBoundary', kind: this.state.staleChunk ? 'stale_chunk' : 'crash' },
    });
  }

  componentDidUpdate(prev: Props) {
    if (prev.routeKey !== this.props.routeKey && this.state.hasError && !this.state.transient) {
      this.setState({ hasError: false, message: '', transient: false, staleChunk: false });
    }
  }

  componentWillUnmount() {
    if (this.recoveryTimer != null) {
      window.clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  handleReload = () => {
    // Hard reload: most page-level crashes are caused by a stale
    // chunk (post-deploy) or a bad SDK state, both of which fix
    // themselves on a fresh JS download.
    window.location.reload();
  };

  render() {
    // Non-transient page-level errors used to render nothing (blank
    // area below the navbar). Sentry got the report but the user got
    // no signal — they couldn't tell if the page was loading, dead,
    // or broken. Show a compact card with a reload action while
    // keeping the navbar + bottom nav intact. The routeKey auto-reset
    // (componentDidUpdate above) still recovers when they navigate.
    if (this.state.hasError && !this.state.transient) {
      const staleChunk = this.state.staleChunk;
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl">
            {staleChunk ? '✨' : '⚠️'}
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">
              {staleChunk ? 'A new version of Vano is ready' : 'This page hit a snag'}
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {staleChunk
                ? 'Tap reload to pick it up — your progress is saved.'
                : 'Something went wrong loading this view. Reload to try again, or use the menu to head somewhere else.'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {staleChunk ? 'Reload to update' : 'Reload page'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
