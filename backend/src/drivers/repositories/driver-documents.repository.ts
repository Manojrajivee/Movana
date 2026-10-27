import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RegisterDriverDocumentDto } from '../dto/register-driver-document.dto';

export interface DriverDocumentTypeEntity {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isMandatory: boolean;
  expires: boolean;
  createdAt: Date;
}

export interface DriverDocumentEntity {
  id: string;
  driverId: string;
  documentTypeId: string;
  documentNumber: string;
  documentUrl: string;
  issuedDate: string | null;
  expiryDate: string | null;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  verifiedBy: string | null;
  verifiedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  documentType?: {
    code: string;
    name: string;
    isMandatory: boolean;
    expires: boolean;
  };
}

@Injectable()
export class DriverDocumentsRepository {
  constructor(private readonly db: DatabaseService) {}

  async getDocumentTypes(): Promise<DriverDocumentTypeEntity[]> {
    const res = await this.db.query(
      `SELECT id, code, name, description, is_mandatory, expires, created_at
       FROM driver_document_types
       ORDER BY code ASC;`,
    );
    return res.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      isMandatory: row.is_mandatory,
      expires: row.expires,
      createdAt: row.created_at,
    }));
  }

  async findDocumentTypeById(id: string): Promise<DriverDocumentTypeEntity | null> {
    const res = await this.db.query(
      `SELECT id, code, name, description, is_mandatory, expires, created_at
       FROM driver_document_types
       WHERE id = $1;`,
      [id],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      isMandatory: row.is_mandatory,
      expires: row.expires,
      createdAt: row.created_at,
    };
  }

  async upsertDocument(
    driverId: string,
    data: RegisterDriverDocumentDto,
  ): Promise<DriverDocumentEntity> {
    const query = `
      INSERT INTO driver_documents (
        driver_id,
        document_type_id,
        document_number,
        document_url,
        issued_date,
        expiry_date,
        verification_status,
        verified_by,
        verified_at,
        rejection_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', NULL, NULL, NULL)
      ON CONFLICT (driver_id, document_type_id) DO UPDATE SET
        document_number = EXCLUDED.document_number,
        document_url = EXCLUDED.document_url,
        issued_date = EXCLUDED.issued_date,
        expiry_date = EXCLUDED.expiry_date,
        verification_status = 'PENDING',
        verified_by = NULL,
        verified_at = NULL,
        rejection_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id;
    `;

    const res = await this.db.query(query, [
      driverId,
      data.documentTypeId,
      data.documentNumber,
      data.documentUrl,
      data.issuedDate || null,
      data.expiryDate || null,
    ]);

    const docId = res.rows[0].id;
    const doc = await this.findDocumentById(docId);
    return doc!;
  }

  async findDocumentsByDriverId(driverId: string): Promise<DriverDocumentEntity[]> {
    const query = `
      SELECT 
        dd.id,
        dd.driver_id,
        dd.document_type_id,
        dd.document_number,
        dd.document_url,
        dd.issued_date::text AS issued_date,
        dd.expiry_date::text AS expiry_date,
        dd.verification_status,
        dd.verified_by,
        dd.verified_at,
        dd.rejection_reason,
        dd.created_at,
        dd.updated_at,
        json_build_object(
          'code', dt.code,
          'name', dt.name,
          'isMandatory', dt.is_mandatory,
          'expires', dt.expires
        ) AS document_type
      FROM driver_documents dd
      JOIN driver_document_types dt ON dt.id = dd.document_type_id
      WHERE dd.driver_id = $1
      ORDER BY dt.is_mandatory DESC, dt.name ASC;
    `;

    const res = await this.db.query(query, [driverId]);
    return res.rows.map((row) => this.mapRow(row));
  }

  async findDocumentById(documentId: string): Promise<DriverDocumentEntity | null> {
    const query = `
      SELECT 
        dd.id,
        dd.driver_id,
        dd.document_type_id,
        dd.document_number,
        dd.document_url,
        dd.issued_date::text AS issued_date,
        dd.expiry_date::text AS expiry_date,
        dd.verification_status,
        dd.verified_by,
        dd.verified_at,
        dd.rejection_reason,
        dd.created_at,
        dd.updated_at,
        json_build_object(
          'code', dt.code,
          'name', dt.name,
          'isMandatory', dt.is_mandatory,
          'expires', dt.expires
        ) AS document_type
      FROM driver_documents dd
      JOIN driver_document_types dt ON dt.id = dd.document_type_id
      WHERE dd.id = $1;
    `;

    const res = await this.db.query(query, [documentId]);
    return res.rows[0] ? this.mapRow(res.rows[0]) : null;
  }

  async recordVerification(
    documentId: string,
    status: 'VERIFIED' | 'REJECTED',
    verifiedBy: string,
    rejectionReason?: string,
    notes?: string,
  ): Promise<DriverDocumentEntity> {
    return this.db.withTransaction(async (client) => {
      // 1. Update document
      const updateDocQuery = `
        UPDATE driver_documents
        SET 
          verification_status = $1,
          verified_by = $2,
          verified_at = CURRENT_TIMESTAMP,
          rejection_reason = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING driver_id, document_type_id;
      `;
      const updateRes = await client.query(updateDocQuery, [
        status,
        verifiedBy,
        status === 'REJECTED' ? rejectionReason || null : null,
        documentId,
      ]);

      const { driver_id: driverId, document_type_id: typeId } = updateRes.rows[0];

      // 2. Fetch doc type code for verification log
      const typeRes = await client.query(`SELECT code FROM driver_document_types WHERE id = $1;`, [
        typeId,
      ]);
      const typeCode = typeRes.rows[0]?.code || 'DOCUMENT_CHECK';

      // 3. Log into driver_verifications
      await client.query(
        `INSERT INTO driver_verifications (
          driver_id, verification_type, status, notes, verified_by
        ) VALUES ($1, $2, $3, $4, $5);`,
        [driverId, typeCode, status, notes || null, verifiedBy],
      );

      // 4. Evaluate overall driver verification status:
      // If any mandatory doc is rejected -> REJECTED
      // If all mandatory docs are verified -> VERIFIED
      if (status === 'REJECTED') {
        await client.query(
          `UPDATE drivers SET verification_status = 'REJECTED', updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
          [driverId],
        );
      } else {
        const checkQuery = `
          SELECT 
            COUNT(*) FILTER (WHERE dt.is_mandatory = TRUE) AS mandatory_total,
            COUNT(*) FILTER (WHERE dt.is_mandatory = TRUE AND dd.verification_status = 'VERIFIED') AS mandatory_verified
          FROM driver_document_types dt
          LEFT JOIN driver_documents dd ON dd.document_type_id = dt.id AND dd.driver_id = $1;
        `;
        const checkRes = await client.query(checkQuery, [driverId]);
        const { mandatory_total, mandatory_verified } = checkRes.rows[0];
        if (
          parseInt(mandatory_total, 10) > 0 &&
          parseInt(mandatory_total, 10) === parseInt(mandatory_verified, 10)
        ) {
          await client.query(
            `UPDATE drivers SET verification_status = 'VERIFIED', updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
            [driverId],
          );
        }
      }

      // Return refreshed document
      const docRes = await client.query(
        `
        SELECT 
          dd.id,
          dd.driver_id,
          dd.document_type_id,
          dd.document_number,
          dd.document_url,
          dd.issued_date::text AS issued_date,
          dd.expiry_date::text AS expiry_date,
          dd.verification_status,
          dd.verified_by,
          dd.verified_at,
          dd.rejection_reason,
          dd.created_at,
          dd.updated_at,
          json_build_object(
            'code', dt.code,
            'name', dt.name,
            'isMandatory', dt.is_mandatory,
            'expires', dt.expires
          ) AS document_type
        FROM driver_documents dd
        JOIN driver_document_types dt ON dt.id = dd.document_type_id
        WHERE dd.id = $1;
        `,
        [documentId],
      );

      return this.mapRow(docRes.rows[0]);
    });
  }

  private mapRow(row: any): DriverDocumentEntity {
    return {
      id: row.id,
      driverId: row.driver_id,
      documentTypeId: row.document_type_id,
      documentNumber: row.document_number,
      documentUrl: row.document_url,
      issuedDate: row.issued_date || null,
      expiryDate: row.expiry_date || null,
      verificationStatus: row.verification_status,
      verifiedBy: row.verified_by || null,
      verifiedAt: row.verified_at || null,
      rejectionReason: row.rejection_reason || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      documentType: row.document_type || undefined,
    };
  }
}
