// models/permission.model.ts
import { Column, Model, Table, DataType, ForeignKey, Index } from 'sequelize-typescript';
import { Role } from '../role/role.model';

@Table({
  tableName: 'role_permission',
  timestamps: false,
  indexes: [
    {
      fields: ['role_id'], // index to speed up permission fetch per role
    },
    {
      fields: ['module'], // index for faster module lookups
    },
    {
      fields: ['sub_module'], // index for faster submodule lookups
    },
    {
      unique: true,
      fields: ['role_id', 'module', 'sub_module'], 
      // ensures a role cannot have duplicate module+submodule permission entries
    },
  ],
})
export class Permission extends Model<Permission> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  _id: string;

  @ForeignKey(() => Role)
  @Index // explicit index
  @Column({ type: DataType.INTEGER, allowNull: false })
  role_id: number;

  @Index // explicit index
  @Column({ type: DataType.STRING, allowNull: false })
  module: string;

  @Index // explicit index
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
