import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response, Request } from 'express';

interface ErrorResponse {
  success: boolean;
  message: string | string[];
}

@Catch()
export class GlobalErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    // Handle different types of exceptions
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as any;
      
      // Handle BadRequestException specifically for validation errors
      if (exception.name === 'BadRequestException' && Array.isArray(res?.message)) {
        message = res.message.join(', ');
      } else {
        message = res?.message || exception.message;
      }
      
      error = res?.error || exception.name;
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
      
      // Handle specific database errors
      if (exception.name === 'SequelizeUniqueConstraintError') {
        status = HttpStatus.CONFLICT;
        message = 'Resource already exists with the provided unique field(s)';
        error = 'Duplicate Entry';
      } else if (exception.name === 'SequelizeValidationError') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Validation failed';
        error = 'Validation Error';
      } else if (exception.name === 'SequelizeForeignKeyConstraintError') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Foreign key constraint violation';
        error = 'Foreign Key Error';
      }
    }

    const errorResponse: ErrorResponse = {
      success: false,
      message,
    };

    // Log the error for debugging
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
      exception instanceof Error ? exception.stack : exception,
    );

    response.status(status).json(errorResponse);
  }
}
