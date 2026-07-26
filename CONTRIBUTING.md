# Contributing

Thanks for helping improve `NexaFx-js`.

## Local setup

1. Copy the environment template and fill in the required values:
   ```bash
   cp .env.example .env
   ```
2. Start the backing services with Docker Compose if you use local containers for PostgreSQL and Redis.
3. Install dependencies and run the seed script when your environment needs sample data:
   ```bash
   npm ci
   npm run seed
   ```

## Branching strategy

- Use short-lived feature branches such as `fix/issue-123-short-description`.
- Keep each branch scoped to a single issue or small, related change set.
- Open pull requests from your fork into `Nexacore-Org/NexaFx-js`.

## Commit and PR format

- Prefer conventional commits such as `fix:`, `feat:`, or `chore:`.
- Reference the issue number in the PR description with `Closes #123`.
- Keep PR titles concise and action-oriented.

## Code style

- ESLint and Prettier are already configured in the repository.
- Use the existing TypeScript patterns in the codebase: single quotes, 2-space indentation, and small focused modules.
- Avoid unrelated refactors when you are fixing a specific issue.

## Testing requirements

- Run the relevant unit tests before opening a PR:
  ```bash
  npm test
  ```
- Run coverage checks for larger changes:
  ```bash
  npm run test:cov
  ```
- Run the build to verify the app still compiles:
  ```bash
  npm run build
  ```
- The repository enforces coverage thresholds in `package.json` for the highest-risk modules.

## Pull request checklist

- [ ] Change is scoped to the issue.
- [ ] Tests pass locally.
- [ ] Build passes locally.
- [ ] Coverage stays above the configured thresholds.
- [ ] README or docs are updated when behavior changes.
- [ ] PR description includes a short summary and testing notes.
