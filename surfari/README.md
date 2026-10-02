This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

## Tests

```bash
npm test                                            # game logic + balance simulations
TEST_DATABASE_URL=postgres://user@host/db npm test  # + Tide economy against real Postgres
```

- `tests/chaserAI.test.ts` — rival-crew balance: every escape route works (top speed, timed
  jumps, well-timed cuts, tail-whip) and every failure mode still bites (cruising, stopping,
  mistimed moves). Retuning chasers without breaking the game should keep these green.
- `tests/crewMotion.test.ts` — remote riders stay smooth and close to their true position.
- `tests/motion.test.ts` — springs are stable and frame-rate independent.
- `tests/economy.db.test.ts` — yield, builds, run payouts and heartbeats through the real API
  routes and Neon driver, in a throwaway schema. Skipped when `TEST_DATABASE_URL` is unset.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
