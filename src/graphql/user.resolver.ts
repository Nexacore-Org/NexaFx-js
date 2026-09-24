import { Resolver, Query, Args, Context } from '@nestjs/graphql';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
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

interface CallerPrincipal {
  sub: string;
  role?: string;
  roles?: string[];
}

interface GraphQLRequestContext {
  req?: { user?: CallerPrincipal };
}

/**
 * Access model for this resolver: a caller may read their own record, and an
 * admin may read anyone's. `email`, `firstName`, `lastName` and `kycStatus` are
 * PII and compliance-sensitive, so authentication alone is not sufficient —
 * every query here is scoped to the caller unless they hold the admin role.
 */
@Resolver(() => UserType)
export class UserResolver {
  constructor(private usersService: UsersService) {}

  /** Self-service profile lookup — always the authenticated caller. */
  @Query(() => UserType, { nullable: true })
  async me(@Context() context: GraphQLRequestContext) {
    return this.usersService.findById(this.requireCaller(context).sub);
  }

  /** Admin tooling, or the caller's own record. */
  @Query(() => UserType, { nullable: true })
  async user(
    @Args('id') id: string,
    @Context() context: GraphQLRequestContext,
  ) {
    const caller = this.requireCaller(context);

    if (caller.sub !== id && !this.isAdmin(caller)) {
      throw new ForbiddenException(
        'You may only read your own user record',
      );
    }

    return this.usersService.findById(id);
  }

  private requireCaller(context: GraphQLRequestContext): CallerPrincipal {
    const caller = context?.req?.user;
    if (!caller?.sub) {
      throw new UnauthorizedException('Authentication required');
    }
    return caller;
  }

  private isAdmin(caller: CallerPrincipal): boolean {
    return caller.role === 'admin' || (caller.roles ?? []).includes('admin');
  }
}
