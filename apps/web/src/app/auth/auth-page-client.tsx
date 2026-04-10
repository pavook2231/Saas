'use client';

import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { useToastFeedback } from '@/components/features/use-toast-feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { sanitizeInternalPath } from '@/lib/safe-url';

import { useAuth } from '../providers/auth-provider';

type AuthMode = 'login' | 'register';
type OAuthProvider = 'google' | 'vk' | 'yandex';
type ResetStage = 'request' | 'verify';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const resendCooldownSeconds = 59;

const initialLoginState = {
  email: '',
  password: '',
};

const initialRegisterState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
};

const initialResetState = {
  email: '',
  newPassword: '',
  code: '',
};

const valueHighlights = [
  {
    title: 'Расписание',
    text: 'Календарь, спектакли и репетиции собраны в одном рабочем окне.',
  },
  {
    title: 'Организация',
    text: 'Состав, приглашения и доступы без лишних разделов и путаницы.',
  },
  {
    title: 'Роли',
    text: 'Участники видят только нужное, а управление остается у ответственных ролей.',
  },
];

function VkIdMark() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <rect x="0.75" y="0.75" width="26.5" height="26.5" rx="9.25" fill="url(#vkid-bg)" />
      <path
        d="M8.35 10.15c.12 5.37 2.8 8.6 7.5 8.6h.27v-3.07c1.73.17 3.04 1.44 3.56 3.07h2.45c-.67-2.42-2.44-3.76-3.55-4.28 1.11-.64 2.65-2.2 3.02-4.32h-2.22c-.48 1.72-1.9 3.28-3.26 3.43v-3.43h-2.22v6.02c-1.38-.35-3.12-2.04-3.2-6.02H8.35Z"
        fill="white"
      />
      <defs>
        <linearGradient id="vkid-bg" x1="4" y1="3.5" x2="24.5" y2="25">
          <stop stopColor="#3da3ff" />
          <stop offset="1" stopColor="#1151ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const formatCountdown = (value: number) => {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export default function AuthPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    status,
    login,
    startOAuth,
    requestRegisterCode,
    registerWithCode,
    requestPasswordResetCode,
    resetPasswordWithCode,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [loginForm, setLoginForm] = useState(initialLoginState);
  const [registerForm, setRegisterForm] = useState(initialRegisterState);
  const [resetForm, setResetForm] = useState(initialResetState);
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [emailConfirmOpen, setEmailConfirmOpen] = useState(false);
  const [emailConfirmCode, setEmailConfirmCode] = useState('');
  const [emailConfirmError, setEmailConfirmError] = useState<string | null>(null);
  const [emailConfirmBusy, setEmailConfirmBusy] = useState(false);
  const [emailConfirmResendBusy, setEmailConfirmResendBusy] = useState(false);
  const [emailConfirmCountdown, setEmailConfirmCountdown] = useState(0);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetStage, setResetStage] = useState<ResetStage>('request');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetResendBusy, setResetResendBusy] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);

  const nextUrl = useMemo(() => {
    const raw = searchParams.get('next');
    return (sanitizeInternalPath(raw, '/calendar') ?? '/calendar') as Route;
  }, [searchParams]);

  const pageErrorTitle = useMemo(() => {
    if (mode === 'register') {
      return 'Не удалось создать аккаунт';
    }

    return 'Не удалось войти';
  }, [mode]);

  useToastFeedback({
    errorText,
    errorTitle: pageErrorTitle,
  });

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(nextUrl);
    }
  }, [nextUrl, router, status]);

  useEffect(() => {
    if (emailConfirmCountdown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setEmailConfirmCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [emailConfirmCountdown]);

  useEffect(() => {
    if (resetCountdown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setResetCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resetCountdown]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorText(null);
  };

  const validateEmail = (email: string) => {
    if (!emailPattern.test(email.trim())) {
      throw new Error('Введите корректный email');
    }
  };

  const validateStrongPassword = (password: string) => {
    if (password.trim().length < 8) {
      throw new Error('Пароль должен содержать минимум 8 символов');
    }

    if (!/[A-Z]/.test(password)) {
      throw new Error('В пароле нужна хотя бы одна заглавная буква');
    }

    if (!/[a-z]/.test(password)) {
      throw new Error('В пароле нужна хотя бы одна строчная буква');
    }

    if (!/\d/.test(password)) {
      throw new Error('В пароле нужна хотя бы одна цифра');
    }
  };

  const validateCode = (code: string) => {
    if (code.trim().length < 4) {
      throw new Error('Введите код из письма');
    }
  };

  const callbackPath = `/auth/callback?next=${encodeURIComponent(nextUrl)}`;

  const handleOAuth = async (provider: OAuthProvider) => {
    setOauthLoading(provider);
    setErrorText(null);

    try {
      await startOAuth(provider, callbackPath);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось начать вход через соцсеть');
      setOauthLoading(null);
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorText(null);

    try {
      validateEmail(loginForm.email);

      if (loginForm.password.trim().length < 8) {
        throw new Error('Пароль должен содержать минимум 8 символов');
      }

      await login({
        email: loginForm.email.trim(),
        password: loginForm.password,
      });

      router.replace(nextUrl);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  };

  const openRegisterConfirm = async () => {
    validateEmail(registerForm.email);
    validateStrongPassword(registerForm.password);

    if (!registerForm.firstName.trim()) {
      throw new Error('Введите имя');
    }

    if (!registerForm.lastName.trim()) {
      throw new Error('Введите фамилию');
    }

    await requestRegisterCode({ email: registerForm.email.trim() });
    setEmailConfirmCode('');
    setEmailConfirmError(null);
    setEmailConfirmCountdown(resendCooldownSeconds);
    setEmailConfirmOpen(true);
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorText(null);

    try {
      await openRegisterConfirm();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось начать регистрацию');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailConfirmBusy(true);
    setEmailConfirmError(null);

    try {
      validateCode(emailConfirmCode);
      await registerWithCode({
        email: registerForm.email.trim(),
        code: emailConfirmCode.trim(),
        password: registerForm.password,
        firstName: registerForm.firstName.trim(),
        lastName: registerForm.lastName.trim(),
      });
      setEmailConfirmOpen(false);
      router.replace(nextUrl);
    } catch (error) {
      setEmailConfirmError(error instanceof Error ? error.message : 'Не удалось подтвердить email');
    } finally {
      setEmailConfirmBusy(false);
    }
  };

  const handleResendRegisterCode = async () => {
    setEmailConfirmResendBusy(true);
    setEmailConfirmError(null);

    try {
      await requestRegisterCode({ email: registerForm.email.trim() });
      setEmailConfirmCountdown(resendCooldownSeconds);
    } catch (error) {
      setEmailConfirmError(error instanceof Error ? error.message : 'Не удалось отправить код повторно');
    } finally {
      setEmailConfirmResendBusy(false);
    }
  };

  const closeRegisterConfirm = () => {
    setEmailConfirmOpen(false);
    setEmailConfirmCode('');
    setEmailConfirmError(null);
    setEmailConfirmBusy(false);
    setEmailConfirmResendBusy(false);
    setEmailConfirmCountdown(0);
  };

  const openResetModal = () => {
    setResetOpen(true);
    setResetStage('request');
    setResetError(null);
    setResetBusy(false);
    setResetResendBusy(false);
    setResetCountdown(0);
    setResetForm((current) => ({
      email: current.email || loginForm.email,
      newPassword: '',
      code: '',
    }));
  };

  const closeResetModal = () => {
    setResetOpen(false);
    setResetStage('request');
    setResetError(null);
    setResetBusy(false);
    setResetResendBusy(false);
    setResetCountdown(0);
    setResetForm(initialResetState);
  };

  const handleRequestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetBusy(true);
    setResetError(null);

    try {
      validateEmail(resetForm.email);
      validateStrongPassword(resetForm.newPassword);
      await requestPasswordResetCode({ email: resetForm.email.trim() });
      setResetStage('verify');
      setResetCountdown(resendCooldownSeconds);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Не удалось отправить код');
    } finally {
      setResetBusy(false);
    }
  };

  const handleConfirmReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetBusy(true);
    setResetError(null);

    try {
      validateEmail(resetForm.email);
      validateStrongPassword(resetForm.newPassword);
      validateCode(resetForm.code);
      await resetPasswordWithCode({
        email: resetForm.email.trim(),
        code: resetForm.code.trim(),
        newPassword: resetForm.newPassword,
      });
      setResetOpen(false);
      router.replace(nextUrl);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Не удалось сменить пароль');
    } finally {
      setResetBusy(false);
    }
  };

  const handleResendResetCode = async () => {
    setResetResendBusy(true);
    setResetError(null);

    try {
      await requestPasswordResetCode({ email: resetForm.email.trim() });
      setResetCountdown(resendCooldownSeconds);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Не удалось отправить код повторно');
    } finally {
      setResetResendBusy(false);
    }
  };

  const renderOauthButtons = (context: 'login' | 'register') => (
    <div className="auth-social-section">
      <p className="auth-social-section__label">
        {context === 'login' ? 'Войти через соцсеть' : 'Создать аккаунт через соцсеть'}
      </p>
      <div className="oauth-grid">
        <Button
          type="button"
          variant="ghost"
          className="oauth-button"
          onClick={() => void handleOAuth('google')}
          disabled={oauthLoading !== null || submitting || emailConfirmBusy || resetBusy}
        >
          {oauthLoading === 'google'
            ? 'Подключаем Google...'
            : context === 'login'
              ? 'Войти через Google'
              : 'Регистрация через Google'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="oauth-button oauth-button--vkid"
          onClick={() => void handleOAuth('vk')}
          disabled={oauthLoading !== null || submitting || emailConfirmBusy || resetBusy}
        >
          <span className="oauth-button__vkid-shell">
            <span className="oauth-button__vkid-mark">
              <VkIdMark />
            </span>
            <span className="oauth-button__vkid-copy">
              <span className="oauth-button__vkid-title">
                {oauthLoading === 'vk'
                  ? 'Подключаем VK ID...'
                  : context === 'login'
                    ? 'Войти через VK ID'
                    : 'Регистрация через VK ID'}
              </span>
              <span className="oauth-button__vkid-caption">Официальный вход через аккаунт VK</span>
            </span>
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="oauth-button"
          onClick={() => void handleOAuth('yandex')}
          disabled={oauthLoading !== null || submitting || emailConfirmBusy || resetBusy}
        >
          {oauthLoading === 'yandex'
            ? 'Подключаем Яндекс...'
            : context === 'login'
              ? 'Войти через Яндекс'
              : 'Регистрация через Яндекс'}
        </Button>
      </div>
    </div>
  );

  const registerConfirmFooter = (
    <>
      <Button type="button" variant="ghost" onClick={closeRegisterConfirm}>
        Изменить email
      </Button>
      <Button
        type="submit"
        form="email-confirm-form"
        loading={emailConfirmBusy}
      >
        {emailConfirmBusy ? 'Подтверждаем...' : 'Подтвердить'}
      </Button>
    </>
  );

  const resetFooter = (
    <>
      <Button type="button" variant="ghost" onClick={closeResetModal}>
        Закрыть
      </Button>
      <Button
        type="submit"
        form={resetStage === 'request' ? 'reset-request-form' : 'reset-confirm-form'}
        loading={resetBusy}
      >
        {resetBusy
          ? resetStage === 'request'
            ? 'Отправляем код...'
            : 'Сохраняем пароль...'
          : resetStage === 'request'
            ? 'Отправить код'
            : 'Сменить пароль'}
      </Button>
    </>
  );

  return (
    <>
      <main className="auth-shell">
        <section className="auth-hero-card">
          <div className="auth-hero-card__top">
            <Badge variant="primary">Alpha</Badge>
            <p className="auth-hero-card__eyebrow">Внутренний сервис театра</p>
            <h1>Расписание, состав и приглашения в одном месте</h1>
            <p className="auth-hero-card__copy">
              Короткий и понятный интерфейс для театральной организации без лишних сущностей и лишнего шума.
            </p>
          </div>

          <div className="auth-hero-grid">
            {valueHighlights.map((item) => (
              <Card key={item.title} tone="subtle" className="auth-hero-grid__card">
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </Card>
            ))}
          </div>
        </section>

        <Card className="auth-panel">
          <CardHeader>
            <div className="auth-tabs">
              <button
                type="button"
                className={mode === 'login' ? 'is-active' : ''}
                onClick={() => switchMode('login')}
              >
                Вход
              </button>
              <button
                type="button"
                className={mode === 'register' ? 'is-active' : ''}
                onClick={() => switchMode('register')}
              >
                Регистрация
              </button>
            </div>

            <div className="auth-panel__header">
              <CardTitle>{mode === 'login' ? 'Вход в аккаунт' : 'Создать аккаунт'}</CardTitle>
              <CardDescription>
                {mode === 'login'
                  ? 'Войдите по email и паролю или используйте удобный вход через соцсеть.'
                  : 'Сначала заполним данные, затем подтвердим email в отдельном окне.'}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="auth-panel__content">
            {mode === 'login' ? (
              <>
                {renderOauthButtons('login')}

                <div className="auth-divider">
                  <span>или через email</span>
                </div>

                <form className="auth-form-grid" onSubmit={handleLogin}>
                  <Input
                    autoComplete="email"
                    type="email"
                    label="Email"
                    placeholder="you@company.com"
                    value={loginForm.email}
                    onChange={(event) =>
                      setLoginForm((current) => ({ ...current, email: event.target.value }))
                    }
                  />

                  <Input
                    autoComplete="current-password"
                    type="password"
                    label="Пароль"
                    placeholder="Введите пароль"
                    value={loginForm.password}
                    onChange={(event) =>
                      setLoginForm((current) => ({ ...current, password: event.target.value }))
                    }
                  />

                  <div className="auth-link-row">
                    <button
                      type="button"
                      className="auth-link-button"
                      onClick={openResetModal}
                    >
                      Забыли пароль?
                    </button>
                  </div>

                  <Button type="submit" fullWidth loading={submitting}>
                    {submitting ? 'Входим...' : 'Войти'}
                  </Button>
                </form>
              </>
            ) : (
              <>
                {renderOauthButtons('register')}

                <div className="auth-divider">
                  <span>или через email</span>
                </div>

                <form className="auth-form-grid" onSubmit={handleRegister}>
                  <div className="auth-form-grid auth-form-grid--double">
                    <Input
                      autoComplete="given-name"
                      label="Имя"
                      placeholder="Анна"
                      value={registerForm.firstName}
                      onChange={(event) =>
                        setRegisterForm((current) => ({ ...current, firstName: event.target.value }))
                      }
                    />

                    <Input
                      autoComplete="family-name"
                      label="Фамилия"
                      placeholder="Иванова"
                      value={registerForm.lastName}
                      onChange={(event) =>
                        setRegisterForm((current) => ({ ...current, lastName: event.target.value }))
                      }
                    />
                  </div>

                  <Input
                    autoComplete="email"
                    type="email"
                    label="Email"
                    placeholder="you@company.com"
                    value={registerForm.email}
                    onChange={(event) =>
                      setRegisterForm((current) => ({ ...current, email: event.target.value }))
                    }
                  />

                  <Input
                    autoComplete="new-password"
                    type="password"
                    label="Пароль"
                    hint="Минимум 8 символов, заглавная и строчная буква, цифра"
                    placeholder="Надежный пароль"
                    value={registerForm.password}
                    onChange={(event) =>
                      setRegisterForm((current) => ({ ...current, password: event.target.value }))
                    }
                  />

                  <Button type="submit" fullWidth loading={submitting}>
                    {submitting ? 'Отправляем код...' : 'Создать аккаунт'}
                  </Button>
                </form>
              </>
            )}

            {errorText ? <p className="auth-error-banner">{errorText}</p> : null}
          </CardContent>
        </Card>
      </main>

      <Modal
        open={emailConfirmOpen}
        onClose={closeRegisterConfirm}
        title="Подтвердите email"
        description={`Мы отправили код подтверждения на ${registerForm.email.trim()}.`}
        size="sm"
        footer={registerConfirmFooter}
      >
        <form id="email-confirm-form" className="auth-form-grid" onSubmit={handleConfirmRegistration}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            label="Код из письма"
            placeholder="123456"
            value={emailConfirmCode}
            onChange={(event) => setEmailConfirmCode(event.target.value)}
          />

          <div className="auth-modal-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleResendRegisterCode()}
              disabled={emailConfirmCountdown > 0 || emailConfirmResendBusy}
            >
              {emailConfirmResendBusy ? 'Отправляем...' : 'Отправить код повторно'}
            </Button>
            <span className="auth-modal-hint">
              {emailConfirmCountdown > 0
                ? `Отправить повторно через ${formatCountdown(emailConfirmCountdown)}`
                : 'Можно отправить код повторно'}
            </span>
          </div>

          {emailConfirmError ? <p className="auth-error-banner">{emailConfirmError}</p> : null}
        </form>
      </Modal>

      <Modal
        open={resetOpen}
        onClose={closeResetModal}
        title="Восстановление пароля"
        description={
          resetStage === 'request'
            ? 'Введите email и новый пароль. Мы отправим код подтверждения на почту.'
            : `Мы отправили код подтверждения на ${resetForm.email.trim()}. Введите его и задайте новый пароль.`
        }
        size="sm"
        footer={resetFooter}
      >
        {resetStage === 'request' ? (
          <form id="reset-request-form" className="auth-form-grid" onSubmit={handleRequestReset}>
            <Input
              autoComplete="email"
              type="email"
              label="Email"
              placeholder="you@company.com"
              value={resetForm.email}
              onChange={(event) =>
                setResetForm((current) => ({ ...current, email: event.target.value }))
              }
            />

            <Input
              autoComplete="new-password"
              type="password"
              label="Новый пароль"
              hint="Минимум 8 символов, заглавная и строчная буква, цифра"
              placeholder="Новый надежный пароль"
              value={resetForm.newPassword}
              onChange={(event) =>
                setResetForm((current) => ({ ...current, newPassword: event.target.value }))
              }
            />

            {resetError ? <p className="auth-error-banner">{resetError}</p> : null}
          </form>
        ) : (
          <form id="reset-confirm-form" className="auth-form-grid" onSubmit={handleConfirmReset}>
            <Input
              autoComplete="email"
              type="email"
              label="Email"
              placeholder="you@company.com"
              value={resetForm.email}
              onChange={(event) =>
                setResetForm((current) => ({ ...current, email: event.target.value }))
              }
            />

            <Input
              autoComplete="new-password"
              type="password"
              label="Новый пароль"
              hint="Минимум 8 символов, заглавная и строчная буква, цифра"
              placeholder="Новый надежный пароль"
              value={resetForm.newPassword}
              onChange={(event) =>
                setResetForm((current) => ({ ...current, newPassword: event.target.value }))
              }
            />

            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              label="Код из письма"
              placeholder="123456"
              value={resetForm.code}
              onChange={(event) =>
                setResetForm((current) => ({ ...current, code: event.target.value }))
              }
            />

            <div className="auth-modal-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void handleResendResetCode()}
                disabled={resetCountdown > 0 || resetResendBusy}
              >
                {resetResendBusy ? 'Отправляем...' : 'Отправить код повторно'}
              </Button>
              <span className="auth-modal-hint">
                {resetCountdown > 0
                  ? `Отправить повторно через ${formatCountdown(resetCountdown)}`
                  : 'Можно отправить код повторно'}
              </span>
            </div>

            <div className="auth-modal-actions auth-modal-actions--split">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setResetStage('request');
                  setResetError(null);
                  setResetForm((current) => ({ ...current, code: '' }));
                  setResetCountdown(0);
                }}
              >
                Изменить email
              </Button>
            </div>

            {resetError ? <p className="auth-error-banner">{resetError}</p> : null}
          </form>
        )}
      </Modal>
    </>
  );
}
