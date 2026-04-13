'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { organizationsApi, type OrganizationInvitation, type OrganizationInvitationHistory } from '@/app/lib/api/organizations';
import { useAuth } from '@/app/providers/auth-provider';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { roleLabels } from '@/lib/organization-access';
import { BrowserNotificationsSettings } from './browser-notifications-settings';
import { CalendarSyncSettings } from './calendar-sync-settings';
import { CreateOrganizationAction } from './create-organization-action';
import { EventReminderSettings } from './event-reminder-settings';
import { PageHeader } from './page-header';
import { useActiveWorkspace } from './use-active-workspace';
import { useToastFeedback } from './use-toast-feedback';

const formatDateTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
    : '—';

const statusLabel: Record<OrganizationInvitationHistory['status'], string> = {
  ACCEPTED: 'Принято',
  DECLINED: 'Отклонено',
  EXPIRED: 'Истекло',
  REVOKED: 'Отозвано',
};

const statusVariant: Record<OrganizationInvitationHistory['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  ACCEPTED: 'success',
  DECLINED: 'warning',
  EXPIRED: 'neutral',
  REVOKED: 'error',
};

const buildDisplayName = (firstName?: string | null, lastName?: string | null, email?: string | null) =>
  [firstName, lastName].filter(Boolean).join(' ').trim() || email || 'Пользователь';

