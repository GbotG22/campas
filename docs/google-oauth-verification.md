# Google OAuth Verification Notes

Last updated: 2026-06-17

## Current Google Cloud Project

- Project name: app 1
- Project ID: app-1-497206
- Project number: 1051218592083
- OAuth app name: campas
- Publishing status: Testing
- User type: External
- Test user: quanjizhongpureizhe@gmail.com

## OAuth Clients

- iOS client: `1051218592083-0u8o25sui598dsakvdnlmlp1obgmpaag.apps.googleusercontent.com`
- Web client: `1051218592083-qfn59d0r0efko24sf9cthrvljnfi3g2j.apps.googleusercontent.com`
- iOS bundle ID: `com.campas.app`
- iOS URL scheme: `com.googleusercontent.apps.1051218592083-0u8o25sui598dsakvdnlmlp1obgmpaag`

## Requested Scope

Camply currently requests only:

```text
https://www.googleapis.com/auth/calendar.readonly
```

Purpose:

```text
Camply uses read-only Google Calendar access to display the user's calendar events inside the app's schedule screen. Camply does not create, edit, or delete Google Calendar events.
```

Japanese purpose:

```text
Camplyは、ユーザーのGoogleカレンダーの予定をアプリ内のスケジュール画面に表示するために、読み取り専用のGoogle Calendar API権限を使用します。CamplyはGoogleカレンダーの予定を作成、編集、削除しません。
```

## Privacy Policy Requirements

The privacy policy must be publicly accessible before Google verification. It should state:

- What Google data is accessed: Google Calendar event data.
- Why it is accessed: to display calendar events in Camply's schedule screen.
- Scope level: read-only `calendar.readonly`.
- Storage: calendar event contents are not stored on Camply servers.
- Token storage: OAuth token is stored on-device in SecureStore and deleted on disconnect.
- Sharing: Google user data is not sold, used for ads, or used for AI model training.
- Revocation: users can disconnect in the app or from Google Account third-party access settings.

Local files updated:

- `privacy.html`
- `app/legal/privacy.tsx`
- `camply-lp/app/legal/privacy/page.tsx`

## Google Cloud Branding Fields

Fill these after the LP is deployed to a stable public domain.

- Application homepage: `https://<public-camply-domain>/`
- Privacy policy: `https://<public-camply-domain>/legal/privacy`
- Terms of service: `https://<public-camply-domain>/legal/terms`
- Authorized domain: `<public-camply-domain without https://>`

If using a Vercel preview URL, do not submit it for verification. Use a stable production domain.

## Verification Submission Draft

App description:

```text
Camply is a student life management app for schedules, assignments, part-time shifts, subscriptions, and money tracking.
```

Google Calendar feature description:

```text
Users can connect their Google Calendar account so Camply can show upcoming calendar events alongside classes, assignments, and shifts in the schedule screen. The app requests read-only access and does not modify calendar data.
```

Data handling:

```text
Google Calendar event data is used only to render the user's schedule inside Camply. Event contents are not stored on Camply servers. OAuth tokens are stored securely on the user's device and removed when the user disconnects Google Calendar.
```

Recommended demo steps for verification video:

1. Open Camply.
2. Go to the schedule or premium Google Calendar connection entry point.
3. Tap Google Calendar connect.
4. Sign in with Google.
5. Approve read-only calendar access.
6. Show Google Calendar events appearing in the schedule screen.
7. Show the disconnect/sign-out control for Google Calendar.

## Before Production

- Deploy the LP legal pages to a stable public URL.
- Add homepage, privacy policy, and terms URLs in Google Auth Platform > Branding.
- Add the authorized domain in Google Auth Platform > Branding.
- Confirm Data Access contains only `calendar.readonly`.
- Confirm test users are no longer needed after publishing and verification.
- Submit app verification before opening the Google Calendar feature to general users.
