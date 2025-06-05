import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { EncryptionService } from './encryption.service';

interface CreateUserDto {
  email: string;
  address: string;
  phone: string;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private encryptionService: EncryptionService,
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const user = new User();
    user.email = createUserDto.email;
    user.encryptedAddress = this.encryptionService.encrypt(createUserDto.address);
    user.encryptedPhone = this.encryptionService.encrypt(createUserDto.phone);
    
    return this.userRepository.save(user);
  }

  async findUserById(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    
    if (user) {
      // Decrypt sensitive fields for return
      user.address = this.encryptionService.decrypt(user.encryptedAddress);
      user.phone = this.encryptionService.decrypt(user.encryptedPhone);
    }
    
    return user;
  }

  async updateUserAddress(id: number, newAddress: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    
    if (user) {
      user.encryptedAddress = this.encryptionService.encrypt(newAddress);
      return this.userRepository.save(user);
    }
    
    throw new Error('User not found');
  }
}