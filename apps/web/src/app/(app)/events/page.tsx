import { redirect } from 'next/navigation';

type EventsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const firstValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const templateId = firstValue(resolvedSearchParams.templateId);
  const compose = firstValue(resolvedSearchParams.compose);
  const quick = firstValue(resolvedSearchParams.quick);
  const kind = firstValue(resolvedSearchParams.kind) ?? (templateId ? 'PERFORMANCE' : 'EVENT');

  const nextParams = new URLSearchParams();

  if (compose === '1' || quick === '1' || templateId) {
    nextParams.set('compose', '1');
    nextParams.set('kind', kind);
  }

  if (templateId) {
    nextParams.set('templateId', templateId);
  }

  const query = nextParams.toString();
  redirect(query ? `/calendar?${query}` : '/calendar');
}
