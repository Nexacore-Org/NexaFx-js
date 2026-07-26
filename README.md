<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Role-Based Access Control

<!-- ROLES-START -->
<!-- roles: ADMIN, USER, COMPLIANCE -->
NexaFx enforces role-based access control on all protected endpoints. The `UserRole` enum (`src/users/user.entity.ts`) defines three roles:

| Enum key | String value | Description |
|----------|-------------|-------------|
| `ADMIN` | `admin` | Full administrative access. Can view platform stats, override transaction status, manage user status and roles, and serve KYC documents. All admin routes are additionally restricted to IP-allowlisted origins. |
| `USER` | `user` | Standard authenticated user. Default role assigned on registration. Access to personal account, wallet, and transaction endpoints. |
| `COMPLIANCE` | `compliance` | Compliance officer. Reserved for audit and regulatory workflows. |

### Permission Matrix

| Endpoint | Method | USER | ADMIN | COMPLIANCE |
|----------|--------|:----:|:-----:|:----------:|
| `/api/v1/admin/stats` | GET | - | yes | - |
| `/api/v1/admin/transactions/:id/status` | PATCH | - | yes | - |
| `/api/v1/admin/users/:id/status` | PATCH | - | yes | - |
| `/api/v1/admin/users/:id/role` | PATCH | - | yes | - |
| `/api/v1/admin/kyc/:userId/:version/:filename` | GET | - | yes | - |
| All other JWT-authenticated endpoints | * | yes | yes | yes |

> All `/api/v1/admin/*` routes additionally require the caller IP to appear on the configured allowlist (`IpAllowlistGuard`).
<!-- ROLES-END -->

## Database Migrations

Schema changes are managed exclusively through TypeORM migrations. Auto-sync (`synchronize`) is disabled in all environments to prevent accidental schema changes.

```bash
# Generate a migration from entity changes
$ npm run migration:generate

# Apply pending migrations
$ npm run migration:run

# Revert the last migration
$ npm run migration:revert

# Dry-run: check for pending migrations without applying (also runs in CI)
$ npm run migration:dryrun
```

> **Note:** Never rely on `synchronize: true` in any environment. Always generate and commit migrations alongside entity changes.
## Documentation

- [Contributing guide](./CONTRIBUTING.md)
- [Architecture overview](./docs/architecture.md)

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Data retention

Financial records now use soft deletes instead of hard deletes for the primary transaction, FX trade, and referral entities. Deletions should update the `deletedAt` timestamp so the data remains available for audit, reconciliation, and retention workflows.

## Operational logging

Slow database queries are emitted as JSON log entries with the event name `typeorm.slow_query`.
The payload includes these fields:

- `thresholdMs`
- `durationMs`
- `query`
- `parameters`

Set `SLOW_QUERY_THRESHOLD_MS` to adjust the slow-query warning threshold. The default is `1000` milliseconds.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
