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
import { AddScheduleStopSchema } from '../dto/add-schedule-stop.dto';
import { CreateTripScheduleSchema } from '../dto/create-trip-schedule.dto';
import { QueryTripSchedulesSchema } from '../dto/query-trip-schedules.dto';
import { UpdateScheduleStopSchema } from '../dto/update-schedule-stop.dto';
import { UpdateTripScheduleSchema } from '../dto/update-trip-schedule.dto';
import { SchedulesService } from '../services/schedules.service';

@ApiTags('Schedules')
@ApiBearerAuth()
@Controller('api/v1/schedules')
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a master recurring trip schedule (timetable)' })
  @ApiResponse({ status: 201, description: 'Trip schedule created successfully' })
  async createSchedule(@Body() body: unknown) {
    const validated = CreateTripScheduleSchema.parse(body);
    return this.service.createSchedule(validated);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List and query trip schedules' })
  @ApiResponse({ status: 200, description: 'Trip schedules retrieved successfully' })
  async getSchedules(@Query() query: unknown) {
    const validated = QueryTripSchedulesSchema.parse(query);
    return this.service.getSchedules(validated);
  }

  @Get('summary')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get timetable summary joined with routes, stops, and calendar days' })
  @ApiResponse({ status: 200, description: 'Timetable summary retrieved successfully' })
  async getScheduleSummary(
    @Query('routeCode') routeCode?: string,
    @Query('isActive') isActiveStr?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const isActive = isActiveStr === 'true' ? true : isActiveStr === 'false' ? false : undefined;
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10), 1), 100) : 20;
    const offset = offsetStr ? Math.max(parseInt(offsetStr, 10), 0) : 0;

    return this.service.getScheduleSummary({
      routeCode,
      isActive,
      limit,
      offset,
    });
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get trip schedule details by ID with intermediate stops' })
  @ApiResponse({ status: 200, description: 'Trip schedule found' })
  async getScheduleById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getScheduleById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update trip schedule departure/arrival times or calendar' })
  @ApiResponse({ status: 200, description: 'Trip schedule updated successfully' })
  async updateSchedule(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = UpdateTripScheduleSchema.parse(body);
    return this.service.updateSchedule(id, validated);
  }

  @Delete(':id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate trip schedule' })
  @ApiResponse({ status: 200, description: 'Trip schedule deactivated' })
  async deleteSchedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteSchedule(id);
  }

  @Post(':id/stops')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an intermediate stop timing offset to trip schedule' })
  @ApiResponse({ status: 201, description: 'Schedule stop added' })
  async addScheduleStop(@Param('id', ParseUUIDPipe) scheduleId: string, @Body() body: unknown) {
    const validated = AddScheduleStopSchema.parse(body);
    return this.service.addScheduleStop(scheduleId, validated);
  }

  @Get(':id/stops')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get intermediate stops for trip schedule' })
  @ApiResponse({ status: 200, description: 'Schedule stops retrieved' })
  async getScheduleStops(@Param('id', ParseUUIDPipe) scheduleId: string) {
    return this.service.getScheduleStops(scheduleId);
  }

  @Patch(':id/stops/:stopId')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update intermediate stop scheduled arrival/departure offsets' })
  @ApiResponse({ status: 200, description: 'Schedule stop updated' })
  async updateScheduleStop(
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() body: unknown,
  ) {
    const validated = UpdateScheduleStopSchema.parse(body);
    return this.service.updateScheduleStop(scheduleId, stopId, validated);
  }

  @Delete(':id/stops/:stopId')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove intermediate stop from trip schedule' })
  @ApiResponse({ status: 200, description: 'Schedule stop removed' })
  async deleteScheduleStop(
    @Param('id', ParseUUIDPipe) scheduleId: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
  ) {
    return this.service.deleteScheduleStop(scheduleId, stopId);
  }
}
