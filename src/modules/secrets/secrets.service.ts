import { Injectable } from '@nestjs/common';
import { CreateSecretDto } from './dto/create-secret.dto';
import { UpdateSecretDto } from './dto/update-secret.dto';

@Injectable()
export class SecretsService {
  create(createSecretDto: CreateSecretDto) {
    return 'This action adds a new secret';
  }

  findAll() {
    return `This action returns all secrets`;
  }

  findOne(id: number) {
    return `This action returns a #${id} secret`;
  }

  update(id: number, updateSecretDto: UpdateSecretDto) {
    return `This action updates a #${id} secret`;
  }

  remove(id: number) {
    return `This action removes a #${id} secret`;
  }
}
