import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class Message {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true }) // El ID que da waha
  whatsappId: string;

  @Column()
  from: string; // Emisor

  @Column({ nullable: true })
  fromMe: boolean; // Autoenviado

  @Column('text')
  body: string; // Contenido

  @Column({ default: 'received' })
  status: string; // Estado

  @CreateDateColumn()
  createdAt: Date; // Fecha
}