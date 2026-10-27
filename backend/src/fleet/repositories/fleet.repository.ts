import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';

export interface VehicleEntity {
  id: string;
  registration_number: string;
  vehicle_code: string;
  vehicle_type_id: string;
  manufacturer_id: string;
  model_id: string;
  model_year: number;
  vin: string;
  engine_number: string;
  capacity: number;
  standing_capacity: number;
  seat_capacity: number;
  fuel_type: 'DIESEL' | 'ELECTRIC' | 'CNG' | 'HYBRID';
  status: 'ACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED' | 'RESERVED';
  current_odometer: string | number;
  current_latitude: string | number | null;
  current_longitude: string | number | null;
  last_location_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  manufacturer_name?: string;
  model_name?: string;
  type_name?: string;
  type_code?: string;
}

export interface VehicleManufacturerEntity {
  id: string;
  name: string;
  country: string;
  website: string | null;
  created_at: Date;
}

export interface VehicleModelEntity {
  id: string;
  manufacturer_id: string;
  name: string;
  release_year: number | null;
  default_capacity: number;
  created_at: Date;
  manufacturer_name?: string;
}

export interface VehicleTypeEntity {
  id: string;
  code: string;
  name: string;
  description: string | null;
  default_fare_multiplier: string | number;
  is_active: boolean;
  created_at: Date;
}

@Injectable()
export class FleetRepository {
  constructor(private readonly db: DatabaseService) {}

  async createVehicle(
    data: {
      registrationNumber: string;
      vehicleCode: string;
      vehicleTypeId: string;
      manufacturerId: string;
      modelId: string;
      modelYear: number;
      vin: string;
      engineNumber: string;
      capacity: number;
      standingCapacity: number;
      seatCapacity: number;
      fuelType: string;
      currentOdometer: number;
    },
    client?: PoolClient,
  ): Promise<VehicleEntity> {
    const query = `
      INSERT INTO vehicles (
        registration_number, vehicle_code, vehicle_type_id, manufacturer_id,
        model_id, model_year, vin, engine_number, capacity, standing_capacity,
        seat_capacity, fuel_type, status, current_odometer
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE', $13)
      RETURNING *
    `;
    const params = [
      data.registrationNumber,
      data.vehicleCode,
      data.vehicleTypeId,
      data.manufacturerId,
      data.modelId,
      data.modelYear,
      data.vin,
      data.engineNumber,
      data.capacity,
      data.standingCapacity,
      data.seatCapacity,
      data.fuelType,
      data.currentOdometer,
    ];

    const result = client
      ? await client.query<VehicleEntity>(query, params)
      : await this.db.query<VehicleEntity>(query, params);

    return result.rows[0];
  }

