// Stryker disable all: bootstrap code that no spec loads; the specs build their own providers (specs-harness.ts, drafts/specs/harness.ts).
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { signOutWhenSessionEnds } from './auth/sign-out-when-session-ends';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([signOutWhenSessionEnds])),
  ],
};
