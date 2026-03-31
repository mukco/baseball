# Gemfile Dependency Reference

This document explains every gem in `backend_rails/Gemfile` — what it does, why it's here, and whether you actually need it for day-to-day development.

---

## Runtime gems

### `rails (~> 8.1.3)`
The web framework. We use the `--api` flag when generating the app, which strips out everything related to views, sessions, cookies, and asset compilation. What remains is a lean stack: routing, controllers, middleware, and the autoloader. No ActiveRecord, no ActionMailer, no ActionCable — just HTTP in and JSON out.

### `puma (>= 5.0)`
The HTTP server that runs the Rails app. Puma is multi-threaded, which matters here because several endpoints make outbound HTTP calls (to MLB Stats API, Baseball Savant) that block while waiting for a response. A multi-threaded server means one slow Statcast request doesn't stall every other request. Puma ships with Rails by default; there's no reason to swap it out.

### `rack-cors`
Adds `Access-Control-Allow-Origin` and related headers to responses so the frontend dev server on `localhost:5173` can call the API on `localhost:8000` without the browser blocking the request. Configured in `config/application.rb`. Without this, every API call from the React app would fail with a CORS error during development.

### `faraday`
HTTP client used by `MlbApiService` and `StatcastService` to make outbound requests to:
- `statsapi.mlb.com` (schedule, player search, season stats)
- `baseballsavant.mlb.com` (Statcast CSV exports)
- `fangraphs.com` (leaderboard data)

Faraday was chosen over Ruby's built-in `Net::HTTP` because it has a clean middleware stack, simple timeout configuration, and first-class support for the retry adapter below. It also makes the service layer easier to test — you can swap in a test adapter without monkey-patching.

### `faraday-retry`
A Faraday middleware that automatically retries failed requests with configurable backoff. Both services configure `max: 2, interval: 0.5` (or higher for slow endpoints like Baseball Savant). This handles transient network hiccups without any retry logic cluttering the service code.

### `csv`
Ruby's standard library CSV parser, explicitly declared as a gem because Ruby 3.4+ stopped bundling some standard library gems by default. Used in `StatcastService` to parse the raw CSV text returned by Baseball Savant's export endpoint into an array of hashes.

### `bootsnap`
Speeds up Rails boot time by caching the result of `require` calls and YAML loads to disk. On a cold boot it makes no difference, but during development — where you restart the server frequently — it shaves several seconds off each restart. It's `require: false` because it hooks into the boot process via `config/boot.rb` rather than being required normally.

### `tzinfo-data`
Only active on `platforms: %i[ windows jruby ]`. Rails needs timezone data and on Linux/macOS it reads from the OS (`/usr/share/zoneinfo`). On Windows and JRuby that file isn't available, so this gem bundles it. Safe to ignore on a Mac or Linux dev machine.

---

## Gems you can remove if you don't need them

### `kamal` (`require: false`)
A deployment tool from 37signals (the Rails company) for shipping containerised apps to bare servers via Docker and SSH — no Kubernetes or Heroku required. It's included by `rails new` by default since Rails 8. `require: false` means it has zero runtime impact; it only activates when you run `kamal` CLI commands. If you're deploying to Heroku, Render, Fly.io, or aren't thinking about deployment yet, you can remove this with no side effects.

### `thruster` (`require: false`)
A companion to Kamal that wraps Puma with HTTP/2 support, asset caching headers, and X-Sendfile acceleration in production. Like Kamal, it's a Rails 8 default and `require: false` so it's not loaded in development. Remove it if you're not using Kamal for deployment.

---

## Development and test gems

These gems are in the `group :development, :test` block. They are never loaded in production.

### `debug`
Ruby's standard debugger. Lets you drop `binding.irb` or `debugger` into any file and get an interactive REPL at that line. The `require: "debug/prelude"` means it's always pre-loaded in dev/test without needing an explicit `require`.

### `bundler-audit`
Checks your `Gemfile.lock` against a database of known security vulnerabilities (CVEs). Run it with:

```bash
bundle exec bundler-audit check --update
```

The `--update` flag pulls the latest advisory database before checking. Configuration lives in `config/bundler-audit.yml` where you can whitelist specific advisories if you've assessed the risk and decided to accept it. The Rails CI workflow (`bin/ci`) runs this automatically. It does nothing at boot (`require: false`).

### `brakeman`
Static analysis tool that scans Rails source code for common security issues — mass assignment vulnerabilities, SQL injection risks, unescaped output, insecure redirects, etc. Run it with:

```bash
bundle exec brakeman
```

It reports by severity (High / Medium / Weak) and links to explanations for each issue. Since this app has no database or user input beyond URL parameters, most Brakeman checks won't fire — but it's cheap to run and catches things like accidentally rendering user-controlled data. Also run by `bin/ci`.

### `rubocop-rails-omakase`
RuboCop is a Ruby linter and formatter. This specific config is the "opinionated" Rails house style from DHH and 37signals — it enforces things like double-quoted strings, trailing commas, and method length limits. Run it with:

```bash
bundle exec rubocop
```

Or auto-fix safe offenses:

```bash
bundle exec rubocop -a
```

You can diverge from the Omakase style by editing `.rubocop.yml`. If you'd rather use Standard Ruby or a different style guide entirely, swap this gem out.

---

## Gems that are commented out

### `jbuilder` (commented out)
A template language for building JSON responses using `.json.jbuilder` view files. Not used here — controllers call `render json:` directly which is simpler for an API-only app with no complex serialisation needs. Leave it commented out.

### `bcrypt` (commented out)
Required if you use `has_secure_password` on a model. Not needed — there are no user accounts or authentication in this app.
