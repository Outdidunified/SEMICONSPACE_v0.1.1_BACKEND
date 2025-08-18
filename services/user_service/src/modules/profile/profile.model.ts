// src/modules/profile/profile.model.ts
import { Table, Column, Model, DataType, Index } from 'sequelize-typescript';

@Table({
  tableName: 'profile_details',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'modified_date',
  indexes: [
    {
      unique: true,
      fields: ['email'], // Unique index like in Mongoose
    },
    {
      fields: ['phone'], //  Normal index
    },
  ],
})
export class Profile extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  userId: string;

  @Column({ field: 'first_name', type: DataType.STRING })
  first_name: string;

  @Column({ field: 'last_name', type: DataType.STRING })
  last_name: string;

  @Column({
    field: 'email',
    type: DataType.STRING,
    allowNull: false,
    unique: true, // 
  })
  email: string;

  @Column({ field: 'role', type: DataType.STRING })
  role: string;

  @Index // 
  @Column({ field: 'phone', type: DataType.STRING })
  phone: string;

  @Column({ field: 'password', type: DataType.STRING })
  password: string;

  @Column({ field: 'role_id', type: DataType.STRING })
  role_id: string;

  @Column({ field: 'modified_by', type: DataType.STRING })
  modified_by: string;

  @Column({
    field: 'status',
    type: DataType.BOOLEAN,
    defaultValue: true,
  })
  status: boolean;
}
