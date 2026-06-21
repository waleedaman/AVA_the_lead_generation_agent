import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { logApiEvent } from './common/file-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3100',
  });
  app.use((req, res, next) => {
    const startedAt = Date.now();
    const requestId = `${startedAt}-${Math.random().toString(16).slice(2)}`;
    logApiEvent('request_start', {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      query: req.query,
      body: req.body,
    });
    res.on('finish', () => {
      logApiEvent('request_finish', {
        requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    next();
  });

  const port = process.env.PORT ?? 3101;
  await app.listen(port);
  logApiEvent('service_started', { port });
}
void bootstrap();
