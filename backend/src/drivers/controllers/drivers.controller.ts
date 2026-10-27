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
import { DriversService } from '../services/drivers.service';
import { CreateDriverDto, CreateDriverSchema } from '../dto/create-driver.dto';
import { UpdateDriverDto, UpdateDriverSchema } from '../dto/update-driver.dto';
import { UpdateDriverStatusDto, UpdateDriverStatusSchema } from '../dto/update-driver-status.dto';
import { QueryDriversDto, QueryDriversSchema } from '../dto/query-drivers.dto';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { DriverEntity, PaginatedDriversResult } from '../repositories/drivers.repository';

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('api/v1/drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Provision a new commercial driver' })
  @ApiResponse({ status: 201, description: 'Driver provisioned successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 409,
    description: 'Unique constraint conflict (user, employee code, license)',
  })
  async createDriver(
    @Body() body: CreateDriverDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverEntity> {
    const validated = CreateDriverSchema.parse(body);
    return this.driversService.createDriver(validated, user);
  }

  @Get('me')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Retrieve authenticated driver profile' })
  @ApiResponse({ status: 200, description: 'Driver profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Driver profile not found' })
  async getMyDriverProfile(@CurrentUser() user: AuthenticatedUser): Promise<DriverEntity> {
    return this.driversService.getMyDriverProfile(user);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @ApiOperation({ summary: 'List and search drivers with pagination and status filters' })
  @ApiResponse({ status: 200, description: 'Drivers retrieved successfully' })
  async listDrivers(@Query() query: QueryDriversDto): Promise<PaginatedDriversResult> {
    const validated = QueryDriversSchema.parse(query);
    return this.driversService.listDrivers(validated);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve driver profile by UUID (Owner, Operator, Safety, Admin)' })
  @ApiResponse({ status: 200, description: 'Driver retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Driver not found' })
  async getDriverById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverEntity> {
    return this.driversService.getDriverById(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update permitted driver details' })
  @ApiResponse({ status: 200, description: 'Driver updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Driver not found' })
  async updateDriver(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateDriverDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverEntity> {
    const validated = UpdateDriverSchema.parse(body);
    return this.driversService.updateDriver(id, validated, user);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Transition driver employment status with audit reason' })
  @ApiResponse({ status: 200, description: 'Driver status transitioned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Driver not found' })
  async updateDriverStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateDriverStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    const validated = UpdateDriverStatusSchema.parse(body);
    return this.driversService.updateDriverStatus(id, validated, user);
  }
}
