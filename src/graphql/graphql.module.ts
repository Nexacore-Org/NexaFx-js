import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ASTVisitor, GraphQLError, ValidationContext } from 'graphql';
import { UsersModule } from '../users/users.module';
import { UserResolver } from './user.resolver';

const isProduction = process.env.NODE_ENV === 'production';
const maxDepth = Number(process.env.GRAPHQL_MAX_DEPTH) || 10;

/** Rejects operations whose selection sets nest deeper than `max`. */
export const depthLimit =
  (max: number) =>
  (context: ValidationContext): ASTVisitor => {
    let depth = 0;
    return {
      SelectionSet: {
        enter() {
          depth += 1;
          if (depth > max) {
            context.reportError(
              new GraphQLError(`Query exceeds maximum depth of ${max}`),
            );
          }
        },
        leave() {
          depth -= 1;
        },
      },
    };
  };

// Static imports: a failure loading the resolver or GraphQL packages now fails startup.
@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      path: '/graphql',
      introspection: !isProduction,
      playground: !isProduction,
      validationRules: [depthLimit(maxDepth)],
    }),
    UsersModule,
  ],
  providers: [UserResolver],
})
export class AppGraphQLModule {}
