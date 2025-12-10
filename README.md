This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

[Live Demo](https://uptime-monitor-next.vercel.app/)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Development Tools

This project includes a **Rust-based audit tool** (`tools/audit`) to manage code quality, security checks, and automation tasks.

### Building the Tool

The tool is automatically built during `npm install`. To build it manually:

```bash
npm run build:audit
```

### Usage

The compiled binary is located at `tools/audit/target/release/audit`.

```bash
# General Usage
./tools/audit/target/release/audit [COMMAND]

# Key Commands
audit start            # Run all pre-commit checks
audit vercel-cleanup   # Manage old Vercel deployments
audit generate-favicons # Generate favicons from SVG
audit local-cron       # Run monitor checks locally
audit test-bypass      # Test Vercel protection bypass
```

### Vercel Protection Bypass

If Vercel Authentication is enabled, you can use the bypass feature:

```bash
# Test if bypass works (requires VERCEL_AUTOMATION_BYPASS_SECRET env var)
audit test-bypass --url https://your-project.vercel.app
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
