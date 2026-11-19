import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MailProcessor, SendEmailJobData } from './mail.processor';
import { MailService } from './mail.service';

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
    discard: jest.fn(),
  } as unknown as Job<SendEmailJobData>;
}

describe('MailProcessor', () => {
  let processor: MailProcessor;
  let mailService: { send: jest.Mock };

  beforeEach(async () => {
    mailService = { send: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailProcessor,
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    processor = module.get<MailProcessor>(MailProcessor);
  });

  describe('handleSendEmail', () => {
    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    });

    afterEach(() => jest.restoreAllMocks());

    it('sends the queued HTML as-is and completes', async () => {
      const job = makeJob({
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>rendered</p>',
        from: 'billing@nexafx.com',
      });

      await expect(processor.handleSendEmail(job)).resolves.toBeUndefined();
      expect(mailService.send).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>rendered</p>',
        text: undefined,
        from: 'billing@nexafx.com',
      });
      expect(job.discard).not.toHaveBeenCalled();
    });

    it('passes the text body through unchanged when there is no HTML', async () => {
      const job = makeJob({
        to: 'user@example.com',
        subject: 'Hello',
        text: 'plain body',
      });

      await processor.handleSendEmail(job);

      expect(mailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'plain body', html: undefined }),
      );
    });

    it('rejects the job on a transport error so Bull retries it', async () => {
      mailService.send.mockRejectedValue(new Error('SMTP timeout'));
      const job = makeJob({ to: 'user@example.com', subject: 'Hello' });

      await expect(processor.handleSendEmail(job)).rejects.toThrow(
        'SMTP timeout',
      );
      expect(job.discard).not.toHaveBeenCalled();
    });

    it('discards a permanent recipient failure so it is not retried', async () => {
      mailService.send.mockRejectedValue(
        Object.assign(new Error('Invalid recipient'), { responseCode: 550 }),
      );
      const job = makeJob({ to: 'user@example.com', subject: 'Hello' });

      await expect(processor.handleSendEmail(job)).rejects.toThrow(
        'Invalid recipient',
      );
      expect(job.discard).toHaveBeenCalled();
    });

    it('discards a job with missing fields', async () => {
      const job = makeJob({ subject: 'Hello' });

      await expect(processor.handleSendEmail(job)).rejects.toThrow(
        'Missing required email fields',
      );
      expect(job.discard).toHaveBeenCalled();
      expect(mailService.send).not.toHaveBeenCalled();
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
