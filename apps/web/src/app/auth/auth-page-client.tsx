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

type AuthMode = 'login' | 'register';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initialRegisterState = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
};

const initialLoginState = {
  email: '',
  password: '',
};

const valueHighlights = [
  {
    title: 'Живое расписание',
    text: 'Календарь, drag and drop и быстрые изменения без визуальной перегрузки.',
  },
  {
    title: 'Спектакли и составы',
    text: 'Шаблоны постановок, роли и участники собраны в одном рабочем потоке.',
  },
  {
    title: 'Командная синхронизация',
    text: 'Чаты, уведомления и realtime-обновления помогают держать всех в одном контексте.',
  },
];

export default function AuthPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, login, register, startOAuth } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [loginForm, setLoginForm] = useState(initialLoginState);
  const [registerForm, setRegisterForm] = useState(initialRegisterState);
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useToastFeedback({
    errorText,
    errorTitle: mode === 'login' ? 'Не удалось войти' : 'Не удалось создать аккаунт',
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

  const validateLogin = () => {
    if (!emailPattern.test(loginForm.email.trim())) {
      throw new Error('Введите корректный email');
    }

    if (loginForm.password.trim().length < 8) {
      throw new Error('Пароль должен содержать минимум 8 символов');
    }
  };

  const validateRegister = () => {
    if (!emailPattern.test(registerForm.email.trim())) {
      throw new Error('Введите корректный email');
    }

    if (registerForm.password.trim().length < 8) {
      throw new Error('Пароль должен содержать минимум 8 символов');
    }

    if (!/[A-Z]/.test(registerForm.password)) {
      throw new Error('В пароле нужна хотя бы одна заглавная буква');
    }

    if (!/[a-z]/.test(registerForm.password)) {
      throw new Error('В пароле нужна хотя бы одна строчная буква');
    }

    if (!/\d/.test(registerForm.password)) {
      throw new Error('В пароле нужна хотя бы одна цифра');
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorText(null);

    try {
      validateLogin();
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

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorText(null);

    try {
      validateRegister();
      await register({
        email: registerForm.email.trim(),
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

  const handleOAuth = async (provider: 'google' | 'vk' | 'yandex') => {
    setOauthLoading(provider);
    setErrorText(null);

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
          <p className="auth-hero-card__eyebrow">RPGLife SaaS</p>
          <h1>Управление расписанием, людьми и спектаклями в одном окне</h1>
          <p className="auth-hero-card__copy">
            Спокойный рабочий интерфейс для театров, студий и команд: меньше хаоса, быстрее действия, понятнее контекст.
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
              onClick={() => {
                setMode('login');
                setErrorText(null);
              }}
            >
              Вход
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'is-active' : ''}
              onClick={() => {
                setMode('register');
                setErrorText(null);
              }}
            >
              Регистрация
            </button>
          </div>

          <div className="auth-panel__header">
            <CardTitle>{mode === 'login' ? 'С возвращением' : 'Создайте аккаунт'}</CardTitle>
            <CardDescription>
              {mode === 'login'
                ? 'Войдите по email или через OAuth-провайдера.'
                : 'Создайте аккаунт, чтобы перейти в рабочее пространство.'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="auth-panel__content">
          <div className="oauth-grid">
            <Button
              type="button"
              variant="ghost"
              className="oauth-button"
              onClick={() => void handleOAuth('google')}
              disabled={oauthLoading !== null || submitting}
            >
              {oauthLoading === 'google' ? 'Подключаем Google...' : 'Войти через Google'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="oauth-button"
              onClick={() => void handleOAuth('vk')}
              disabled={oauthLoading !== null || submitting}
            >
              {oauthLoading === 'vk' ? 'Подключаем VK...' : 'Войти через VK'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="oauth-button"
              onClick={() => void handleOAuth('yandex')}
              disabled={oauthLoading !== null || submitting}
            >
              {oauthLoading === 'yandex' ? 'Подключаем Yandex...' : 'Войти через Yandex'}
            </Button>
          </div>

          <div className="auth-divider">
            <span>или продолжить по email</span>
          </div>

          {mode === 'login' ? (
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
                {submitting ? 'Входим...' : 'Войти'}
              </Button>
            </form>
          ) : (
            <form className="auth-form-grid" onSubmit={handleRegister}>
              <div className="auth-form-grid auth-form-grid--double">
                <Input
                  autoComplete="given-name"
                  label="Имя"
                  placeholder="Анна"
                  value={registerForm.firstName}
                  onChange={(event) =>
                    setRegisterForm((current) => ({
                      ...current,
                      firstName: event.target.value,
                    }))
                  }
                />

                <Input
                  autoComplete="family-name"
                  label="Фамилия"
                  placeholder="Иванова"
                  value={registerForm.lastName}
                  onChange={(event) =>
                    setRegisterForm((current) => ({
                      ...current,
                      lastName: event.target.value,
                    }))
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
                {submitting ? 'Создаем аккаунт...' : 'Зарегистрироваться'}
              </Button>
            </form>
          )}

          {errorText ? <p className="auth-error-banner">{errorText}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}
