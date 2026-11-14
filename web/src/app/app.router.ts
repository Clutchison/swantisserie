import { Injectable, type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import {
  type ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  type Params,
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
} from '@angular/router';
import { routes } from './app.routes';

/**
 * Reuses a route only when both its route config and its path params are
 * unchanged, so each draft id gets its own draft page, with its own store and
 * page services, as opening its URL fresh would. Query params, such as the
 * draft page's `?tab=`, aren't compared, so a tab change keeps the page.
 */
@Injectable()
export class SameParamsRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot) {
    return super.shouldReuseRoute(future, curr) && sameParams(future.params, curr.params);
  }
}

function sameParams(a: Params, b: Params) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * The app's router: its routes, how it binds them to inputs and when it
 * reuses them. The app and the spec harnesses all set it up from here, so the
 * specs run the router the app does.
 */
export function provideAppRouter(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideRouter(routes, withComponentInputBinding()),
    { provide: RouteReuseStrategy, useClass: SameParamsRouteReuseStrategy },
  ]);
}
