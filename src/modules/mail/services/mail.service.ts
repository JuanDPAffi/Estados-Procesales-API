import { Injectable, Logger } from '@nestjs/common';
import { MsGraphMailAdapter } from '../adapters/ms-graph-mail.adapter';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly msGraphMailAdapter: MsGraphMailAdapter) {}

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