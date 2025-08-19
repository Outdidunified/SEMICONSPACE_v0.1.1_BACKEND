// models/permission.model.ts
import { Column, Model, Table, DataType, ForeignKey } from 'sequelize-typescript';
import { Role } from '../role/role.model';

@Table({ tableName: 'role_permission', timestamps: false })
export class Permission extends Model<Permission> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  _id: string;

  @ForeignKey(() => Role)
  @Column({ type: DataType.INTEGER, allowNull: false })
  role_id: number;

  @Column({ type: DataType.STRING, allowNull: false })
  module: string;

  @Column({ type: DataType.STRING, allowNull: true })
  sub_module: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  can_create: boolean;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  can_view: boolean;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  can_update: boolean;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  can_delete: boolean;

  @Column({ type: DataType.BOOLEAN, defaultValue: true })
  status: boolean;
}
