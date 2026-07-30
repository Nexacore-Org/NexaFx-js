import { Resolver, Query, Args } from '@nestjs/graphql';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class UserType {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field({ nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  lastName?: string;

  @Field()
  isActive!: boolean;

  @Field()
  kycStatus!: string;
}

@Resolver(() => UserType)
export class UserResolver {
  constructor(private usersService: UsersService) {}

  @Query(() => UserType, { nullable: true })
  async user(@Args('id') id: string) {
    return this.usersService.findById(id);
  }
}
