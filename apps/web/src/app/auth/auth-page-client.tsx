'use client';

import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToastFeedback } from '@/components/features/use-toast-feedback';

import { useAuth } from '../providers/auth-provider';

type AuthMode = 'login' | 'register' | 'reset';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initialRegisterState = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  code: '',
};

const initialLoginState = {
  email: '',
  password: '',
};

const initialLoginCodeState = {
  email: '',
  code: '',
};

const initialResetState = {
  email: '',
  code: '',
  newPassword: '',
};

const valueHighlights = [
  {
    title: 'Расписание',
    text: 'Календарь и понятный просмотр событий без лишних разделов.',
  },
  {
    title: 'Спектакли и состав',
    text: 'Спектакли, участники и залы собраны в одном рабочем пространстве.',
  },
  {
    title: 'Доступ по ролям',
    text: 'Участники видят только расписание, а управление доступно только ответственным ролям.',
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

const buildCodeSentText = (maskedEmail: string, expiresInSeconds: number) => {
  const minutes = Math.max(1, Math.round(expiresInSeconds / 60));
  return `Код отправлен на ${maskedEmail}. Он действует ${minutes} мин.`;
};

export default function AuthPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    status,
    login,
    startOAuth,
    requestLoginCode,
    loginWithCode,
    requestRegisterCode,
    registerWithCode,
    requestPasswordResetCode,
    resetPasswordWithCode,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [loginForm, setLoginForm] = useState(initialLoginState);
  const [loginCodeForm, setLoginCodeForm] = useState(initialLoginCodeState);
  const [registerForm, setRegisterForm] = useState(initialRegisterState);
  const [resetForm, setResetForm] = useState(initialResetState);
  const [submitting, setSubmitting] = useState(false);
  const [codeSending, setCodeSending] = useState<AuthMode | null>(null);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);

  useToastFeedback({
    errorText,
    errorTitle:
      mode === 'login'
        ? 'Не удалось войти'
        : mode === 'register'
          ? 'Не удалось создать аккаунт'
          : 'Не удалось сменить пароль',
  });

  const nextUrl = useMemo(() => {
    const raw = searchParams.get('next');
    return (raw && raw.startsWith('/') ? raw : '/calendar') as Route;
  }, [searchParams]);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(nextUrl);
    }
  }, [nextUrl, router, status]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorText(null);
    setSuccessText(null);
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

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorText(null);
    setSuccessText(null);

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
      setErrorText(error instanceof Error ? error.message : 'Не удалось выполнить вход');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestLoginCode = async () => {
    setCodeSending('login');
    setErrorText(null);
    setSuccessText(null);

    try {
      validateEmail(loginCodeForm.email);
      const response = await requestLoginCode({ email: loginCodeForm.email.trim() });
      setSuccessText(buildCodeSentText(response.maskedEmail, response.expiresInSeconds));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось отправить код');
    } finally {
      setCodeSending(null);
    }
  };

  const handleLoginWithCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorText(null);
    setSuccessText(null);

    try {
      validateEmail(loginCodeForm.email);
      validateCode(loginCodeForm.code);

      await loginWithCode({
        email: loginCodeForm.email.trim(),
        code: loginCodeForm.code.trim(),
      });
      router.replace(nextUrl);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось войти по коду');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestRegisterCode = async () => {
    setCodeSending('register');
    setErrorText(null);
    setSuccessText(null);

    try {
      validateEmail(registerForm.email);
      const response = await requestRegisterCode({ email: registerForm.email.trim() });
      setSuccessText(buildCodeSentText(response.maskedEmail, response.expiresInSeconds));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось отправить код');
    } finally {
      setCodeSending(null);
    }
  };

  const handleRegisterWithCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorText(null);
    setSuccessText(null);

    try {
      validateEmail(registerForm.email);
      validateStrongPassword(registerForm.password);
      validateCode(registerForm.code);

      await registerWithCode({
        email: registerForm.email.trim(),
        code: registerForm.code.trim(),
        password: registerForm.password,
        firstName: registerForm.firstName.trim() || undefined,
        lastName: registerForm.lastName.trim() || undefined,
      });
      router.replace(nextUrl);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось создать аккаунт');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestResetCode = async () => {
    setCodeSending('reset');
    setErrorText(null);
    setSuccessText(null);

    try {
      validateEmail(resetForm.email);
      const response = await requestPasswordResetCode({ email: resetForm.email.trim() });
      setSuccessText(buildCodeSentText(response.maskedEmail, response.expiresInSeconds));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось отправить код');
    } finally {
      setCodeSending(null);
    }
  };

  const handleResetPasswordWithCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorText(null);
    setSuccessText(null);

    try {
      validateEmail(resetForm.email);
      validateStrongPassword(resetForm.newPassword);
      validateCode(resetForm.code);

      await resetPasswordWithCode({
        email: resetForm.email.trim(),
        code: resetForm.code.trim(),
        newPassword: resetForm.newPassword,
      });
      router.replace(nextUrl);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось сменить пароль');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'vk' | 'yandex') => {
    setOauthLoading(provider);
    setErrorText(null);
    setSuccessText(null);

    try {
      const callbackPath = `/auth/callback?next=${encodeURIComponent(nextUrl)}`;
      await startOAuth(provider, callbackPath);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось начать OAuth-вход');
      setOauthLoading(null);
    }
  };

  return (
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
          <div className="auth-tabs auth-tabs--triple">
            <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => switchMode('login')}>
              Вход
            </button>
            <button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => switchMode('register')}>
              Регистрация
            </button>
            <button type="button" className={mode === 'reset' ? 'is-active' : ''} onClick={() => switchMode('reset')}>
              Смена пароля
            </button>
          </div>

          <div className="auth-panel__header">
            <CardTitle>
              {mode === 'login'
                ? 'Вход в аккаунт'
                : mode === 'register'
                  ? 'Регистрация по коду'
                  : 'Смена пароля по коду'}
            </CardTitle>
            <CardDescription>
              {mode === 'login'
                ? 'Войдите через соцсеть, код из письма или пароль.'
                : mode === 'register'
                  ? 'Отправим код на email, после этого завершим создание аккаунта.'
                  : 'Отправим код на email, после этого вы сможете задать новый пароль.'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="auth-panel__content">
          {mode === 'login' ? (
            <>
              <div className="oauth-grid">
                <Button
                  type="button"
                  variant="ghost"
                  className="oauth-button"
                  onClick={() => void handleOAuth('google')}
                  disabled={oauthLoading !== null || submitting || codeSending !== null}
                >
                  {oauthLoading === 'google' ? 'Подключаем Google...' : 'Войти через Google'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="oauth-button oauth-button--vkid"
                  onClick={() => void handleOAuth('vk')}
                  disabled={oauthLoading !== null || submitting || codeSending !== null}
                >
                  <span className="oauth-button__vkid-shell">
                    <span className="oauth-button__vkid-mark">
                      <VkIdMark />
                    </span>
                    <span className="oauth-button__vkid-copy">
                      <span className="oauth-button__vkid-title">
                        {oauthLoading === 'vk' ? 'Подключаем VK ID...' : 'Войти через VK ID'}
                      </span>
                      <span className="oauth-button__vkid-caption">
                        Официальный вход через аккаунт VK
                      </span>
                    </span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="oauth-button"
                  onClick={() => void handleOAuth('yandex')}
                  disabled={oauthLoading !== null || submitting || codeSending !== null}
                >
                  {oauthLoading === 'yandex' ? 'Подключаем Yandex...' : 'Войти через Yandex'}
                </Button>
              </div>

              <div className="auth-divider">
                <span>или код на почту</span>
              </div>

              <form className="auth-form-grid" onSubmit={handleLoginWithCode}>
                <div className="auth-code-panel">
                  <div className="auth-code-panel__header">
                    <strong>Вход по коду</strong>
                    <p>Отправим одноразовый код на email и сразу откроем рабочее пространство.</p>
                  </div>

                  <Input
                    autoComplete="email"
                    type="email"
                    label="Email"
                    placeholder="you@company.com"
                    value={loginCodeForm.email}
                    onChange={(event) =>
                      setLoginCodeForm((current) => ({ ...current, email: event.target.value }))
                    }
                  />

                  <div className="auth-form-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void handleRequestLoginCode()}
                      disabled={submitting || oauthLoading !== null || codeSending !== null}
                    >
                      {codeSending === 'login' ? 'Отправляем код...' : 'Получить код'}
                    </Button>
                  </div>

                  <Input
                    inputMode="numeric"
                    label="Код из письма"
                    placeholder="123456"
                    value={loginCodeForm.code}
                    onChange={(event) =>
                      setLoginCodeForm((current) => ({ ...current, code: event.target.value }))
                    }
                  />

                  <Button type="submit" fullWidth loading={submitting}>
                    {submitting ? 'Проверяем код...' : 'Войти по коду'}
                  </Button>
                </div>
              </form>

              <div className="auth-divider">
                <span>или пароль</span>
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

                <Button type="submit" fullWidth loading={submitting}>
                  {submitting ? 'Входим...' : 'Войти по паролю'}
                </Button>
              </form>
            </>
          ) : null}

          {mode === 'register' ? (
            <form className="auth-form-grid" onSubmit={handleRegisterWithCode}>
              <div className="auth-code-panel">
                <div className="auth-code-panel__header">
                  <strong>Регистрация по коду</strong>
                  <p>Сначала отправим код подтверждения, затем создадим аккаунт и сразу выполним вход.</p>
                </div>

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

                <div className="auth-form-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void handleRequestRegisterCode()}
                    disabled={submitting || codeSending !== null}
                  >
                    {codeSending === 'register' ? 'Отправляем код...' : 'Получить код'}
                  </Button>
                </div>

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

                <Input
                  inputMode="numeric"
                  label="Код из письма"
                  placeholder="123456"
                  value={registerForm.code}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, code: event.target.value }))
                  }
                />

                <Button type="submit" fullWidth loading={submitting}>
                  {submitting ? 'Создаем аккаунт...' : 'Создать аккаунт по коду'}
                </Button>
              </div>
            </form>
          ) : null}

          {mode === 'reset' ? (
            <form className="auth-form-grid" onSubmit={handleResetPasswordWithCode}>
              <div className="auth-code-panel">
                <div className="auth-code-panel__header">
                  <strong>Смена пароля по коду</strong>
                  <p>Отправим код на email, после проверки сохраним новый пароль и сразу выполним вход.</p>
                </div>

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

                <div className="auth-form-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void handleRequestResetCode()}
                    disabled={submitting || codeSending !== null}
                  >
                    {codeSending === 'reset' ? 'Отправляем код...' : 'Получить код'}
                  </Button>
                </div>

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
                  label="Код из письма"
                  placeholder="123456"
                  value={resetForm.code}
                  onChange={(event) =>
                    setResetForm((current) => ({ ...current, code: event.target.value }))
                  }
                />

                <Button type="submit" fullWidth loading={submitting}>
                  {submitting ? 'Сохраняем пароль...' : 'Сменить пароль по коду'}
                </Button>
              </div>
            </form>
          ) : null}

          {successText ? <p className="auth-success-banner">{successText}</p> : null}
          {errorText ? <p className="auth-error-banner">{errorText}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}

