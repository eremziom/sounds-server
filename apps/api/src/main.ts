import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createApiValidationPipe } from './common/api-validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(createApiValidationPipe());
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
