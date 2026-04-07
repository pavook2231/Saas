'use client';

import { useMemo, useState } from 'react';
import { ru } from '../lib/i18n/ru';

type CurrencyCode = 'RUB' | 'USD' | 'EUR' | 'KZT' | 'BYN' | 'UZS';
type RateSource = 'HISTORY' | 'CONFIG' | 'NONE';

type OrganizationResponse = {
  id: string;
  financeEnabled?: boolean;
};

type PointRateResponse = {
  referenceDate: string;
  pointValue: string | null;
  currency: CurrencyCode;
  source: RateSource;
  effectiveFrom: string | null;
};

type SetPointRateResponse = {
  pointValue: string;
  currency: CurrencyCode;
  effectiveFrom: string;
  createdAt: string;
  currentRate: {
    pointValue: string | null;
    currency: CurrencyCode;
    source: RateSource;
    effectiveFrom: string | null;
  };
};

type IncomeParticipant = {
  participantId: string;
  participantName: string;
  autoPoints: string;
  manualPoints: string;
  totalPoints: string;
  amount: string | null;
};

type IncomeEntry = {
  ledgerEntryId: string;
  participantId: string;
  participantName: string;
  eventId: string | null;
  eventTitle: string | null;
  type: string;
  points: string;
  pointValue: string | null;
  currency: CurrencyCode;
  amount: string | null;
  description: string | null;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
};

type IncomeResponse = {
  periodStart: string;
  periodEnd: string;
  referenceDate: string;
  periodStartDay: number;
  rate: {
    pointValue: string | null;
    currency: CurrencyCode;
    source: RateSource;
    effectiveFrom: string | null;
  };
  totals: {
    autoPoints: string;
    manualPoints: string;
    totalPoints: string;
    totalAmount: string | null;
  };
  participants: IncomeParticipant[];
  entriesCount: number;
  entries: IncomeEntry[];
};

type BusyAction =
  | 'sync-finance'
  | 'toggle-finance'
  | 'load-rate'
  | 'save-rate'
  | 'load-income'
  | 'export-csv'
  | 'export-json';

const currencyOptions: CurrencyCode[] = ['RUB', 'USD', 'EUR', 'KZT', 'BYN', 'UZS'];

const todayInput = (): string => new Date().toISOString().slice(0, 10);

const defaultApiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api')
  .replace(/\/$/, '');

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return ru.common.unexpectedRequestError;
};

const parseErrorMessage = async (response: Response): Promise<string> => {
  const fallback = ru.common.requestError(response.status);

  try {
    const payload = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };

    if (Array.isArray(payload.message)) {
      return payload.message.join(', ');
    }

    if (typeof payload.message === 'string' && payload.message.length > 0) {
      return payload.message;
    }

    if (typeof payload.error === 'string' && payload.error.length > 0) {
      return payload.error;
    }

    return fallback;
  } catch {
    return fallback;
  }
};

const parseFileName = (response: Response, fallbackName: string): string => {
  const contentDisposition = response.headers.get('content-disposition');

  if (!contentDisposition) {
    return fallbackName;
  }

  const match = contentDisposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? fallbackName;
};

const downloadBlob = (fileName: string, content: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const formatIsoDateTime = (value: string | null): string => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('ru-RU');
};

const formatAmount = (amount: string | null, currency: CurrencyCode): string => {
  if (!amount) {
    return '-';
  }

  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return `${amount} ${currency}`;
  }

  return `${numeric.toFixed(2)} ${currency}`;
};

