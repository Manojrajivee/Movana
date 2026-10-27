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
import { CreateStopSchema } from '../dto/create-stop.dto';
import { NearbyStopsSchema } from '../dto/nearby-stops.dto';
import { QueryStopsSchema } from '../dto/query-stops.dto';
import { UpdateStopStatusSchema } from '../dto/update-stop-status.dto';
import { UpdateStopSchema } from '../dto/update-stop.dto';
import { StopsService } from '../services/stops.service';

@ApiTags('Stops')
@ApiBearerAuth()
@Controller('api/v1/stops')
export class StopsController {
  constructor(private readonly service: StopsService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a master geographic transit stop or station' })
  @ApiResponse({ status: 201, description: 'Stop created successfully' })
  async createStop(@Body() body: unknown) {
    const validated = CreateStopSchema.parse(body);
    return this.service.createStop(validated);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List and query transit stops' })
  @ApiResponse({ status: 200, description: 'Stops retrieved successfully' })
  async getStops(@Query() query: unknown) {
    const validated = QueryStopsSchema.parse(query);
    return this.service.getStops(validated);
  }

  @Get('nearby')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find stops nearby geographic coordinates using spatial distance' })
  @ApiResponse({ status: 200, description: 'Nearby stops retrieved successfully' })
  async getNearbyStops(@Query() query: unknown) {
    const validated = NearbyStopsSchema.parse(query);
    return this.service.getNearbyStops(validated);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get stop details by ID' })
  @ApiResponse({ status: 200, description: 'Stop found' })
  async getStopById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getStopById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update transit stop metadata, location, or geofence' })
  @ApiResponse({ status: 200, description: 'Stop updated successfully' })
  async updateStop(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = UpdateStopSchema.parse(body);
    return this.service.updateStop(id, validated);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update transit stop operational status (ACTIVE, INACTIVE, TEMPORARILY_CLOSED)',
  })
  @ApiResponse({ status: 200, description: 'Stop status updated successfully' })
  async updateStopStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = UpdateStopStatusSchema.parse(body);
    return this.service.updateStopStatus(id, validated);
  }

  @Delete(':id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete transit stop if no active routes or route stops depend on it' })
  @ApiResponse({ status: 200, description: 'Stop deleted successfully' })
  async deleteStop(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteStop(id);
  }
}
