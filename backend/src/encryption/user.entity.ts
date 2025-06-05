import { Entity, Column, PrimaryGeneratedColumn, BeforeInsert, BeforeUpdate } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  encryptedAddress: string; // This will store encrypted address

  @Column()
  encryptedPhone: string; // This will store encrypted phone

  // Transient properties for plain text values
  address?: string;
  phone?: string;
}