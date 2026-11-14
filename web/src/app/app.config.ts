import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAppRouter } from './app.router';
import { signOutWhenSessionEnds } from './auth/sign-out-when-session-ends';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppRouter(),
    provideHttpClient(withFetch(), withInterceptors([signOutWhenSessionEnds])),
  ],
};
