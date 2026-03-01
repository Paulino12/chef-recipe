# Supabase Email Templates

Use these as the starting point for Supabase Auth email templates.

## Confirm Signup

Subject:

```txt
Confirm your Recipe Platform account
```

Body:

```html
<h2>Confirm your email</h2>
<p>Welcome to Recipe Platform.</p>
<p>Confirm your email address to activate your account and start accessing your recipe subscription.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm email</a></p>
<p>If you did not create this account, you can ignore this email.</p>
```

## Reset Password

Subject:

```txt
Reset your Recipe Platform password
```

Body:

```html
<h2>Reset your password</h2>
<p>We received a request to reset your Recipe Platform password.</p>
<p>Use the secure link below to choose a new password.</p>
<p><a href="{{ .ConfirmationURL }}">Reset password</a></p>
<p>If you did not request this, you can ignore this email.</p>
```

## Supabase Dashboard Notes

- Authentication -> Email Templates
- Keep the `{{ .ConfirmationURL }}` placeholder intact
- Set your Site URL and additional redirect URLs so these links can land on:
  - `/signin?confirmed=1`
  - `/reset-password`
