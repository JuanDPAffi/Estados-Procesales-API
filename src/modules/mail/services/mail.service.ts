import { Injectable, Logger } from '@nestjs/common';
import { MsGraphMailAdapter } from '../adapters/ms-graph-mail.adapter';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly msGraphMailAdapter: MsGraphMailAdapter,
    private readonly configService: ConfigService
  ) {}

  /**
   * NUEVO: Envía recordatorio para importar inmobiliarias
   * Se usará desde el endpoint de Power Automate
   */
  async sendImportReminderEmail(): Promise<void> {
    const fromEmail = this.configService.get<string>('MAIL_REMINDER_FROM') || this.configService.get<string>('MAIL_DEFAULT_FROM');
    const toEmails = this.configService.get<string>('MAIL_REMINDER_TO');
    const bccEmails = this.configService.get<string>('MAIL_REMINDER_BCC');

    if (!toEmails) {
      this.logger.warn('No se han configurado destinatarios (MAIL_REMINDER_TO)');
      return;
    }

    try {
      // PASAMOS fromEmail COMO TERCER ARGUMENTO
      await this.msGraphMailAdapter.sendImportReminderEmail(toEmails, bccEmails, fromEmail);

      this.logger.log(`Recordatorio enviado desde ${fromEmail} a: ${toEmails}`);
    } catch (error) {
      this.logger.error('Error enviando recordatorio', error);
      throw error;
    }
  }

  /**
   * Envía correo de bienvenida a un nuevo usuario
   * No lanza error si falla, solo registra en logs
   */
  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    try {
      await this.msGraphMailAdapter.sendWelcomeEmail(email, name);
      this.logger.log(`Correo de bienvenida enviado a: ${email}`);
    } catch (error) {
      this.logger.error(
        `Error enviando correo de bienvenida a ${email}:`,
        error?.response?.data || error,
      );
      // No lanzamos el error para no bloquear el registro
    }
  }

  /**
   * Envía correo de restablecimiento de contraseña
   * No lanza error si falla, solo registra en logs
   */
  async sendPasswordResetEmail(
    email: string,
    name: string,
    resetLink: string,
  ): Promise<void> {
    try {
      await this.msGraphMailAdapter.sendPasswordResetEmail(
        email,
        name,
        resetLink,
      );
      this.logger.log(`Correo de reset de contraseña enviado a: ${email}`);
    } catch (error) {
      this.logger.error(
        `Error enviando correo de reset a ${email}:`,
        error?.response?.data || error,
      );
      // No lanzamos el error para no bloquear el proceso
    }
  }

  /**
   * Envía correo de activación de cuenta
   * No lanza error si falla, solo registra en logs
   */
  async sendActivationEmail(
    email: string,
    name: string,
    activationLink: string,
  ): Promise<void> {
    try {
      await this.msGraphMailAdapter.sendActivationEmail(
        email,
        name,
        activationLink,
      );
      this.logger.log(`Correo de activación enviado a: ${email}`);
    } catch (error) {
      this.logger.error(
        `Error enviando correo de activación a ${email}:`,
        error?.response?.data || error,
      );
    }
  }
}