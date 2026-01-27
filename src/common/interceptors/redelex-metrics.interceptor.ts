// src/common/interceptors/redelex-metrics.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable, from, throwError } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
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
      switchMap((data) => {
        const t4 = performance.now();
        const redelex_ms = data?.redelex_ms || data?.data?.redelex_ms || 0;
        const total_ms = Math.round(t4 - t1);
        const processing_ms = Math.max(0, total_ms - redelex_ms);

        this.saveTelemetry({
          path: request.url,
          method: request.method,
          total_ms,
          redelex_ms,
          processing_ms,
          userEmail: request.user?.email || 'API_SYSTEM',
          statusCode: response.statusCode,
        });

        if (data?.redelex_ms) delete data.redelex_ms;
        if (data?.data?.redelex_ms) delete data.data.redelex_ms;

        return from(Promise.resolve({ ...data, metrics: { total_ms, redelex_ms, processing_ms } }));
      }),

      catchError((err) => {
        const tError = performance.now();
        const total_ms = Math.round(tError - t1);
        
        const statusCode = err.response?.status || err.status || 500;
        const isTimeout = statusCode === 524 || statusCode === 408 || err.code === 'ECONNABORTED';

        this.saveTelemetry({
          path: request.url,
          method: request.method,
          total_ms,
          redelex_ms: isTimeout ? total_ms : 0,
          processing_ms: isTimeout ? 0 : total_ms,
          userEmail: request.user?.email || 'API_SYSTEM',
          statusCode: statusCode,
        });

        return throwError(() => err);
      })
    );
  }

  private saveTelemetry(doc: any) {
    this.telemetryModel.create(doc).catch(err => 
      console.error('TELEMETRY_WRITE_ERROR:', err.message)
    );
  }
}