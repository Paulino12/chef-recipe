# Supabase Email Templates

Use these in `Supabase -> Authentication -> Email Templates`.

Recommended sender settings:

- Sender name: `Recipe Platform`
- Sender email: `no-reply@chef-recipe.maryoctav.com`

These templates keep the Supabase action URL intact by using `{{ .ConfirmationURL }}`.

## Confirm Signup

Suggested subject:

```text
Confirm your Recipe Platform account
```

Suggested HTML:

```html
<div style="margin:0;padding:32px 16px;background:#f6f1e7;font-family:Arial,sans-serif;color:#2f2722;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #eadfce;border-radius:24px;overflow:hidden;box-shadow:0 10px 30px rgba(47,39,34,0.08);">
    <div style="padding:32px 32px 16px 32px;">
      <div style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#8a6a52;margin-bottom:12px;">
        Recipe Platform
      </div>
      <h1 style="margin:0 0 12px 0;font-size:32px;line-height:1.15;color:#2f2722;">
        Confirm your email
      </h1>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#5c4d42;">
        Welcome to Recipe Platform. Please confirm your email address to activate your account and sign in securely.
      </p>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#7b6b5f;">
        Once confirmed, you can access recipes, save favourites, and manage your account from one place.
      </p>
      <a
        href="{{ .ConfirmationURL }}"
        style="display:inline-block;background:#7a5741;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:14px;"
      >
        Confirm account
      </a>
      <p style="margin:24px 0 0 0;font-size:14px;line-height:1.6;color:#7b6b5f;">
        If you did not create this account, you can safely ignore this email.
      </p>
    </div>
    <div style="padding:20px 32px;background:#fbf7f1;border-top:1px solid #efe5d8;font-size:12px;line-height:1.6;color:#8b7b6f;">
      Recipe Platform<br />
      chef-recipe.maryoctav.com
    </div>
  </div>
</div>
```

## Reset Password

Suggested subject:

```text
Reset your Recipe Platform password
```

Suggested HTML:

```html
<div style="margin:0;padding:32px 16px;background:#f6f1e7;font-family:Arial,sans-serif;color:#2f2722;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #eadfce;border-radius:24px;overflow:hidden;box-shadow:0 10px 30px rgba(47,39,34,0.08);">
    <div style="padding:32px 32px 16px 32px;">
      <div style="font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:#8a6a52;margin-bottom:12px;">
        Recipe Platform
      </div>
      <h1 style="margin:0 0 12px 0;font-size:32px;line-height:1.15;color:#2f2722;">
        Reset your password
      </h1>
      <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#5c4d42;">
        We received a request to reset your password. Use the button below to choose a new one.
      </p>
      <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#7b6b5f;">
        For your security, this link is time-limited and should only be used by you.
      </p>
      <a
        href="{{ .ConfirmationURL }}"
        style="display:inline-block;background:#7a5741;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:14px;"
      >
        Reset password
      </a>
      <p style="margin:24px 0 0 0;font-size:14px;line-height:1.6;color:#7b6b5f;">
        If you did not request this password reset, you can safely ignore this email.
      </p>
    </div>
    <div style="padding:20px 32px;background:#fbf7f1;border-top:1px solid #efe5d8;font-size:12px;line-height:1.6;color:#8b7b6f;">
      Recipe Platform<br />
      chef-recipe.maryoctav.com
    </div>
  </div>
</div>
```

## Notes

- Keep `{{ .ConfirmationURL }}` in the button link so Supabase handles the correct token flow.
- After updating templates, send a fresh email and test both:
  - `Confirm signup`
  - `Reset password`
- If Gmail still shows a warning banner, improve trust by adding DMARC for the sending subdomain and giving the sender domain time to build reputation.
