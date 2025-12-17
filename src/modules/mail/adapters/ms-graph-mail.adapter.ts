import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

@Injectable()
export class MsGraphMailAdapter {
  private cachedToken: CachedToken | null = null;

  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly scope: string;
  private readonly fromAddress: string;
  private readonly brandName: string;
  private readonly logoUrl: string;
  private readonly footerText: string;

  constructor(private readonly configService: ConfigService) {
    this.tenantId = this.configService.get<string>('TENANT_ID_AD');
    this.clientId = this.configService.get<string>('CLIENT_ID_AD');
    this.clientSecret = this.configService.get<string>('CLIENT_SECRET_AD');
    this.scope = this.configService.get<string>(
      'GRAPH_SCOPE',
      'https://graph.microsoft.com/.default',
    );
    this.fromAddress = this.configService.get<string>('MAIL_DEFAULT_FROM');
    this.brandName = this.configService.get<string>(
      'MAIL_BRAND_NAME',
      'Estados Procesales',
    );
    this.logoUrl = this.configService.get<string>('MAIL_LOGO_URL');
    this.footerText = this.configService.get<string>(
      'MAIL_FOOTER_TEXT',
      'Affi Latam · Todos los derechos reservados',
    );
  }

  private async getAccessToken(): Promise<string> {
    if (!this.tenantId || !this.clientId || !this.clientSecret) {
      throw new Error('Credenciales de Microsoft Entra incompletas');
    }

    // Usar token cacheado si sigue vigente
    const now = Date.now();
    if (this.cachedToken && now < this.cachedToken.expiresAt - 60_000) {
      return this.cachedToken.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const params = new URLSearchParams();
    params.append('client_id', this.clientId);
    params.append('client_secret', this.clientSecret);
    params.append('scope', this.scope);
    params.append('grant_type', 'client_credentials');

    const resp = await axios.post(tokenUrl, params);
    const accessToken = resp.data.access_token as string;
    const expiresIn = resp.data.expires_in as number; // segundos

    this.cachedToken = {
      accessToken,
      expiresAt: now + expiresIn * 1000,
    };

    return accessToken;
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    if (!this.fromAddress) {
      throw new Error('MAIL_DEFAULT_FROM no configurado');
    }

    const accessToken = await this.getAccessToken();

    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      this.fromAddress,
    )}/sendMail`;

    const html = this.buildWelcomeEmailHtml(name);

    const message = {
      message: {
        subject: `Bienvenido a ${this.brandName}`,
        body: {
          contentType: 'HTML',
          content: html,
        },
        from: {
          emailAddress: {
            address: this.fromAddress,
          },
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
      },
      saveToSentItems: true,
    };

    await axios.post(url, message, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async sendPasswordResetEmail(
    to: string,
    name: string,
    resetLink: string,
  ): Promise<void> {
    if (!this.fromAddress) {
      throw new Error('MAIL_DEFAULT_FROM no configurado');
    }

    const accessToken = await this.getAccessToken();

    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      this.fromAddress,
    )}/sendMail`;

    const html = this.buildPasswordResetEmailHtml(name, resetLink);

