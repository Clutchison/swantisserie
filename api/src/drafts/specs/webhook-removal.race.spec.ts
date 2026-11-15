import { setTimeout } from 'node:timers/promises';
import request from 'supertest';
import { app, registerWebhook } from '../../testing/app.js';
import { answered, describeRaces, race } from './race-harness.js';
import {
  aliceCookie,
  carol,
  changeWebhook,
  getDraft,
  readyDraft,
  signIn,
} from './harness.js';

/**
 * How long the second request waits before it's sent: well within the time
 * the race holds the first's COMMIT back, so the first is still open and
 * holding its locks when the second gets there.
 */
const HEAD_START_MS = 200;

describeRaces('removing a webhook against switching a draft to it', () => {
  let webhookId: string;
  let id: string;
  let before: number;
  let carolCookie: string;

  beforeEach(async () => {
    webhookId = await registerWebhook('#roto-side');
    id = await readyDraft([aliceCookie], 1);
    before = (await getDraft(id).expect(200)).body.version as number;
    carolCookie = await signIn(carol);
  });

  const switchToIt = () => changeWebhook(id, webhookId);
  const removeIt = () =>
    request(app.getHttpServer())
      .delete(`/api/admin/webhooks/${webhookId}`)
      .set('Cookie', carolCookie);
  const after = (send: () => PromiseLike<request.Response>) => async () => {
    await setTimeout(HEAD_START_MS);
    return send();
  };

  /**
   * Expects the draft to have no webhook, and, if the switch stood, to have
   * been bumped again by the removal, so whoever was pushed the switch is
   * then pushed the draft with no webhook.
   */
  async function expectNoWebhookShownLast(switched: request.Response) {
    const draft = (await getDraft(id).expect(200)).body;
    expect(draft.webhook).toBeNull();
    expect([
      { switched: 200, version: before + 2 },
      { switched: '409 webhook-removed', version: before },
    ]).toContainEqual({ switched: answered(switched), version: draft.version });
  }

  it('bumps a draft switched to the webhook before it is removed, so its last version shows no webhook', async () => {
    const [switched, removed] = await race(switchToIt, after(removeIt));

    expect(removed.status).toBe(204);
    expect(answered(switched)).toBe(200);
    await expectNoWebhookShownLast(switched);
  });

  it('refuses a switch to the webhook once its removal has begun', async () => {
    const [removed, switched] = await race(removeIt, after(switchToIt));

    expect(removed.status).toBe(204);
    expect(answered(switched)).toBe('409 webhook-removed');
    await expectNoWebhookShownLast(switched);
  });
});
