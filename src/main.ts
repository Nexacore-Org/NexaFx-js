import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiUsageInterceptor } from './common/interceptors/api-usage.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Register global API usage interceptor
  const apiUsageService = app.get('ApiUsageService');
  if (apiUsageService) {
    app.useGlobalInterceptors(new ApiUsageInterceptor(apiUsageService));
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
