import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  UpdateNotificationPreferenceSchema,
  UpdatePreferencesMatrixSchema,
} from '../dto/update-notification-preference.dto';
import { NotificationPreferencesService } from '../services/notification-preferences.service';

@Controller('api/v1/notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly service: NotificationPreferencesService) {}

  @Get('me')
  async getMyPreferences(@CurrentUser() currentUser: any) {
    return this.service.getUserPreferences(currentUser.id);
  }

  @Patch('me')
  async updateMySinglePreference(@CurrentUser() currentUser: any, @Body() body: unknown) {
    const parsed = UpdateNotificationPreferenceSchema.parse(body);
    return this.service.updateSinglePreference(currentUser.id, parsed);
  }

  @Put('me/matrix')
  async updateMyPreferencesMatrix(@CurrentUser() currentUser: any, @Body() body: unknown) {
    const parsed = UpdatePreferencesMatrixSchema.parse(body);
    return this.service.updatePreferencesMatrix(currentUser.id, parsed);
  }

  @Post('me/reset-defaults')
  @HttpCode(HttpStatus.OK)
  async resetMyPreferences(@CurrentUser() currentUser: any) {
    return this.service.resetToDefaults(currentUser.id);
  }

  @Get('users/:userId')
  @Roles('ADMIN', 'OPERATOR')
  async getUserPreferencesAdmin(@Param('userId') userId: string) {
    return this.service.getUserPreferences(userId);
  }
}
