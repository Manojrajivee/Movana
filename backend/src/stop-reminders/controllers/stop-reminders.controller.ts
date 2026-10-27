import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateStopReminderSchema } from '../dto/create-reminder.dto';
import { StopRemindersService } from '../services/stop-reminders.service';

@ApiTags('Stop Reminders')
@ApiBearerAuth()
@Controller('api/v1/stop-reminders')
export class StopRemindersController {
  constructor(private readonly service: StopRemindersService) {}

  @Post()
  @Roles('PASSENGER', 'ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Subscribe to an approaching stop alarm reminder' })
  @ApiResponse({ status: 201, description: 'Stop reminder created successfully' })
  async createReminder(@Body() body: unknown, @CurrentUser() currentUser: AuthenticatedUser) {
    const validated = CreateStopReminderSchema.parse(body);
    return this.service.createReminder(validated, currentUser);
  }

  @Get('me')
  @Roles('PASSENGER', 'ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all active stop reminders for the authenticated passenger' })
  @ApiResponse({ status: 200, description: 'User reminders retrieved' })
  async getMyReminders(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.service.getUserReminders(currentUser.id);
  }

  @Get(':id')
  @Roles('PASSENGER', 'ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get details of a specific stop reminder' })
  @ApiResponse({ status: 200, description: 'Stop reminder details retrieved' })
  async getReminderById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.service.getReminderById(id, currentUser);
  }

  @Delete(':id')
  @Roles('PASSENGER', 'ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel/dismiss an approaching stop reminder alarm' })
  @ApiResponse({ status: 200, description: 'Stop reminder cancelled successfully' })
  async deleteReminder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.service.deleteReminder(id, currentUser);
  }

  @Post('evaluate/:tripId')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Evaluate and trigger pending stop reminders for an active trip' })
  @ApiResponse({ status: 200, description: 'Reminders evaluated and triggered alarms returned' })
  async evaluateTripReminders(@Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.service.evaluateTripReminders(tripId);
  }
}
