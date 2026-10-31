import { Routes } from '@angular/router';
import { appAdmin, SIGN_IN_PATH, signedIn } from './auth/auth';
import { SignInPage } from './auth/sign-in-page';
import { DraftListPage } from './drafts/draft-list-page';

export const routes: Routes = [
  { path: SIGN_IN_PATH, component: SignInPage },
  {
    // Every page but sign-in goes in here, so it is guarded by default.
    path: '',
    canActivateChild: [signedIn],
    children: [
      { path: '', component: DraftListPage },
      {
        path: 'drafts/new',
        loadComponent: () => import('./drafts/create-draft-page').then((m) => m.CreateDraftPage),
      },
      {
        path: 'drafts/:id',
        loadComponent: () => import('./drafts/draft-page').then((m) => m.DraftPage),
      },
      {
        path: 'admin/webhooks',
        loadComponent: () => import('./admin/webhooks-page').then((m) => m.WebhooksPage),
        canActivate: [appAdmin],
      },
      {
        path: 'admin/feedback',
        loadComponent: () => import('./feedback/feedback-page').then((m) => m.FeedbackPage),
        canActivate: [appAdmin],
      },
      {
        path: 'status',
        loadComponent: () => import('./status/status-page').then((m) => m.StatusPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