  async findVehicleById(id: string, client?: PoolClient): Promise<VehicleEntity | null> {
    const query = `
      SELECT 
        v.*,
        vm.name AS manufacturer_name,
        vmod.name AS model_name,
        vt.name AS type_name,
        vt.code AS type_code
      FROM vehicles v
      JOIN vehicle_manufacturers vm ON vm.id = v.manufacturer_id
      JOIN vehicle_models vmod ON vmod.id = v.model_id
      JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
      WHERE v.id = $1 AND v.deleted_at IS NULL
    `;
    const result = client
      ? await client.query<VehicleEntity>(query, [id])
      : await this.db.query<VehicleEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findVehicleByRegistrationNumber(
    regNum: string,
    client?: PoolClient,
  ): Promise<VehicleEntity | null> {
    const query = `SELECT * FROM vehicles WHERE UPPER(registration_number) = UPPER($1) AND deleted_at IS NULL`;
    const result = client
      ? await client.query<VehicleEntity>(query, [regNum])
      : await this.db.query<VehicleEntity>(query, [regNum]);

    return result.rows[0] ?? null;
  }

  async findVehicleByCode(code: string, client?: PoolClient): Promise<VehicleEntity | null> {
    const query = `SELECT * FROM vehicles WHERE UPPER(vehicle_code) = UPPER($1) AND deleted_at IS NULL`;
    const result = client
      ? await client.query<VehicleEntity>(query, [code])
      : await this.db.query<VehicleEntity>(query, [code]);

    return result.rows[0] ?? null;
  }

  async findVehicleByVin(vin: string, client?: PoolClient): Promise<VehicleEntity | null> {
    const query = `SELECT * FROM vehicles WHERE UPPER(vin) = UPPER($1) AND deleted_at IS NULL`;
    const result = client
      ? await client.query<VehicleEntity>(query, [vin])
      : await this.db.query<VehicleEntity>(query, [vin]);

    return result.rows[0] ?? null;
  }

  async findVehicles(
    options: {
      status?: string;
      vehicleTypeId?: string;
      manufacturerId?: string;
      modelId?: string;
      fuelType?: string;
      search?: string;
      limit: number;
      offset: number;
    },
    client?: PoolClient,
  ): Promise<{ vehicles: VehicleEntity[]; total: number }> {
    const conditions: string[] = ['v.deleted_at IS NULL'];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (options.status) {
      conditions.push(`v.status = $${paramIndex++}`);
      params.push(options.status);
    }

    if (options.vehicleTypeId) {
      conditions.push(`v.vehicle_type_id = $${paramIndex++}`);
      params.push(options.vehicleTypeId);
    }

    if (options.manufacturerId) {
      conditions.push(`v.manufacturer_id = $${paramIndex++}`);
      params.push(options.manufacturerId);
    }

    if (options.modelId) {
      conditions.push(`v.model_id = $${paramIndex++}`);
      params.push(options.modelId);
    }

    if (options.fuelType) {
      conditions.push(`v.fuel_type = $${paramIndex++}`);
      params.push(options.fuelType);
    }

    if (options.search) {
      conditions.push(
        `(v.registration_number ILIKE $${paramIndex} OR v.vehicle_code ILIKE $${paramIndex} OR v.vin ILIKE $${paramIndex})`,
      );
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countQuery = `SELECT COUNT(*)::int AS count FROM vehicles v ${whereClause}`;
    const countResult = client
      ? await client.query<{ count: number }>(countQuery, params)
      : await this.db.query<{ count: number }>(countQuery, params);
    const total = countResult.rows[0]?.count ?? 0;

    const dataQuery = `
      SELECT 
        v.*,
        vm.name AS manufacturer_name,
        vmod.name AS model_name,
        vt.name AS type_name,
        vt.code AS type_code
      FROM vehicles v
      JOIN vehicle_manufacturers vm ON vm.id = v.manufacturer_id
      JOIN vehicle_models vmod ON vmod.id = v.model_id
      JOIN vehicle_types vt ON vt.id = v.vehicle_type_id
      ${whereClause}
      ORDER BY v.vehicle_code ASC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(options.limit, options.offset);

    const dataResult = client
      ? await client.query<VehicleEntity>(dataQuery, params)
      : await this.db.query<VehicleEntity>(dataQuery, params);

    return { vehicles: dataResult.rows, total };
  }

  async updateVehicle(
    id: string,
    data: {
      vehicleTypeId?: string;
      seatCapacity?: number;
      standingCapacity?: number;
      capacity?: number;
      fuelType?: string;
      currentOdometer?: number;
    },
    client?: PoolClient,
  ): Promise<VehicleEntity | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (data.vehicleTypeId !== undefined) {
      fields.push(`vehicle_type_id = $${idx++}`);
      params.push(data.vehicleTypeId);
    }

    if (data.seatCapacity !== undefined) {
      fields.push(`seat_capacity = $${idx++}`);
      params.push(data.seatCapacity);
    }

    if (data.standingCapacity !== undefined) {
      fields.push(`standing_capacity = $${idx++}`);
      params.push(data.standingCapacity);
    }

    if (data.capacity !== undefined) {
      fields.push(`capacity = $${idx++}`);
      params.push(data.capacity);
    }

    if (data.fuelType !== undefined) {
      fields.push(`fuel_type = $${idx++}`);
      params.push(data.fuelType);
    }

    if (data.currentOdometer !== undefined) {
      fields.push(`current_odometer = $${idx++}`);
      params.push(data.currentOdometer);
    }

    if (fields.length === 0) {
      return this.findVehicleById(id, client);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const query = `
      UPDATE vehicles
      SET ${fields.join(', ')}
      WHERE id = $${idx} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = client
      ? await client.query<VehicleEntity>(query, params)
      : await this.db.query<VehicleEntity>(query, params);

    return result.rows[0] ?? null;
  }

  async updateVehicleStatus(
    id: string,
    status: 'ACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED' | 'RESERVED',
    client?: PoolClient,
  ): Promise<VehicleEntity | null> {
    const query = `
      UPDATE vehicles
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = client
      ? await client.query<VehicleEntity>(query, [status, id])
      : await this.db.query<VehicleEntity>(query, [status, id]);

    return result.rows[0] ?? null;
  }

  async recordStatusHistory(
    vehicleId: string,
    oldStatus: string,
    newStatus: string,
    reason: string | null,
    changedBy: string | null,
    client?: PoolClient,
  ): Promise<void> {
    const query = `
      INSERT INTO vehicle_status_history (
        vehicle_id, old_status, new_status, reason, changed_by
      )
      VALUES ($1, $2, $3, $4, $5)
    `;
    const params = [vehicleId, oldStatus, newStatus, reason, changedBy];
    if (client) {
      await client.query(query, params);
    } else {
      await this.db.query(query, params);
    }
  }

  async updateTelemetry(
    id: string,
    latitude: number,
    longitude: number,
    odometer?: number,
    client?: PoolClient,
  ): Promise<VehicleEntity | null> {
    const odoClause = odometer !== undefined ? ', current_odometer = $4' : '';
    const query = `
      UPDATE vehicles
      SET current_latitude = $1,
          current_longitude = $2,
          last_location_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
          ${odoClause}
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `;
    const params =
      odometer !== undefined ? [latitude, longitude, id, odometer] : [latitude, longitude, id];

    const result = client
      ? await client.query<VehicleEntity>(query, params)
      : await this.db.query<VehicleEntity>(query, params);

    return result.rows[0] ?? null;
  }

  async softDeleteVehicle(id: string, client?: PoolClient): Promise<VehicleEntity | null> {
    const query = `
      UPDATE vehicles
      SET deleted_at = CURRENT_TIMESTAMP, status = 'DECOMMISSIONED', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = client
      ? await client.query<VehicleEntity>(query, [id])
      : await this.db.query<VehicleEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findVehicleTypes(client?: PoolClient): Promise<VehicleTypeEntity[]> {
    const query = `SELECT * FROM vehicle_types ORDER BY name ASC`;
    const result = client
      ? await client.query<VehicleTypeEntity>(query)
      : await this.db.query<VehicleTypeEntity>(query);

    return result.rows;
  }

  async findVehicleTypeById(id: string, client?: PoolClient): Promise<VehicleTypeEntity | null> {
    const query = `SELECT * FROM vehicle_types WHERE id = $1`;
    const result = client
      ? await client.query<VehicleTypeEntity>(query, [id])
      : await this.db.query<VehicleTypeEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findVehicleModels(
    manufacturerId?: string,
    client?: PoolClient,
  ): Promise<VehicleModelEntity[]> {
    let query = `
      SELECT vm.*, mfg.name AS manufacturer_name
      FROM vehicle_models vm
      JOIN vehicle_manufacturers mfg ON mfg.id = vm.manufacturer_id
    `;
    const params: string[] = [];
    if (manufacturerId) {
      query += ` WHERE vm.manufacturer_id = $1`;
      params.push(manufacturerId);
    }
    query += ` ORDER BY vm.name ASC`;

    const result = client
      ? await client.query<VehicleModelEntity>(query, params)
      : await this.db.query<VehicleModelEntity>(query, params);

    return result.rows;
  }

  async findVehicleModelById(id: string, client?: PoolClient): Promise<VehicleModelEntity | null> {
    const query = `SELECT * FROM vehicle_models WHERE id = $1`;
    const result = client
      ? await client.query<VehicleModelEntity>(query, [id])
      : await this.db.query<VehicleModelEntity>(query, [id]);

    return result.rows[0] ?? null;
  }

  async findManufacturers(client?: PoolClient): Promise<VehicleManufacturerEntity[]> {
    const query = `SELECT * FROM vehicle_manufacturers ORDER BY name ASC`;
    const result = client
      ? await client.query<VehicleManufacturerEntity>(query)
      : await this.db.query<VehicleManufacturerEntity>(query);

    return result.rows;
  }

  async findManufacturerById(
    id: string,
    client?: PoolClient,
  ): Promise<VehicleManufacturerEntity | null> {
    const query = `SELECT * FROM vehicle_manufacturers WHERE id = $1`;
    const result = client
      ? await client.query<VehicleManufacturerEntity>(query, [id])
      : await this.db.query<VehicleManufacturerEntity>(query, [id]);

    return result.rows[0] ?? null;
  }
}
