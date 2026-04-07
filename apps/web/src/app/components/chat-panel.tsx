'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ru } from '../lib/i18n/ru';

type ChatScope = 'ORGANIZATION' | 'EVENT';

type ChatMessage = {
  id: string;
  organizationId: string;
  eventId: string | null;
  scope: ChatScope;
  body: string;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender: {
    userId: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
};

type ChatListResponse = {
  items: ChatMessage[];
  limit: number;
  hasMore: boolean;
  nextBefore: string | null;
};

const defaultApiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api')
  .replace(/\/$/, '');

const defaultSocketBaseUrl = defaultApiBaseUrl.replace(/\/api$/, '');

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

const formatSenderName = (message: ChatMessage): string => {
  const firstName = message.sender.firstName?.trim() ?? '';
  const lastName = message.sender.lastName?.trim() ?? '';
  const fullName = `${firstName} ${lastName}`.trim();

  if (fullName.length > 0) {
    return fullName;
  }

  return message.sender.userId.slice(0, 8);
};

const formatTimestamp = (isoValue: string): string => {
  const date = new Date(isoValue);

  if (Number.isNaN(date.getTime())) {
    return isoValue;
  }

  return date.toLocaleString('ru-RU');
};

const upsertMessage = (messages: ChatMessage[], incoming: ChatMessage): ChatMessage[] => {
  const existingIndex = messages.findIndex((item) => item.id === incoming.id);

  if (existingIndex === -1) {
    return [...messages, incoming].sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
  }

  const next = [...messages];
  next[existingIndex] = incoming;
  return next;
};

type ChatPanelProps = {
  organizationId?: string | null;
  accessToken?: string | null;
  defaultScope?: ChatScope;
  defaultEventId?: string | null;
  lockWorkspace?: boolean;
};

export function ChatPanel({
  organizationId: organizationIdProp,
  accessToken: accessTokenProp,
  defaultScope = 'ORGANIZATION',
  defaultEventId,
  lockWorkspace = false,
}: ChatPanelProps = {}) {
  const socketRef = useRef<Socket | null>(null);

  const [organizationId, setOrganizationId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [scope, setScope] = useState<ChatScope>(defaultScope);
  const [eventId, setEventId] = useState(defaultEventId ?? '');
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const resolvedOrganizationId = organizationIdProp?.trim() || organizationId.trim();
  const resolvedAccessToken = accessTokenProp?.trim() || accessToken.trim();
  const resolvedEventId = (defaultEventId ?? eventId).trim();

  const apiBase = useMemo(() => {
    if (!resolvedOrganizationId) {
      return null;
    }

    return `${defaultApiBaseUrl}/organizations/${resolvedOrganizationId}/chats`;
  }, [resolvedOrganizationId]);

  const currentScopeTitle =
    scope === 'ORGANIZATION'
      ? ru.chat.currentScopeTitles.ORGANIZATION
      : ru.chat.currentScopeTitles.EVENT;

  const requireApiBase = (): string => {
    if (!apiBase) {
      throw new Error(ru.common.organizationIdRequired);
    }

    return apiBase;
  };

  const requireToken = (): string => {
    if (!resolvedAccessToken) {
      throw new Error(ru.common.accessTokenRequired);
    }

    return resolvedAccessToken;
  };

  const requireEventId = (): string => {
    if (!resolvedEventId) {
      throw new Error(ru.chat.errors.eventIdRequired);
    }

    return resolvedEventId;
  };

  const resolveMessagesPath = (): string => {
    if (scope === 'ORGANIZATION') {
      return '/organization/messages';
    }

    return `/events/${requireEventId()}/messages`;
  };

  const isMessageForCurrentRoom = (message: ChatMessage): boolean => {
    if (message.organizationId !== resolvedOrganizationId) {
      return false;
    }

    if (scope === 'ORGANIZATION') {
      return message.scope === 'ORGANIZATION';
    }

    return message.scope === 'EVENT' && message.eventId === resolvedEventId;
  };

  const loadMessages = async () => {
    setLoading(true);
    setErrorText(null);
    setNoticeText(null);

    try {
      const token = requireToken();
      const path = resolveMessagesPath();
      const response = await fetch(`${requireApiBase()}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const payload = (await response.json()) as ChatListResponse;
      setMessages(payload.items);
      setNoticeText(ru.chat.notices.loadedMessages(payload.items.length));
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    setSending(true);
    setErrorText(null);
    setNoticeText(null);

    try {
      const token = requireToken();
      const body = messageText.trim();

      if (body.length < 1) {
        throw new Error(ru.chat.errors.emptyMessage);
      }

      const path = resolveMessagesPath();
      const response = await fetch(`${requireApiBase()}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          body,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      const payload = (await response.json()) as ChatMessage;
      setMessages((current) => upsertMessage(current, payload));
      setMessageText('');
      setNoticeText(ru.chat.notices.messageSent);
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const disconnectSocket = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocketConnected(false);
  };

  const connectRealtime = async () => {
    setConnecting(true);
    setErrorText(null);
    setNoticeText(null);

    try {
      const token = requireToken();
      const currentOrganizationId = resolvedOrganizationId;
      const currentEventId = resolvedEventId;

      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      const socket = io(`${defaultSocketBaseUrl}/chats`, {
        transports: ['websocket'],
        auth: {
          token,
        },
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setSocketConnected(true);
        setNoticeText(ru.chat.notices.realtimeConnected);

        if (scope === 'EVENT' && currentEventId) {
          socket.emit('chat:subscribe:event', {
            organizationId: currentOrganizationId,
            eventId: currentEventId,
          });
        }
      });

      socket.on('disconnect', () => {
        setSocketConnected(false);
      });

      socket.on('chat:error', (payload: { message?: string }) => {
        setErrorText(payload.message ?? ru.chat.errors.socketError);
      });

      socket.on('chat:message:new', (payload: ChatMessage) => {
        if (!isMessageForCurrentRoom(payload)) {
          return;
        }

        setMessages((current) => upsertMessage(current, payload));
      });

      socket.on('chat:message:updated', (payload: ChatMessage) => {
        if (!isMessageForCurrentRoom(payload)) {
          return;
        }

        setMessages((current) => upsertMessage(current, payload));
      });

      socket.on('chat:message:deleted', (payload: ChatMessage) => {
        if (!isMessageForCurrentRoom(payload)) {
          return;
        }

        setMessages((current) => upsertMessage(current, payload));
      });
    } catch (error) {
      disconnectSocket();
      setErrorText(getErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    setScope(defaultScope);
  }, [defaultScope]);

  useEffect(() => {
    if (defaultEventId !== undefined) {
      setEventId(defaultEventId ?? '');
    }
  }, [defaultEventId]);

  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  return (
    <section className="chat-panel">
      <h2>{ru.chat.title}</h2>
      <p className="chat-note">{ru.chat.note}</p>

      <div className="chat-form">
        {!lockWorkspace ? (
          <>
            <label>
              {ru.chat.fields.organizationId}
              <input
                placeholder={ru.chat.fields.organizationPlaceholder}
                value={organizationIdProp ?? organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                disabled={Boolean(organizationIdProp)}
              />
            </label>

            <label>
              {ru.chat.fields.accessToken}
              <input
                placeholder={ru.chat.fields.accessTokenPlaceholder}
                type="password"
                value={accessTokenProp ?? accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                disabled={Boolean(accessTokenProp)}
              />
            </label>
          </>
        ) : null}

        <div className="segmented chat-segmented">
          <button
            type="button"
            className={scope === 'ORGANIZATION' ? 'active' : ''}
            onClick={() => setScope('ORGANIZATION')}
          >
            {ru.chat.scopes.ORGANIZATION}
          </button>
          <button
            type="button"
            className={scope === 'EVENT' ? 'active' : ''}
            onClick={() => setScope('EVENT')}
          >
            {ru.chat.scopes.EVENT}
          </button>
        </div>

        {scope === 'EVENT' ? (
          <label>
            {ru.chat.fields.eventId}
            <input
              placeholder={ru.chat.fields.eventPlaceholder}
              value={defaultEventId ?? eventId}
              onChange={(event) => setEventId(event.target.value)}
              disabled={Boolean(defaultEventId)}
            />
          </label>
        ) : null}

        <div className="action-row">
          <button type="button" onClick={() => void loadMessages()} disabled={loading || sending}>
            {loading
              ? ru.chat.actions.loading
              : ru.chat.actions.loadScope(currentScopeTitle)}
          </button>
          <button
            type="button"
            onClick={() => void connectRealtime()}
            disabled={connecting || sending}
          >
            {connecting
              ? ru.chat.actions.connectingRealtime
              : socketConnected
                ? ru.chat.actions.reconnectRealtime
                : ru.chat.actions.connectRealtime}
          </button>
          <button type="button" onClick={disconnectSocket} disabled={!socketConnected}>
            {ru.chat.actions.disconnect}
          </button>
        </div>
      </div>

      <div className="chat-compose">
        <textarea
          placeholder={ru.chat.fields.messagePlaceholder}
          value={messageText}
          onChange={(event) => setMessageText(event.target.value)}
          rows={3}
        />
        <button
          className="accent-button"
          type="button"
          onClick={() => void sendMessage()}
          disabled={sending}
        >
          {sending ? ru.chat.actions.sending : ru.chat.actions.send}
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <p className="empty-state">{ru.chat.emptyState}</p>
        ) : (
          messages.map((message) => (
            <article key={message.id} className="chat-message">
              <header>
                <strong>{formatSenderName(message)}</strong>
                <span>{formatTimestamp(message.createdAt)}</span>
              </header>
              <p>{message.body}</p>
              {message.editedAt ? (
                <small>
                  {ru.chat.notices.editedPrefix} {formatTimestamp(message.editedAt)}
                </small>
              ) : null}
            </article>
          ))
        )}
      </div>

      {noticeText ? <p className="chat-notice">{noticeText}</p> : null}
      {errorText ? <p className="chat-error">{errorText}</p> : null}
    </section>
  );
}
