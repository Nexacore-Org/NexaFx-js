import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';

let graphqlImports: any[] = [];
let providersList: any[] = [];

try {
  const { GraphQLModule } = require('@nestjs/graphql');
  const { ApolloDriver } = require('@nestjs/apollo');
  const { UserResolver } = require('./user.resolver');

  graphqlImports.push(
    GraphQLModule.forRoot({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      path: '/graphql',
    }),
  );
  providersList.push(UserResolver);
} catch {
  // @nestjs/graphql or @nestjs/apollo not installed
}

@Module({
  imports: [...graphqlImports, UsersModule],
  providers: providersList,
})
export class AppGraphQLModule {}
