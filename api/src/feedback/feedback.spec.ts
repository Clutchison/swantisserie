import type { FeedbackView, ReviewedFeedbackView } from 'contract';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service.js';
import { alice, app, carol, signIn, useTestApp } from '../testing/app.js';

const pageUrl = 'https://swantisserie.example/drafts/42';
const aliceAvatar = 'https://cdn.discordapp.com/embed/avatars/5.png';

/** Whether ISO timestamp `iso` falls between `since` and now, allowing a second either way. */
function isRecent(iso: string, since: number) {
  const time = Date.parse(iso);
  return time >= since - 1000 && time <= Date.now() + 1000;
}

describe('feedback', () => {
  let aliceCookie: string;
  let carolCookie: string;

  useTestApp();

  beforeEach(async () => {
    aliceCookie = await signIn(alice);
    carolCookie = await signIn(carol);
  });

  function send(body: object, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .post('/api/feedback')
      .set('Cookie', cookie)
      .send(body);
  }

  const list = (cookie = carolCookie) =>
    request(app.getHttpServer())
      .get('/api/admin/feedback')
      .set('Cookie', cookie);

  const listReviewed = (cookie = carolCookie) =>
    request(app.getHttpServer())
      .get('/api/admin/feedback/reviewed')
      .set('Cookie', cookie);

  /** Everything saved, as the app admins' two lists show it. */
  async function saved(): Promise<{
    unreviewed: FeedbackView[];
    reviewed: ReviewedFeedbackView[];
  }> {
    return {
      unreviewed: (await list().expect(200)).body,
      reviewed: (await listReviewed().expect(200)).body,
    };
  }

  const nothingSaved = { unreviewed: [], reviewed: [] };

  it('saves the sender, time sent and page URL, starting unreviewed', async () => {
    const before = Date.now();

    await send({ message: 'The pool tab is great', pageUrl }).expect(204);

    const { unreviewed, reviewed } = await saved();
    expect(reviewed).toEqual([]);
    expect(unreviewed).toEqual([
      {
        id: expect.any(String),
        message: 'The pool tab is great',
        pageUrl,
        sentAt: expect.any(String),
        sender: { name: 'Alice', avatarUrl: aliceAvatar },
      },
    ]);
    expect(isRecent(unreviewed[0].sentAt, before)).toBe(true);
  });

  it('accepts feedback from app admins too', async () => {
    await send({ message: 'Hello', pageUrl }, carolCookie).expect(204);

    expect((await saved()).unreviewed[0].sender.name).toBe('Carol');
  });

  it('rejects anyone not signed in', async () => {
    await request(app.getHttpServer())
      .post('/api/feedback')
      .send({ message: 'Hello', pageUrl })
      .expect(401);

    expect(await saved()).toEqual(nothingSaved);
  });

  it.each([
    ['missing', undefined],
    ['not text', 42],
    ['empty', ''],
    ['only whitespace', ' \n\t '],
    ['over 2,000 characters', 'x'.repeat(2001)],
  ])('rejects a message that is %s', async (_, message) => {
    const res = await send({ message, pageUrl }).expect(400);

    expect(res.body).toMatchObject({ error: 'invalid' });
    expect(await saved()).toEqual(nothingSaved);
  });

  it('accepts a message of exactly 2,000 characters', async () => {
    const message = 'x'.repeat(2000);

    await send({ message, pageUrl }).expect(204);

    expect((await saved()).unreviewed[0].message).toBe(message);
  });

  it('counts and saves the message without its surrounding whitespace', async () => {
    await send({ message: `  ${'x'.repeat(2000)}\n`, pageUrl }).expect(204);

    expect((await saved()).unreviewed[0].message).toBe('x'.repeat(2000));
  });

  it.each([
    ['missing', undefined],
    ['not a URL', 'somewhere'],
    ['not a web page', 'javascript:alert(1)'],
    ['absurdly long', `https://example.com/${'x'.repeat(2048)}`],
  ])('rejects a page URL that is %s', async (_, url) => {
    await send({ message: 'Hello', pageUrl: url }).expect(400);

    expect(await saved()).toEqual(nothingSaved);
  });

  describe('reviewing', () => {
    const markReviewed = (id: string, cookie = carolCookie) =>
      request(app.getHttpServer())
        .put(`/api/admin/feedback/${id}/reviewed`)
        .set('Cookie', cookie);

    /**
     * Saved with a known time sent, so order and details can be checked.
     * Written directly, as sending always stamps the current time.
     */
    const received = (message: string, sentAt: string) =>
      app.get(PrismaService).feedback.create({
        data: {
          message,
          pageUrl,
          senderId: alice.id,
          sentAt: new Date(sentAt),
        },
      });

    it('lists unreviewed feedback with its details', async () => {
      const { id } = await received(
        'Line one\nLine two',
        '2026-10-31T12:00:00.000Z',
      );

      const res = await list().expect(200);

      expect(res.body).toEqual([
        {
          id,
          message: 'Line one\nLine two',
          pageUrl,
          sentAt: '2026-10-31T12:00:00.000Z',
          sender: { name: 'Alice', avatarUrl: aliceAvatar },
        },
      ]);
    });

    it('lists the newest first', async () => {
      await received('Middle', '2026-10-02T12:00:00.000Z');
      await received('Newest', '2026-10-03T12:00:00.000Z');
      await received('Oldest', '2026-10-01T12:00:00.000Z');

      const res = await list().expect(200);

      expect(
        (res.body as { message: string }[]).map((item) => item.message),
      ).toEqual(['Newest', 'Middle', 'Oldest']);
    });

    it('marking removes it from the list, keeping it and recording who and when', async () => {
      const { id } = await received('Hello', '2026-10-31T12:00:00.000Z');
      const before = Date.now();

      await markReviewed(id).expect(204);

      const { unreviewed, reviewed } = await saved();
      expect(unreviewed).toEqual([]);
      expect(reviewed).toEqual([
        expect.objectContaining({
          id,
          message: 'Hello',
          reviewedBy: { name: 'Carol' },
        }),
      ]);
      expect(isRecent(reviewed[0].reviewedAt, before)).toBe(true);
    });

    it('keeps the first review when an item is marked again', async () => {
      const { id } = await received('Hello', '2026-10-31T12:00:00.000Z');
      await markReviewed(id).expect(204);
      const [first] = (await saved()).reviewed;

      await markReviewed(id).expect(204);

      expect((await saved()).reviewed[0].reviewedAt).toBe(first.reviewedAt);
    });

    it('says when there is no such feedback to mark', async () => {
      await markReviewed('no-such-feedback').expect(404);
    });

    describe('the reviewed list', () => {
      it('shows the same details plus who reviewed it and when', async () => {
        const { id } = await received('Hello', '2026-10-31T12:00:00.000Z');
        await received('Still unreviewed', '2026-10-31T13:00:00.000Z');
        const before = Date.now();
        await markReviewed(id).expect(204);

        const res = await listReviewed().expect(200);

        expect(res.body).toEqual([
          {
            id,
            message: 'Hello',
            pageUrl,
            sentAt: '2026-10-31T12:00:00.000Z',
            sender: { name: 'Alice', avatarUrl: aliceAvatar },
            reviewedAt: expect.any(String),
            reviewedBy: { name: 'Carol' },
          },
        ]);
        expect(isRecent(res.body[0].reviewedAt, before)).toBe(true);
      });

      it('lists the newest sent first, whatever order they were reviewed in', async () => {
        const middle = await received('Middle', '2026-10-02T12:00:00.000Z');
        const newest = await received('Newest', '2026-10-03T12:00:00.000Z');
        const oldest = await received('Oldest', '2026-10-01T12:00:00.000Z');
        await markReviewed(newest.id).expect(204);
        await markReviewed(oldest.id).expect(204);
        await markReviewed(middle.id).expect(204);

        const res = await listReviewed().expect(200);

        expect(
          (res.body as { message: string }[]).map((item) => item.message),
        ).toEqual(['Newest', 'Middle', 'Oldest']);
      });

      it('rejects anyone who is not an app admin', async () => {
        await listReviewed(aliceCookie).expect(403);
        await request(app.getHttpServer())
          .get('/api/admin/feedback/reviewed')
          .expect(401);
      });
    });

    describe('marking unreviewed', () => {
      const markUnreviewed = (id: string, cookie = carolCookie) =>
        request(app.getHttpServer())
          .delete(`/api/admin/feedback/${id}/reviewed`)
          .set('Cookie', cookie);

      it('returns it to the list, forgetting the review', async () => {
        const { id } = await received('Hello', '2026-10-31T12:00:00.000Z');
        await markReviewed(id).expect(204);

        await markUnreviewed(id).expect(204);

        const { unreviewed, reviewed } = await saved();
        expect(unreviewed.map((item) => item.id)).toEqual([id]);
        expect(reviewed).toEqual([]);
      });

      it('changes nothing when the item is already unreviewed', async () => {
        const { id } = await received('Hello', '2026-10-31T12:00:00.000Z');

        await markUnreviewed(id).expect(204);

        const { unreviewed, reviewed } = await saved();
        expect(unreviewed.map((item) => item.id)).toEqual([id]);
        expect(reviewed).toEqual([]);
      });

      it('says when there is no such feedback', async () => {
        await markUnreviewed('no-such-feedback').expect(404);
      });

      it('rejects anyone who is not an app admin', async () => {
        const { id } = await received('Hello', '2026-10-31T12:00:00.000Z');
        await markReviewed(id).expect(204);

        await markUnreviewed(id, aliceCookie).expect(403);
        await request(app.getHttpServer())
          .delete(`/api/admin/feedback/${id}/reviewed`)
          .expect(401);

        const { unreviewed, reviewed } = await saved();
        expect(unreviewed).toEqual([]);
        expect(reviewed).toEqual([
          expect.objectContaining({ id, reviewedBy: { name: 'Carol' } }),
        ]);
      });
    });

    describe('the unreviewed count', () => {
      const count = (cookie = carolCookie) =>
        request(app.getHttpServer())
          .get('/api/admin/feedback/unreviewed-count')
          .set('Cookie', cookie);

      it('counts only unreviewed feedback', async () => {
        expect((await count().expect(200)).body).toEqual({ count: 0 });

        const { id } = await received('Reviewed', '2026-10-01T12:00:00.000Z');
        await received('Waiting', '2026-10-02T12:00:00.000Z');
        await received('Also waiting', '2026-10-03T12:00:00.000Z');
        await markReviewed(id).expect(204);

        expect((await count().expect(200)).body).toEqual({ count: 2 });
      });

      it('only app admins can fetch it', async () => {
        await count(aliceCookie).expect(403);
        await request(app.getHttpServer())
          .get('/api/admin/feedback/unreviewed-count')
          .expect(401);
      });
    });

    it('rejects anyone who is not an app admin', async () => {
      const { id } = await received('Hello', '2026-10-31T12:00:00.000Z');

      await list(aliceCookie).expect(403);
      await markReviewed(id, aliceCookie).expect(403);
      await request(app.getHttpServer()).get('/api/admin/feedback').expect(401);
      await request(app.getHttpServer())
        .put(`/api/admin/feedback/${id}/reviewed`)
        .expect(401);

      const { unreviewed, reviewed } = await saved();
      expect(unreviewed.map((item) => item.id)).toEqual([id]);
      expect(reviewed).toEqual([]);
    });
  });
});
