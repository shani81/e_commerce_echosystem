import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@aicos/ui';
import Link from 'next/link';
import { ApiHealth } from '@/components/api-health';

const STEPS = [
  {
    title: 'Film your shelves',
    description:
      'Walk your store with a phone. No spreadsheets, no manual data entry, no SKU-by-SKU typing.',
  },
  {
    title: 'AI builds the catalog',
    description:
      'AICOS extracts names, prices, variants, images, and SEO from the video — with per-field confidence.',
  },
  {
    title: 'Review & publish',
    description:
      'You approve what goes live. Nothing AI-generated publishes on its own. A real store, in minutes.',
  },
] as const;

export default function HomePage() {
  return (
    <main className="bg-hero-grid min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-content flex-col px-6 py-8 sm:px-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white"
            >
              A
            </span>
            <span className="text-lg font-semibold tracking-tight text-neutral-900">AICOS</span>
            <Badge variant="brand" className="ml-1">
              Phase 1
            </Badge>
          </div>
          <nav className="flex items-center gap-5 text-sm font-medium text-neutral-600">
            <Link href="/shop" className="transition-colors hover:text-neutral-900">
              Shop
            </Link>
            <a
              href="http://localhost:3100"
              className="transition-colors hover:text-neutral-900"
            >
              Admin →
            </a>
          </nav>
        </header>

        {/* Hero */}
        <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <Badge variant="brand" size="md" className="mb-6">
            AI Commerce OS
          </Badge>

          <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl md:text-6xl">
            Film your shelves.{' '}
            <span className="text-brand-600">Publish your store.</span> In minutes.
          </h1>

          <p className="mt-6 max-w-2xl text-pretty text-base text-neutral-600 sm:text-lg">
            AICOS turns a short video of your physical inventory into a complete, operational online
            store — catalog, pricing, and SEO built by AI, with a human always in control of what
            goes live.
          </p>

          <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <Button size="lg" fullWidth className="sm:w-auto">
              Start filming
            </Button>
            <Button variant="outline" size="lg" fullWidth className="sm:w-auto">
              See how it works
            </Button>
          </div>

          {/* Value-prop steps */}
          <ol className="mt-14 grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <Card variant="elevated" padding="lg" className="h-full">
                  <CardHeader>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                      {i + 1}
                    </span>
                    <CardTitle className="mt-3">{step.title}</CardTitle>
                    <CardDescription>{step.description}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ol>

          {/* Live stack proof: client-side API health */}
          <div className="mt-10 w-full max-w-md">
            <Card variant="ghost" padding="none">
              <CardContent>
                <ApiHealth />
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Footer */}
        <footer className="flex flex-col items-center justify-between gap-3 border-t border-neutral-200 pt-6 text-sm text-neutral-500 sm:flex-row">
          <span>© {new Date().getFullYear()} AICOS — AI Commerce OS</span>
          <span className="font-mono text-xs">storefront · localhost:3000</span>
        </footer>
      </div>
    </main>
  );
}
