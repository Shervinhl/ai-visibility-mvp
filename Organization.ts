import { query } from '@config/database';
import { Organization } from '@/types';
import { logger } from '@utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class OrganizationModel {
  /**
   * Create a new organization
   */
  static async create(data: Partial<Organization>): Promise<Organization> {
    const id = uuidv4();
    const sql = `
      INSERT INTO organizations 
      (id, name, domain, description, industry, founded_year, website_url, 
       entity_type, entity_names, locations, brand_relationships)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      id,
      data.name,
      data.domain,
      data.description || null,
      data.industry || null,
      data.foundedYear || null,
      data.websiteUrl || null,
      data.entityType || null,
      data.entityNames ? JSON.stringify(data.entityNames) : null,
      data.locations ? JSON.stringify(data.locations) : null,
      data.brandRelationships ? JSON.stringify(data.brandRelationships) : null,
    ];

    try {
      const result = await query(sql, values);
      logger.info(`Organization created: ${id}`);
      return this.rowToOrganization(result.rows[0]);
    } catch (error) {
      logger.error('Failed to create organization', { error, data });
      throw error;
    }
  }

  /**
   * Get organization by ID
   */
  static async findById(id: string): Promise<Organization | null> {
    const sql = 'SELECT * FROM organizations WHERE id = $1';
    try {
      const result = await query(sql, [id]);
      if (result.rows.length === 0) return null;
      return this.rowToOrganization(result.rows[0]);
    } catch (error) {
      logger.error('Failed to find organization', { error, id });
      throw error;
    }
  }

  /**
   * Get organization by domain
   */
  static async findByDomain(domain: string): Promise<Organization | null> {
    const sql = 'SELECT * FROM organizations WHERE domain = $1';
    try {
      const result = await query(sql, [domain]);
      if (result.rows.length === 0) return null;
      return this.rowToOrganization(result.rows[0]);
    } catch (error) {
      logger.error('Failed to find organization by domain', { error, domain });
      throw error;
    }
  }

  /**
   * Get all organizations (with pagination)
   */
  static async findAll(limit: number = 20, offset: number = 0): Promise<Organization[]> {
    const sql = 'SELECT * FROM organizations ORDER BY created_at DESC LIMIT $1 OFFSET $2';
    try {
      const result = await query(sql, [limit, offset]);
      return result.rows.map(row => this.rowToOrganization(row));
    } catch (error) {
      logger.error('Failed to list organizations', { error });
      throw error;
    }
  }

  /**
   * Update organization
   */
  static async update(id: string, data: Partial<Organization>): Promise<Organization> {
    const fields = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.name) {
      fields.push(`name = $${paramCount++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(data.description);
    }
    if (data.industry) {
      fields.push(`industry = $${paramCount++}`);
      values.push(data.industry);
    }
    if (data.websiteUrl) {
      fields.push(`website_url = $${paramCount++}`);
      values.push(data.websiteUrl);
    }
    if (data.entityNames) {
      fields.push(`entity_names = $${paramCount++}`);
      values.push(JSON.stringify(data.entityNames));
    }
    if (data.locations) {
      fields.push(`locations = $${paramCount++}`);
      values.push(JSON.stringify(data.locations));
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const sql = `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    try {
      const result = await query(sql, values);
      if (result.rows.length === 0) {
        throw new Error('Organization not found');
      }
      logger.info(`Organization updated: ${id}`);
      return this.rowToOrganization(result.rows[0]);
    } catch (error) {
      logger.error('Failed to update organization', { error, id });
      throw error;
    }
  }

  /**
   * Delete organization
   */
  static async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM organizations WHERE id = $1';
    try {
      const result = await query(sql, [id]);
      const deleted = result.rowCount > 0;
      if (deleted) {
        logger.info(`Organization deleted: ${id}`);
      }
      return deleted;
    } catch (error) {
      logger.error('Failed to delete organization', { error, id });
      throw error;
    }
  }

  /**
   * Convert database row to Organization object
   */
  private static rowToOrganization(row: any): Organization {
    return {
      id: row.id,
      name: row.name,
      domain: row.domain,
      description: row.description,
      industry: row.industry,
      foundedYear: row.founded_year,
      websiteUrl: row.website_url,
      entityType: row.entity_type,
      entityNames: row.entity_names,
      locations: row.locations,
      parentOrganization: row.parent_organization,
      brandRelationships: row.brand_relationships,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
