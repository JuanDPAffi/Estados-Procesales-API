import { Module } from '@nestjs/common';
import { MailService } from './services/mail.service';
import { MsGraphMailAdapter } from './adapters/ms-graph-mail.adapter';

@Module({
  providers: [
    MailService,
    MsGraphMailAdapter, // Patrón Adaptador para MS Graph
  ],
  exports: [MailService], // Exportamos para usar en otros módulos
})
export class MailModule {}