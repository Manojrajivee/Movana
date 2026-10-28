import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateEmergencyContactSchema } from '../dto/emergency-contact.dto';
import { TriggerSosSchema, UpdateSosStatusSchema } from '../dto/trigger-sos.dto';
import { SosService } from '../services/sos.service';

@Controller('api/v1/sos')
export class SosController {
  constructor(private readonly service: SosService) {}

  @Post('trigger')
  @HttpCode(HttpStatus.CREATED)
  async triggerSos(@Body() body: unknown, @CurrentUser() currentUser: any) {
    const parsed = TriggerSosSchema.parse(body);
    return this.service.triggerSos(parsed, currentUser);
  }

  @Get('active')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  async getActiveEmergencies(@CurrentUser() currentUser: any) {
    return this.service.getActiveEmergencies(currentUser);
  }

  @Get('contacts')
  async getEmergencyContacts(@CurrentUser() currentUser: any) {
    return this.service.getEmergencyContacts(currentUser);
  }

  @Post('contacts')
  @HttpCode(HttpStatus.CREATED)
  async addEmergencyContact(@Body() body: unknown, @CurrentUser() currentUser: any) {
    const parsed = CreateEmergencyContactSchema.parse(body);
    return this.service.addEmergencyContact(parsed, currentUser);
  }

  @Delete('contacts/:id')
  async deleteEmergencyContact(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.service.deleteEmergencyContact(id, currentUser);
  }

  @Get(':id')
  async getEmergencyById(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.service.getEmergencyById(id, currentUser);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  async updateEmergencyStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: any,
  ) {
    const parsed = UpdateSosStatusSchema.parse(body);
    return this.service.updateEmergencyStatus(id, parsed, currentUser);
  }
}
