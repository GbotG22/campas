# Google OAuth Verification Notes

Last updated: 2026-06-17

## Current Google Cloud Project

- Project name: app 1
- Project ID: app-1-497206
- Project number: 1051218592083
- OAuth app name: Camply
- Publishing status: Production
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
https://www.googleapis.com/auth/calendar.events.readonly
```

Purpose:

```text
Camply uses read-only Google Calendar event access to display the user's calendar events inside the app's schedule screen. Camply does not create, edit, or delete Google Calendar events.
```

Japanese purpose:

```text
Camplyは、ユーザーのGoogleカレンダーの予定をアプリ内のスケジュール画面に表示するために、読み取り専用のGoogle Calendar APIイベント権限を使用します。CamplyはGoogleカレンダーの予定を作成、編集、削除しません。
```

## Privacy Policy Requirements

The privacy policy must be publicly accessible before Google verification. It should state:

- What Google data is accessed: Google Calendar event data.
- Why it is accessed: to display calendar events in Camply's schedule screen.
- Scope level: read-only `calendar.events.readonly`.
- Storage: calendar event contents are not stored on Camply servers.
- Token storage: OAuth token is stored on-device in SecureStore and deleted on disconnect.
- Sharing: Google user data is not sold, used for ads, or used for AI model training.
- Revocation: users can disconnect in the app or from Google Account third-party access settings.
- Limited Use: use and transfer of Google user data complies with the Google API Services User Data Policy, including the Limited Use requirements.

Local files updated:

- `privacy.html`
- `app/legal/privacy.tsx`
- `camply-lp/app/legal/privacy/page.tsx`

## Google Cloud Branding Fields

Current public legal pages:

- Application homepage: `https://www.camply-app.com/`
- Privacy policy: `https://www.camply-app.com/legal/privacy`
- Terms of service: `https://www.camply-app.com/legal/terms`
- Authorized domain saved in Google Auth Platform: `camply-app.com`

These URLs are currently saved in Google Auth Platform > Branding.

Previous fallback URLs:

- Application homepage: `https://camply-lp.vercel.app/`
- Privacy policy: `https://camply-lp.vercel.app/legal/privacy`
- Terms of service: `https://camply-lp.vercel.app/legal/terms`
- Authorized domain: `camply-lp.vercel.app`

`camply-app.com` and `www.camply-app.com` are configured on Vercel and DNS now resolves publicly. DNS provider currently uses `01.dnsv.jp` through `04.dnsv.jp`.

DNS records:

```text
A camply-app.com 76.76.21.21
A www.camply-app.com 76.76.21.21
```

After the DNS record propagates, use the preferred production domain for Google verification.

Search Console verification:

```text
TXT camply-app.com google-site-verification=bEiIsovd1rd8JUW7zQkVHxiHsEmxP6OHaH30IacrNNQ
```

## Execution Status

Checked on 2026-06-17:

- Google Calendar API is enabled in Google Cloud project `app-1-497206`.
- Google Auth Platform test user is set to `quanjizhongpureizhe@gmail.com`.
- Google Auth Platform Branding uses the `https://www.camply-app.com/` legal URLs.
- Google Auth Platform Branding is verified and published.
- Google Search Console ownership for `camply-app.com` is verified.
- Google Auth Platform Audience is set to Production.
- App source now requests only `calendar.events.readonly`.
- Public privacy policy now references only `calendar.events.readonly`.
- Public privacy policy returns HTTP 200 at `https://camply-lp.vercel.app/legal/privacy`.
- Public terms page returns HTTP 200 at `https://camply-lp.vercel.app/legal/terms`.
- Published privacy policy includes `calendar.events.readonly`, Google data purpose, no ads/sale/AI training, token deletion on disconnect, and Limited Use wording.
- `camply-lp`: `npm run lint` passed.
- `camply-lp`: `npm run build` passed.
- `camply`: `npm run type-check` passed.
- DNS records were submitted in お名前.com Navi for `camply-app.com`.
- Submitted records:
  - `A camply-app.com 76.76.21.21`
  - `A www.camply-app.com 76.76.21.21`
- Public DNS now resolves `camply-app.com` and `www.camply-app.com` to `76.76.21.21`.
- `http://www.camply-app.com/legal/privacy` and `http://www.camply-app.com/legal/terms` return HTTP 200 from Vercel.
- Vercel certificate `cert_3QzCoYsrg4PkiV6haVdqfISB` was issued for `camply-app.com` and `www.camply-app.com`.
- `https://www.camply-app.com/`, `https://www.camply-app.com/legal/privacy`, and `https://www.camply-app.com/legal/terms` return HTTP 200.
- Google Auth Platform Branding was switched to the `www.camply-app.com` URLs.
- Google Auth Platform Branding was published and now shows as verified and visible to users.
- Vercel production deployment `dpl_4UCrx7mg88d3YsJ1VAy45Geo6e8w` was deployed and aliased to `https://www.camply-app.com`.
- `https://www.camply-app.com/legal/privacy` returns HTTP 200 and contains `calendar.events.readonly`.
- Google Auth Platform Data Access was staged in the open browser tab with:
  - `calendar.readonly` removed.
  - `calendar.events.readonly` selected.
  - Scope justification filled.
- Google Cloud will not enable Save on Data Access until a YouTube demo video link is provided.

Current blocker:

- No DNS, HTTPS, Search Console, branding, or public policy blocker remains.
- The only blocker before saving Data Access and submitting OAuth verification is a YouTube demo video link that shows the Google Calendar OAuth flow and how Camply uses the calendar events in-app.

## Verification Submission Draft

App description:

```text
Camply is a student life management app for schedules, assignments, part-time shifts, subscriptions, and money tracking.
```

Google Calendar feature description:

```text
Users can connect their Google Calendar account so Camply can show upcoming calendar events alongside classes, assignments, and shifts in the schedule screen. The app requests read-only event access and does not modify calendar data.
```

Data handling:

```text
Google Calendar event data is used only to render the user's schedule inside Camply. Event contents are not stored on Camply servers. OAuth tokens are stored securely on the user's device and removed when the user disconnects Google Calendar.
```

Scope justification:

```text
Camply uses this read-only scope only when a user chooses to connect Google Calendar. The app calls the Calendar API events.list endpoint for the user's primary calendar to display upcoming events in Camply's schedule screen alongside classes, assignments, shifts, and subscriptions. Camply does not create, edit, delete, share, sell, or use Google Calendar data for ads or AI model training. Event data is used only for in-app display and is not stored on Camply servers; the OAuth token is stored securely on the user's device and deleted when the user disconnects. This is the minimum required Calendar scope because Camply needs read access to event titles, start/end times, and status, and no write scope is requested.
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

- Record a short YouTube demo video for OAuth verification.
- Paste the YouTube demo link into Google Auth Platform > Data Access.
- Save Data Access with only `calendar.events.readonly`.
- Submit app verification before opening the Google Calendar feature to general users.
