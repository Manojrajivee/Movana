import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DriverOperationsService, DutyEndResult } from '../services/driver-operations.service';
import { StartDutySchema } from '../dto/start-duty.dto';
import { EndDutySchema } from '../dto/end-duty.dto';
import { RecordSafetyEventSchema } from '../dto/record-safety-event.dto';
import { QuerySafetyEventsSchema } from '../dto/query-safety-events.dto';
import { QueryDutyHistorySchema } from '../dto/query-duty-history.dto';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  DriverDutyAssignmentEntity,
  DriverSafetyEventEntity,
  DriverHoursSummary,
} from '../repositories/driver-operations.repository';

@ApiTags('Driver Operations')
@ApiBearerAuth()
@Controller('api/v1/driver-operations')
export class DriverOperationsController {
  constructor(private readonly driverOpsService: DriverOperationsService) {}

  @Post('duty/start')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @ApiOperation({ summary: 'Clock-in / Start driver operational shift duty' })
  @ApiResponse({ status: 200, description: 'Driver duty started successfully' })
  async startDuty(
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<DriverDutyAssignmentEntity> {
    const validated = StartDutySchema.parse(body);
    return this.driverOpsService.startDuty(validated, currentUser);
  }

  @Post('duty/end')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @ApiOperation({ summary: 'Clock-out / Complete driver operational shift duty and verify HOS' })
  @ApiResponse({ status: 200, description: 'Driver duty completed successfully' })
  async endDuty(
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<DutyEndResult> {
    const validated = EndDutySchema.parse(body);
    return this.driverOpsService.endDuty(validated, currentUser);
  }

  @Get('duty/current')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'Get current active duty assignment for driver' })
  @ApiResponse({ status: 200, description: 'Current active duty retrieved' })
  async getCurrentDuty(
    @Query('driverId') driverId: string | undefined,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<DriverDutyAssignmentEntity | null> {
    return this.driverOpsService.getCurrentDuty(driverId, currentUser);
  }

  @Get('duty/history')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'Query driver shift duty history with hours of service summary' })
  @ApiResponse({ status: 200, description: 'Duty history and summary retrieved' })
  async getDutyHistory(
    @Query() query: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{
    history: DriverDutyAssignmentEntity[];
    total: number;
    summary: DriverHoursSummary;
  }> {
    const validated = QueryDutyHistorySchema.parse(query);
    return this.driverOpsService.getDutyHistory(validated, currentUser);
  }

  @Post('safety-events')
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @ApiOperation({ summary: 'Record driver safety infraction or telematics alert' })
  @ApiResponse({ status: 201, description: 'Driver safety event recorded' })
  async recordSafetyEvent(
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<DriverSafetyEventEntity> {
    const validated = RecordSafetyEventSchema.parse(body);
    return this.driverOpsService.recordSafetyEvent(validated, currentUser);
  }

  @Get('safety-events')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'Query driver safety events and compliance records' })
  @ApiResponse({ status: 200, description: 'Driver safety events retrieved' })
  async getSafetyEvents(
    @Query() query: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{ events: DriverSafetyEventEntity[]; total: number }> {
    const validated = QuerySafetyEventsSchema.parse(query);
    return this.driverOpsService.getSafetyEvents(validated, currentUser);
  }
}
