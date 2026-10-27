import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DriverAssignmentsService } from '../services/driver-assignments.service';
import {
  CreateDriverAssignmentDto,
  CreateDriverAssignmentSchema,
} from '../dto/create-driver-assignment.dto';
import {
  UpdateAssignmentStatusDto,
  UpdateAssignmentStatusSchema,
} from '../dto/update-assignment-status.dto';
import { QueryAssignmentsDto, QueryAssignmentsSchema } from '../dto/query-assignments.dto';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { DriverAssignmentEntity } from '../repositories/driver-assignments.repository';

@ApiTags('Driver Assignments')
@ApiBearerAuth()
@Controller(['api/v1/driver-assignments', 'api/v1/drivers/assignments'])
export class DriverAssignmentsController {
  constructor(private readonly assignmentsService: DriverAssignmentsService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign driver to a shift, trip, or standby duty' })
  @ApiResponse({ status: 201, description: 'Assignment scheduled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid assignment parameters or driver not eligible' })
  @ApiResponse({ status: 404, description: 'Driver or vehicle not found' })
  @ApiResponse({ status: 409, description: 'Driver or vehicle has overlapping assignment' })
  async createAssignment(
    @Body() body: CreateDriverAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverAssignmentEntity> {
    const validated = CreateDriverAssignmentSchema.parse(body);
    return this.assignmentsService.createAssignment(validated, user);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'List driver duty assignments with filtering' })
  @ApiResponse({ status: 200, description: 'Assignments list retrieved successfully' })
  async getAssignments(
    @Query() query: QueryAssignmentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ assignments: DriverAssignmentEntity[]; total: number }> {
    const validated = QueryAssignmentsSchema.parse(query);
    return this.assignmentsService.getAssignments(validated, user);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'Get details of a specific driver assignment' })
  @ApiResponse({ status: 200, description: 'Assignment retrieved successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: driver attempting to view another assignment',
  })
  @ApiResponse({ status: 404, description: 'Assignment not found' })
  async getAssignmentById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverAssignmentEntity> {
    return this.assignmentsService.getAssignmentById(id, user);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @ApiOperation({
    summary: 'Transition assignment status (SCHEDULED, ACTIVE, COMPLETED, CANCELLED)',
  })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: driver attempting to cancel or alter other assignment',
  })
  @ApiResponse({ status: 404, description: 'Assignment not found' })
  async updateAssignmentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAssignmentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverAssignmentEntity> {
    const validated = UpdateAssignmentStatusSchema.parse(body);
    return this.assignmentsService.updateAssignmentStatus(id, validated, user);
  }
}
