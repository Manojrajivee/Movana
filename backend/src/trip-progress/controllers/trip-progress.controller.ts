import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { QueryMilestonesSchema } from '../dto/query-trip-progress.dto';
import { RecordMilestoneSchema } from '../dto/record-milestone.dto';
import { TripProgressService } from '../services/trip-progress.service';

@ApiTags('Trip Progress')
@ApiBearerAuth()
@Controller('api/v1/trip-progress')
export class TripProgressController {
  constructor(private readonly service: TripProgressService) {}

  @Get('active/live-board')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get active trip progress live board with calculated progress' })
  @ApiResponse({ status: 200, description: 'Live board retrieved successfully' })
  async getLiveBoard() {
    return this.service.getLiveBoard();
  }

  @Get(':tripId')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get real-time trip progress, completion percentage, and stop sequence',
  })
  @ApiResponse({ status: 200, description: 'Trip progress retrieved' })
  async getTripProgress(@Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.service.getTripProgress(tripId);
  }

  @Post(':tripId/milestones')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record an operational milestone event for an active trip' })
  @ApiResponse({ status: 201, description: 'Milestone event recorded successfully' })
  async recordMilestone(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const validated = RecordMilestoneSchema.parse(body);
    return this.service.recordMilestone(tripId, validated, currentUser.id);
  }

  @Get(':tripId/milestones')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get chronological milestone events for a trip' })
  @ApiResponse({ status: 200, description: 'Milestones retrieved' })
  async getTripMilestones(@Param('tripId', ParseUUIDPipe) tripId: string, @Query() query: unknown) {
    const validated = QueryMilestonesSchema.parse(query);
    return this.service.getTripMilestones(tripId, validated);
  }
}
