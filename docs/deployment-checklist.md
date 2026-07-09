# Deployment Checklist

This project must receive real production values from the deployment platform's
environment variable or secret-management screen. Do not commit real DB
credentials, admin credentials, Gmail accounts, app passwords, or tokens to this
repository.

## Required Environment Variables

| Variable | Required for | Meaning |
|---|---|---|
| `SPRING_PROFILES_ACTIVE` | all deployed runs | Must be set explicitly. Use `prod` for production, `dev` for shared development, and `local` only for a developer machine. |
| `DB_URL` | `local`, `dev`, `prod` | JDBC URL for the database used by the selected profile. |
| `DB_USERNAME` | `local`, `dev`, `prod` | Database login username. |
| `DB_PASSWORD` | `local`, `dev`, `prod` | Database login password. |
| `ADMIN_USERNAME` | `local`, `dev`, `prod` | Initial administrator login username. |
| `ADMIN_PASSWORD` | `local`, `dev`, `prod` | Initial administrator login password. Use a strong unique value before deployment. |

## Optional Environment Variables

| Variable | Default | Meaning |
|---|---|---|
| `LOGO_CLEANUP_ENABLED` | `true` | Enables scheduled cleanup of unused uploaded logo files. |
| `LOGO_CLEANUP_CRON` | `0 0 4 * * *` | Cron expression for logo cleanup. |
| `LOGO_CLEANUP_ZONE` | `Asia/Seoul` | Time zone for the logo cleanup schedule. |
| `E2E_CLEANUP_ENABLED` | `false` for local/dev | Enables guarded E2E cleanup endpoints. Never enable this in production. |

Session cookie `Secure` and `HttpOnly` are fixed in `application.yml`. Decide
`server.servlet.session.cookie.same-site` in the active profile after the
frontend/backend domain structure is finalized.

## Handover Checks

- Confirm who owns access to the deployment platform, database, DNS, and mail account.
- Confirm production secrets are stored only in the deployment platform or a secret manager.
- Confirm no production value is present in `.env`, committed YAML, shell scripts, screenshots, issue comments, or chat logs.
- Rotate `ADMIN_PASSWORD` whenever the operator changes.
- If email sending is enabled later, reissue the Gmail app password or mail-provider credential during operator handover.
- Keep `SPRING_PROFILES_ACTIVE=prod` set in production so the app never starts with local settings.

## Before First Production Deployment

1. Create the production database and user.
2. Set `SPRING_PROFILES_ACTIVE=prod`.
3. Set every required environment variable above.
4. Start the app once and verify startup fails if any required value is missing.
5. Verify the initial administrator can log in.
6. Store the final environment-variable list in the operator handover notes, not in Git.