    const message = {
      message: {
        subject: `Restablecer contraseña - ${this.brandName}`,
        body: {
          contentType: 'HTML',
          content: html,
        },
        from: {
          emailAddress: {
            address: this.fromAddress,
          },
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
      },
      saveToSentItems: true,
    };

    await axios.post(url, message, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  private buildWelcomeEmailHtml(name: string): string {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8" />
        <title>Bienvenido a ${this.brandName}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f3f4f6;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6; padding:24px 0;">
        <tr>
            <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 12px 30px rgba(15,23,42,0.12);">
                <tr>
                <td align="center" style="padding:24px 24px 12px 24px;">
                    ${
                      this.logoUrl
                        ? `<img src="${this.logoUrl}" alt="${this.brandName}" style="max-width:120px; height:auto; display:block; margin-bottom:12px;" />`
                        : ''
                    }
                    <h1 style="margin:0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:20px; color:#111827;">
                    ¡Bienvenido(a) a ${this.brandName}!
                    </h1>
                </td>
                </tr>
                <tr>
                <td style="padding:8px 24px 24px 24px;">
                    <p style="margin:0 0 12px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; color:#111827;">
                    Hola <strong>${name}</strong>,
                    </p>
                    <p style="margin:0 0 12px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; color:#4b5563;">
                    Gracias por registrarte en <strong>${this.brandName}</strong>. Tu cuenta ha sido creada correctamente y ya puedes acceder para consultar los procesos asociados.
                    </p>
                    <p style="margin:0 0 16px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; color:#4b5563;">
                    Si no reconoces este registro, por favor ponte en contacto con nuestro equipo de soporte.
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 8px 0;">
                    <tr>
                    <td align="center" style="padding: 12px 0;">
                        <a href="https://estadosprocesales.affi.net/auth/login" 
                        style="background-color:#260086; 
                                color:white; 
                                padding:12px 24px; 
                                border-radius:8px; 
                                text-decoration:none; 
                                font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; 
                                font-size:14px; 
                                font-weight:600; 
                                display:inline-block;">
                        Iniciar sesión en Estados Procesales
                        </a>
                    </td>
                    </tr>
                    </table>
                    <p style="margin:16px 0 0 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; color:#4b5563;">
                    Saludos,<br/>
                    <span style="color:#111827; font-weight:600;">Equipo ${this.brandName}</span>
                    </p>
                </td>
                </tr>
                <tr>
                <td style="padding:16px 24px 18px 24px; background-color:#f9fafb; border-top:1px solid #e5e7eb;">
                    <p style="margin:0 0 4px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:11px; color:#9ca3af;">
                    Este es un mensaje automático, por favor no respondas a este correo.
                    </p>
                    <p style="margin:0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:11px; color:#9ca3af;">
                    ${this.footerText}
                    </p>
                </td>
                </tr>
            </table>
            </td>
        </tr>
        </table>
    </body>
    </html>
    `;
  }

  async sendImportReminderEmail(
    toEmails: string, 
    bccEmails: string = '', 
    customFrom: string = null
  ): Promise<void> {
    
    // 2. Determinar quién envía: si nos pasan uno específico úsalo, si no, usa el default
    const sender = customFrom || this.fromAddress;

    if (!sender) throw new Error('No hay remitente configurado (From Address)');

    const accessToken = await this.getAccessToken();
    
    // 3. IMPORTANTE: La URL de Graph debe apuntar al usuario que envía
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;

    const html = this.buildImportReminderEmailHtml();

    const formatRecipients = (list: string) => {
      if (!list) return [];
      return list.split(',').map(e => e.trim()).filter(e => e).map(email => ({
        emailAddress: { address: email }
      }));
    };

    const message = {
      message: {
        subject: `🔔 Recordatorio: Importar Inmobiliarias - ${this.brandName}`,
        body: {
          contentType: 'HTML',
          content: html,
        },
        from: {
          emailAddress: { address: sender },
        },
        toRecipients: formatRecipients(toEmails),
        bccRecipients: formatRecipients(bccEmails)
      },
      saveToSentItems: true,
    };

    await axios.post(url, message, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // --- BUILDER PRIVADO DEL HTML ---
  private buildImportReminderEmailHtml(): string {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Recordatorio de Importación - ${this.brandName}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f3f4f6;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6; padding:24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 12px 30px rgba(15,23,42,0.12);">
              <tr>
                <td align="center" style="padding:24px 24px 12px 24px;">
                  ${
                    this.logoUrl
                      ? `<img src="${this.logoUrl}" alt="${this.brandName}" style="max-width:120px; height:auto; display:block; margin-bottom:12px;" />`
                      : ''
                  }
                  <h1 style="margin:0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:20px; color:#111827;">
                    Actualización de Datos Requerida
                  </h1>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 24px 24px 24px;">
                  <p style="margin:0 0 12px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; color:#111827;">
                    Hola,
                  </p>
                  <p style="margin:0 0 12px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; color:#4b5563;">
                    Este es un recordatorio automático para realizar la importación de inmobiliarias en <strong>${this.brandName}</strong>.
                  </p>
                  
                  <div style="background-color:#eff6ff; border-left:4px solid #260086; padding:16px; margin:16px 0; border-radius:4px;">
                    <p style="margin:0 0 8px 0; font-weight:600; font-size:14px; color:#1e3a8a;">Pasos a seguir:</p>
                    <ol style="margin:0; padding-left:20px; color:#1e40af; font-size:14px;">
                        <li style="margin-bottom:4px;">Descargar el listado de inmobiliarias de <strong>Quasar</strong>.</li>
                        <li style="margin-bottom:4px;">Ingresar al Panel de Inmobiliarias.</li>
                        <li>Clic en el botón <strong>Importar</strong>.</li>
                    </ol>
                  </div>

                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 8px 0; width:100%;">
                    <tr>
                      <td align="center">
                        <a href="https://estadosprocesales.affi.net/panel/inmobiliarias"
                           style="background-color:#260086;
                                  color:#ffffff;
                                  padding:12px 24px;
                                  border-radius:8px;
                                  text-decoration:none;
                                  font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                  font-size:14px;
                                  font-weight:600;
                                  display:inline-block;">
                          Ir al Panel
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 24px 18px 24px; background-color:#f9fafb; border-top:1px solid #e5e7eb;">
                  <p style="margin:0 0 4px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:11px; color:#9ca3af;">
                    Mensaje generado automáticamente por el sistema.
                  </p>
                  <p style="margin:0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:11px; color:#9ca3af;">
                    ${this.footerText}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }

  async sendActivationEmail(
    to: string,
    name: string,
    activationLink: string,
  ): Promise<void> {
    if (!this.fromAddress) {
      throw new Error('MAIL_DEFAULT_FROM no configurado');
    }

    const accessToken = await this.getAccessToken();

    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      this.fromAddress,
    )}/sendMail`;

    const html = this.buildActivationEmailHtml(name, activationLink);

    const message = {
      message: {
        subject: `Activa tu cuenta - ${this.brandName}`,
        body: {
          contentType: 'HTML',
          content: html,
        },
        from: {
          emailAddress: {
            address: this.fromAddress,
          },
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
      },
      saveToSentItems: true,
    };

    await axios.post(url, message, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  private buildActivationEmailHtml(name: string, activationLink: string): string {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Activa tu cuenta - ${this.brandName}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f3f4f6;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6; padding:24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 12px 30px rgba(15,23,42,0.12);">
              <tr>
                <td align="center" style="padding:24px 24px 12px 24px;">
                  ${
                    this.logoUrl
                      ? `<img src="${this.logoUrl}" alt="${this.brandName}" style="max-width:120px; height:auto; display:block; margin-bottom:12px;" />`
                      : ''
                  }
                  <h1 style="margin:0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:20px; color:#111827;">
                    ¡Bienvenido a ${this.brandName}!
                  </h1>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 24px 24px 24px;">
                  <p style="margin:0 0 12px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; color:#111827;">
                    Hola <strong>${name}</strong>,
                  </p>
                  <p style="margin:0 0 12px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; color:#4b5563;">
                    Gracias por registrarte. Para comenzar a utilizar la plataforma, es necesario que confirmes tu dirección de correo electrónico.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 8px 0; width:100%;">
                    <tr>
                      <td align="center">
                        <a href="${activationLink}"
                           style="background-color:#260086;
                                  color:#ffffff;
                                  padding:12px 24px;
                                  border-radius:8px;
                                  text-decoration:none;
                                  font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                  font-size:14px;
                                  font-weight:600;
                                  display:inline-block;">
                          Activar cuenta
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:16px 0 0 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:12px; color:#9ca3af;">
                    Si el botón no funciona, copia y pega este enlace: ${activationLink}
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 24px 18px 24px; background-color:#f9fafb; border-top:1px solid #e5e7eb;">
                  <p style="margin:0 0 4px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:11px; color:#9ca3af;">
                    Este es un mensaje automático, por favor no respondas a este correo.
                  </p>
                  <p style="margin:0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:11px; color:#9ca3af;">
                    ${this.footerText}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }

  private buildPasswordResetEmailHtml(name: string, resetLink: string): string {
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Restablecer contraseña - ${this.brandName}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f3f4f6;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6; padding:24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 12px 30px rgba(15,23,42,0.12);">
              <tr>
                <td align="center" style="padding:24px 24px 12px 24px;">
                  ${
                    this.logoUrl
                      ? `<img src="${this.logoUrl}" alt="${this.brandName}" style="max-width:120px; height:auto; display:block; margin-bottom:12px;" />`
                      : ''
                  }
                  <h1 style="margin:0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:20px; color:#111827;">
                    Restablecer tu contraseña
                  </h1>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 24px 24px 24px;">
                  <p style="margin:0 0 12px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; color:#111827;">
                    Hola <strong>${name}</strong>,
                  </p>
                  <p style="margin:0 0 12px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; color:#4b5563;">
                    Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>${this.brandName}</strong>.
                  </p>
                  <p style="margin:0 0 16px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; color:#4b5563;">
                    Haz clic en el siguiente botón para crear una nueva contraseña. Este enlace es válido por 1 hora.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 8px 0; width:100%;">
                    <tr>
                      <td align="center">
                        <a href="${resetLink}"
                           style="background-color:#260086;
                                  color:#ffffff;
                                  padding:12px 24px;
                                  border-radius:8px;
                                  text-decoration:none;
                                  font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                                  font-size:14px;
                                  font-weight:600;
                                  display:inline-block;">
                          Restablecer contraseña
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:16px 0 0 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:12px; color:#9ca3af;">
                    Si tú no solicitaste este cambio, puedes ignorar este mensaje. Tu contraseña actual seguirá funcionando.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 24px 18px 24px; background-color:#f9fafb; border-top:1px solid #e5e7eb;">
                  <p style="margin:0 0 4px 0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:11px; color:#9ca3af;">
                    Este es un mensaje automático, por favor no respondas a este correo.
                  </p>
                  <p style="margin:0; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:11px; color:#9ca3af;">
                    ${this.footerText}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }
}

