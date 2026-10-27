import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DriverDocumentsService } from '../services/driver-documents.service';
import {
  RegisterDriverDocumentDto,
  RegisterDriverDocumentSchema,
} from '../dto/register-driver-document.dto';
import {
  VerifyDriverDocumentDto,
  VerifyDriverDocumentSchema,
} from '../dto/verify-driver-document.dto';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  DriverDocumentEntity,
  DriverDocumentTypeEntity,
} from '../repositories/driver-documents.repository';

@ApiTags('Driver Documents')
@ApiBearerAuth()
@Controller('api/v1/drivers')
export class DriverDocumentsController {
  constructor(private readonly docsService: DriverDocumentsService) {}

  @Get('document-types')
  @ApiOperation({ summary: 'List all supported driver compliance document types' })
  @ApiResponse({ status: 200, description: 'Document types retrieved successfully' })
  async getDocumentTypes(): Promise<DriverDocumentTypeEntity[]> {
    return this.docsService.getDocumentTypes();
  }

  @Post(':driverId/documents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register compliance document metadata for a driver' })
  @ApiResponse({ status: 201, description: 'Document registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Driver or document type not found' })
  async registerDocument(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @Body() body: RegisterDriverDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverDocumentEntity> {
    const validated = RegisterDriverDocumentSchema.parse(body);
    return this.docsService.registerDocument(driverId, validated, user);
  }

  @Get(':driverId/documents')
  @ApiOperation({ summary: 'List all registered documents for a driver' })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Driver not found' })
  async getDocumentsForDriver(
    @Param('driverId', new ParseUUIDPipe({ version: '4' })) driverId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverDocumentEntity[]> {
    return this.docsService.getDocumentsForDriver(driverId, user);
  }

  @Get('documents/:documentId')
  @ApiOperation({ summary: 'Retrieve specific document metadata by ID' })
  @ApiResponse({ status: 200, description: 'Document retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocumentById(
    @Param('documentId', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverDocumentEntity> {
    return this.docsService.getDocumentById(documentId, user);
  }

  @Patch('documents/:documentId/verify')
  @Roles('SAFETY_OFFICER', 'ADMIN', 'OPERATOR')
  @ApiOperation({ summary: 'Evaluate and verify driver document (Separation of duties enforced)' })
  @ApiResponse({ status: 200, description: 'Document verification status updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'Forbidden (including self-verification attempt)' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async verifyDocument(
    @Param('documentId', new ParseUUIDPipe({ version: '4' })) documentId: string,
    @Body() body: VerifyDriverDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DriverDocumentEntity> {
    const validated = VerifyDriverDocumentSchema.parse(body);
    return this.docsService.verifyDocument(documentId, validated, user);
  }
}
