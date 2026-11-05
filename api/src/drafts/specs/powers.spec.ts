import {
  aliceCookie,
  bob,
  carol,
  draftsRequest,
  readyDraft,
  signIn,
  useDraftsApp,
} from './harness.js';

useDraftsApp();

describe('draft powers', () => {
  function powers(id: string, cookie = aliceCookie) {
    return draftsRequest('get', `/${id}/powers`, cookie);
  }

  it('lets the organizer organize and switch announcements, but not add bots', async () => {
    const id = await readyDraft([aliceCookie]);

    const { body } = await powers(id).expect(200);

    expect(body).toEqual({
      organize: true,
      addBots: false,
      switchAnnouncements: true,
    });
  });

  it('gives an app admin every power, in a draft they don’t organize', async () => {
    const id = await readyDraft([aliceCookie]);

    const { body } = await powers(id, await signIn(carol)).expect(200);

    expect(body).toEqual({
      organize: true,
      addBots: true,
      switchAnnouncements: true,
    });
  });

  it('gives a player who neither organizes nor is an app admin no powers', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);

    const { body } = await powers(id, bobCookie).expect(200);

    expect(body).toEqual({
      organize: false,
      addBots: false,
      switchAnnouncements: false,
    });
  });

  it('answers 404 for a draft that doesn’t exist', async () => {
    await powers('no-such-draft').expect(404);
  });
});
