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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AssignIncidentSchema } from '../dto/assign-incident.dto';
import { CloseIncidentSchema } from '../dto/close-incident.dto';
import { CreateIncidentActionSchema } from '../dto/create-action.dto';
import { QueryIncidentManagementSchema } from '../dto/query-incident-management.dto';
import { ResolveIncidentSchema } from '../dto/resolve-incident.dto';
import { TransitionIncidentStatusSchema } from '../dto/transition-status.dto';
import { IncidentManagementService } from '../services/incident-management.service';

@Controller('api/v1/incident-management')
export class IncidentManagementController {
  constructor(private readonly service: IncidentManagementService) {}

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  async listIncidents(@Query() query: unknown) {
    const parsed = QueryIncidentManagementSchema.parse(query);
    return this.service.listIncidents(parsed);
  }

  @Get(':id/lifecycle')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER', 'PASSENGER', 'DRIVER')
  async getIncidentLifecycle(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: any,
  ) {
    return this.service.getIncidentLifecycle(id, currentUser);
  }

  @Post(':id/assign')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  async assignInvestigator(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: any,
  ) {
    const parsed = AssignIncidentSchema.parse(body);
    return this.service.assignInvestigator(id, parsed, currentUser);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  async transitionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: any,
  ) {
    const parsed = TransitionIncidentStatusSchema.parse(body);
    return this.service.transitionStatus(id, parsed, currentUser);
  }

  @Post(':id/actions')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.CREATED)
  async recordCorrectiveAction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: any,
  ) {
    const parsed = CreateIncidentActionSchema.parse(body);
    return this.service.recordCorrectiveAction(id, parsed, currentUser);
  }

  @Post(':id/resolve')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  async resolveIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: any,
  ) {
    const parsed = ResolveIncidentSchema.parse(body);
    return this.service.resolveIncident(id, parsed, currentUser);
  }

  @Post(':id/close')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  async closeIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: any,
  ) {
    const parsed = CloseIncidentSchema.parse(body || {});
    return this.service.closeIncident(id, parsed, currentUser);
  }
}
