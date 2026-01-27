// src/common/interceptors/redelex-metrics.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { performance } from 'perf_hooks';
import { ApiTelemetry } from '../../modules/redelex/schemas/api-telemetry.schema';

@Injectable()
export class RedelexMetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectModel(ApiTelemetry.name) private readonly telemetryModel: Model<ApiTelemetry>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const t1 = performance.now();
    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();

    return next.handle().pipe(
      map(async (data) => {
        const t4 = performance.now();
        const redelex_ms = data?.redelex_ms || data?.data?.redelex_ms || 0;
        const total_ms = Math.round(t4 - t1);
        const processing_ms = Math.max(0, total_ms - redelex_ms);

        if (data?.redelex_ms) delete data.redelex_ms;
        if (data?.data?.redelex_ms) delete data.data.redelex_ms;

        const metrics = {
          redelex_ms,
          processing_ms,
          total_ms,
          spans: 1,
          path: request.url,
          method: request.method,
        };

        this.telemetryModel.create({
          ...metrics,
          userEmail: request.user?.email || 'API',
          statusCode: response.statusCode,
        }).catch(err => console.error('Error guardando telemetría:', err));

        return { ...data, metrics };
      }),
    );
  }
}