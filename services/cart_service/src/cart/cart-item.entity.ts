import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('cart_items')
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ name: 'productid' }) // productId stored as "productid"
  productId: string;

  @Column()
  quantity: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ name: 'manufacturername', nullable: true })
  manufacturerName: string;

  @Column({ name: 'manufacturerpartnumber', nullable: true })
  manufacturerPartNumber: string;


  @Column({ type: 'double precision', nullable: true })
  price: number;

  @Column({ name: 'datasheeturl', nullable: true })
  datasheetUrl: string;

  @Column({ name: 'imageurl', nullable: true })
  imageUrl: string;

  @Column({ name: 'createdby', nullable: true })
  createdBy: string;

  @Column({ name: 'modifiedby', nullable: true })
  modifiedBy: string;

  @Column({ name: 'createddate', type: 'timestamp', nullable: true })
  createdDate: Date;

  @Column({ name: 'modifieddate', type: 'timestamp', nullable: true })
  modifiedDate: Date;

  @Column({ default: true })
  status: boolean;

  @Column({ name: 'package_type', nullable: true })
  packageType: string; // New field for package type
}
