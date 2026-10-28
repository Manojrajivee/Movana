import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateNotificationSchema } from '../dto/create-notification.dto';
import { QueryNotificationsSchema } from '../dto/query-notifications.dto';
import { NotificationsService } from '../services/notifications.service';

@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  async dispatchNotification(@Body() body: unknown, @CurrentUser() currentUser: any) {
    const parsed = CreateNotificationSchema.parse(body);
    return this.service.dispatch(parsed, currentUser);
  }

  @Get('me')
  async getMyNotifications(
    @CurrentUser() currentUser: any,
    @Query() query: Record<string, string>,
  ) {
    const parsed = QueryNotificationsSchema.parse(query);
    return this.service.getUserNotifications(currentUser.id, parsed);
  }

  @Get('me/unread-count')
  async getMyUnreadCount(@CurrentUser() currentUser: any) {
    return this.service.getUnreadCount(currentUser.id);
  }

  @Post('me/read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@CurrentUser() currentUser: any) {
    return this.service.markAllAsRead(currentUser);
  }

  @Get(':id')
  async getNotificationById(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.service.getNotificationById(id, currentUser);
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.service.markAsRead(id, currentUser);
  }

  @Post(':id/retry')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  async retryNotification(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.service.retryNotification(id, currentUser);
  }

  @Get(':id/deliveries')
  async getDeliveryHistory(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.service.getDeliveryHistory(id, currentUser);
  }
}
