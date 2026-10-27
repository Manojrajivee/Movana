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
import { AuthenticatedUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateDisruptionSchema } from '../dto/create-disruption.dto';
import { QueryDisruptionsSchema } from '../dto/query-disruptions.dto';
import { ResolveDisruptionSchema } from '../dto/resolve-disruption.dto';
import { UpdateDisruptionSchema } from '../dto/update-disruption.dto';
import { ServiceDisruptionsService } from '../services/service-disruptions.service';

@ApiTags('Service Disruptions')
@ApiBearerAuth()
@Controller('api/v1/service-disruptions')
export class ServiceDisruptionsController {
  constructor(private readonly service: ServiceDisruptionsService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create and broadcast an operational transit service disruption advisory',
  })
  @ApiResponse({ status: 201, description: 'Service disruption created successfully' })
  async createDisruption(@Body() body: unknown, @CurrentUser() currentUser: AuthenticatedUser) {
    const validated = CreateDisruptionSchema.parse(body);
    return this.service.createDisruption(validated, currentUser);
  }

  @Get('active')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all currently active service disruption advisories across the network',
  })
  @ApiResponse({ status: 200, description: 'Active service disruptions retrieved' })
  async getActiveDisruptions() {
    return this.service.getActiveDisruptions();
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Query service disruption advisories with route, trip, and severity filters',
  })
  @ApiResponse({ status: 200, description: 'Service disruptions retrieved' })
  async getDisruptions(@Query() query: unknown) {
    const validated = QueryDisruptionsSchema.parse(query);
    return this.service.getDisruptions(validated);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get details of a specific service disruption advisory' })
  @ApiResponse({ status: 200, description: 'Service disruption details retrieved' })
  async getDisruptionById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getDisruptionById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update details or extend schedule of a service disruption advisory' })
  @ApiResponse({ status: 200, description: 'Service disruption updated successfully' })
  async updateDisruption(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = UpdateDisruptionSchema.parse(body);
    return this.service.updateDisruption(id, validated);
  }

  @Post(':id/resolve')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve and clear an active service disruption advisory' })
  @ApiResponse({ status: 200, description: 'Service disruption resolved successfully' })
  async resolveDisruption(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = ResolveDisruptionSchema.parse(body);
    return this.service.resolveDisruption(id, validated);
  }

  @Delete(':id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a service disruption advisory' })
  @ApiResponse({ status: 200, description: 'Service disruption deleted successfully' })
  async deleteDisruption(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteDisruption(id);
  }
}
