import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * SMTP mail sender for transactional notifications. Locally this points at
 * Mailhog (SMTP localhost:1200, web UI :8100). When SMTP_HOST is unset the
 * service degrades gracefully: it logs the message instead of sending, so the
 * notification pipeline still completes (status SENT) without a mail server.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.from = config.get<string>('MAIL_FROM') ?? 'no-reply@aicos.local';
    if (!host) {
      this.transporter = null;
      this.logger.warn('SMTP_HOST unset — emails are logged, not delivered');
      return;
    }
    const port = Number(config.get<string>('SMTP_PORT') ?? 1025);
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      ...(user ? { auth: { user, pass } } : {}),
    });
    this.logger.log(`SMTP mailer ready (${host}:${port})`);
  }

  /** Verify SMTP connectivity at boot (best-effort) so misconfig surfaces early. */
  async onModuleInit(): Promise<void> {
    if (!this.transporter) return;
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified');
    } catch (err) {
      this.logger.warn(
        `SMTP verify failed — emails may not deliver: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  get enabled(): boolean {
    return this.transporter !== null;
  }

  /** Send an HTML email; returns the provider message id (or null when logged). */
  async send(to: string, subject: string, html: string): Promise<string | null> {
    if (!this.transporter) {
      this.logger.log(`[mail-disabled] to=${to} subject="${subject}"`);
      return null;
    }
    const info = await this.transporter.sendMail({ from: this.from, to, subject, html });
    return info.messageId ?? null;
  }
}
