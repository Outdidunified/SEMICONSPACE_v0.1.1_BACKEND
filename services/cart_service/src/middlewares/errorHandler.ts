import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { RpcException } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';

@Catch()
export class GlobalErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalErrorFilter.name);
  private readonly handledResponses = new WeakSet<Response>();

  catch(exception: unknown, host: ArgumentsHost) {
    const ctxType = host.getType<string>();

    if (ctxType === 'http') {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
      
      // Prevent multiple responses
      if (this.handledResponses.has(response) || response.headersSent) {
        return;
      }
      
      this.handledResponses.add(response);
      
      let status = HttpStatus.INTERNAL_SERVER_ERROR;
      let message: any = { error: true, message: 'Internal server error', data: {} };

      if (exception instanceof HttpException) {
        status = exception.getStatus();
        const res = exception.getResponse();
        if (res && typeof res === 'object') {
          message = res;
        } else {
          message = { error: true, message: exception.message, data: {} };
        }
      } else if (exception instanceof Error) {
        message = { error: true, message: exception.message, data: {} };
      }

      this.logger.error(`HTTP Error: ${message.message}`, exception instanceof Error ? exception.stack : '');

      // Omit data on error responses
      const body: any = {
        success: false,
        message: message?.message ?? 'Internal server error',
      };

      try {
        response.status(status).json(body);
      } catch (error) {
        // If response is already sent or headers are sent, just log
        this.logger.error('Failed to send error response:', error);
      }
    } else if (ctxType === 'rpc') {
      // Kafka/microservice context
      let errorResponse: any = { success: false, message: 'Internal server error' };

      if (exception instanceof RpcException) {
        errorResponse = exception.getError() as any;
      } else if (exception instanceof Error) {
        errorResponse = { success: false, message: exception.message };
      }

      this.logger.error(`RPC Error: ${errorResponse.message}`, exception instanceof Error ? exception.stack : '');

      // Ensure consistent shape for Kafka responses and omit data
      return {
        success: false,
        message: errorResponse.message ?? 'Internal server error',
      };
    }
  }
}
