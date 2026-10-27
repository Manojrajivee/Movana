import {
  Body,
  Controller,
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
import { AuthenticatedUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AssignTripCrewSchema } from '../dto/assign-trip-crew.dto';
import { CreateTripSchema } from '../dto/create-trip.dto';
import { QueryTripsSchema } from '../dto/query-trips.dto';
import { RecordTripEventSchema } from '../dto/record-trip-event.dto';
import { UpdateTripStatusSchema } from '../dto/update-trip-status.dto';
import { TransportOperationsService } from '../services/transport-operations.service';

@ApiTags('Transport Operations')
@ApiBearerAuth()
@Controller('api/v1/transport-operations')
export class TransportOperationsController {
  constructor(private readonly service: TransportOperationsService) {}

  @Post('trips')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create operational trip dispatch' })
  @ApiResponse({ status: 201, description: 'Trip created successfully' })
  async createTrip(@Body() body: unknown, @CurrentUser() currentUser: AuthenticatedUser) {
    const validated = CreateTripSchema.parse(body);
    return this.service.createTrip(validated, currentUser);
  }

  @Get('trips')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Query operational trips' })
  @ApiResponse({ status: 200, description: 'Trips retrieved successfully' })
  async getTrips(@Query() query: unknown, @CurrentUser() currentUser: AuthenticatedUser) {
    const validated = QueryTripsSchema.parse(query);
    return this.service.getTrips(validated, currentUser);
  }

  @Get('dispatch/summary')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get daily dispatch operational overview summary' })
  @ApiResponse({ status: 200, description: 'Dispatch summary retrieved' })
  async getDispatchSummary(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.service.getDispatchSummary(currentUser);
  }

  @Get('trips/:id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get trip details by ID' })
  @ApiResponse({ status: 200, description: 'Trip details retrieved' })
  async getTripById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.service.getTripById(id, currentUser);
  }

  @Patch('trips/:id/status')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update operational trip status' })
  @ApiResponse({ status: 200, description: 'Trip status updated' })
  async updateTripStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const validated = UpdateTripStatusSchema.parse(body);
    return this.service.updateTripStatus(id, validated, currentUser);
  }

  @Post('trips/:id/events')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record operational milestone event' })
  @ApiResponse({ status: 201, description: 'Event recorded successfully' })
  async recordTripEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const validated = RecordTripEventSchema.parse(body);
    return this.service.recordTripEvent(id, validated, currentUser);
  }

  @Get('trips/:id/events')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER', 'FLEET_MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get trip milestone events' })
  @ApiResponse({ status: 200, description: 'Milestone events retrieved' })
  async getTripEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.service.getTripEvents(id, currentUser);
  }

  @Post('trips/:id/assignments')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign crew to operational trip' })
  @ApiResponse({ status: 201, description: 'Crew assigned successfully' })
  async assignCrew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const validated = AssignTripCrewSchema.parse(body);
    return this.service.assignCrew(id, validated, currentUser);
  }

  @Get('trips/:id/assignments')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER', 'FLEET_MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get operational trip crew assignments' })
  @ApiResponse({ status: 200, description: 'Trip crew assignments retrieved' })
  async getTripAssignments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.service.getTripAssignments(id, currentUser);
  }

  @Get('trips/:id/status-history')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER', 'FLEET_MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get operational trip status transition history' })
  @ApiResponse({ status: 200, description: 'Status history retrieved' })
  async getTripStatusHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.service.getTripStatusHistory(id, currentUser);
  }
}
