import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Inmobiliaria, InmobiliariaSchema } from '../auth/schemas/inmobiliaria.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Inmobiliaria.name, schema: InmobiliariaSchema },
    ]),
  ],
  exports: [MongooseModule], // ¡Importante exportarlo para que Auth lo pueda usar!
})
export class InmobiliariaModule {}