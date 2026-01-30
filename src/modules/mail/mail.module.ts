import { Module } from '@nestjs/common';
import { MailService } from './services/mail.service';
import { MsGraphMailAdapter } from './adapters/ms-graph-mail.adapter';

@Module({
  providers: [
    MailService,
    MsGraphMailAdapter,
  ],
  exports: [MailService, MsGraphMailAdapter],
})
export class MailModule {}