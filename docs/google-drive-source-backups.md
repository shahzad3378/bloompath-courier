# Google Drive source backups

The workflow in `.github/workflows/drive-source-backup.yml` creates a dated ZIP after every push to `main` and nightly at 02:00 Asia/Dubai. It only archives Git-tracked source; it excludes `.env*` (except `.env.example`), credentials, dependencies, and build caches. The Drive folder is created by the OAuth app as `BloomPath Courier Source Backups (Automated)`.

## One-time authorization

The ChatGPT Google Drive connection does not provide a reusable token to GitHub Actions. Configure a separate OAuth client and save its refresh token as a GitHub Actions secret. Do not paste the secret into a chat or commit it to the repository.

1. In Google Cloud Console, create a project and enable the Google Drive API.
2. Configure the OAuth consent screen for the Google account that owns the backups. Request only the `https://www.googleapis.com/auth/drive.file` scope.
3. Create an OAuth client of type **Web application**, add `https://developers.google.com/oauthplayground` as an authorized redirect URI, and copy its client ID and client secret. Publish the consent screen to production before generating the long-lived token; Google testing-mode refresh tokens expire after seven days.
4. In OAuth 2.0 Playground settings, enable **Use your own OAuth credentials** and enter that client ID and client secret. In Step 1, authorize `https://www.googleapis.com/auth/drive.file` with the `bloompathcourier@gmail.com` account. In Step 2, exchange the code and copy the refresh token.
5. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**. Name it `GOOGLE_DRIVE_OAUTH_JSON` and set its value to this JSON object, replacing each value locally:

   ```json
   {"client_id":"...","client_secret":"...","refresh_token":"..."}
   ```

6. Open **Actions → Back up source to Google Drive → Run workflow**. A successful run creates the dated ZIP. Future main-branch pushes and the nightly schedule run automatically.

Google recommends the non-sensitive `drive.file` scope for narrow, per-file access. The workflow creates and manages its own backup folder and files with that scope.
