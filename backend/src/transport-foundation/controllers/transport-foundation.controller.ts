import {
  BadRequestException,
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
import { CreateCalendarExceptionSchema } from '../dto/create-calendar-exception.dto';
import { CreateServiceCalendarSchema } from '../dto/create-service-calendar.dto';
import { QueryServiceCalendarsSchema } from '../dto/query-service-calendars.dto';
import { UpdateServiceCalendarSchema } from '../dto/update-service-calendar.dto';
import { TransportFoundationService } from '../services/transport-foundation.service';

@ApiTags('Transport Foundation')
@ApiBearerAuth()
@Controller('api/v1/transport-foundation')
export class TransportFoundationController {
  constructor(private readonly service: TransportFoundationService) {}

  @Get('transit-modes')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get supported platform transit modes and network definitions' })
  @ApiResponse({ status: 200, description: 'Transit modes retrieved' })
  getTransitModes() {
    return this.service.getTransitModes();
  }

  @Post('calendars')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a master service calendar' })
  @ApiResponse({ status: 201, description: 'Service calendar created' })
  async createCalendar(@Body() body: unknown) {
    const validated = CreateServiceCalendarSchema.parse(body);
    return this.service.createCalendar(validated);
  }

  @Get('calendars')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List and query service calendars' })
  @ApiResponse({ status: 200, description: 'Service calendars retrieved' })
  async getCalendars(@Query() query: unknown) {
    const validated = QueryServiceCalendarsSchema.parse(query);
    return this.service.getCalendars(validated);
  }

  @Get('calendars/:id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get service calendar by ID with exceptions' })
  @ApiResponse({ status: 200, description: 'Service calendar found' })
  async getCalendarById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCalendarById(id);
  }

  @Patch('calendars/:id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update service calendar details' })
  @ApiResponse({ status: 200, description: 'Service calendar updated' })
  async updateCalendar(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = UpdateServiceCalendarSchema.parse(body);
    return this.service.updateCalendar(id, validated);
  }

  @Delete('calendars/:id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete service calendar' })
  @ApiResponse({ status: 200, description: 'Service calendar deleted' })
  async deleteCalendar(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteCalendar(id);
  }

  @Post('calendars/:id/exceptions')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a calendar exception (holiday or special service)' })
  @ApiResponse({ status: 201, description: 'Calendar exception created' })
  async createException(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = CreateCalendarExceptionSchema.parse(body);
    return this.service.createException(id, validated);
  }

  @Get('calendars/:id/exceptions')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List calendar exceptions' })
  @ApiResponse({ status: 200, description: 'Calendar exceptions retrieved' })
  async getExceptions(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getExceptions(id);
  }

  @Delete('calendars/:id/exceptions/:exceptionId')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete calendar exception' })
  @ApiResponse({ status: 200, description: 'Calendar exception deleted' })
  async deleteException(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('exceptionId', ParseUUIDPipe) exceptionId: string,
  ) {
    return this.service.deleteException(id, exceptionId);
  }

  @Get('calendars/:id/is-active-on')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check if service calendar is active on a specific date' })
  @ApiResponse({ status: 200, description: 'Activity check completed' })
  async isCalendarActiveOnDate(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('date') date: string,
  ) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Query parameter "date" must be formatted as YYYY-MM-DD');
    }
    return this.service.isCalendarActiveOnDate(id, date);
  }
}
