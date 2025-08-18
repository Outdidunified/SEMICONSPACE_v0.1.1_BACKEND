// src/modules/address/address.model.ts
import { Table, Column, Model, DataType } from 'sequelize-typescript';

@Table({ tableName: 'addresses', timestamps: true, createdAt: 'created_at', updatedAt: 'modified_date' })
export class Address extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  addressId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @Column({ type: DataType.STRING, allowNull: true })
  address: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  pin: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  city: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  state: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  country: string | null; // ✅ New column

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isDefault: boolean;


  @Column({ field: 'modified_by', type: DataType.STRING, allowNull: true })
  modified_by: string;
}
