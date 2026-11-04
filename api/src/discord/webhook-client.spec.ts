import {
  WebhookGoneError,
  webhookPostError,
  WebhookRefusedError,
} from './webhook-client.js';

describe('webhookPostError', () => {
  it('is nothing for a post Discord took', () => {
    expect(webhookPostError(204)).toBeNull();
  });

  it('says Discord no longer has the webhook on a 404', () => {
    expect(webhookPostError(404)).toBeInstanceOf(WebhookGoneError);
  });

  it.each([400, 401, 403, 413])(
    'says Discord refused the post on a %i',
    (status) => {
      const error = webhookPostError(status);
      expect(error).toBeInstanceOf(WebhookRefusedError);
      expect(String(error)).toContain(String(status));
    },
  );

  it.each([429, 500, 502, 503])(
    'is a failure worth retrying on a %i',
    (status) => {
      const error = webhookPostError(status);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(WebhookGoneError);
      expect(error).not.toBeInstanceOf(WebhookRefusedError);
      expect(String(error)).toContain(String(status));
    },
  );
});
