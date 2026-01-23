import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InmobiliariaController } from './controllers/inmobiliaria.controller';
import { InmobiliariaService } from './services/inmobiliaria.service';
import { Inmobiliaria, InmobiliariaSchema } from './schema/inmobiliaria.schema';
import { User, UserSchema } from '../auth/schemas/user.schema'; 
import { MailModule } from '../mail/mail.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HubspotSyncService } from './services/hubspot-sync.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Inmobiliaria.name, schema: InmobiliariaSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MailModule,
    ScheduleModule.forRoot()
  ],
  controllers: [InmobiliariaController],
  providers: [InmobiliariaService, HubspotSyncService],
  exports: [MongooseModule, InmobiliariaService],
})
export class InmobiliariaModule {}