export function PointsIncomePanel() {
  const [organizationId, setOrganizationId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [referenceDate, setReferenceDate] = useState(todayInput);
  const [participantId, setParticipantId] = useState('');
  const [pointValue, setPointValue] = useState('1.00');
  const [currency, setCurrency] = useState<CurrencyCode>('RUB');
  const [effectiveFrom, setEffectiveFrom] = useState(todayInput);
  const [rateData, setRateData] = useState<PointRateResponse | null>(null);
  const [incomeData, setIncomeData] = useState<IncomeResponse | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [financeEnabled, setFinanceEnabled] = useState<boolean | null>(null);

  const pointsBaseUrl = useMemo(() => {
    const trimmedOrgId = organizationId.trim();

    if (!trimmedOrgId) {
      return null;
    }

    return `${defaultApiBaseUrl}/organizations/${trimmedOrgId}/points`;
  }, [organizationId]);

  const requireOrganization = (): string => {
    if (!pointsBaseUrl) {
      throw new Error(ru.common.organizationIdRequired);
    }

    return pointsBaseUrl;
  };

  const requireOrganizationId = (): string => {
    const value = organizationId.trim();

    if (!value) {
      throw new Error(ru.common.organizationIdRequired);
    }

    return value;
  };

  const requireAuthHeaders = (): HeadersInit => {
    const token = accessToken.trim();

    if (!token) {
      throw new Error(ru.common.actionAccessTokenRequired);
    }

    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const withAction = async (action: BusyAction, fn: () => Promise<void>) => {
    setBusyAction(action);
    setErrorText(null);
    setNoticeText(null);

    try {
      await fn();
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  };

  const buildQueryUrl = (path: string, params: Record<string, string | undefined>) => {
    const baseUrl = requireOrganization();
    const url = new URL(`${baseUrl}${path}`);

    for (const [key, value] of Object.entries(params)) {
      if (!value || value.trim().length === 0) {
        continue;
      }

      url.searchParams.set(key, value.trim());
    }

    return url.toString();
  };

  const syncFinanceStatus = async (): Promise<boolean> => {
    const orgId = requireOrganizationId();
    const url = `${defaultApiBaseUrl}/organizations/${orgId}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...requireAuthHeaders(),
      },
    });

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response));
    }

    const payload = (await response.json()) as OrganizationResponse;
    const enabled = payload.financeEnabled === true;
    setFinanceEnabled(enabled);
    if (!enabled) {
      setRateData(null);
      setIncomeData(null);
    }

    return enabled;
  };

  const ensureFinanceEnabled = async () => {
    const enabled = await syncFinanceStatus();

    if (!enabled) {
      throw new Error(ru.finance.errors.financeDisabled);
    }
  };

  const loadRate = async () => {
    await withAction('load-rate', async () => {
      await ensureFinanceEnabled();
      const url = buildQueryUrl('/rate', {
        referenceDate,
      });

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...requireAuthHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const payload = (await response.json()) as PointRateResponse;
      setRateData(payload);
      setCurrency(payload.currency);

      if (payload.pointValue) {
        setPointValue(payload.pointValue);
      }

      setNoticeText(ru.finance.notices.rateLoaded);
    });
  };

  const saveRate = async () => {
    await withAction('save-rate', async () => {
      await ensureFinanceEnabled();
      const url = buildQueryUrl('/rate', {});

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...requireAuthHeaders(),
        },
        body: JSON.stringify({
          pointValue: pointValue.trim(),
          currency,
          effectiveFrom: effectiveFrom.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const payload = (await response.json()) as SetPointRateResponse;

      setRateData({
        referenceDate: new Date().toISOString(),
        pointValue: payload.currentRate.pointValue ?? payload.pointValue,
        currency: payload.currentRate.currency,
        source: payload.currentRate.source,
        effectiveFrom: payload.currentRate.effectiveFrom,
      });

      setCurrency(payload.currency);
      setPointValue(payload.pointValue);
      setNoticeText(
        ru.finance.notices.rateSaved(
          payload.pointValue,
          payload.currency,
          payload.effectiveFrom,
        ),
      );
    });
  };

  const loadIncome = async () => {
    await withAction('load-income', async () => {
      await ensureFinanceEnabled();
      const url = buildQueryUrl('/period/income', {
        referenceDate,
        participantId,
      });

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...requireAuthHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const payload = (await response.json()) as IncomeResponse;
      setIncomeData(payload);
      setNoticeText(ru.finance.notices.incomeCalculated);
    });
  };

  const exportReport = async (format: 'csv' | 'json') => {
    await withAction(format === 'csv' ? 'export-csv' : 'export-json', async () => {
      await ensureFinanceEnabled();
      const url = buildQueryUrl('/period/income/export', {
        referenceDate,
        participantId,
        format,
      });

      const response = await fetch(url, {
        headers: {
          Accept: format === 'csv' ? 'text/csv' : 'application/json',
          ...requireAuthHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      if (format === 'csv') {
        const csvContent = await response.text();
        const fileName = parseFileName(
          response,
          `points-income-${(referenceDate || todayInput()).replaceAll('-', '')}.csv`,
        );

        downloadBlob(fileName, csvContent, 'text/csv;charset=utf-8');
      } else {
        const jsonContent = JSON.stringify(await response.json(), null, 2);
        const fileName = `points-income-${(referenceDate || todayInput()).replaceAll('-', '')}.json`;
        downloadBlob(fileName, jsonContent, 'application/json;charset=utf-8');
      }

      setNoticeText(ru.finance.notices.exportReady(format));
    });
  };

  const refreshFinanceStatus = async () => {
    await withAction('sync-finance', async () => {
      const enabled = await syncFinanceStatus();
      setNoticeText(enabled ? ru.finance.notices.financeEnabled : ru.finance.notices.financeDisabled);
    });
  };

  const updateFinanceEnabled = async (next: boolean) => {
    await withAction('toggle-finance', async () => {
      const orgId = requireOrganizationId();
      const url = `${defaultApiBaseUrl}/organizations/${orgId}`;

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...requireAuthHeaders(),
        },
        body: JSON.stringify({
          financeEnabled: next,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      setFinanceEnabled(next);
      if (!next) {
        setRateData(null);
        setIncomeData(null);
      }
      setNoticeText(
        next
          ? ru.finance.notices.financeModuleEnabled
          : ru.finance.notices.financeModuleDisabled,
      );
    });
  };

  return (
    <section className="finance-panel">
      <h2>{ru.finance.title}</h2>
      <p className="finance-note">{ru.finance.note}</p>

      <form
        className="finance-form"
        onSubmit={(event) => {
          event.preventDefault();
          void loadIncome();
        }}
      >
        <label>
          {ru.finance.fields.organizationId}
          <input
            placeholder={ru.finance.fields.organizationPlaceholder}
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
          />
        </label>

        <label>
          {ru.finance.fields.accessToken}
          <input
            placeholder={ru.finance.fields.accessTokenPlaceholder}
            type="password"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
          />
        </label>

        <div className="row">
          <label>
            {ru.finance.fields.referenceDate}
            <input
              type="date"
              value={referenceDate}
              onChange={(event) => setReferenceDate(event.target.value)}
            />
          </label>

          <label>
            {ru.finance.fields.participant}
            <input
              placeholder={ru.finance.fields.participantPlaceholder}
              value={participantId}
              onChange={(event) => setParticipantId(event.target.value)}
            />
          </label>
        </div>

        <div className="action-row">
          <button
            type="button"
            onClick={() => void refreshFinanceStatus()}
            disabled={busyAction !== null}
          >
            {busyAction === 'sync-finance'
              ? ru.finance.progress.checking
              : ru.finance.actions.checkFinanceFlag}
          </button>
        </div>
      </form>

      {financeEnabled === false ? (
        <section className="finance-block">
          <h3>{ru.finance.sections.financeDisabled}</h3>
          <p className="empty-state">{ru.finance.sections.financeDisabledText}</p>
          <div className="action-row">
            <button
              className="accent-button"
              type="button"
              onClick={() => void updateFinanceEnabled(true)}
              disabled={busyAction !== null}
            >
              {busyAction === 'toggle-finance'
                ? ru.finance.progress.updating
                : ru.finance.actions.enableFinance}
            </button>
          </div>
        </section>
      ) : null}

      {financeEnabled === null ? (
        <section className="finance-block">
          <h3>{ru.finance.sections.financeAccess}</h3>
          <p className="empty-state">{ru.finance.sections.financeAccessText}</p>
        </section>
      ) : null}

      {financeEnabled ? (
        <>
          <section className="finance-block">
            <h3>{ru.finance.sections.pointRate}</h3>

            <div className="row">
              <label>
                {ru.finance.fields.pointValue}
                <input
                  inputMode="decimal"
                  placeholder="3.00"
                  value={pointValue}
                  onChange={(event) => setPointValue(event.target.value)}
                />
              </label>

              <label>
                {ru.finance.fields.currency}
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
                >
                  {currencyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              {ru.finance.fields.effectiveFrom}
              <input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            </label>

            <div className="action-row">
              <button
                type="button"
                onClick={() => void loadRate()}
                disabled={busyAction !== null}
              >
                {busyAction === 'load-rate'
                  ? ru.finance.progress.loading
                  : ru.finance.actions.loadRate}
              </button>
              <button
                className="accent-button"
                type="button"
                onClick={() => void saveRate()}
                disabled={busyAction !== null}
              >
                {busyAction === 'save-rate'
                  ? ru.finance.progress.saving
                  : ru.finance.actions.saveRate}
              </button>
              <button
                type="button"
                onClick={() => void updateFinanceEnabled(false)}
                disabled={busyAction !== null}
              >
                {busyAction === 'toggle-finance'
                  ? ru.finance.progress.updating
                  : ru.finance.actions.disableFinance}
              </button>
            </div>

            {rateData ? (
              <p className="finance-meta">
                {ru.finance.meta.currentRate}: {rateData.pointValue ?? '-'} {rateData.currency}
                {' | '}
                {ru.finance.meta.source} {rateData.source}
                {' | '}
                {ru.finance.meta.effective} {formatIsoDateTime(rateData.effectiveFrom)}
              </p>
            ) : null}
          </section>

          <section className="finance-block">
            <h3>{ru.finance.sections.income}</h3>

            <div className="action-row">
              <button
                type="button"
                onClick={() => void loadIncome()}
                disabled={busyAction !== null}
              >
                {busyAction === 'load-income'
                  ? ru.finance.progress.calculating
                  : ru.finance.actions.calculate}
              </button>
              <button
                type="button"
                onClick={() => void exportReport('csv')}
                disabled={busyAction !== null}
              >
                {busyAction === 'export-csv'
                  ? ru.finance.progress.exporting
                  : ru.finance.actions.exportCsv}
              </button>
              <button
                type="button"
                onClick={() => void exportReport('json')}
                disabled={busyAction !== null}
              >
                {busyAction === 'export-json'
                  ? ru.finance.progress.exporting
                  : ru.finance.actions.exportJson}
              </button>
            </div>

            {incomeData ? (
              <>
                <div className="income-stats">
                  <article>
                    <span>{ru.finance.stats.totalPoints}</span>
                    <strong>{incomeData.totals.totalPoints}</strong>
                  </article>
                  <article>
                    <span>{ru.finance.stats.autoPoints}</span>
                    <strong>{incomeData.totals.autoPoints}</strong>
                  </article>
                  <article>
                    <span>{ru.finance.stats.manualPoints}</span>
                    <strong>{incomeData.totals.manualPoints}</strong>
                  </article>
                  <article>
                    <span>{ru.finance.stats.totalIncome}</span>
                    <strong>
                      {formatAmount(incomeData.totals.totalAmount, incomeData.rate.currency)}
                    </strong>
                  </article>
                </div>

                <p className="finance-meta">
                  {ru.finance.meta.period}: {incomeData.periodStart.slice(0, 10)} -{' '}
                  {incomeData.periodEnd.slice(0, 10)}
                  {' | '}
                  {ru.finance.meta.entries} {incomeData.entriesCount}
                  {' | '}
                  {ru.finance.meta.rate} {incomeData.rate.pointValue ?? '-'}{' '}
                  {incomeData.rate.currency}
                </p>

                <div className="income-table-wrap">
                  <table className="income-table">
                    <thead>
                      <tr>
                        <th>{ru.finance.table.participant}</th>
                        <th>{ru.finance.table.auto}</th>
                        <th>{ru.finance.table.manual}</th>
                        <th>{ru.finance.table.total}</th>
                        <th>{ru.finance.table.income}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomeData.participants.map((participant) => (
                        <tr key={participant.participantId}>
                          <td>{participant.participantName}</td>
                          <td>{participant.autoPoints}</td>
                          <td>{participant.manualPoints}</td>
                          <td>{participant.totalPoints}</td>
                          <td>{formatAmount(participant.amount, incomeData.rate.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="empty-state">{ru.finance.emptyIncome}</p>
            )}
          </section>
        </>
      ) : null}

      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}
    </section>
  );
}
