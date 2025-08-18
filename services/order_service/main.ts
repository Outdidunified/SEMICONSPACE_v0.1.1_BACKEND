import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { GlobalErrorFilter } from './src/middlewares/errorHandler';
import * as dotenv from 'dotenv';

async function bootstrap() {
  dotenv.config();

  const app = await NestFactory.create(AppModule);

  // ✅ Apply validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );

  //  Global error handler
  app.useGlobalFilters(new GlobalErrorFilter());

  //  Enable CORS
  app.enableCors();

  const PORT = process.env.PORT || 8006;

  try {
    await app.listen(PORT);
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1); // Fatal if HTTP server can't start
  }
}

bootstrap();
