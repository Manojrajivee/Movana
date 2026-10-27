import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { EtaService, TripEtaResponse, StopArrivalPrediction } from '../services/eta.service';

@ApiTags('ETA Engine')
@ApiBearerAuth()
@Controller('api/v1/eta')
export class EtaController {
  constructor(private readonly etaService: EtaService) {}

  @Get('trips/:tripId')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @ApiOperation({ summary: 'Calculate real-time ETAs for all stops in an active trip' })
  @ApiResponse({ status: 200, description: 'Trip stops ETA calculated successfully' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async getTripEta(@Param('tripId', ParseUUIDPipe) tripId: string): Promise<TripEtaResponse> {
    return this.etaService.getTripEta(tripId);
  }

  @Get('stops/:stopId')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @ApiOperation({ summary: 'Get approaching trips and estimated arrival times for a stop' })
  @ApiResponse({ status: 200, description: 'Approaching trips ETA retrieved successfully' })
  async getStopEta(
    @Param('stopId', ParseUUIDPipe) stopId: string,
  ): Promise<StopArrivalPrediction[]> {
    return this.etaService.getStopEta(stopId);
  }
}
