import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DriverAssignmentsService } from '../services/driver-assignments.service';
import {
  CreateDriverAvailabilityDto,
  CreateDriverAvailabilitySchema,
} from '../dto/create-driver-availability.dto';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { DriverAvailabilityEntity } from '../repositories/driver-assignments.repository';

@ApiTags('Driver Availability')
@ApiBearerAuth()
@Controller('api/v1/drivers/:driverId/availability')
export class DriverAvailabilityController {
  constructor(private readonly assignmentsService: DriverAssignmentsService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a recurring weekly availability shift for a driver' })
  @ApiResponse({ status: 201, description: 'Shift created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid shift timing or day' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: driver attempting to modify another driver shift',
  })
  @ApiResponse({ status: 404, description: 'Driver not found' })
  async createAvailability(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() body: CreateDriverAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverAvailabilityEntity> {
    const validated = CreateDriverAvailabilitySchema.parse(body);
    return this.assignmentsService.createAvailability(driverId, validated, user);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'List weekly availability shifts for a driver' })
  @ApiResponse({ status: 200, description: 'Availability roster retrieved successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: driver attempting to view another driver shift',
  })
  @ApiResponse({ status: 404, description: 'Driver not found' })
  async getAvailability(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverAvailabilityEntity[]> {
    return this.assignmentsService.getAvailability(driverId, user);
  }

  @Delete(':availId')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a weekly availability shift for a driver' })
  @ApiResponse({ status: 204, description: 'Shift removed successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: driver attempting to remove another driver shift',
  })
  @ApiResponse({ status: 404, description: 'Shift or driver not found' })
  async deleteAvailability(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Param('availId', ParseUUIDPipe) availId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.assignmentsService.deleteAvailability(driverId, availId, user);
  }
}
