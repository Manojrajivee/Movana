import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { PlanMultiModalSchema } from '../dto/plan-multi-modal.dto';
import { MultiModalService } from '../services/multi-modal.service';

@ApiTags('Multi-Modal Transport')
@Public()
@Controller('api/v1/multi-modal')
export class MultiModalController {
  constructor(private readonly service: MultiModalService) {}

  @Get('modes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get supported intermodal transit modes and carbon parameters' })
  @ApiResponse({ status: 200, description: 'Transit modes retrieved successfully' })
  getSupportedModes() {
    return this.service.getSupportedModes();
  }

  @Get('hubs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List interchange transit hubs connecting multiple route lines' })
  @ApiResponse({ status: 200, description: 'Interchange hubs retrieved successfully' })
  async getInterchangeHubs(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Math.min(50, Math.max(1, parseInt(limit, 10))) : 20;
    return this.service.getInterchangeHubs(parsedLimit);
  }

  @Post('plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Plan a multi-modal journey with vehicular and pedestrian legs' })
  @ApiResponse({ status: 200, description: 'Multi-modal journey planned successfully' })
  async planMultiModalJourney(@Body() body: unknown) {
    const validated = PlanMultiModalSchema.parse(body);
    return this.service.planMultiModalJourney(validated);
  }

  @Get('hubs/:stopId/connections')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all connecting route lines and transit modes for a specific hub' })
  @ApiResponse({ status: 200, description: 'Hub connections retrieved successfully' })
  async getHubConnections(@Param('stopId', ParseUUIDPipe) stopId: string) {
    return this.service.getHubConnections(stopId);
  }
}
