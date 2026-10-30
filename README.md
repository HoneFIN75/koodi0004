# koodi0004
koodi0004

## Deployment

The production workflow requires the GitHub Actions secrets `SSH_HOST`,
`SSH_USER`, `SSH_KEY` (the private key), and `DEPLOY_PATH`. Pushes to `main`
deploy automatically; the workflow can also be started manually.

Like `koodi0003`, the workflow fetches SSH host keys using `ssh-keyscan` on
port 22. No `SSH_KNOWN_HOSTS` secret is required. The fetched keys are used
with strict host-key checking, but are not independently verified before
use, so this does not protect against a man-in-the-middle attack during
the initial key scan.
