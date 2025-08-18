// user_service/common/models/profile.model.ts

import { Table, Column, Model, DataType } from 'sequelize-typescript';

@Table({
  tableName: 'profile_details',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'modified_date',
})
export class Profile extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  userId: string;

  @Column({ field: 'first_name', type: DataType.STRING })
  first_name: string;

  @Column({ field: 'last_name', type: DataType.STRING })
  last_name: string;

  @Column({ field: 'email', type: DataType.STRING })
  email: string;
  

  @Column({ field: 'phone', type: DataType.STRING })
  phone: string;


  @Column({ field: 'password', type: DataType.STRING })
  password: string;

  @Column({ field: 'role', type: DataType.STRING })
  role: string;

  @Column({ field: 'role_id', type: DataType.STRING })
  role_id: string;

  @Column({ field: 'created_by', type: DataType.STRING })
  created_by: string;

  @Column({ field: 'modified_by', type: DataType.STRING })
  modified_by: string;

  @Column({ field: 'status', type: DataType.BOOLEAN, defaultValue: true })
  status: boolean;

  @Column({ field: 'created_at', type: DataType.DATE })
  created_at: Date;

  @Column({ field: 'modified_date', type: DataType.DATE })
  modified_date: Date;

}
