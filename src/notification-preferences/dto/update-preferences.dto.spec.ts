import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  MAX_PREFERENCES_PER_REQUEST,
  UpdatePreferencesRequestDto,
} from './update-preferences.dto';
import {
  NotificationChannel,
  NotificationEventType,
} from '../notification-preference.entity';

const validPreference = {
  channel: NotificationChannel.EMAIL,
  eventType: NotificationEventType.TRANSACTION,
  isEnabled: true,
};

async function validateBody(body: unknown) {
  return validate(plainToInstance(UpdatePreferencesRequestDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('UpdatePreferencesRequestDto', () => {
  it('accepts a valid preference batch', async () => {
    const errors = await validateBody({ preferences: [validPreference] });
    expect(errors).toEqual([]);
  });

  it.each([
    ['a missing preferences field', {}],
    ['an empty array', { preferences: [] }],
    ['a non-array value', { preferences: validPreference }],
    [
      'an unknown channel',
      { preferences: [{ ...validPreference, channel: 'carrier-pigeon' }] },
    ],
    [
      'an unknown event type',
      { preferences: [{ ...validPreference, eventType: 'unknown' }] },
    ],
    [
      'a missing isEnabled flag',
      { preferences: [{ ...validPreference, isEnabled: undefined }] },
    ],
    [
      'an extra field',
      { preferences: [{ ...validPreference, surprise: true }] },
    ],
  ])('rejects %s', async (_label, body) => {
    const errors = await validateBody(body);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects too many preferences', async () => {
    const errors = await validateBody({
      preferences: Array.from(
        { length: MAX_PREFERENCES_PER_REQUEST + 1 },
        () => ({
          ...validPreference,
        }),
      ),
    });
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({ arrayMaxSize: expect.any(String) as string }),
    );
  });

  it('rejects duplicate (channel,eventType) pairs', async () => {
    const errors = await validateBody({
      preferences: [validPreference, { ...validPreference, isEnabled: false }],
    });
    expect(errors[0].constraints).toEqual(
      expect.objectContaining({
        uniquePreferencePairs:
          'Duplicate (channel,eventType) pairs are not allowed',
      }),
    );
  });
});
