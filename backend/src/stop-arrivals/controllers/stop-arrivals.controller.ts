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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { QueryRecentArrivalsSchema } from '../dto/query-stop-arrivals.dto';
import { RecordArrivalSchema } from '../dto/record-arrival.dto';
import { RecordDepartureSchema } from '../dto/record-departure.dto';
import { SkipStopSchema } from '../dto/skip-stop.dto';
import { StopArrivalsService } from '../services/stop-arrivals.service';

@ApiTags('Stop Arrivals')
@ApiBearerAuth()
@Controller('api/v1/stop-arrivals')
export class StopArrivalsController {
  constructor(private readonly service: StopArrivalsService) {}

  @Post('trips/:tripId/stops/:stopId/arrive')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record vehicle arrival at a specific stop in the sequence' })
  @ApiResponse({ status: 200, description: 'Stop arrival recorded successfully' })
  async recordArrival(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const validated = RecordArrivalSchema.parse(body);
    return this.service.recordArrival(tripId, stopId, validated, currentUser.id);
  }

  @Post('trips/:tripId/stops/:stopId/depart')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record vehicle departure from a stop after boarding' })
  @ApiResponse({ status: 200, description: 'Stop departure recorded successfully' })
  async recordDeparture(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const validated = RecordDepartureSchema.parse(body);
    return this.service.recordDeparture(tripId, stopId, validated, currentUser.id);
  }

  @Post('trips/:tripId/stops/:stopId/skip')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Operationally skip a scheduled stop due to detour or emergency' })
  @ApiResponse({ status: 200, description: 'Stop skipped successfully' })
  async recordSkip(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const validated = SkipStopSchema.parse(body);
    return this.service.recordSkip(tripId, stopId, validated, currentUser.id);
  }

  @Get('trips/:tripId/timeline')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get stop arrival/departure timeline and dwell metrics for a trip' })
  @ApiResponse({ status: 200, description: 'Stop timeline retrieved' })
  async getTripTimeline(@Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.service.getTripTimeline(tripId);
  }

  @Get('stops/:stopId/recent')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get recent vehicle arrivals and departures at a specific stop' })
  @ApiResponse({ status: 200, description: 'Recent arrivals retrieved' })
  async getRecentStopArrivals(
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Query() query: unknown,
  ) {
    const validated = QueryRecentArrivalsSchema.parse(query);
    return this.service.getRecentStopArrivals(stopId, validated);
  }
}
