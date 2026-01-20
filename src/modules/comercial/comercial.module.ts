import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SalesTeam, SalesTeamSchema } from './schemas/sales-team.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SalesTeam.name, schema: SalesTeamSchema }])
  ],
  exports: [MongooseModule] // Exportamos para que RedelexService lo pueda leer
})
export class ComercialModule {}