import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { CreateLocationShareSchema } from '../dto/create-share.dto';
import { LocationSharingService } from '../services/location-sharing.service';

@Controller('api/v1/location-sharing')
export class LocationSharingController {
  constructor(private readonly service: LocationSharingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createShare(@Body() body: unknown, @CurrentUser() currentUser: any) {
    const parsed = CreateLocationShareSchema.parse(body);
    return this.service.createShare(parsed, currentUser);
  }

  @Get('active')
  async getActiveShares(@CurrentUser() currentUser: any) {
    return this.service.getActiveShares(currentUser);
  }

  @Delete(':id')
  async revokeShare(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.service.revokeShare(id, currentUser);
  }

  @Public()
  @Get('public/:token')
  async getPublicLocation(@Param('token') token: string, @Res() res: Response) {
    const data = await this.service.getPublicLocation(token);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(HttpStatus.OK).json(data);
  }
}