export function ProfileWorkspace() {
  const { user, logoutAll, changePassword, getTwoFactorStatus, beginTotpSetup, enableTotp, disableTotp, updateProfile, refreshSession } = useAuth();
  const { accessToken, organizations, activeOrganizationId, setActiveOrganizationId, refreshOrganizations } = useActiveWorkspace();
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [history, setHistory] = useState<OrganizationInvitationHistory[]>([]);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [totpModalOpen, setTotpModalOpen] = useState(false);
  const [totpMode, setTotpMode] = useState<'setup' | 'disable'>('setup');
  const [twoFactorStatus, setTwoFactorStatus] = useState<{ required: boolean; enabled: boolean; pending: boolean; method: 'totp' | null } | null>(null);
  const [totpSetupData, setTotpSetupData] = useState<{ manualEntryKey: string; issuer: string; accountName: string } | null>(null);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', avatarUrl: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [totpForm, setTotpForm] = useState({ currentPassword: '', code: '' });

  useToastFeedback({ noticeText, errorText, noticeTitle: 'Профиль', errorTitle: 'Профиль' });

  const displayName = useMemo(() => buildDisplayName(user?.firstName, user?.lastName, user?.email), [user?.email, user?.firstName, user?.lastName]);

  useEffect(() => {
    if (!user) return;
    setProfileForm({ firstName: user.firstName ?? '', lastName: user.lastName ?? '', avatarUrl: user.avatarUrl ?? '' });
  }, [user]);

  const loadProfileData = useCallback(async () => {
    if (!accessToken) {
      setInvitations([]);
      setHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [inviteResponse, historyResponse] = await Promise.all([
        organizationsApi.listMyInvitations({ accessToken }),
        organizationsApi.listMyInvitationHistory({ accessToken }),
      ]);
      setInvitations(inviteResponse);
      setHistory(historyResponse);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить профиль.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const loadTwoFactor = useCallback(async () => {
    if (!accessToken) {
      setTwoFactorStatus(null);
      return;
    }
    try {
      setTwoFactorStatus(await getTwoFactorStatus());
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось загрузить статус двухфакторной защиты.');
    }
  }, [accessToken, getTwoFactorStatus]);

  useEffect(() => void loadProfileData(), [loadProfileData]);
  useEffect(() => void loadTwoFactor(), [loadTwoFactor]);

  const afterOrgAction = async (message: string) => {
    await refreshSession();
    await refreshOrganizations();
    await loadProfileData();
    setNoticeText(message);
  };

  const withProcessing = async (id: string, action: () => Promise<void>) => {
    setProcessingId(id);
    setNoticeText(null);
    setErrorText(null);
    try {
      await action();
    } finally {
      setProcessingId(null);
    }
  };

  const securityDescription = twoFactorStatus?.required
    ? twoFactorStatus.enabled
      ? 'Для вашей роли код из приложения будет основным вторым шагом.'
      : 'Для вашей роли TOTP обязателен. Лучше включить его сейчас.'
    : twoFactorStatus?.enabled
      ? 'Код из приложения используется как второй шаг при входе.'
      : 'Можно добавить приложение-аутентификатор для дополнительной защиты.';

  const profileFooter = <>
    <Button type="button" variant="ghost" onClick={() => setProfileModalOpen(false)}>Отмена</Button>
    <Button type="button" onClick={() => void withProcessing('profile', async () => {
      await updateProfile({ firstName: profileForm.firstName.trim(), lastName: profileForm.lastName.trim(), avatarUrl: profileForm.avatarUrl.trim() });
      setProfileModalOpen(false);
      setNoticeText('Профиль обновлен.');
    })} loading={processingId === 'profile'}>Сохранить</Button>
  </>;

  const passwordFooter = <>
    <Button type="button" variant="ghost" onClick={() => setSecurityModalOpen(false)}>Отмена</Button>
    <Button type="button" onClick={() => void withProcessing('password', async () => {
      if (passwordForm.newPassword.trim().length < 8) throw new Error('Новый пароль должен быть не короче 8 символов.');
      if (passwordForm.newPassword !== passwordForm.confirmPassword) throw new Error('Подтверждение пароля не совпадает.');
      await changePassword({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSecurityModalOpen(false);
      setNoticeText('Пароль обновлен.');
    }).catch((error: unknown) => setErrorText(error instanceof Error ? error.message : 'Не удалось изменить пароль.'))} loading={processingId === 'password'}>Обновить пароль</Button>
  </>;

  return (
    <section className="app-page">
      <PageHeader eyebrow="Профиль" title="Профиль" description="Личные данные, приглашения, организации и доступ к аккаунту." actions={<div className="account-page__actions"><Button type="button" variant="ghost" onClick={() => void loadProfileData()}>Обновить</Button><CreateOrganizationAction /></div>} />
      {noticeText ? <p className="finance-notice">{noticeText}</p> : null}
      {errorText ? <p className="finance-error">{errorText}</p> : null}
      <section className="account-overview-shell">
        <div className="account-overview-shell__identity"><Avatar name={displayName} src={user?.avatarUrl} size="lg" /><div className="account-overview-shell__copy"><p className="kicker">Аккаунт</p><strong>{displayName}</strong><span>{user?.email ?? '—'}</span></div></div>
        <div className="account-overview-shell__stats"><div className="account-overview-shell__stat"><span>Организаций</span><strong>{organizations.length}</strong></div><div className="account-overview-shell__stat"><span>Приглашений</span><strong>{invitations.length}</strong></div><div className="account-overview-shell__stat"><span>TOTP</span><strong>{twoFactorStatus?.enabled ? 'Включен' : 'Не включен'}</strong></div></div>
      </section>
      <div className="account-layout">
        <div className="account-layout__main">
          <Card><CardHeader><CardTitle>Личные данные</CardTitle><CardDescription>Имя, почта и фотография профиля.</CardDescription></CardHeader><CardContent className="account-profile-card"><div className="account-profile-card__identity"><Avatar name={displayName} src={user?.avatarUrl} size="lg" /><div className="account-profile-card__copy"><strong>{displayName}</strong><span>{user?.email ?? '—'}</span></div></div><div className="account-profile-card__meta"><Badge variant="neutral">Организаций: {organizations.length}</Badge><Button type="button" variant="ghost" onClick={() => setProfileModalOpen(true)}>Редактировать профиль</Button></div></CardContent></Card>
          <Card><CardHeader><CardTitle>Приглашения</CardTitle><CardDescription>Здесь появляются приглашения от администраторов. Их можно принять или отклонить без перехода в другие разделы.</CardDescription></CardHeader><CardContent className="profile-stack">{loading ? <p className="empty-state">Загружаем приглашения...</p> : invitations.length === 0 ? <div className="resource-empty-inline"><strong>Новых приглашений нет</strong><p>Когда вас пригласят в организацию, карточка появится в этом блоке.</p></div> : invitations.map((invitation) => <div key={invitation.invitationId} className="profile-item-card"><div className="resource-inline-info"><strong>{invitation.organization.name}</strong><span>Роль: {roleLabels[invitation.role]}</span><span>Действует до {formatDateTime(invitation.expiresAt)}</span></div><div className="resource-card__actions"><Button type="button" size="sm" variant="ghost" onClick={() => void withProcessing(invitation.invitationId, async () => { await organizationsApi.declineInvitation({ accessToken: accessToken!, invitationId: invitation.invitationId }); await loadProfileData(); setNoticeText(`Приглашение в «${invitation.organization.name}» отклонено.`); })} loading={processingId === invitation.invitationId}>Отклонить</Button><Button type="button" size="sm" onClick={() => void withProcessing(invitation.invitationId, async () => { await organizationsApi.acceptInvitation({ accessToken: accessToken!, invitationId: invitation.invitationId }); await refreshSession(); await refreshOrganizations(); setActiveOrganizationId(invitation.organization.id); await loadProfileData(); setNoticeText(`Вы вступили в организацию «${invitation.organization.name}».`); })} loading={processingId === invitation.invitationId}>Принять</Button></div></div>)}</CardContent></Card>
        </div>
        <div className="account-layout__side">
          <Card><CardHeader><CardTitle>Организации и доступ</CardTitle><CardDescription>Текущая активная организация и все пространства, к которым у вас есть доступ.</CardDescription></CardHeader><CardContent className="profile-stack">{organizations.length === 0 ? <div className="resource-empty-inline"><strong>Организаций пока нет</strong><p>Создайте первую организацию или дождитесь приглашения от команды.</p></div> : organizations.map((organization) => <div key={organization.id} className="profile-item-card"><div className="resource-inline-info"><strong>{organization.name}</strong><span>{roleLabels[organization.role]} · {organization.slug}</span></div><div className="resource-card__actions">{activeOrganizationId === organization.id ? <Badge variant="primary">Активная</Badge> : <Button type="button" variant="ghost" size="sm" onClick={() => setActiveOrganizationId(organization.id)}>Сделать активной</Button>}<Button type="button" variant="ghost" size="sm" onClick={() => void withProcessing(organization.id, async () => { if (!window.confirm(`Выйти из организации «${organization.name}»?`)) return; await organizationsApi.leaveOrganization({ accessToken: accessToken!, organizationId: organization.id }); await afterOrgAction(`Вы вышли из организации «${organization.name}».`); })} loading={processingId === organization.id}>Выйти</Button>{organization.role === 'ADMIN' ? <Button type="button" variant="danger" size="sm" onClick={() => void withProcessing(organization.id, async () => { if (!window.confirm(`Удалить организацию «${organization.name}»? Это действие необратимо.`)) return; await organizationsApi.archiveOrganization({ accessToken: accessToken!, organizationId: organization.id }); await afterOrgAction(`Организация «${organization.name}» удалена.`); })} loading={processingId === organization.id}>Удалить</Button> : null}</div></div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle>История приглашений</CardTitle><CardDescription>Здесь видно, что вы уже приняли, отклонили или пропустили.</CardDescription></CardHeader><CardContent className="profile-stack">{loading ? <p className="empty-state">Загружаем историю...</p> : history.length === 0 ? <div className="resource-empty-inline"><strong>История пока пустая</strong><p>Принятые и отклонённые приглашения появятся здесь.</p></div> : history.map((item) => <div key={item.invitationId} className="profile-item-card"><div className="resource-inline-info"><strong>{item.organization.name}</strong><span>Роль: {roleLabels[item.role]}</span><span>{formatDateTime(item.resolvedAt)}</span></div><Badge variant={statusVariant[item.status]}>{statusLabel[item.status]}</Badge></div>)}</CardContent></Card>
        </div>
      </div>
      <div className="account-settings-grid">
        <Card><CardHeader><CardTitle>Уведомления</CardTitle><CardDescription>Только нужное: синхронизация календаря, напоминания и push-статус этого устройства.</CardDescription></CardHeader><CardContent className="account-settings-card"><div className="account-toggle-list"><CalendarSyncSettings accessToken={accessToken} onNotice={setNoticeText} onError={setErrorText} /><EventReminderSettings accessToken={accessToken} onNotice={setNoticeText} onError={setErrorText} /><BrowserNotificationsSettings accessToken={accessToken} onNotice={setNoticeText} onError={setErrorText} /></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Безопасность</CardTitle><CardDescription>Пароль, TOTP и завершение всех активных сессий.</CardDescription></CardHeader><CardContent className="account-security-card"><div className="account-security-card__group"><strong>{user?.email ?? '—'}</strong><span>Почта используется как логин и пока не редактируется.</span></div><div className="account-security-card__group"><strong>TOTP {twoFactorStatus?.enabled ? 'включен' : 'не включен'}</strong><span>{securityDescription}</span></div><div className="resource-card__actions"><Button type="button" variant="ghost" onClick={() => setSecurityModalOpen(true)}>Сменить пароль</Button>{twoFactorStatus?.enabled ? <Button type="button" variant="ghost" onClick={() => { setTotpMode('disable'); setTotpSetupData(null); setTotpForm({ currentPassword: '', code: '' }); setTotpModalOpen(true); }}>Отключить TOTP</Button> : <Button type="button" variant="ghost" onClick={() => { setTotpMode('setup'); setTotpSetupData(null); setTotpForm({ currentPassword: '', code: '' }); setTotpModalOpen(true); }}>Настроить TOTP</Button>}<Button type="button" variant="danger" onClick={() => void withProcessing('logout-all', async () => { if (!window.confirm('Выйти со всех устройств? Текущая сессия тоже завершится.')) return; await logoutAll(); })} loading={processingId === 'logout-all'}>Выйти со всех устройств</Button></div></CardContent></Card>
      </div>
      <Modal open={profileModalOpen} onClose={() => setProfileModalOpen(false)} title="Редактировать профиль" description="Обновите имя и аватар. Почта используется как логин и пока не меняется." footer={profileFooter}><div className="profile-stack"><div className="account-profile-preview"><Avatar name={buildDisplayName(profileForm.firstName, profileForm.lastName, user?.email)} src={profileForm.avatarUrl || null} size="lg" /><div className="resource-inline-info"><strong>{buildDisplayName(profileForm.firstName, profileForm.lastName, user?.email)}</strong><span>{user?.email ?? '—'}</span></div></div><div className="account-form-grid"><Input label="Имя" value={profileForm.firstName} onChange={(event) => setProfileForm((current) => ({ ...current, firstName: event.target.value }))} placeholder="Имя" /><Input label="Фамилия" value={profileForm.lastName} onChange={(event) => setProfileForm((current) => ({ ...current, lastName: event.target.value }))} placeholder="Фамилия" /></div><Input label="Ссылка на аватар" value={profileForm.avatarUrl} onChange={(event) => setProfileForm((current) => ({ ...current, avatarUrl: event.target.value }))} placeholder="https://..." hint="Если оставить пустым, останутся инициалы." /><Input label="Почта" value={user?.email ?? ''} disabled hint="Эта почта используется для входа и пока не редактируется." /></div></Modal>
      <Modal open={totpModalOpen} onClose={() => { setTotpModalOpen(false); setTotpSetupData(null); setTotpForm({ currentPassword: '', code: '' }); }} title={totpMode === 'setup' ? 'Настроить TOTP' : 'Отключить TOTP'} description={totpMode === 'setup' ? totpSetupData ? 'Добавьте секрет в приложение-аутентификатор и подтвердите его шестизначным кодом.' : 'Сначала подтвердите текущий пароль, затем мы покажем секрет для приложения-аутентификатора.' : 'Подтвердите текущий пароль и код из приложения, чтобы отключить TOTP.'} footer={<><Button type="button" variant="ghost" onClick={() => { setTotpModalOpen(false); setTotpSetupData(null); setTotpForm({ currentPassword: '', code: '' }); }}>Отмена</Button>{totpMode === 'setup' ? totpSetupData ? <Button type="button" onClick={() => void withProcessing('totp-enable', async () => { const status = await enableTotp({ currentPassword: totpForm.currentPassword || undefined, code: totpForm.code.trim() }); setTwoFactorStatus(status); await refreshSession(); setTotpModalOpen(false); setTotpSetupData(null); setTotpForm({ currentPassword: '', code: '' }); setNoticeText('TOTP включен для этого аккаунта.'); })} loading={processingId === 'totp-enable'}>Включить TOTP</Button> : <Button type="button" onClick={() => void withProcessing('totp-setup-start', async () => { const response = await beginTotpSetup({ currentPassword: totpForm.currentPassword || undefined }); setTotpSetupData({ manualEntryKey: response.manualEntryKey, issuer: response.issuer, accountName: response.accountName }); setNoticeText('Секрет TOTP готов. Добавьте его в приложение-аутентификатор и подтвердите кодом.'); })} loading={processingId === 'totp-setup-start'}>Показать секрет</Button> : <Button type="button" variant="danger" onClick={() => void withProcessing('totp-disable', async () => { const status = await disableTotp({ currentPassword: totpForm.currentPassword || undefined, code: totpForm.code.trim() }); setTwoFactorStatus(status); await refreshSession(); setTotpModalOpen(false); setTotpSetupData(null); setTotpForm({ currentPassword: '', code: '' }); setNoticeText('TOTP отключен для этого аккаунта.'); })} loading={processingId === 'totp-disable'}>Отключить</Button>}</>}><div className="profile-stack"><Input label="Текущий пароль" type="password" value={totpForm.currentPassword} onChange={(event) => setTotpForm((current) => ({ ...current, currentPassword: event.target.value }))} hint="Нужен для настройки и отключения TOTP." />{totpSetupData ? <><Input label="Секрет для приложения" value={totpSetupData.manualEntryKey} disabled hint={`${totpSetupData.issuer} · ${totpSetupData.accountName}`} /><Input label="Код из приложения" value={totpForm.code} onChange={(event) => setTotpForm((current) => ({ ...current, code: event.target.value }))} placeholder="123456" /></> : totpMode === 'disable' ? <Input label="Код из приложения" value={totpForm.code} onChange={(event) => setTotpForm((current) => ({ ...current, code: event.target.value }))} placeholder="123456" /> : null}</div></Modal>
      <Modal open={securityModalOpen} onClose={() => setSecurityModalOpen(false)} title="Сменить пароль" description="Если раньше вы входили только через OAuth, можно просто задать новый пароль." footer={passwordFooter}><div className="profile-stack"><Input label="Текущий пароль" type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} hint="Если пароля раньше не было, поле можно оставить пустым." /><Input label="Новый пароль" type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} /><Input label="Повторите новый пароль" type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} /></div></Modal>
    </section>
  );
}
