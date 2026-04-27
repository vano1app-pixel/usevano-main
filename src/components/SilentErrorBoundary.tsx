import { Component, type ReactNode } from 'react';
import { captureException } from '@/lib/observability';

interface Props {
  children: ReactNode;
  /** Tag forwarded to Sentry to identify which subtree failed. */
  source: string;
}

interface State {
  hasError: boolean;
}

/**
 * Renders nothing if the wrapped subtree throws — used to isolate
 * non-critical "ambient" UI (the mobile bottom nav, floating WhatsApp
 * button, cookie / PWA banners, redirect helpers) so a single broken
 * widget can't bubble up to the global ErrorBoundary and replace the
 * whole app with the "Something went wrong" screen.
 *
 * The error is still reported to Sentry with a `source` tag so we can
 * find and fix the underlying bug, but the user keeps a working page.
 *
 * Use sparingly: anything that's actually load-bearing (the Routes
 * tree, auth state, etc.) belongs in RouteErrorBoundary or the
 * top-level ErrorBoundary, where the user gets a visible recovery.
 */
export class SilentErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    captureException(error, {
      extra: { componentStack: info.componentStack },
      tags: { source: this.props.source },
    });
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
