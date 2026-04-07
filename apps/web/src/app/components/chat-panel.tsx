'use client';

import { useMemo, useRef, useState } from 'react';
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

export function ChatPanel() {
  const socketRef = useRef<Socket | null>(null);

  const [organizationId, setOrganizationId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [scope, setScope] = useState<ChatScope>('ORGANIZATION');
  const [eventId, setEventId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);

  const apiBase = useMemo(() => {
    const trimmedOrganizationId = organizationId.trim();

    if (!trimmedOrganizationId) {
      return null;
    }

    return `${defaultApiBaseUrl}/organizations/${trimmedOrganizationId}/chats`;
  }, [organizationId]);

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
    const token = accessToken.trim();

    if (!token) {
      throw new Error(ru.common.accessTokenRequired);
    }

    return token;
  };

  const requireEventId = (): string => {
    const value = eventId.trim();

    if (!value) {
      throw new Error(ru.chat.errors.eventIdRequired);
    }

    return value;
  };

  const resolveMessagesPath = (): string => {
    if (scope === 'ORGANIZATION') {
      return '/organization/messages';
    }

    return `/events/${requireEventId()}/messages`;
  };

  const isMessageForCurrentRoom = (message: ChatMessage): boolean => {
    if (message.organizationId !== organizationId.trim()) {
      return false;
    }

    if (scope === 'ORGANIZATION') {
      return message.scope === 'ORGANIZATION';
    }

    return message.scope === 'EVENT' && message.eventId === eventId.trim();
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
      const currentOrganizationId = organizationId.trim();
      const currentEventId = eventId.trim();

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

  return (
    <section className="chat-panel">
      <h2>{ru.chat.title}</h2>
      <p className="chat-note">{ru.chat.note}</p>

      <div className="chat-form">
        <label>
          {ru.chat.fields.organizationId}
          <input
            placeholder={ru.chat.fields.organizationPlaceholder}
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
          />
        </label>

        <label>
          {ru.chat.fields.accessToken}
          <input
            placeholder={ru.chat.fields.accessTokenPlaceholder}
            type="password"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
          />
        </label>

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
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
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
