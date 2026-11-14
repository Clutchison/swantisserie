import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';

/**
 * The app's router: its routes, how it binds them to inputs and when it
 * reuses them. The app and the spec harnesses all set it up from here, so the
 * specs run the router the app does.
 */
export function provideAppRouter(): EnvironmentProviders {
  return makeEnvironmentProviders([provideRouter(routes, withComponentInputBinding())]);
}
