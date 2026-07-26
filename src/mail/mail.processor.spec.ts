import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MailProcessor, SendEmailJobData } from './mail.processor';

function makeJob(
  data: Partial<SendEmailJobData>,
  opts: { attempts?: number } = {},
  attemptsMade = 0,
): Job<SendEmailJobData> {
  return {
    id: 'test-job-id',
    name: 'send-email',
    data: data as SendEmailJobData,
    opts: { attempts: opts.attempts ?? 3, ...opts },
    attemptsMade,
  } as unknown as Job<SendEmailJobData>;
}

describe('MailProcessor', () => {
  let processor: MailProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailProcessor],
    }).compile();

    processor = module.get<MailProcessor>(MailProcessor);
  });

  describe('handleSendEmail', () => {
    it('logs and completes for a valid job', () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});
      const job = makeJob({ to: 'user@example.com', subject: 'Hello' });

      expect(() => processor.handleSendEmail(job)).not.toThrow();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('user@example.com'),
      );
    });

    it('throws when "to" is missing', () => {
      const job = makeJob({ subject: 'Hello' });
      expect(() => processor.handleSendEmail(job)).toThrow(
        'Missing required email fields',
      );
    });

    it('throws when "subject" is missing', () => {
      const job = makeJob({ to: 'user@example.com' });
      expect(() => processor.handleSendEmail(job)).toThrow(
        'Missing required email fields',
      );
    });
  });

  describe('onFailed', () => {
    it('logs a warning when retries remain', () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      const job = makeJob({ to: 'u@e.com', subject: 'S' }, { attempts: 3 }, 1);

      processor.onFailed(job, new Error('SMTP timeout'));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('attempt 1'),
      );
    });

    it('logs a dead-letter error when all retries are exhausted', () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      const job = makeJob({ to: 'u@e.com', subject: 'S' }, { attempts: 3 }, 3);

      processor.onFailed(job, new Error('SMTP timeout'));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEAD-LETTER]'),
        expect.anything(),
      );
    });
  });

  describe('onError', () => {
    it('logs the queue error', () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      processor.onError(new Error('Redis connection lost'));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis connection lost'),
        expect.anything(),
      );
    });
  });
});
