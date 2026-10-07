import { isTauri } from '@tauri-apps/api/core';
import * as Sentry from '@sentry/browser';
import { defaultOptions, makeRendererTransport, sendBreadcrumbToRust } from 'tauri-plugin-sentry-api';
import { scrubBreadcrumb, scrubEvent } from './js/web/scrub.js';

Sentry.init({
	...defaultOptions,
	environment: import.meta.env.MODE,
	release: import.meta.env.VITE_APP_VERSION,
	dsn: isTauri() ? defaultOptions.dsn : import.meta.env.VITE_SENTRY_DSN,
	integrations: (integrations) => {
		const base =
			typeof defaultOptions.integrations === 'function'
				? defaultOptions.integrations(integrations)
				: integrations;
		return base.concat([
			Sentry.browserTracingIntegration(),
			Sentry.feedbackIntegration({
				colorScheme: 'system',
				enableScreenshot: false,
				isNameRequired: true,
				isEmailRequired: true
			}),
		]);
	},

	transport: isTauri() ? makeRendererTransport : undefined,
	beforeSend: scrubEvent,
	beforeSendTransaction: scrubEvent,
	beforeBreadcrumb: isTauri()
		? (breadcrumb) => sendBreadcrumbToRust(scrubBreadcrumb(breadcrumb))
		: scrubBreadcrumb,

	tracesSampleRate: import.meta.env.MODE === 'production' ? 0.2 : 1,
});
