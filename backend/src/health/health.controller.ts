import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService, LivenessResponse, ReadinessResponse } from './health.service';

import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Application liveness probe' })
  @ApiResponse({
    status: 200,
    description: 'Process is alive and handling HTTP requests.',
  })
  getLive(): LivenessResponse {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Application readiness probe' })
  @ApiResponse({
    status: 200,
    description:
      'All required infrastructure dependencies (PostgreSQL movana/movana_app) are healthy.',
  })
  @ApiResponse({
    status: 503,
    description:
      'One or more required infrastructure dependencies are unavailable or identity check failed.',
  })
  async getReady(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const { statusCode, response } = await this.healthService.getReadiness();
    res.status(statusCode);
    return response;
  }
}
