import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { PlanJourneySchema } from '../dto/plan-journey.dto';
import { QueryDirectJourneySchema } from '../dto/query-direct-journey.dto';
import { JourneyPlannerService } from '../services/journey-planner.service';

@ApiTags('Journey Planner')
@Public()
@Controller('api/v1/journey-planner')
export class JourneyPlannerController {
  constructor(private readonly service: JourneyPlannerService) {}

  @Post('plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plan point-to-point transit journey between stops or GPS coordinates' })
  @ApiResponse({ status: 200, description: 'Journey options computed successfully' })
  async planJourney(@Body() body: unknown) {
    const validated = PlanJourneySchema.parse(body);
    return this.service.planJourney(validated);
  }

  @Get('direct')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find direct transit routes between origin and destination stops' })
  @ApiResponse({ status: 200, description: 'Direct routes retrieved successfully' })
  async getDirectRoutes(
    @Query('originStopId') originStopId: string,
    @Query('destinationStopId') destinationStopId: string,
    @Query('limit') limit?: string,
  ) {
    const validated = QueryDirectJourneySchema.parse({
      originStopId,
      destinationStopId,
      limit,
    });
    return this.service.getDirectRoutes(validated);
  }

  @Get('transfers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find connecting transit routes with intermediate interchange stops' })
  @ApiResponse({ status: 200, description: 'Transfer routes retrieved successfully' })
  async getTransferRoutes(
    @Query('originStopId', ParseUUIDPipe) originStopId: string,
    @Query('destinationStopId', ParseUUIDPipe) destinationStopId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(50, Math.max(1, parseInt(limit, 10))) : 10;
    return this.service.getTransferRoutes(originStopId, destinationStopId, parsedLimit);
  }
}
