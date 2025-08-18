import { Table, Column, Model, DataType } from 'sequelize-typescript';

@Table({
  tableName: 'addresses',
  timestamps: true,
  createdAt: 'created_at',    // Sequelize will auto-set on creation
  updatedAt: 'modified_date', // Sequelize will auto-set on update
  indexes: [
    { fields: ['userId'] },
    { fields: ['pin'] },
    { fields: ['city'] },
    { fields: ['state'] },
  ],
})
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
  country: string | null;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isDefault: boolean;

  @Column({ field: 'modified_by', type: DataType.STRING, allowNull: true })
  modified_by: string;
}
