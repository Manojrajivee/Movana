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
import { CancelTripSchema } from '../dto/cancel-trip.dto';
import { CreateAdHocTripSchema } from '../dto/create-ad-hoc-trip.dto';
import { DispatchScheduleSchema } from '../dto/dispatch-schedule.dto';
import { QueryTripsSchema } from '../dto/query-trips.dto';
import { UpdateTripSchema } from '../dto/update-trip.dto';
import { TripsService } from '../services/trips.service';

@ApiTags('Trips')
@ApiBearerAuth()
@Controller('api/v1/trips')
export class TripsController {
  constructor(private readonly service: TripsService) {}

  @Post('dispatch-schedule')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Dispatch and realize a trip from a recurring timetable schedule' })
  @ApiResponse({ status: 201, description: 'Trip dispatched from schedule successfully' })
  async dispatchSchedule(@Body() body: unknown, @CurrentUser() currentUser: AuthenticatedUser) {
    const validated = DispatchScheduleSchema.parse(body);
    return this.service.dispatchSchedule(validated, currentUser.id);
  }

  @Post('ad-hoc')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Dispatch an ad-hoc unscheduled trip on a transit route' })
  @ApiResponse({ status: 201, description: 'Ad-hoc trip dispatched successfully' })
  async createAdHocTrip(@Body() body: unknown, @CurrentUser() currentUser: AuthenticatedUser) {
    const validated = CreateAdHocTripSchema.parse(body);
    return this.service.createAdHocTrip(validated, currentUser.id);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Query and search trips with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Trips retrieved successfully' })
  async getTrips(@Query() query: unknown) {
    const validated = QueryTripsSchema.parse(query);
    return this.service.getTrips(validated);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get full trip details with intermediate stops timeline' })
  @ApiResponse({ status: 200, description: 'Trip details retrieved' })
  async getTripById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getTripById(id);
  }

  @Get(':id/stops')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get trip stops timeline in sequence' })
  @ApiResponse({ status: 200, description: 'Trip stops retrieved' })
  async getTripStops(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getTripStops(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update trip crew, vehicle assignment, or schedule timing' })
  @ApiResponse({ status: 200, description: 'Trip updated successfully' })
  async updateTrip(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = UpdateTripSchema.parse(body);
    return this.service.updateTrip(id, validated);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an active or scheduled trip with operational reason' })
  @ApiResponse({ status: 200, description: 'Trip cancelled successfully' })
  async cancelTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const validated = CancelTripSchema.parse(body);
    return this.service.cancelTrip(id, validated, currentUser.id);
  }
}
