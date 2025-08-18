// modules/role/role.model.ts
import { Column, Model, Table, DataType } from 'sequelize-typescript';

@Table({ tableName: 'user_roles', timestamps: false })
export class Role extends Model<Role> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  _id: string;

  @Column({ type: DataType.INTEGER, unique: true, allowNull: false })
  role_id: number;

  @Column({ type: DataType.STRING, allowNull: false })
  role_name: string;

  @Column({ type: DataType.DATE, defaultValue: DataType.NOW })
  created_date: Date;

  @Column(DataType.STRING)
  created_by: string;

  @Column(DataType.STRING)
  modified_by: string;

  @Column(DataType.DATE)
  modified_date: Date; // ✅ Important

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  status: boolean;
}
