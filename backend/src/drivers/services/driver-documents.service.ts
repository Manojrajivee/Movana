import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  DriverDocumentsRepository,
  DriverDocumentEntity,
  DriverDocumentTypeEntity,
} from '../repositories/driver-documents.repository';
import { DriversRepository } from '../repositories/drivers.repository';
import {
  RegisterDriverDocumentDto,
  RegisterDriverDocumentSchema,
} from '../dto/register-driver-document.dto';
import {
  VerifyDriverDocumentDto,
  VerifyDriverDocumentSchema,
} from '../dto/verify-driver-document.dto';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

@Injectable()
export class DriverDocumentsService {
  private readonly logger = new Logger(DriverDocumentsService.name);

  constructor(
    private readonly docsRepo: DriverDocumentsRepository,
    private readonly driversRepo: DriversRepository,
  ) {}

  /**
   * Retrieves list of all supported compliance document types.
   */
  async getDocumentTypes(): Promise<DriverDocumentTypeEntity[]> {
    return this.docsRepo.getDocumentTypes();
  }

  /**
   * Registers or updates document metadata for a driver.
   */
  async registerDocument(
    driverId: string,
    data: RegisterDriverDocumentDto,
    currentUser: AuthenticatedUser,
  ): Promise<DriverDocumentEntity> {
    const validated = RegisterDriverDocumentSchema.parse(data);

    const driver = await this.driversRepo.findById(driverId);
    if (!driver) {
      throw new NotFoundException(`Driver with ID [${driverId}] not found`);
    }

    const isSelf = driver.userId === currentUser.id;
    const isOperatorOrAdmin =
      currentUser.roles.includes('ADMIN') || currentUser.roles.includes('OPERATOR');

    if (!isSelf && !isOperatorOrAdmin) {
      throw new ForbiddenException('Access denied: cannot register documents for this driver');
    }

    const docType = await this.docsRepo.findDocumentTypeById(validated.documentTypeId);
    if (!docType) {
      throw new NotFoundException(`Document type [${validated.documentTypeId}] does not exist`);
    }

    // If document type expires, expiry date is required and must be in the future
    if (docType.expires) {
      if (!validated.expiryDate) {
        throw new BadRequestException(
          `Document type '${docType.name}' requires a valid expiry date`,
        );
      }
      const expiry = new Date(validated.expiryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expiry <= today) {
        throw new BadRequestException('Document expiry date must be in the future');
      }
    }

    const registered = await this.docsRepo.upsertDocument(driverId, validated);
    this.logger.log(`Document [${registered.id}] registered for driver [${driverId}]`);
    return registered;
  }

  /**
   * Lists all uploaded compliance documents for a driver.
   */
  async getDocumentsForDriver(
    driverId: string,
    currentUser: AuthenticatedUser,
  ): Promise<DriverDocumentEntity[]> {
    const driver = await this.driversRepo.findById(driverId);
    if (!driver) {
      throw new NotFoundException(`Driver with ID [${driverId}] not found`);
    }

    const isSelf = driver.userId === currentUser.id;
    const isStaff =
      currentUser.roles.includes('ADMIN') ||
      currentUser.roles.includes('OPERATOR') ||
      currentUser.roles.includes('SAFETY_OFFICER');

    if (!isSelf && !isStaff) {
      throw new ForbiddenException('Access denied: cannot view documents for this driver');
    }

    return this.docsRepo.findDocumentsByDriverId(driverId);
  }

  /**
   * Retrieves specific document by ID.
   */
  async getDocumentById(
    documentId: string,
    currentUser: AuthenticatedUser,
  ): Promise<DriverDocumentEntity> {
    const doc = await this.docsRepo.findDocumentById(documentId);
    if (!doc) {
      throw new NotFoundException(`Document with ID [${documentId}] not found`);
    }

    const driver = await this.driversRepo.findById(doc.driverId);
    if (!driver) {
      throw new NotFoundException('Associated driver not found');
    }

    const isSelf = driver.userId === currentUser.id;
    const isStaff =
      currentUser.roles.includes('ADMIN') ||
      currentUser.roles.includes('OPERATOR') ||
      currentUser.roles.includes('SAFETY_OFFICER');

    if (!isSelf && !isStaff) {
      throw new ForbiddenException('Access denied: cannot view this document');
    }

    return doc;
  }

  /**
   * Evaluates and records compliance decision (VERIFIED or REJECTED) with separation of duties.
   */
  async verifyDocument(
    documentId: string,
    data: VerifyDriverDocumentDto,
    currentUser: AuthenticatedUser,
  ): Promise<DriverDocumentEntity> {
    const validated = VerifyDriverDocumentSchema.parse(data);

    const doc = await this.docsRepo.findDocumentById(documentId);
    if (!doc) {
      throw new NotFoundException(`Document with ID [${documentId}] not found`);
    }

    const driver = await this.driversRepo.findById(doc.driverId);
    if (!driver) {
      throw new NotFoundException('Associated driver not found');
    }

    // Separation of duties rule: A user cannot verify their own document
    if (driver.userId === currentUser.id) {
      throw new ForbiddenException(
        'Separation of duties violation: drivers are strictly prohibited from evaluating their own compliance documents',
      );
    }

    const verified = await this.docsRepo.recordVerification(
      documentId,
      validated.status,
      currentUser.id,
      validated.rejectionReason,
      validated.notes,
    );

    this.logger.log(
      `Document [${documentId}] marked as [${validated.status}] by [${currentUser.id}]`,
    );

    return verified;
  }
}
