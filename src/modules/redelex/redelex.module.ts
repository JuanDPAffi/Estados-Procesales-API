import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RedelexController } from './controllers/redelex.controller';
import { RedelexService } from './services/redelex.service';
import { RedelexToken, RedelexTokenSchema } from './schemas/redelex-token.schema';
import { CedulaProceso, CedulaProcesoSchema } from './schemas/cedula-proceso.schema';
import { ApiTelemetry, ApiTelemetrySchema } from './schemas/api-telemetry.schema';
import { AuthModule } from '../auth/auth.module';
import { InmobiliariaModule } from '../inmobiliaria/inmobiliaria.module';
import { ComercialModule } from '../comercial/comercial.module';
import { RedelexMetricsInterceptor } from '../../common/interceptors/redelex-metrics.interceptor';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RedelexToken.name, schema: RedelexTokenSchema },
      { name: CedulaProceso.name, schema: CedulaProcesoSchema },
      { name: ApiTelemetry.name, schema: ApiTelemetrySchema },
    ]),
    AuthModule,
    ComercialModule,
    InmobiliariaModule 
  ],
  controllers: [RedelexController],
  providers: [RedelexService, RedelexMetricsInterceptor],
  exports: [RedelexService], 
})
export class RedelexModule {}