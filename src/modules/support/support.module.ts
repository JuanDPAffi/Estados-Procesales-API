import { Module } from '@nestjs/common';
import { SupportController } from './controllers/support.controller';
import { SupportService } from './services/support.service';
import { ConfigModule } from '@nestjs/config';
import { InmobiliariaModule } from '../inmobiliaria/inmobiliaria.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [ConfigModule, InmobiliariaModule, MailModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}