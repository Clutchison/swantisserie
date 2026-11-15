import { setTimeout } from 'node:timers/promises';
import type { DraftView } from 'contract';
import type request from 'supertest';
import type { DiscordProfile } from '../../discord/discord-client.js';
import {
  signInConfigOverride,
  startSignInAs,
} from '../../testing/discord-sign-in.js';
import { describeRaces, raceLastCommitFirst } from './race-harness.js';
import {
  aliceCookie,
  bob,
  bobCookie,
  card,
  createDraft,
  cubeCobra,
  dave,
  getDraft,
  join,
  readyDraft,
  scryfall,
  signIn,
} from './harness.js';
import { useSockets } from './socket-harness.js';

/**
 * How long the second request waits before it's sent: well within the time
 * the race holds the first's COMMIT back, so the first is still open and
 * holding its locks when the second gets there.
 */
const HEAD_START_MS = 200;

/** Bob as Discord now has him: renamed, with an avatar of his own. */
const renamedBob: DiscordProfile = {
  id: bob.id,
  username: 'bob',
  global_name: 'Robert',
  avatar: 'a_0123456789abcdef0123456789abcdef',
};

/** Bob as a draft shows him once his sign-in has recorded `renamedBob`. */
const bobRenamed = {
  name: 'Robert',
  avatarUrl: `https://cdn.discordapp.com/avatars/${bob.id}/a_0123456789abcdef0123456789abcdef.png`,
};

/** Sends `send` once `HEAD_START_MS` has passed. */
const after = (send: () => PromiseLike<request.Response>) => async () => {
  await setTimeout(HEAD_START_MS);
  return send();
};

/** The app with a Discord application to sign in through. */
const signingIn = { overrides: [signInConfigOverride] };

/** Bob, as `draft` shows him. */
const bobIn = (draft: DraftView) =>
  draft.players.find((player) => player.id === bob.id);

describeRaces(
  'Bob’s sign-in under a new name against his joining a draft in its Lobby',
  () => {
    const { watch } = useSockets();
    let id: string;
    let pushed: DraftView[];
    let signInRenamed: () => PromiseLike<request.Response>;

    beforeEach(async () => {
      id = await readyDraft([aliceCookie], 1);
      pushed = await watch(id, await signIn(dave));
      ({ callback: signInRenamed } = await startSignInAs(renamedBob));
    });

    const joinIt = () => join(id, bobCookie);

    /**
     * Expects the last view pushed for the draft to be the draft as it now
     * is, showing Bob renamed.
     */
    async function expectRenamedPushedLast() {
      const now = (await getDraft(id).expect(200)).body as DraftView;
      expect(bobIn(now)).toMatchObject(bobRenamed);
      await vi.waitFor(() =>
        expect(Math.max(...pushed.map((draft) => draft.version))).toBe(
          now.version,
        ),
      );
      const last = pushed.find((draft) => draft.version === now.version)!;
      expect(bobIn(last)).toMatchObject(bobRenamed);
    }

    it('pushes the draft with the new name and avatar when the join comes while the sign-in is recording them', async () => {
      const [signedIn, joined] = await raceLastCommitFirst(
        signInRenamed,
        after(joinIt),
      );

      expect(signedIn.headers.location).toBe('/');
      expect(joined.status).toBe(201);
      await expectRenamedPushedLast();
    });

    it('pushes the draft with the new name and avatar when the sign-in comes while the join is recording them', async () => {
      const [joined, signedIn] = await raceLastCommitFirst(
        joinIt,
        after(signInRenamed),
      );

      expect(signedIn.headers.location).toBe('/');
      expect(joined.status).toBe(201);
      await expectRenamedPushedLast();
    });
  },
  signingIn,
);

describeRaces(
  'Bob’s sign-in under a new name against his creating a draft',
  () => {
    let signInRenamed: () => PromiseLike<request.Response>;

    beforeEach(async () => {
      // A cube's pool is complete once the draft is saved, so no snapshot
      // changes the draft afterwards. Its checks are the fakes' alone, and
      // write nothing: the creation's one COMMIT is the draft's save, so it
      // and the sign-in's recording of Bob are the two COMMITs the race
      // holds. (The sign-in's session is saved after the gate has opened.)
      cubeCobra.cube.mockResolvedValue({
        name: 'The Pauper Cube',
        mainboard: [
          {
            oracleId: card('Lightning Bolt').oracle_id!,
            name: 'Lightning Bolt',
          },
        ],
      });
      scryfall.printingsOn.mockImplementation(async (game) => [
        card('Lightning Bolt', { set: `${game}-set` }),
      ]);
      ({ callback: signInRenamed } = await startSignInAs(renamedBob));
    });

    let created: request.Response;
    const createIt = async () =>
      (created = await createDraft(
        {
          name: 'Pauper',
          poolSource: { kind: 'cube', cubeLink: 'thepaupercube' },
        },
        bobCookie,
      ));

    /**
     * Expects the newest view of the new draft given out to show Bob renamed
     * as its organizer: the creation's answer, unless a later bump pushed the
     * draft again.
     */
    async function expectRenamedOrganizer() {
      expect(created.status).toBe(201);
      const answer = created.body as DraftView;
      const now = (await getDraft(answer.id).expect(200)).body as DraftView;
      expect(now.organizer).toEqual({ id: bob.id, name: 'Robert' });
      const newest = answer.version === now.version ? answer : now;
      expect(newest.organizer).toEqual({ id: bob.id, name: 'Robert' });
    }

    it('shows the new name as the organizer of a draft created while the sign-in is recording it', async () => {
      const [signedIn] = await raceLastCommitFirst(
        signInRenamed,
        after(createIt),
      );

      expect(signedIn.headers.location).toBe('/');
      await expectRenamedOrganizer();
    });

    it('shows the new name as the organizer of a draft whose creation the sign-in comes during', async () => {
      const [, signedIn] = await raceLastCommitFirst(
        createIt,
        after(signInRenamed),
      );

      expect(signedIn.headers.location).toBe('/');
      await expectRenamedOrganizer();
    });
  },
  signingIn,
);
