import React, { useEffect, useState } from 'react';
import { ExternalLink, AlertTriangle, X, Copy, Check } from 'lucide-react';
import {
  detectInAppBrowser,
  IN_APP_BROWSER_LABEL,
  openInExternalBrowser,
  copyCurrentUrl,
} from '@/lib/inAppBrowser';

/**
 * Sticky top-of-page banner shown when the user is in an embedded in-app
 * browser (Instagram, Fiverr, TikTok, etc). Google OAuth is blocked in those
 * browsers with a 403 "disallowed_useragent" page, so we warn them before
 * they press Sign-in with Google.
 *
 * Self-gating: renders null on any real browser.
 * Session-dismissible so it doesn't nag a user who ignored it once, but
 * re-appears on a fresh tab so the signal isn't permanently lost.
 */
const DISMISS_KEY = 'vano_iab_dismissed';

export const InAppBrowserBanner: React.FC = () => {
  // `undefined` = not yet checked (SSR / first paint), keeps us from flashing
  // the banner before detection runs.
  const [browser, setBrowser] = useState<ReturnType<typeof detectInAppBrowser> | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setBrowser(detectInAppBrowser());
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') setDismissed(true);
    } catch {
      /* ignore — session storage blocked by privacy mode */
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const onCopy = async () => {
    const ok = await copyCurrentUrl();
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  if (!browser || dismissed) return null;
  const appLabel = IN_APP_BROWSER_LABEL[browser];

  return (
    <div
      role="alert"
      className="sticky top-0 z-[60] w-full border-b border-amber-500/40 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-start gap-2 px-3 py-2 sm:items-center sm:px-4">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300 sm:mt-0" aria-hidden="true" />
        <div className="flex-1 min-w-0 text-xs sm:text-sm leading-snug">
          <p>
            <span className="font-semibold">Opened in {appLabel} browser.</span>{' '}
            Sign-in with Google won&apos;t work here — open this page in Safari or Chrome to continue.
          </p>
          <p className="mt-0.5 text-[10.5px] sm:text-[11px] opacity-75">
            If the button doesn&apos;t work, tap <span className="font-mono">⋯</span> in {appLabel} and choose
            &ldquo;Open in Safari&rdquo; / &ldquo;Open in Chrome&rdquo;.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={openInExternalBrowser}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 active:scale-[0.97]"
          >
            <ExternalLink size={12} strokeWidth={2.5} />
            Open in browser
          </button>
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy page URL"
            className="inline-flex items-center justify-center rounded-lg border border-amber-600/30 bg-white/50 p-1.5 text-amber-900 transition-colors hover:bg-white dark:bg-amber-950/30 dark:text-amber-100"
          >
            {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2} />}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss warning"
            className="inline-flex items-center justify-center rounded-lg p-1.5 text-amber-900/70 transition-colors hover:bg-white/60 hover:text-amber-900 dark:text-amber-100/70 dark:hover:bg-amber-950/40"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
};
