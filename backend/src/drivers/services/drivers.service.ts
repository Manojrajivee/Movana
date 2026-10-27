import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  DriversRepository,
  DriverEntity,
  PaginatedDriversResult,
} from '../repositories/drivers.repository';
import { CreateDriverDto, CreateDriverSchema } from '../dto/create-driver.dto';
import { UpdateDriverDto, UpdateDriverSchema } from '../dto/update-driver.dto';
import { UpdateDriverStatusDto, UpdateDriverStatusSchema } from '../dto/update-driver-status.dto';
import { QueryDriversDto, QueryDriversSchema } from '../dto/query-drivers.dto';
import { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(private readonly driversRepo: DriversRepository) {}

  /**
   * Provisions a new driver linked to an existing user account.
   */
  async createDriver(data: CreateDriverDto, assignedBy: AuthenticatedUser): Promise<DriverEntity> {
    const validated = CreateDriverSchema.parse(data);

    // 1. Check license expiry is in the future
    const expiry = new Date(validated.licenseExpiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expiry <= today) {
      throw new BadRequestException('Driver license expiry date must be a future date');
    }

    // 2. Uniqueness checks
    const existingByUser = await this.driversRepo.findByUserId(validated.userId);
    if (existingByUser) {
      throw new ConflictException('User is already registered as a commercial driver');
    }

    const existingByEmp = await this.driversRepo.findByEmployeeCode(validated.employeeCode);
    if (existingByEmp) {
      throw new ConflictException('Employee code is already registered in the system');
    }

    const existingByLicense = await this.driversRepo.findByLicenseNumber(validated.licenseNumber);
    if (existingByLicense) {
      throw new ConflictException('Commercial license number is already registered in the system');
    }

    const created = await this.driversRepo.create(validated, assignedBy.id);
    this.logger.log(
      `Driver provisioned with ID [${created.id}], employee code [${created.employeeCode}]`,
    );
    return created;
  }

  /**
   * Retrieves driver profile belonging to authenticated user.
   */
  async getMyDriverProfile(currentUser: AuthenticatedUser): Promise<DriverEntity> {
    const driver = await this.driversRepo.findByUserId(currentUser.id);
    if (!driver) {
      throw new NotFoundException('Driver profile not found for authenticated user');
    }
    return driver;
  }

  /**
   * Retrieves driver profile by UUID with role and ownership authorization.
   */
  async getDriverById(driverId: string, currentUser: AuthenticatedUser): Promise<DriverEntity> {
    const driver = await this.driversRepo.findById(driverId);
    if (!driver) {
      throw new NotFoundException(`Driver with ID [${driverId}] not found`);
    }

    const isSelf = driver.userId === currentUser.id;
    const isAuthorizedStaff =
      currentUser.roles.includes('ADMIN') ||
      currentUser.roles.includes('OPERATOR') ||
      currentUser.roles.includes('SAFETY_OFFICER');

    if (!isSelf && !isAuthorizedStaff) {
      throw new ForbiddenException('Access denied: insufficient privileges to view driver details');
    }

    return driver;
  }

  /**
   * Updates permitted driver details.
   */
  async updateDriver(
    driverId: string,
    data: UpdateDriverDto,
    currentUser: AuthenticatedUser,
  ): Promise<DriverEntity> {
    const validated = UpdateDriverSchema.parse(data);
    const driver = await this.getDriverById(driverId, currentUser);

    const isSelf = driver.userId === currentUser.id;
    const isOperatorOrAdmin =
      currentUser.roles.includes('ADMIN') || currentUser.roles.includes('OPERATOR');

    if (!isSelf && !isOperatorOrAdmin) {
      throw new ForbiddenException('Access denied: cannot update driver profile');
    }

    if (validated.licenseExpiryDate) {
      const expiry = new Date(validated.licenseExpiryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expiry <= today) {
        throw new BadRequestException('Driver license expiry date must be a future date');
      }
    }

    const updated = await this.driversRepo.update(driverId, validated);
    if (!updated) {
      throw new NotFoundException('Failed to update driver details');
    }
    return updated;
  }

  /**
   * Transitions driver employment status with audit trail.
   */
  async updateDriverStatus(
    driverId: string,
    dto: UpdateDriverStatusDto,
    currentUser: AuthenticatedUser,
  ): Promise<{ success: boolean; message: string }> {
    const validated = UpdateDriverStatusSchema.parse(dto);

    const driver = await this.driversRepo.findById(driverId);
    if (!driver) {
      throw new NotFoundException(`Driver with ID [${driverId}] not found`);
    }

    // Business invariant: Cannot transition terminated driver back without ADMIN role
    if (driver.employmentStatus === 'TERMINATED' && validated.status !== 'TERMINATED') {
      if (!currentUser.roles.includes('ADMIN')) {
        throw new ForbiddenException(
          'Reactivating a terminated driver requires Super Administrator authorization',
        );
      }
    }

    const success = await this.driversRepo.updateStatus(
      driverId,
      validated.status,
      validated.reason,
      currentUser.id,
    );

    if (!success) {
      throw new NotFoundException('Failed to transition driver status');
    }

    this.logger.log(
      `Driver [${driverId}] status transitioned from [${driver.employmentStatus}] to [${validated.status}] by [${currentUser.id}]`,
    );

    return {
      success: true,
      message: `Driver status successfully transitioned to ${validated.status}`,
    };
  }

  /**
   * Paginated driver search and filter.
   */
  async listDrivers(query: QueryDriversDto): Promise<PaginatedDriversResult> {
    const validated = QueryDriversSchema.parse(query);
    return this.driversRepo.findAll(validated);
  }
}
