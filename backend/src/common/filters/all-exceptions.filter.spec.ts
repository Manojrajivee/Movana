import { HttpStatus, HttpException } from '@nestjs/common';
import { z } from 'zod';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter (Unit Tests)', () => {
  let filter: AllExceptionsFilter;
  let mockLogger: any;
  let mockResponse: any;
  let mockHost: any;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    const mockRequest = {
      url: '/test-endpoint',
      method: 'GET',
    };

    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };

    filter = new AllExceptionsFilter(mockLogger);
  });

  it('should format HttpException with safe client message and correct status code', () => {
    const notFoundException = new HttpException('Resource not found', HttpStatus.NOT_FOUND);

    filter.catch(notFoundException, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Resource not found',
        path: '/test-endpoint',
      }),
    );
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should format ZodError with 400 status code and validation details', () => {
    const testSchema = z.object({ email: z.string().email() });
    let zodError: any;
    try {
      testSchema.parse({ email: 'not-an-email' });
    } catch (err) {
      zodError = err;
    }

    filter.catch(zodError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        path: '/test-endpoint',
      }),
    );
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should sanitize internal Error into generic message without leaking internals to client', () => {
    const rawDbError = new Error(
      'FATAL: password authentication failed for user "movana_app" at host 127.0.0.1',
    );

    filter.catch(rawDbError, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred',
        path: '/test-endpoint',
      }),
    );
    // Client response must NOT leak password or host details
    const clientPayload = mockResponse.json.mock.calls[0][0];
    const clientPayloadStr = JSON.stringify(clientPayload);
    expect(clientPayloadStr).not.toContain('authentication failed');
    expect(clientPayloadStr).not.toContain('127.0.0.1');

    // Server log records the error
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
