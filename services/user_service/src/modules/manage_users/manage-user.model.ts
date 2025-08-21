import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  Index,
  Unique,
} from 'sequelize-typescript';
import { v4 as uuidv4 } from 'uuid';

@Table({ 
  tableName: 'profile_details', 
  timestamps: false
})
export class ManageUser extends Model {
  @PrimaryKey
  @Default(uuidv4)
  @Column({ 
    type: DataType.UUID,
    allowNull: false
  })
  userId: string;

  @Column({ 
    type: DataType.STRING(50), 
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 50]
    }
  })
  first_name: string;

  @Column({ 
    type: DataType.STRING(50), 
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 50]
    }
  })
  last_name: string;

  @Column({ 
    type: DataType.STRING(255), 
    allowNull: false,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  })
  email: string;

  @Column({ 
    type: DataType.STRING(20), 
    allowNull: false,
    validate: {
      notEmpty: true,
      is: /^[\+]?[1-9][\d]{0,15}$/
    }
  })
  phone: string;

  @Column({ 
    type: DataType.STRING(255), 
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [8, 255]
    }
  })
  password: string;

  @Column({ 
    type: DataType.STRING(50), 
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [2, 50]
    }
  })
  role: string;

  @Column({ 
    type: DataType.INTEGER, 
    allowNull: false,
    validate: {
      isInt: true,
      min: 1
    }
  })
  role_id: number;

  @Column({ 
    type: DataType.DATE, 
    defaultValue: DataType.NOW,
    allowNull: false
  })
  created_at: Date;

  @Column({ 
    type: DataType.STRING(255), 
    allowNull: true,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  })
  created_by: string;

  @Column({ 
    type: DataType.STRING(255), 
    allowNull: true,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  })
  modified_by: string;

  @Column({ 
    type: DataType.DATE, 
    allowNull: true 
  })
  modified_date: Date;

  @Column({ 
    type: DataType.BOOLEAN, 
    allowNull: true,
    defaultValue: true
  })
  status: boolean;
}
