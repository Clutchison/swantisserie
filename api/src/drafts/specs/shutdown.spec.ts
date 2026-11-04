import { Logger } from '@nestjs/common';
import {
  aliceCookie,
  app,
  useDraftsApp,
  slowDownDatabase,
  readyDraft,
  getDraft,
} from './harness.js';

useDraftsApp();

describe('shutting down', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets a request still reading the database finish first', async () => {
    const errors = vi.spyOn(Logger.prototype, 'error');
    const id = await readyDraft([aliceCookie]);
    slowDownDatabase(50);

    // `then` sends the request now, rather than when it is awaited.
    const read = getDraft(id).then((res) => res);
    // Before #294, closing 200 ms into this read hung for good.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await app.close();

    expect((await read).status).toBe(200);
    expect(errors).not.toHaveBeenCalled();
  });
});
