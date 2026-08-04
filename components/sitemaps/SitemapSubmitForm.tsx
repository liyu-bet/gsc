'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolveSitemapUrl } from '@/lib/sitemap-validation';

type SitemapSubmitFormProps = {
  propertyId: string;
  siteUrl: string;
  isDomainProperty: boolean;
  canSubmit: boolean;
  disabledReason?: string | null;
};

export function SitemapSubmitForm({
  propertyId,
  siteUrl,
  isDomainProperty,
  canSubmit,
  disabledReason,
}: SitemapSubmitFormProps) {
  const router = useRouter();
  const [rawInput, setRawInput] = useState('sitemap.xml');
  const [domainScheme, setDomainScheme] = useState<'https' | 'http'>('https');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(
    () => resolveSitemapUrl(siteUrl, rawInput, { domainScheme }),
    [siteUrl, rawInput, domainScheme]
  );

  const submitDisabled =
    !canSubmit || pending || !preview.ok || Boolean(disabledReason);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitDisabled || !preview.ok) return;
    setNotice(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/sites/${propertyId}/sitemaps/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            sitemap: rawInput,
            domainScheme,
          }),
        });
        const data = (await response.json()) as {
          ok?: boolean;
          message?: string;
          code?: string;
        };
        if (!response.ok || !data.ok) {
          setNotice({
            kind: 'error',
            text: data.message || 'Не удалось отправить карту сайта',
          });
          return;
        }
        setNotice({
          kind: 'ok',
          text: 'Карта сайта отправлена. Google может обработать её не сразу',
        });
        router.refresh();
      } catch {
        setNotice({
          kind: 'error',
          text: 'Не удалось отправить карту сайта',
        });
      }
    });
  }

  return (
    <form className="sitemap-submit-form" onSubmit={onSubmit}>
      <div className="sitemap-submit-grid">
        <label className="sitemap-field">
          <span>URL или путь карты сайта</span>
          <input
            type="text"
            name="sitemap"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            disabled={!canSubmit || pending}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={preview.ok ? undefined : true}
            aria-describedby="sitemap-preview"
          />
        </label>

        {isDomainProperty ? (
          <label className="sitemap-field">
            <span>Схема для domain-ресурса</span>
            <select
              value={domainScheme}
              onChange={(e) => setDomainScheme(e.target.value === 'http' ? 'http' : 'https')}
              disabled={!canSubmit || pending}
            >
              <option value="https">https</option>
              <option value="http">http</option>
            </select>
          </label>
        ) : null}
      </div>

      <p id="sitemap-preview" className={`sitemap-preview ${preview.ok ? '' : 'sitemap-preview-error'}`}>
        {preview.ok ? (
          <>
            Итоговый URL: <code title={preview.sitemapUrl}>{preview.sitemapUrl}</code>
          </>
        ) : (
          preview.message
        )}
      </p>

      {disabledReason ? <p className="muted">{disabledReason}</p> : null}

      <button className="button" type="submit" disabled={submitDisabled}>
        {pending ? 'Отправка…' : 'Отправить карту сайта'}
      </button>

      <div aria-live="polite">
        {notice ? (
          <p className={notice.kind === 'ok' ? 'sitemap-notice-ok' : 'sitemap-notice-error'}>
            {notice.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
