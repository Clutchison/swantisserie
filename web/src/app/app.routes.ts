import { Routes } from '@angular/router';
import { appAdmin, knownUser, SIGN_IN_PATH, signedIn } from './auth/auth';
import { SignInPage } from './auth/sign-in-page';
import { DraftListPage } from './drafts/draft-list-page';

export const routes: Routes = [
  { path: SIGN_IN_PATH, component: SignInPage },
  {
    // Open to anyone, even when the API is down: it's where to look when the app seems down.
    path: 'status',
    loadComponent: () => import('./status/status-page').then((m) => m.StatusPage),
    canActivate: [knownUser],
  },
  {
    // Every page but sign-in and status goes in here, so it is guarded by default.
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
        path: 'trophy-hall',
        loadComponent: () => import('./trophy-hall/trophy-hall-page').then((m) => m.TrophyHallPage),
      },
      // The Trophy Hall replaced the leaderboard: old links still work.
      { path: 'leaderboard', redirectTo: 'trophy-hall' },
      {
        path: 'my-stats',
        loadComponent: () => import('./my-stats/my-stats-page').then((m) => m.MyStatsPage),
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
    ],
  },
  { path: '**', redirectTo: '' },
];
