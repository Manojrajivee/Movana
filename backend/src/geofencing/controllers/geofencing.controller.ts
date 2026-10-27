import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateGeofenceSchema } from '../dto/create-geofence.dto';
import { EvaluateGeofenceSchema } from '../dto/evaluate-geofence.dto';
import { QueryGeofenceEventsSchema } from '../dto/query-geofence-events.dto';
import { QueryGeofencesSchema } from '../dto/query-geofences.dto';
import { RecordGeofenceEventSchema } from '../dto/record-geofence-event.dto';
import { UpdateGeofenceSchema } from '../dto/update-geofence.dto';
import { GeofencingService } from '../services/geofencing.service';

@ApiTags('Geofencing')
@ApiBearerAuth()
@Controller('api/v1/geofences')
export class GeofencingController {
  constructor(private readonly service: GeofencingService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create geofence perimeter' })
  @ApiResponse({ status: 201, description: 'Geofence created successfully' })
  async createGeofence(@Body() body: unknown) {
    const validated = CreateGeofenceSchema.parse(body);
    return this.service.createGeofence(validated);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Query geofences' })
  @ApiResponse({ status: 200, description: 'Geofences retrieved' })
  async getGeofences(@Query() query: unknown) {
    const validated = QueryGeofencesSchema.parse(query);
    return this.service.getGeofences(validated);
  }

  @Get('events')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Query geofence transition events log' })
  @ApiResponse({ status: 200, description: 'Geofence events retrieved' })
  async getGeofenceEvents(@Query() query: unknown) {
    const validated = QueryGeofenceEventsSchema.parse(query);
    return this.service.getGeofenceEvents(validated);
  }

  @Post('events')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record boundary transition event' })
  @ApiResponse({ status: 201, description: 'Geofence event recorded' })
  async recordGeofenceEvent(@Body() body: unknown) {
    const validated = RecordGeofenceEventSchema.parse(body);
    return this.service.recordGeofenceEvent(validated);
  }

  @Post('evaluate')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Evaluate vehicle GPS fix against active geofences' })
  @ApiResponse({ status: 200, description: 'Geofences evaluated and transitions recorded' })
  async evaluateVehiclePosition(@Body() body: unknown) {
    const validated = EvaluateGeofenceSchema.parse(body);
    return this.service.evaluateVehiclePosition(validated);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get geofence details by ID' })
  @ApiResponse({ status: 200, description: 'Geofence found' })
  async getGeofenceById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getGeofenceById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update geofence perimeter parameters' })
  @ApiResponse({ status: 200, description: 'Geofence updated successfully' })
  async updateGeofence(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = UpdateGeofenceSchema.parse(body);
    return this.service.updateGeofence(id, validated);
  }

  @Delete(':id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate geofence perimeter' })
  @ApiResponse({ status: 200, description: 'Geofence deactivated' })
  async deleteGeofence(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteGeofence(id);
  }
}
