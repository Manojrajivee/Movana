import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { NearbyVehiclesSchema } from '../dto/nearby-vehicles.dto';
import { QueryTrackingVehiclesSchema } from '../dto/query-tracking-vehicles.dto';
import { TrackingService } from '../services/tracking.service';

@ApiTags('Tracking')
@ApiBearerAuth()
@Controller('api/v1/tracking')
export class TrackingController {
  constructor(private readonly service: TrackingService) {}

  @Get('vehicles')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Query live active vehicle tracking feed' })
  @ApiResponse({ status: 200, description: 'Active vehicles tracking feed retrieved' })
  async getActiveVehicles(@Query() query: unknown) {
    const validated = QueryTrackingVehiclesSchema.parse(query);
    return this.service.getActiveVehicles(validated);
  }

  @Get('nearby')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find nearby live active transit vehicles' })
  @ApiResponse({ status: 200, description: 'Nearby transit vehicles retrieved' })
  async getNearbyVehicles(@Query() query: unknown) {
    const validated = NearbyVehiclesSchema.parse(query);
    return this.service.getNearbyVehicles(validated);
  }

  @Get('vehicles/:id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get real-time tracking details for a specific vehicle' })
  @ApiResponse({ status: 200, description: 'Vehicle real-time tracking found' })
  async getVehicleTracking(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getVehicleTracking(id);
  }

  @Get('trips/:id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get real-time journey tracking for an active trip' })
  @ApiResponse({ status: 200, description: 'Trip real-time tracking found' })
  async getTripTracking(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getTripTracking(id);
  }
}
